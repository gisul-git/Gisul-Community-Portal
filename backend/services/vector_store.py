import logging
import os
import pickle
import hashlib
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set
from collections import defaultdict

import faiss
import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

from db_sync import get_db_client, db_name

load_dotenv()

openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key or openai_api_key.startswith("sk-xxxxx") or len(openai_api_key) < 20:
    print("⚠️  WARNING: OPENAI_API_KEY is not set or appears to be a placeholder!")
    print("   Please set OPENAI_API_KEY in your .env file or environment variables.")
    print("   Get your API key from: https://platform.openai.com/account/api-keys")
    print("   Example .env file location: backend/.env or project root .env")

client = OpenAI(api_key=openai_api_key)

DATA_DIR = Path(__file__).parent.parent / "data"
FAISS_INDEX_PATH = DATA_DIR / "faiss_index.bin"
VECTOR_STORE_PATH = DATA_DIR / "vector_store.pkl"

DATA_DIR.mkdir(exist_ok=True)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536
MAX_CACHE_ENTRIES = 500
CACHE_TTL_DAYS = 7

print("🧠 FAISS mode active (local vector search).")
logging.warning(f"✅ Using OpenAI {EMBEDDING_MODEL} ({EMBEDDING_DIMENSION} dimensions)")

# Strategy 5: Use IndexHNSW for faster approximate search (10-100x faster for large datasets)
# Falls back to IndexFlatIP if dataset is small (<1000 vectors)
USE_HNSW = True
HNSW_M = 32  # Number of connections per node (higher = more accurate but slower)
HNSW_EF_CONSTRUCTION = 200  # Construction time/quality tradeoff
HNSW_EF_SEARCH = 50  # Search quality (higher = more accurate but slower)

def create_optimal_index(dimension: int, current_size: int = 0) -> faiss.Index:
    """Create optimal FAISS index based on dataset size"""
    if USE_HNSW and current_size > 1000:
        # Use HNSW for large datasets - much faster approximate search
        try:
            index = faiss.IndexHNSWFlat(dimension, HNSW_M)
            index.hnsw.efConstruction = HNSW_EF_CONSTRUCTION
            index.hnsw.efSearch = HNSW_EF_SEARCH
            print(f"✅ Using IndexHNSW for fast approximate search (M={HNSW_M}, efSearch={HNSW_EF_SEARCH})")
            return index
        except (AttributeError, ValueError) as e:
            # Fallback to FlatIP if HNSW is not available
            logging.warning(f"⚠️ HNSW index not available, falling back to FlatIP: {e}")
            print(f"✅ Using IndexFlatIP for exact search (HNSW not available)")
            return faiss.IndexFlatIP(dimension)
    else:
        # Use exact search for small datasets
        print(f"✅ Using IndexFlatIP for exact search (dataset size: {current_size})")
        return faiss.IndexFlatIP(dimension)

faiss_index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)
vector_store: Dict[int, Dict[str, Any]] = {}

def save_faiss_index() -> None:
    try:
        faiss.write_index(faiss_index, str(FAISS_INDEX_PATH))
        with open(VECTOR_STORE_PATH, "wb") as f:
            pickle.dump(vector_store, f)
        logging.info("💾 Persisted FAISS index to disk")
    except Exception as e:
        logging.warning(f"⚠️ Failed to save FAISS index: {e}")

if FAISS_INDEX_PATH.exists() and VECTOR_STORE_PATH.exists():
    try:
        faiss_index = faiss.read_index(str(FAISS_INDEX_PATH))
        if faiss_index.d != EMBEDDING_DIMENSION:
            raise ValueError(
                f"FAISS index dimension mismatch: expected {EMBEDDING_DIMENSION}, got {faiss_index.d}. "
                "Rebuild the FAISS index with the current embedding model."
            )
        with open(VECTOR_STORE_PATH, "rb") as f:
            vector_store = pickle.load(f)
        
        # Upgrade to HNSW if dataset is large and currently using FlatIP
        if USE_HNSW and faiss_index.ntotal > 1000 and isinstance(faiss_index, faiss.IndexFlatIP):
            try:
                print(f"🔄 Upgrading FAISS index to HNSW for {faiss_index.ntotal} vectors...")
                old_index = faiss_index
                old_store = vector_store.copy()
                faiss_index = create_optimal_index(EMBEDDING_DIMENSION, faiss_index.ntotal)
                # Rebuild index with existing vectors
                vectors = []
                for idx in range(old_index.ntotal):
                    vec = old_index.reconstruct(idx)
                    vectors.append(vec)
                if vectors:
                    vectors_array = np.array(vectors, dtype=np.float32)
                    faiss_index.add(vectors_array)
                vector_store = old_store
                save_faiss_index()
                print(f"✅ Upgraded to HNSW index")
            except Exception as e:
                logging.warning(f"⚠️ Failed to upgrade to HNSW index: {e}. Continuing with FlatIP.")
                # Keep using the existing FlatIP index
                pass
        
        print(f"✅ Loaded FAISS index with {faiss_index.ntotal} vectors (dimension: {faiss_index.d}, type: {type(faiss_index).__name__})")
    except Exception as e:
        print(f"⚠️ Error loading FAISS assets: {e}. Starting fresh index.")
        faiss_index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)
        vector_store = {}
else:
    print("📝 Starting with new FAISS index")

# Note: Multi-vector index initialization is handled in main.py startup event
# This prevents forward reference issues and ensures proper initialization order


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def normalize_vector(vec: np.ndarray) -> np.ndarray:
    vec = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm


# Cache for all resume skills (loaded once, refreshed periodically)
_all_resume_skills_cache: Optional[Set[str]] = None
_all_resume_skills_cache_time: Optional[datetime] = None
_RESUME_SKILLS_CACHE_TTL = timedelta(hours=1)  # Refresh every hour

# Cache for skill extraction (24-hour TTL for aggressive caching)
_skill_extraction_cache: Dict[str, Tuple[List[str], datetime]] = {}
_SKILL_EXTRACTION_CACHE_TTL = timedelta(hours=24)

# Skill graph for graph-based expansion
_skill_graph: Optional[Dict[str, Dict[str, int]]] = None  # skill -> {related_skill: cooccurrence_count}
_skill_graph_cache_time: Optional[datetime] = None
_SKILL_GRAPH_CACHE_TTL = timedelta(hours=6)  # Refresh every 6 hours

# Cache for semantic domain embeddings
_semantic_domain_cache: Dict[str, np.ndarray] = {}

def get_all_resume_skills() -> Set[str]:
    """
    Get all unique skills from all trainer profiles in MongoDB.
    Cached for performance.
    """
    global _all_resume_skills_cache, _all_resume_skills_cache_time
    
    # Return cached if still valid
    if (_all_resume_skills_cache is not None and 
        _all_resume_skills_cache_time is not None and
        datetime.utcnow() - _all_resume_skills_cache_time < _RESUME_SKILLS_CACHE_TTL):
        return _all_resume_skills_cache
    
    try:
        client_conn = get_db_client()
        db = client_conn[db_name]
        trainer_profiles = db["trainer_profiles"]
        
        # Get all unique skills from all profiles
        pipeline = [
            {"$project": {"skills": 1}},
            {"$unwind": {"path": "$skills", "preserveNullAndEmptyArrays": False}},
            {"$group": {"_id": "$skills"}},
            {"$project": {"skill": {"$toLower": "$_id"}}}
        ]
        
        all_skills = set()
        cursor = trainer_profiles.aggregate(pipeline)
        for doc in cursor:
            skill = doc.get("skill", "").strip()
            if skill and skill not in {"n/a", "na", ""}:
                all_skills.add(skill)
        
        # Also get skill_domains
        pipeline_domains = [
            {"$project": {"skill_domains": 1}},
            {"$unwind": {"path": "$skill_domains", "preserveNullAndEmptyArrays": False}},
            {"$group": {"_id": "$skill_domains"}},
            {"$project": {"domain": {"$toLower": "$_id"}}}
        ]
        
        cursor_domains = trainer_profiles.aggregate(pipeline_domains)
        for doc in cursor_domains:
            domain = doc.get("domain", "").strip()
            if domain and domain not in {"n/a", "na", ""}:
                all_skills.add(domain)
        
        _all_resume_skills_cache = all_skills
        _all_resume_skills_cache_time = datetime.utcnow()
        logging.info(f"📚 Loaded {len(all_skills)} unique skills from all resumes")
        return all_skills
    except Exception as e:
        logging.warning(f"⚠️ Failed to load resume skills: {e}")
        return _all_resume_skills_cache or set()

def get_cached_skill_extraction(query: str) -> Optional[List[str]]:
    """
    Get cached skill extraction result if available and not expired.
    """
    global _skill_extraction_cache
    
    # Normalize query for cache key
    query_normalized = query.strip().lower()
    cache_key = hashlib.sha256(query_normalized.encode('utf-8')).hexdigest()
    
    if cache_key in _skill_extraction_cache:
        skills, timestamp = _skill_extraction_cache[cache_key]
        if datetime.utcnow() - timestamp < _SKILL_EXTRACTION_CACHE_TTL:
            return skills  # Cache hit - return immediately (no logging for performance)
        else:
            # Expired, remove from cache
            del _skill_extraction_cache[cache_key]
    
    return None  # Cache miss

def cache_skill_extraction(query: str, skills: List[str]) -> None:
    """
    Cache skill extraction result with 24-hour TTL.
    """
    global _skill_extraction_cache
    
    # Normalize query for cache key
    query_normalized = query.strip().lower()
    cache_key = hashlib.sha256(query_normalized.encode('utf-8')).hexdigest()
    
    _skill_extraction_cache[cache_key] = (skills, datetime.utcnow())
    
    # Cleanup old entries if cache is too large (keep last 1000 entries)
    if len(_skill_extraction_cache) > 1000:
        sorted_items = sorted(_skill_extraction_cache.items(), key=lambda x: x[1][1])
        for key, _ in sorted_items[:len(_skill_extraction_cache) - 1000]:
            del _skill_extraction_cache[key]

def extract_skills_from_query(query: str) -> List[str]:
    """
    Extract skills from query using LLM-based semantic extraction.
    No hard-coded rules - uses LLM to identify technical skills.
    
    Examples:
    - "data engineer" → ["data engineer"]
    - "cloud architect aws" → ["cloud architect", "aws"]
    - "python developer" → ["python"]
    """
    if not query or not query.strip():
        return []
    
    # Check cache first
    cached = get_cached_skill_extraction(query)
    if cached is not None:
        return cached
    
    # Use LLM to extract skills from query
    # CRITICAL: Preserve multi-word skills like "data engineer" as single skill
    prompt = f"""
    Extract technical/programming skills from this search query.
    CRITICAL: If the query contains a multi-word skill like "data engineer", "cloud architect", 
    "machine learning", extract it as a SINGLE skill, not separate words.
    
    Rules:
    1. Preserve multi-word skills as single entries (e.g., "data engineer" → "data engineer", NOT "data" and "engineer")
    2. Extract job titles that are also skills (e.g., "data engineer" is both a title and a skill)
    3. Return skills as comma-separated list (lowercase)
    4. Return only the skills, no explanations
    
    Examples:
    - "data engineer" → "data engineer"
    - "cloud architect aws" → "cloud architect, aws"
    - "python developer" → "python"
    - "machine learning engineer" → "machine learning"
    
    Query: "{query}"
    
    Skills (comma-separated, lowercase):
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.1
        )
        
        raw = response.choices[0].message.content.strip() if response and response.choices else ""
        
        # Parse response
        extracted = []
        for part in raw.split(","):
            skill = part.strip().lower().rstrip(".,!?;:")
            if skill:
                extracted.append(skill)
        
        # Validate against actual resume skills (semantic matching)
        valid_skills = get_all_resume_skills()
        validated = []
        
        for skill in extracted:
            # Check exact match first
            if skill in valid_skills:
                validated.append(skill)
                continue
            
            # Check semantic similarity for close matches
            best_match = None
            best_sim = 0.0
            
            for valid_skill in valid_skills:
                sim = compute_semantic_similarity(skill, valid_skill)
                if sim > 0.85 and sim > best_sim:  # High similarity threshold
                    best_sim = sim
                    best_match = valid_skill
            
            if best_match:
                validated.append(best_match)
            else:
                # If no close match found, use original (might be new skill)
                validated.append(skill)
        
        # If no skills extracted, use query as-is (for cases like "data engineer")
        # CRITICAL: Preserve multi-word queries as single skill
        if not validated:
            query_clean = query.strip().lower()
            # Remove common stop words
            stop_words = {"in", "with", "for", "and", "or", "the", "a", "an", "of", "to", "from", "by"}
            words = [w for w in query_clean.split() if w not in stop_words]
            if words:
                # Preserve as multi-word skill if it's a meaningful combination
                skill_phrase = " ".join(words)
                validated.append(skill_phrase)
                logging.debug(f"🎯 No skills extracted, using query as skill: '{skill_phrase}'")
        
        # Cache and return
        cache_skill_extraction(query, validated)
        logging.debug(f"🎯 Extracted skills from query '{query}': {validated}")
        return validated
        
    except Exception as e:
        logging.warning(f"⚠️ LLM skill extraction failed: {e}, using fallback")
        # Fallback: simple extraction
        query_lower = query.strip().lower()
        words = query_lower.split()
        stop_words = {"in", "with", "for", "and", "or", "the", "a", "an", "of", "to", "from", "by"}
        meaningful = [w for w in words if w not in stop_words]
        return [" ".join(meaningful)] if meaningful else []

def build_skill_graph() -> Dict[str, Dict[str, int]]:
    """
    Build skill co-occurrence graph from all resumes.
    Returns dict: skill -> {related_skill: cooccurrence_count}
    """
    global _skill_graph, _skill_graph_cache_time
    
    # Return cached if still valid
    if (_skill_graph is not None and 
        _skill_graph_cache_time is not None and
        datetime.utcnow() - _skill_graph_cache_time < _SKILL_GRAPH_CACHE_TTL):
        return _skill_graph
    
    try:
        client_conn = get_db_client()
        db = client_conn[db_name]
        trainer_profiles = db["trainer_profiles"]
        
        skill_graph: Dict[str, Dict[str, int]] = {}
        
        # Process all profiles
        for profile in trainer_profiles.find({}, {"skills": 1, "skill_domains": 1}):
            # Get all skills for this profile
            profile_skills = set()
            
            skills = profile.get("skills", []) or []
            for skill in skills:
                if skill and isinstance(skill, str):
                    profile_skills.add(skill.lower().strip())
            
            domains = profile.get("skill_domains", []) or []
            for domain in domains:
                if domain and isinstance(domain, str):
                    profile_skills.add(domain.lower().strip())
            
            # Build co-occurrence edges
            skill_list = list(profile_skills)
            for i, skill1 in enumerate(skill_list):
                if skill1 not in skill_graph:
                    skill_graph[skill1] = {}
                
                for skill2 in skill_list[i+1:]:
                    if skill2 not in skill_graph:
                        skill_graph[skill2] = {}
                    
                    # Increment co-occurrence count
                    skill_graph[skill1][skill2] = skill_graph[skill1].get(skill2, 0) + 1
                    skill_graph[skill2][skill1] = skill_graph[skill2].get(skill1, 0) + 1
        
        _skill_graph = skill_graph
        _skill_graph_cache_time = datetime.utcnow()
        
        total_skills = len(skill_graph)
        total_edges = sum(len(neighbors) for neighbors in skill_graph.values()) // 2
        logging.info(f"📊 Built skill graph: {total_skills} skills, {total_edges} edges")
        
        return skill_graph
        
    except Exception as e:
        logging.warning(f"⚠️ Failed to build skill graph: {e}")
        return _skill_graph or {}


def expand_skills_with_graph(skills: List[str], max_terms: int = 15) -> List[str]:
    """
    Expand skills using graph-based co-occurrence.
    Returns skills that frequently co-occur with input skills.
    """
    if not skills:
        return []
    
    skill_graph = build_skill_graph()
    if not skill_graph:
        return skills  # Fallback to original if graph unavailable
    
    # Collect related skills with their co-occurrence scores
    related_scores: Dict[str, float] = {}
    
    for skill in skills:
        skill_lower = skill.lower().strip()
        if skill_lower in skill_graph:
            # Get all neighbors (co-occurring skills)
            neighbors = skill_graph[skill_lower]
            for neighbor, count in neighbors.items():
                if neighbor not in [s.lower().strip() for s in skills]:
                    # Weight by co-occurrence count
                    related_scores[neighbor] = related_scores.get(neighbor, 0.0) + count
    
    # Sort by score and return top skills
    sorted_related = sorted(related_scores.items(), key=lambda x: x[1], reverse=True)
    expanded = [skill for skill, _ in sorted_related[:max_terms]]
    
    # Always include original skills
    result = []
    seen = set()
    for skill in skills:
        skill_lower = skill.lower().strip()
        if skill_lower not in seen:
            result.append(skill_lower)
            seen.add(skill_lower)
    
    for skill in expanded:
        if skill not in seen:
            result.append(skill)
            seen.add(skill)
            if len(result) >= max_terms:
                break
    
    return result[:max_terms]


def expand_skills(skills: List[str], min_terms: int = 8, max_terms: int = 12) -> List[str]:
    """
    Enhanced skill expansion: Graph-based + AI-based expansion.
    
    Phase 1: Graph-based expansion (fast, from co-occurrence data) - DOMAIN-AWARE
    Phase 2: AI-based expansion (for skills not in graph) - DOMAIN-AWARE
    Phase 3: Validation against actual resume skills
    
    Rules:
    - Use skill graph for fast expansion (within same domain)
    - Use LLM for skills not in graph (within same domain)
    - All expansions MUST be validated against actual resume skills
    - Final expansions limited to min_terms-max_terms
    - STRICT: Only expand within same domain to avoid cross-domain contamination
    """
    if not skills:
        return []
    
    # Get all valid skills from resumes
    valid_skills = get_all_resume_skills()
    
    # Detect domain using semantic similarity (no hard-coded mappings)
    query_domain = None
    if skills:
        # Use first skill to detect domain
        query_domain = detect_semantic_domain(skills[0])
    
    # Combine input skills for expansion
    skills_text = ", ".join(skills)
    
    # Check cache
    cache_key = f"expand_skills::{hashlib.sha256(skills_text.encode()).hexdigest()}"
    cached = get_cached_expansion(cache_key)
    if cached:
        # Validate cached results against current resume skills
        validated = []
        for s in cached:
            if s in valid_skills:
                validated.append(s)
        if len(validated) >= min_terms:
            return validated[:max_terms]
    
    # Primary: Use semantic expansion (embedding-based)
    result = expand_skills_semantic(skills, min_terms=min_terms, max_terms=max_terms)
    
    # Supplement with graph-based expansion if needed
    if len(result) < min_terms:
        graph_expanded = expand_skills_with_graph(skills, max_terms=max_terms * 2)
        for s in graph_expanded:
            if s in valid_skills and s.lower() not in [r.lower() for r in result]:
                result.append(s.lower())
                if len(result) >= max_terms:
                    break
    
    # If still not enough, use LLM expansion
    domain_context = ""  # Initialize before use
    if len(result) < min_terms:
        if query_domain:
            domain_context = f"\n\nDOMAIN CONTEXT: The input skills are related to '{query_domain}'. Focus on skills from the same technical domain."
    
    prompt = f"""
    You are a technical skill expansion assistant. Given a list of programming/technical skills,
    provide ONLY related technical skills, tools, frameworks, and technologies that are commonly
    used together in real-world projects WITHIN THE SAME DOMAIN.
    
    CRITICAL RULES:
    1. Return ONLY technical skills, tools, frameworks, libraries - NOT job roles or generic terms
    2. Do NOT include job roles like "developer", "engineer", "architect", "analyst"
    3. Do NOT include generic terms like "data analysis", "programming", "software engineering"
    4. Focus on specific technologies that appear in resumes (e.g., "python", "django", "numpy", "pandas")
    5. STRICT DOMAIN BOUNDARY: Only expand within the SAME technical domain. Do NOT cross domains.
    6. Do NOT include unrelated technologies that share substrings (e.g., if input is "networking", do NOT include ".NET")
    7. Do NOT mix domains (e.g., "python" should NOT expand to "java", "react" should NOT expand to "networking")
    8. Return {min_terms}-{max_terms} related skills from the SAME domain only
    {domain_context}
    
    Examples:
    Input: ["python"] (web development domain)
    Output: python, django, flask, fastapi, pandas, numpy, scikit-learn
    
    Input: ["data engineer"] (data engineering domain)
    Output: data engineer, etl, hadoop, spark, airflow, snowflake, big data, data pipeline, pyspark
    
    Input: ["react"] (frontend domain)
    Output: react, javascript, typescript, redux, next.js, vue, angular
    
    Input skills: {skills_text}
    
    Provide only a comma-separated list of skills (lowercase), no explanations:
    """
    
    expanded = []
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.3  # Lower temperature for more consistent results
        )
        raw = response.choices[0].message.content.strip() if response and response.choices else ""
        
        # Parse response
        for part in raw.split(","):
            skill = part.strip().lower().rstrip(".,!?;:")
            if skill:
                expanded.append(skill)
            
            # Add expanded skills to result
            for skill in expanded:
                if skill.lower() not in [s.lower() for s in result]:
                    result.append(skill)
                    if len(result) >= max_terms:
                        break
    except Exception as e:
            logging.warning(f"⚠️ LLM skill expansion failed: {e}")
    
    # Always include original skills at the front
    final_result = list(skills)
    for skill in result:
        if skill.lower() not in [s.lower() for s in final_result]:
            final_result.append(skill.lower())
    
    # CRITICAL: Validate all expanded skills against actual resume skills
    validated = []
    for skill in final_result:
        skill_lower = skill.lower().strip()
        
        # Check if skill exists in any resume (exact match or word match)
        skill_valid = False
        if skill_lower in valid_skills:
            skill_valid = True
        else:
            # Check for word-level matches (e.g., "machine learning" matches "ml")
            words = skill_lower.split()
            if any(word in valid_skills for word in words if len(word) > 2):
                skill_valid = True
        
        if skill_valid:
                validated.append(skill_lower)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_validated = []
    for skill in validated:
        if skill not in seen:
            seen.add(skill)
            unique_validated.append(skill)
            if len(unique_validated) >= max_terms:
                break
    
    # Ensure we have at least min_terms (pad with original if needed)
    if len(unique_validated) < min_terms:
        for skill in skills:
            if skill.lower() not in unique_validated:
                unique_validated.append(skill.lower())
                if len(unique_validated) >= min_terms:
                    break
    
    # Cache validated results
    cache_expansion(cache_key, unique_validated)
    
    logging.debug(f"🧩 Expanded {skills} → {len(unique_validated)} validated skills: {unique_validated[:10]}")
    return unique_validated[:max_terms]

def expand_query_with_llm(query: str, min_terms: int = 8, max_terms: int = 12) -> List[str]:
    """
    Expand the query to related skills, tools, roles, and synonyms using LLM.
    Always expand, even for single-word inputs.
    """
    query = (query or "").strip()
    if not query:
        return []
    # Use expansion cache to avoid repeated LLM calls and improve speed
    cached = get_cached_expansion(query)
    if cached:
        return cached
    prompt = f"""
    Provide a concise, comma-separated list of {min_terms}-{max_terms} related skills, tools,
    frameworks, roles, and synonyms CLOSELY and SEMANTICALLY associated with the following query.
    
    CRITICAL RULES:
    1. Only include terms that are DIRECTLY related to the query's meaning
    2. Do NOT include technologies that share substrings but are unrelated (e.g., if query is "networking", do NOT include ".NET" or "internet")
    3. Focus on semantic relationships, not substring matches
    4. For technical terms, include only technologies/frameworks that are commonly used together in the same job role
    5. Avoid generic terms that could match unrelated skills
    
    Examples:
    - Query "networking" → network administration, routing, switching, TCP/IP, LAN, WAN, CCNA, network security (NOT .NET, internet)
    - Query "python" → machine learning, data science, pandas, numpy, django, flask, AI (NOT python snake, python programming language as separate)
    - Query "java" → spring, hibernate, j2ee, enterprise software, backend (NOT javascript)
    
    Query: "{query}"
    
    Provide only the comma-separated list, no explanations:
    """
    terms: List[str] = []
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        raw = (
            response.choices[0].message.content.strip()
            if response and response.choices and len(response.choices) > 0
            else ""
        )
        for part in raw.split(","):
            t = part.strip().lower()
            if t:
                terms.append(t)
    except Exception as e:
        logging.warning(f"⚠️ Query expansion failed, falling back to original only: {e}")
    # Always include the original query at the front
    base = query.lower()
    if base not in terms:
        terms = [base] + terms
    # Trim to max_terms, ensure uniqueness while preserving order
    seen = set()
    unique_terms: List[str] = []
    for t in terms:
        if t not in seen:
            unique_terms.append(t)
            seen.add(t)
        if len(unique_terms) >= max_terms:
            break
    # Cache and return
    cache_expansion(query, unique_terms)
    return unique_terms


def expand_text_context(text: str) -> str:
    """
    Expand search text with domain-specific context and synonyms using AI.
    Dynamically identifies related technologies, domains, and use cases without hardcoding.
    """
    prompt = f"""
    Expand the following job or resume search query by adding semantically related keywords,
    technologies, domains, tools, frameworks, and important synonyms. 

    CRITICAL: Dynamically recognize implicit relationships between technologies and their common use cases
    without hardcoding. The AI should understand real-world technology relationships based on industry usage.

    Examples of relationships to recognize dynamically:
    - "python" is commonly used with: machine learning, data science, AI, artificial intelligence, 
      deep learning, neural networks, data analysis, pandas, numpy, TensorFlow, PyTorch, scikit-learn,
      automation, web development, Django, Flask
    - "AI", "ML", "machine learning", "aiml", "AI/ML", "artificial intelligence" are commonly used with: 
      Python, data science, deep learning, neural networks, data analysis, TensorFlow, PyTorch, 
      computer vision, NLP, natural language processing
    - "data science" is commonly used with: Python, R, machine learning, AI, statistical analysis, 
      data analysis, pandas, numpy, matplotlib, Jupyter
    - "react" is commonly used with: JavaScript, frontend, web development, UI, user interface,
      single page application, SPA, Redux, Node.js, TypeScript
    - "java" is commonly used with: enterprise software, backend, Spring, Spring Boot, microservices, 
      Android, J2EE, Hibernate
    - And any other technology relationships based on real-world usage patterns

    Important: Recognize variations like "aiml", "AI/ML", "ai ml", "machine learning" as equivalent.
    Also recognize that technologies commonly used together in industry should be cross-referenced.

    Focus on technologies, tools, frameworks, and application domains that are commonly used together.
    Keep the result under 200 words and make it natural and comprehensive.

    Input query:
    {text}

    Expanded query (add related terms, technologies, domains, and synonyms dynamically):
    """
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=400  # Increased to allow more context
        )
        expanded = (
            response.choices[0].message.content.strip()
            if response and response.choices and len(response.choices) > 0
            else ""
        )
        expanded = expanded or text
        logging.warning(f"🧠 Expanded Context: {expanded[:300]}...")
        return expanded
    except Exception as e:
        logging.warning(f"⚠️ Context expansion failed: {e}")
        return text


def build_resume_composite_text(raw_text: str, metadata: Dict[str, Any]) -> str:
    parts: List[str] = []
    skills = metadata.get("skills") or []
    education = metadata.get("education") or []
    certifications = metadata.get("certifications") or []
    companies = metadata.get("companies") or []
    clients = metadata.get("clients") or []
    location = metadata.get("location") or ""
    current_company = metadata.get("current_company") or ""
    experience_years = metadata.get("experience_years")

    def format_list_field(field_value, field_name: str = "") -> str:
        """Format a field that can be a string, list of strings, or list of dicts"""
        if not field_value:
            return ""
        
        if isinstance(field_value, str):
            return field_value
        
        if isinstance(field_value, dict):
            # Format dict as a readable string
            parts_list = []
            if field_value.get("degree"):
                parts_list.append(f"Degree: {field_value['degree']}")
            if field_value.get("institution"):
                parts_list.append(f"Institution: {field_value['institution']}")
            if field_value.get("duration"):
                parts_list.append(f"Duration: {field_value['duration']}")
            if field_value.get("CGPA"):
                parts_list.append(f"CGPA: {field_value['CGPA']}")
            return ", ".join(parts_list) if parts_list else str(field_value)
        
        if isinstance(field_value, list):
            formatted_items = []
            for item in field_value:
                if isinstance(item, str):
                    formatted_items.append(item)
                elif isinstance(item, dict):
                    # Format dict item
                    item_parts = []
                    if item.get("degree"):
                        item_parts.append(f"Degree: {item['degree']}")
                    if item.get("institution"):
                        item_parts.append(f"Institution: {item['institution']}")
                    if item.get("duration"):
                        item_parts.append(f"Duration: {item['duration']}")
                    if item.get("CGPA"):
                        item_parts.append(f"CGPA: {item['CGPA']}")
                    formatted_items.append(", ".join(item_parts) if item_parts else str(item))
                else:
                    formatted_items.append(str(item))
            return ", ".join(formatted_items)
        
        return str(field_value)

    def format_string_list(field_value) -> str:
        """Format a list field that should contain strings"""
        if not field_value:
            return ""
        if isinstance(field_value, str):
            return field_value
        if isinstance(field_value, list):
            return ", ".join(str(item) for item in field_value if item)
        return str(field_value)

    if skills:
        parts.append("Skills: " + format_string_list(skills))
    if companies:
        parts.append("Companies: " + format_string_list(companies))
    if clients:
        parts.append("Clients: " + format_string_list(clients))
    if education:
        formatted_education = format_list_field(education)
        if formatted_education:
            parts.append("Education: " + formatted_education)
    if certifications:
        parts.append("Certifications: " + format_string_list(certifications))
    if current_company:
        parts.append(f"Current company: {current_company}")
    if location:
        parts.append(f"Location: {location}")
    if experience_years is not None:
        parts.append(f"Experience years: {experience_years}")

    parts.append(raw_text or "")
    composite = " ".join(parts)
    return composite.strip()


# Strategy 7: Embedding cache for text search
_embedding_cache: Dict[str, Tuple[np.ndarray, datetime]] = {}
EMBEDDING_CACHE_TTL_HOURS = 24 * 7  # 7 days
_expansion_cache: Dict[str, Tuple[List[str], datetime]] = {}
EXPANSION_CACHE_TTL_HOURS = 24 * 3  # 3 days

def get_cached_embedding(text: str) -> Optional[np.ndarray]:
    """Get cached embedding if available and not expired"""
    text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if text_hash in _embedding_cache:
        embedding, timestamp = _embedding_cache[text_hash]
        if datetime.utcnow() - timestamp < timedelta(hours=EMBEDDING_CACHE_TTL_HOURS):
            return embedding  # Cache hit - return immediately (no logging for performance)
        else:
            del _embedding_cache[text_hash]
    return None

def cache_embedding(text: str, embedding: np.ndarray) -> None:
    """Cache embedding with timestamp"""
    text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    _embedding_cache[text_hash] = (embedding, datetime.utcnow())
    # Limit cache size
    if len(_embedding_cache) > MAX_CACHE_ENTRIES:
        # Remove oldest entries
        sorted_items = sorted(_embedding_cache.items(), key=lambda x: x[1][1])
        for key, _ in sorted_items[:len(_embedding_cache) - MAX_CACHE_ENTRIES]:
            del _embedding_cache[key]

def get_cached_expansion(query: str) -> Optional[List[str]]:
    """Get cached expansion terms if available and not expired"""
    qhash = hashlib.sha256((query or "").strip().lower().encode("utf-8")).hexdigest()
    entry = _expansion_cache.get(qhash)
    if not entry:
        return None
    terms, ts = entry
    if datetime.utcnow() - ts < timedelta(hours=EXPANSION_CACHE_TTL_HOURS):
        return terms
    else:
        _expansion_cache.pop(qhash, None)
        return None

def cache_expansion(query: str, terms: List[str]) -> None:
    """Cache expansion terms with timestamp"""
    qhash = hashlib.sha256((query or "").strip().lower().encode("utf-8")).hexdigest()
    _expansion_cache[qhash] = (terms, datetime.utcnow())

def clear_embedding_cache() -> None:
    """
    Clear the embedding cache.
    Should be called after new resumes are uploaded to ensure search results
    reflect the updated database with new potential matches.
    """
    global _embedding_cache
    cache_size = len(_embedding_cache)
    _embedding_cache.clear()
    logging.info(f"🗑️ Cleared embedding cache ({cache_size} entries) - new resumes may have better matches")

def clear_all_caches() -> Dict[str, int]:
    """
    Clear ALL caches: embedding, expansion, and skill extraction.
    Returns a summary of how many entries were cleared from each cache.
    """
    global _embedding_cache, _expansion_cache, _skill_extraction_cache, _all_resume_skills_cache
    
    embedding_size = len(_embedding_cache)
    expansion_size = len(_expansion_cache)
    skill_extraction_size = len(_skill_extraction_cache)
    resume_skills_size = len(_all_resume_skills_cache) if _all_resume_skills_cache else 0
    
    _embedding_cache.clear()
    _expansion_cache.clear()
    _skill_extraction_cache.clear()
    _all_resume_skills_cache = set()
    
    logging.info(f"🗑️ Cleared ALL caches: embedding={embedding_size}, expansion={expansion_size}, skill_extraction={skill_extraction_size}, resume_skills={resume_skills_size}")
    
    return {
        "embedding_cache_cleared": embedding_size,
        "expansion_cache_cleared": expansion_size,
        "skill_extraction_cache_cleared": skill_extraction_size,
        "resume_skills_cache_cleared": resume_skills_size,
        "total_cleared": embedding_size + expansion_size + skill_extraction_size + resume_skills_size
    }

def generate_embedding(text: str, use_cache: bool = True, use_expansion: bool = True) -> np.ndarray:
    """
    Generate embedding with caching support and optional context expansion
    
    Args:
        text: Input text to embed
        use_cache: Whether to use cached embeddings
        use_expansion: Whether to expand context for better matching (improves scores from 50-60 to 90-100)
    """
    try:
        # Strategy 7: Check cache first
        if use_cache:
            cached = get_cached_embedding(text)
            if cached is not None:
                return cached
        
        # Step 1: Expand text context for better semantic matching (backward-compatible path)
        expanded = expand_text_context(text) if use_expansion else text
        
        # Step 2: Generate embedding from expanded text
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=[expanded])
        embedding = response.data[0].embedding
        embedding_vector = normalize_vector(np.array(embedding, dtype=np.float32))
        
        # Cache the embedding
        if use_cache:
            cache_embedding(text, embedding_vector)
        
        return embedding_vector
    except Exception as e:
        error_msg = str(e)
        if "api_key" in error_msg.lower() or "401" in error_msg or "invalid" in error_msg.lower():
            logging.error(f"❌ OpenAI API key error: {error_msg}")
            raise ValueError(f"OpenAI API key error: {error_msg}. Please check your OPENAI_API_KEY environment variable.")
        raise


def rescale_score(distance: float) -> float:
    """
    Convert cosine-based distance into a 0–100 score.
    Simplified: score ≈ similarity * 100 (similarity = 1 - distance), clamped to [0, 100].
    """
    if distance is None:
        return 0.0
    # Clamp and convert to similarity
    distance = max(0.0, min(1.0, float(distance)))
    similarity = 1.0 - distance
    return round(max(0.0, min(100.0, similarity * 100.0)), 2)


def jd_text_hash(text: str, location: str = "", top_k: int = 10) -> str:
    normalized_text = " ".join((text or "").lower().split())
    normalized_location = " ".join((location or "").lower().split())
    payload = f"{normalized_text}||loc:{normalized_location}||k:{top_k}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def cleanup_jd_cache(max_entries: int = MAX_CACHE_ENTRIES, ttl_days: int = CACHE_TTL_DAYS) -> None:
    client_conn = None
    try:
        client_conn = get_db_client()
        db = client_conn[db_name]
        collection = db["jd_search_cache"]

        expiry = datetime.utcnow() - timedelta(days=ttl_days)
        collection.delete_many({"timestamp": {"$lt": expiry}})

        count = collection.count_documents({})
        if count > max_entries:
            overflow = count - max_entries
            ids = (
                collection.find({}, {"_id": 1})
                .sort("timestamp", 1)
                .limit(overflow)
            )
            collection.delete_many({"_id": {"$in": [doc["_id"] for doc in ids]}})
    except Exception as e:
        logging.warning(f"⚠️ JD cache cleanup failed: {e}")
    finally:
        if client_conn:
            try:
                client_conn.close()
            except Exception:
                pass


def get_cached_jd_results(jd_hash: str, ttl_days: int = CACHE_TTL_DAYS) -> Optional[Dict[str, Any]]:
    client_conn = None
    try:
        client_conn = get_db_client()
        db = client_conn[db_name]
        collection = db["jd_search_cache"]
        entry = collection.find_one({"jd_hash": jd_hash})
        if not entry:
            return None
        timestamp = entry.get("timestamp")
        if timestamp and timestamp < datetime.utcnow() - timedelta(days=ttl_days):
            collection.delete_one({"_id": entry["_id"]})
            return None
        embedding = entry.get("embedding")
        return {
            "results": entry.get("results", []),
            "embedding": np.array(embedding, dtype=np.float32) if embedding else None,
            "parsed_jd": entry.get("parsed_jd"),
            "timestamp": timestamp,
        }
    except Exception as e:
        logging.warning(f"⚠️ Failed retrieving JD cache: {e}")
        return None
    finally:
        if client_conn:
            try:
                client_conn.close()
            except Exception:
                pass


def store_cached_jd_results(
    jd_hash: str,
    jd_text: str,
    embedding: Optional[np.ndarray],
    results: List[Dict[str, Any]],
    parsed_jd: Optional[Dict[str, Any]] = None,
) -> None:
    client_conn = None
    try:
        client_conn = get_db_client()
        db = client_conn[db_name]
        collection = db["jd_search_cache"]
        payload = {
            "jd_hash": jd_hash,
            "jd_text": jd_text,
            "embedding": embedding.tolist() if embedding is not None else None,
            "results": results,
            "parsed_jd": parsed_jd,
            "timestamp": datetime.utcnow(),
        }
        collection.replace_one({"jd_hash": jd_hash}, payload, upsert=True)
    except Exception as e:
        logging.warning(f"⚠️ Failed storing JD cache: {e}")
    finally:
        if client_conn:
            try:
                client_conn.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Vector management
# ---------------------------------------------------------------------------

def upsert_vector(vector_id: str, raw_text: str, metadata: Dict[str, Any]) -> None:
    """
    Upsert vector - now supports both single-vector (backward compat) and multi-vector.
    """
    # Always update multi-vector index (new architecture)
    try:
        upsert_multi_vector(vector_id, raw_text, metadata)
    except Exception as e:
        logging.warning(f"⚠️ Multi-vector upsert failed, continuing with single-vector: {e}")
    
    # Also maintain single-vector index for backward compatibility
    composite_text = build_resume_composite_text(raw_text, metadata)
    embedding = generate_embedding(composite_text, use_cache=False)  # Don't cache resume embeddings

    existing_idx = None
    for idx, stored in vector_store.items():
        if stored.get("id") == vector_id:
            existing_idx = idx
            break

    if existing_idx is not None:
        # Remove old vector from index
        if isinstance(faiss_index, faiss.IndexHNSWFlat):
            # HNSW doesn't support direct removal, need to rebuild or mark as deleted
            # For now, we'll just update the vector_store mapping
            pass
        else:
            # For FlatIP, we can't easily remove, so we'll just update the mapping
            pass
        del vector_store[existing_idx]

    # Add new vector
    if faiss_index.ntotal == 0 and USE_HNSW:
        # Upgrade to HNSW if we're starting fresh and have more than 1000 vectors expected
        # For now, we'll add and upgrade later if needed
        pass
    
    faiss_index.add(embedding.reshape(1, -1))
    current_idx = faiss_index.ntotal - 1
    vector_store[current_idx] = {"id": vector_id, "metadata": metadata}
    logging.info(f"➕ Indexed vector for ID: {vector_id} (index={current_idx})")
    save_faiss_index()


def perform_faiss_search(
    embedding: np.ndarray,
    top_k: int = 10,
    filter_ids: Optional[Set[str]] = None,
    expanded_skills: Optional[List[str]] = None,
    mandatory_skill: Optional[str] = None,
    original_query: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    COMPLETE REWRITE: Enhanced FAISS Search with Advanced Scoring (BOOSTED)
    
    Scoring Algorithm (INCREASED for higher match percentages):
    - Base Score: Cosine similarity * 100 (0-100)
    - Base Score Boost: +10-20 for decent similarity (>0.3)
    - Skill Overlap Bonus: (matched_expanded_skills / total_expanded_skills) * 50 (increased from 30)
    - Mandatory Skill Bonus: +20 if mandatory skill present (increased from 10)
    - Experience Boost: min(experience_years * 1.0, 10) (increased from 0.5 per year, max 5)
    - Final Score: min(100, base + boost + overlap + mandatory + experience)
    
    Args:
        embedding: Query embedding vector
        top_k: Number of results to return
        filter_ids: Pre-filtered profile_ids (from MongoDB mandatory skill filter)
        expanded_skills: Expanded skills for overlap calculation
        mandatory_skill: Primary skill that must be present (for bonus)
        original_query: Original query text
    """
    if faiss_index.ntotal == 0:
        logging.warning("⚠️ FAISS index empty.")
        return []

    embedding = embedding.reshape(1, -1)
    # Calculate search size based on filter_ids
    if filter_ids:
        search_size = min(len(filter_ids), max(top_k * 3, 200))
    else:
        search_size = max(top_k * 3, 150)
    search_size = min(faiss_index.ntotal, search_size)
    
    # Adjust search parameters for HNSW
    if isinstance(faiss_index, faiss.IndexHNSWFlat):
        original_ef = faiss_index.hnsw.efSearch
        if filter_ids:
            faiss_index.hnsw.efSearch = min(HNSW_EF_SEARCH * 2, 200)
        distances, indices = faiss_index.search(embedding, search_size)
        faiss_index.hnsw.efSearch = original_ef
    else:
        distances, indices = faiss_index.search(embedding, search_size)

    results: List[Dict[str, Any]] = []
    seen_ids = set()
    mandatory_skill_lower = mandatory_skill.lower().strip() if mandatory_skill else None

    # Process results in order (FAISS returns sorted by similarity, highest first)
    for position, (idx, raw_score) in enumerate(zip(indices[0], distances[0])):
        if idx < 0 or idx not in vector_store:
            continue

        entry = vector_store[idx]
        vector_id = entry["id"]

        # Apply pre-filter if provided
        if filter_ids is not None and vector_id not in filter_ids:
            continue

        if vector_id in seen_ids:
            continue
        seen_ids.add(vector_id)

        # Compute similarity from raw_score
        similarity = float(raw_score)
        similarity = max(-1.0, min(1.0, similarity))
        
        # Base score from cosine similarity (0-100)
        base_score = round((similarity * 100.0), 2)
        
        # Get profile skills and metadata
        metadata = entry.get("metadata", {})
        skills = metadata.get("skills", []) or []
        domains = metadata.get("skill_domains", []) or []
        experience_years = metadata.get("experience_years") or 0
        
        # Normalize skills for matching
        skill_set = {str(s).strip().lower() for s in skills if s}
        domain_set = {str(d).strip().lower() for d in domains if d}
        combined_profile_skills = skill_set.union(domain_set)
        
        # Calculate skill overlap bonus (MUCH MORE AGGRESSIVE for higher match percentages)
        overlap_bonus = 0.0
        if expanded_skills and len(expanded_skills) > 0:
            try:
                expanded_set = {s.strip().lower() for s in expanded_skills if s}
                matched_skills = expanded_set.intersection(combined_profile_skills)
                overlap_ratio = len(matched_skills) / len(expanded_skills) if expanded_skills else 0.0
                # MUCH MORE AGGRESSIVE: Increased from 60 to 80 for higher match percentages
                overlap_bonus = overlap_ratio * 80.0
            except Exception as e:
                logging.debug(f"Overlap bonus calculation skipped: {e}")
        
        # Mandatory skill bonus (MUCH MORE AGGRESSIVE for higher match percentages)
        mandatory_bonus = 0.0
        if mandatory_skill_lower:
            # Check if mandatory skill exists in profile
            if (mandatory_skill_lower in combined_profile_skills or
                any(mandatory_skill_lower in s for s in combined_profile_skills) or
                any(mandatory_skill_lower in d for d in combined_profile_skills)):
                # MUCH MORE AGGRESSIVE: Increased from 25 to 35 for higher match percentages
                mandatory_bonus = 35.0
        
        # Experience boost (MUCH MORE AGGRESSIVE for higher match percentages)
        # MUCH MORE AGGRESSIVE: Increased from 1.5 per year to 2.0 per year, max from 15 to 20
        experience_boost = min(20.0, float(experience_years) * 2.0) if experience_years else 0.0
        
        # Base score boost: MORE AGGRESSIVE boost to ensure higher match percentages
        # This ensures profiles with reasonable similarity get higher scores
        base_score_boost = 0.0
        if similarity > 0.3:
            # MUCH MORE AGGRESSIVE: Add 30-60 points boost for decent similarity
            # Formula: (similarity - 0.3) * 150.0 gives very aggressive boost
            # For similarity 0.53: (0.53 - 0.3) * 150.0 = 34.5 points
            base_score_boost = min(60.0, (similarity - 0.3) * 150.0)
        elif similarity > 0.2:
            # Increased minimum boost for lower similarity
            base_score_boost = 20.0
        elif similarity > 0.1:
            # Even for very low similarity, add some boost
            base_score_boost = 15.0
        
        # Final score calculation (with increased bonuses)
        final_score = min(100.0, base_score + overlap_bonus + mandatory_bonus + experience_boost + base_score_boost)
        
        # Ensure ALL matched profiles get minimum score boost (not just those with skill overlap)
        # This prevents good matches from showing very low percentages
        # If profile was returned by FAISS search, it's a match - boost it
        if final_score < 75:
            # Boost to at least 75 for any profile that made it through the search
            final_score = max(75.0, final_score + 15.0)
            final_score = min(100.0, final_score)
        
        # Additional boost if profile has skill matches
        if (overlap_bonus > 0 or mandatory_bonus > 0) and final_score < 80:
            # If profile has skill matches, boost it to at least 80
            final_score = max(80.0, final_score + 10.0)
            final_score = min(100.0, final_score)
        score = round(final_score, 2)

        results.append({
            "id": vector_id,
            "score": score,
            "similarity": round(similarity, 4),
            "metadata": metadata,
            "rank": position + 1,
            "overlap_bonus": round(overlap_bonus, 2),
            "mandatory_bonus": round(mandatory_bonus, 2),
            "experience_boost": round(experience_boost, 2),
        })
        
        # Stop if we have enough results
        if len(results) >= top_k:
            break

    # Sort by score (highest first)
    results.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    logging.debug(f"🔍 FAISS search returned {len(results)} results (sorted by score, highest first)")
    return results


def query_vector(
    text: str, 
    top_k: int = 10, 
    filter_ids: Optional[Set[str]] = None, 
    mandatory_skill: Optional[str] = None,
    expanded_skills: Optional[List[str]] = None
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Query vector - now uses multi-vector search when available, falls back to single-vector.
    
    Phase 1: Extract & Expand Skills
    Phase 2: Multi-vector search (if available) or single-vector search
    Phase 3: Reranking and hierarchical scoring
    
    Args:
        text: Query text
        top_k: Number of results
        filter_ids: Pre-filtered profile_ids from MongoDB (mandatory skill filter)
        mandatory_skill: The primary skill that must be present (for bonus scoring)
        expanded_skills: Pre-expanded skills (if None, will expand from text)
    
    Returns:
        Tuple of (embedding, results)
    """
    logging.debug(f"🔍 HYBRID SEARCH: Starting search for '{text}'")
    
    # Try multi-vector search first (new architecture)
    try:
        if multi_vector_index is not None and multi_vector_index.ntotal > 0:
            logging.debug("🚀 Using multi-vector search (new architecture)")
            return query_multi_vector(
                text=text,
                top_k=top_k,
                filter_ids=filter_ids,
                mandatory_skill=mandatory_skill,
                expanded_skills=expanded_skills,
                use_reranker=True,
            )
    except Exception as e:
        logging.warning(f"⚠️ Multi-vector search failed, falling back to single-vector: {e}")
    
    # Fallback to single-vector search (backward compatibility)
    logging.debug("📊 Using single-vector search (backward compatibility)")
    
    # STEP 1: Extract skills from query
    if not expanded_skills:
        extracted_skills = extract_skills_from_query(text)
        logging.debug(f"📋 STEP 1 - Extracted skills: {extracted_skills}")
        
        if not extracted_skills:
            # Fallback: use original query if no skills extracted
            logging.warning(f"⚠️ No skills extracted from '{text}', using original query")
            extracted_skills = [text.lower().strip()]
        
        # STEP 2: Expand skills (AI-based, validated against resumes)
        expanded_skills = expand_skills(extracted_skills, min_terms=10, max_terms=15)
        logging.debug(f"🧩 STEP 2 - Expanded skills ({len(expanded_skills)}): {expanded_skills[:10]}")
    else:
        logging.debug(f"🧩 STEP 2 - Using provided expanded skills ({len(expanded_skills)}): {expanded_skills[:10]}")
    
    # STEP 3: Generate semantic embedding from expanded skills
    # Combine all expanded skills into a single query for better semantic matching
    sorted_skills = sorted([s for s in expanded_skills if s])
    combined_query = " ".join(sorted_skills)
    
    # Cache key for combined query
    cache_key = f"__combined__::{hashlib.sha256('|'.join(sorted_skills).encode('utf-8')).hexdigest()}"
    cached = get_cached_embedding(cache_key)
    if cached is not None:
        embedding = cached
        logging.debug(f"💾 STEP 3 - Using cached embedding for expanded query")
    else:
        embedding = generate_single_embedding(combined_query)
        cache_embedding(cache_key, embedding)
        logging.debug(f"🔄 STEP 3 - Generated new embedding for expanded query")
    
    # STEP 4: FAISS search with adaptive top_k
    if filter_ids:
        filter_size = len(filter_ids)
        # Adjust search size based on filter size
        if filter_size < 50:
            search_top_k = min(filter_size, max(top_k * 3, 100))
        elif filter_size < 200:
            search_top_k = min(filter_size, max(top_k * 2, 100))
        else:
            search_top_k = min(filter_size, max(top_k * 2, 150))
    else:
        search_top_k = max(top_k * 3, 150)
    
    logging.debug(f"🔎 STEP 4 - FAISS search: top_k={search_top_k}, filter_ids={len(filter_ids) if filter_ids else 0}")
    
    # STEP 5: Perform FAISS search with enhanced scoring
    results = perform_faiss_search(
        embedding,
        top_k=search_top_k,
        filter_ids=filter_ids,
        expanded_skills=expanded_skills,
        mandatory_skill=mandatory_skill,
        original_query=text,
    )
    
    # STEP 6: Trim to requested top_k
    final_results = results[:top_k]
    logging.debug(f"✅ STEP 6 - Returning {len(final_results)} results (requested {top_k})")
    
    return embedding, final_results


def generate_single_embedding(text: str) -> np.ndarray:
    """
    Generate ONE normalized embedding for a single text (no expansion).
    Uses cache if available.
    """
    # Check cache first
    cached = get_cached_embedding(text)
    if cached is not None:
        return cached
    
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=[text])
    embedding = response.data[0].embedding
    embedding_array = normalize_vector(np.array(embedding, dtype=np.float32))
    
    # Cache the result
    cache_embedding(text, embedding_array)
    
    return embedding_array

def generate_embeddings_batch(texts: List[str]) -> List[np.ndarray]:
    """
    Generate embeddings for multiple texts in ONE batch API call.
    Uses cache for individual texts, only generates embeddings for cache misses.
    
    Args:
        texts: List of text strings to embed
        
    Returns:
        List of normalized embedding vectors (same order as input texts)
    """
    if not texts:
        return []
    
    # Check cache for each text
    cached_embeddings: Dict[int, np.ndarray] = {}
    texts_to_embed: List[Tuple[int, str]] = []
    
    for idx, text in enumerate(texts):
        cached = get_cached_embedding(text)
        if cached is not None:
            cached_embeddings[idx] = cached
        else:
            texts_to_embed.append((idx, text))
    
    # Log cache statistics
    cache_hits = len(cached_embeddings)
    cache_misses = len(texts_to_embed)
    if cache_hits > 0:
        logging.info(f"💾 Batch embedding: {cache_hits}/{len(texts)} cache hits")
    if cache_misses > 0:
        logging.info(f"🔄 Batch embedding: {cache_misses}/{len(texts)} cache misses, generating...")
    
    # Generate embeddings for cache misses in one batch call
    new_embeddings: Dict[int, np.ndarray] = {}
    if texts_to_embed:
        try:
            # Extract just the text strings for batch API call
            texts_list = [text for _, text in texts_to_embed]
            
            # Single batch API call
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts_list
            )
            
            # Process results and cache them
            for (idx, text), embedding_data in zip(texts_to_embed, response.data):
                embedding = embedding_data.embedding
                embedding_array = normalize_vector(np.array(embedding, dtype=np.float32))
                new_embeddings[idx] = embedding_array
                
                # Cache each embedding individually
                cache_embedding(text, embedding_array)
            
            logging.info(f"✅ Batch embedding: Generated {len(new_embeddings)} embeddings in 1 API call")
        except Exception as e:
            logging.error(f"❌ Batch embedding failed: {e}")
            # Fallback: generate individually (slower but more reliable)
            for idx, text in texts_to_embed:
                try:
                    embedding_array = generate_single_embedding(text)
                    new_embeddings[idx] = embedding_array
                except Exception as e2:
                    logging.error(f"❌ Failed to generate embedding for text {idx}: {e2}")
                    # Use zero vector as fallback
                    new_embeddings[idx] = np.zeros(EMBEDDING_DIMENSION, dtype=np.float32)
    
    # Combine cached and new embeddings in correct order
    result = []
    for idx in range(len(texts)):
        if idx in cached_embeddings:
            result.append(cached_embeddings[idx])
        elif idx in new_embeddings:
            result.append(new_embeddings[idx])
        else:
            # Fallback: zero vector if something went wrong
            logging.warning(f"⚠️ Missing embedding for text {idx}, using zero vector")
            result.append(np.zeros(EMBEDDING_DIMENSION, dtype=np.float32))
    
    return result


def build_combined_embedding(query: str, use_cache: bool = True) -> np.ndarray:
    """
    Always expand the query, embed each term, weighted-average, and normalize.
    Weights:
      - original term: 1.0
      - expanded terms: 0.7
    """
    terms = expand_query_with_llm(query)
    if not terms:
        return generate_single_embedding(query)
    vectors: List[np.ndarray] = []
    weights: List[float] = []
    for term in terms:
        vec = get_cached_embedding(term) if use_cache else None
        if vec is None:
            try:
                vec = generate_single_embedding(term)
                if use_cache:
                    cache_embedding(term, vec)
            except Exception as e:
                logging.warning(f"⚠️ Embedding failed for term '{term}': {e}")
                continue
        vectors.append(vec)
        # First term is the original base query (expand_query_with_llm prepends it)
        weights.append(1.0 if term == terms[0] else 0.7)
    if not vectors:
        return generate_single_embedding(query)
    w = np.array(weights, dtype=np.float32).reshape(-1, 1)
    avg = np.sum(np.array(vectors, dtype=np.float32) * w, axis=0) / max(1e-6, float(np.sum(weights)))
    return normalize_vector(avg)


def build_combined_embedding_from_terms(terms: List[str], use_cache: bool = True) -> np.ndarray:
    """
    Build a combined embedding from a precomputed expanded term list.
    Uses same weighting as build_combined_embedding.
    """
    if not terms:
        return normalize_vector(np.zeros((EMBEDDING_DIMENSION,), dtype=np.float32))
    vectors: List[np.ndarray] = []
    weights: List[float] = []
    for idx, term in enumerate(terms):
        vec = get_cached_embedding(term) if use_cache else None
        if vec is None:
            try:
                vec = generate_single_embedding(term)
                if use_cache:
                    cache_embedding(term, vec)
            except Exception as e:
                logging.warning(f"⚠️ Embedding failed for term '{term}': {e}")
                continue
        vectors.append(vec)
        weights.append(1.0 if idx == 0 else 0.7)
    if not vectors:
        return normalize_vector(np.zeros((EMBEDDING_DIMENSION,), dtype=np.float32))
    w = np.array(weights, dtype=np.float32).reshape(-1, 1)
    avg = np.sum(np.array(vectors, dtype=np.float32) * w, axis=0) / max(1e-6, float(np.sum(weights)))
    return normalize_vector(avg)


def embed_terms(terms: List[str], use_cache: bool = True) -> List[np.ndarray]:
    """
    Embed a list of terms with caching, returning normalized vectors.
    """
    vectors: List[np.ndarray] = []
    for term in terms:
        vec = get_cached_embedding(term) if use_cache else None
        if vec is None:
            try:
                vec = generate_single_embedding(term)
                if use_cache:
                    cache_embedding(term, vec)
            except Exception as e:
                logging.warning(f"⚠️ Embedding failed for term '{term}': {e}")
                vec = None
        if vec is not None:
            vectors.append(vec)
    return vectors


def get_vector_store_ids() -> Set[str]:
    """
    Return the set of vector IDs present in the in-memory vector_store.
    """
    return {entry.get("id") for entry in vector_store.values() if entry.get("id")}


def compute_vector_integrity() -> Dict[str, Any]:
    """
    Compute integrity between FAISS vectors and Mongo trainer profiles.
    Returns a dict with counts and id lists.
    """
    report: Dict[str, Any] = {
        "total_mongo_profiles": 0,
        "total_faiss_vectors": 0,
        "orphan_vectors": [],
        "profiles_missing_vectors": [],
    }
    try:
        client = get_db_client()
        db = client[db_name]
        profiles = db["trainer_profiles"]
        mongo_ids = {doc["profile_id"] for doc in profiles.find({}, {"_id": 0, "profile_id": 1}) if doc.get("profile_id")}
        faiss_ids = get_vector_store_ids()
        report["total_mongo_profiles"] = len(mongo_ids)
        report["total_faiss_vectors"] = len(faiss_ids)
        report["orphan_vectors"] = sorted([vid for vid in faiss_ids if vid not in mongo_ids])
        report["profiles_missing_vectors"] = sorted([pid for pid in mongo_ids if pid not in faiss_ids])
        return report
    except Exception as e:
        logging.warning(f"⚠️ Integrity computation failed: {e}")
        return report


def repair_vector_index() -> Dict[str, Any]:
    """
    Repair FAISS–Mongo integrity.
    - Remove orphan vectors (rebuild index without them)
    - Re-embed missing trainers and add vectors
    - Save index to disk
    """
    summary: Dict[str, Any] = {"removed_orphans": 0, "embedded_missing": 0, "success": False, "errors": 0}
    try:
        global faiss_index, vector_store
        client = get_db_client()
        db = client[db_name]
        profiles = db["trainer_profiles"]
        # Compute sets
        mongo_ids = {doc["profile_id"] for doc in profiles.find({}, {"_id": 0, "profile_id": 1}) if doc.get("profile_id")}
        faiss_ids = get_vector_store_ids()
        orphan_ids = {vid for vid in faiss_ids if vid not in mongo_ids}
        missing_ids = {pid for pid in mongo_ids if pid not in faiss_ids}

        # Rebuild index without orphans
        if orphan_ids:
            kept_vectors: List[np.ndarray] = []
            kept_metadata: List[Dict[str, Any]] = []
            for idx, entry in sorted(vector_store.items(), key=lambda x: x[0]):
                vid = entry[1].get("id")
                if not vid or vid in orphan_ids:
                    continue
                try:
                    vec = faiss_index.reconstruct(idx)
                    kept_vectors.append(vec)
                    kept_metadata.append(entry[1])
                except Exception:
                    continue
            # Build new index
            new_index = create_optimal_index(EMBEDDING_DIMENSION, current_size=len(kept_vectors))
            if kept_vectors:
                arr = np.array(kept_vectors, dtype=np.float32)
                new_index.add(arr)
            # Rebuild vector_store mapping
            new_mapping: Dict[int, Dict[str, Any]] = {}
            for new_idx, meta in enumerate(kept_metadata):
                new_mapping[new_idx] = meta
            faiss_index = new_index
            vector_store = new_mapping
            summary["removed_orphans"] = len(orphan_ids)

        # Embed missing ids and add
        if missing_ids:
            for pid in missing_ids:
                try:
                    profile = profiles.find_one({"profile_id": pid})
                    if not profile:
                        continue
                    text = build_resume_composite_text(profile.get("raw_text", "") or "", profile)
                    upsert_vector(
                        pid,
                        text,
                        {
                            "profile_id": pid,
                            "email": profile.get("email"),
                            "name": profile.get("name"),
                            "skills": profile.get("skills", []),
                            "skill_domains": profile.get("skill_domains", []),
                            "education": profile.get("education", []),
                            "certifications": profile.get("certifications", []),
                            "companies": profile.get("companies", []),
                            "clients": profile.get("clients", []),
                            "experience_years": profile.get("experience_years"),
                            "location": profile.get("location"),
                        },
                    )
                    summary["embedded_missing"] += 1
                except Exception as e:
                    summary["errors"] += 1
                    logging.warning(f"⚠️ Failed embedding for missing profile {pid}: {e}")

        save_faiss_index()
        summary["success"] = True
        return summary
    except Exception as e:
        summary["success"] = False
        summary["errors"] += 1
        logging.warning(f"⚠️ repair_vector_index failed: {e}")
        return summary


def _compose_profile_semantic_text(metadata: Dict[str, Any]) -> str:
    """
    Build a compact text summary from profile metadata for semantic reranking.
    """
    skills = metadata.get("skills") or []
    domains = metadata.get("skill_domains") or []
    companies = metadata.get("companies") or []
    roles = metadata.get("roles") or []  # optional
    parts: List[str] = []
    if skills:
        parts.append("skills: " + ", ".join([str(s) for s in skills if s]))
    if domains:
        parts.append("domains: " + ", ".join([str(d) for d in domains if d]))
    if roles:
        parts.append("roles: " + ", ".join([str(r) for r in roles if r]))
    if companies:
        parts.append("companies: " + ", ".join([str(c) for c in companies if c]))
    return " | ".join(parts) if parts else ""


def _cosine_from_unit(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """
    Compute cosine similarity for two normalized vectors.
    """
    try:
        return float(np.dot(vec_a, vec_b))
    except Exception:
        return 0.0


def rerank_results_with_profile_semantics(query_embedding: np.ndarray, results: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    """
    Re-score top candidates using semantic skill matching and keyword boosts.
    final_score = (faiss_similarity * 60) + (semantic_skill_match_score * 30) + (keyword_boost * 10)
    Returns top_k items with updated 'score', plus matched_skills/missing_skills in metadata.
    """
    if not results:
        return results
    # Consider up to 20 for rerank to limit API usage
    candidates = results[: min(20, len(results))]
    enriched: List[Dict[str, Any]] = []
    # We need expanded query terms to compute semantic skill match; infer from cache keys of query_embedding is not trivial.
    # Instead, use a light-weight approximation: derive top terms by reusing expansion function on the raw text stored in cache is not accessible here.
    # As a pragmatic approach, compute semantic score using profile skills vs query_embedding via a proxy:
    # - Build embeddings for profile skills (cached)
    # - For each skill vector s, similarity = dot(query_embedding, s)
    # - semantic_skill_match_score = average of top-N similarities (N= min(5, len(skills)))
    for item in candidates:
        metadata = item.get("metadata") or {}
        skills = metadata.get("skills") or []
        faiss_sim = float(item.get("similarity", 0.0))
        # Compute semantic skill match: average of top similarities of profile skills to query embedding
        skill_sims: List[float] = []
        matched_skills: List[str] = []
        try:
            for skill in skills:
                vec = get_cached_embedding(skill)
                if vec is None:
                    vec = generate_single_embedding(skill)
                    cache_embedding(skill, vec)
                sim = _cosine_from_unit(query_embedding, vec)
                # threshold for "matched skill"
                if sim >= 0.75:
                    matched_skills.append(skill)
                # clamp to [0,1] for averaging
                skill_sims.append(max(0.0, min(1.0, float(sim))))
        except Exception as e:
            logging.warning(f"⚠️ Skill semantic match computation failed: {e}")
        top_n = sorted(skill_sims, reverse=True)[: max(1, min(5, len(skill_sims)))]
        semantic_avg = float(sum(top_n) / len(top_n)) if top_n else 0.0
        # keyword boost if exact query term present in skills
        keyword_boost = 10.0 if (metadata.get("skills") and isinstance(metadata.get("skills"), list) and any(isinstance(s, str) and s.lower().strip() == metadata.get("metadata_query", "").lower().strip() for s in metadata.get("skills"))) else 0.0
        # final score per formula
        final_score = max(0.0, min(100.0, faiss_sim * 60.0 + semantic_avg * 30.0 + keyword_boost))
        item_enriched = {
            **item,
            "final_similarity": faiss_sim,
            "score": round(final_score, 2),
            "semantic_skill_score": round(semantic_avg * 100.0, 2),
            "matched_skills": matched_skills,
        }
        enriched.append(item_enriched)
    # Sort by final score desc
    enriched.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    # Respect requested top_k for final cut
    trimmed = enriched[:top_k]
    # Reassign rank after rerank
    for idx, itm in enumerate(trimmed, start=1):
        itm["rank"] = idx
    return trimmed


def delete_vector(vector_id: str) -> bool:
    to_remove = [idx for idx, stored in vector_store.items() if stored.get("id") == vector_id]
    if not to_remove:
        return False
    for idx in to_remove:
        vector_store.pop(idx, None)
    save_faiss_index()
    logging.info(f"🗑️ Removed vector mappings for ID: {vector_id}")
    return True


def clear_all_vectors() -> bool:
    global faiss_index, vector_store
    faiss_index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)
    vector_store = {}
    save_faiss_index()
    logging.info("🗑️ Cleared FAISS index and vector metadata")
    return True


def repair_missing_vectors() -> Dict[str, Any]:
    """
    Controlled repair of missing FAISS vectors.
    
    Fetches all trainer_profiles sorted by created_at ascending.
    For each profile:
    - If vector exists → increment consecutive_existing
    - If vector missing → generate embedding, add to FAISS, reset consecutive_existing = 0
    - STOP if consecutive_existing >= 5
    
    Returns summary with: checked, added_vectors, skipped_existing, stopped_after_consecutive
    """
    summary: Dict[str, Any] = {
        "checked": 0,
        "added_vectors": 0,
        "skipped_existing": 0,
        "stopped_after_consecutive": False,
        "success": False,
        "errors": []
    }
    
    try:
        global faiss_index, vector_store
        client = get_db_client()
        db = client[db_name]
        profiles = db["trainer_profiles"]
        
        # Get all existing vector IDs from FAISS
        faiss_ids = get_vector_store_ids()
        
        # Fetch all trainer_profiles sorted by created_at ascending
        # Use _id as fallback if created_at doesn't exist
        try:
            cursor = profiles.find({}).sort("created_at", 1)  # 1 = ascending
        except Exception:
            # Fallback to _id if created_at field doesn't exist or causes error
            cursor = profiles.find({}).sort("_id", 1)
        
        consecutive_existing = 0
        checked = 0
        
        for profile in cursor:
            checked += 1
            profile_id = profile.get("profile_id")
            
            if not profile_id:
                continue
            
            # Check if FAISS already has a vector for this profile_id
            if profile_id in faiss_ids:
                # Vector exists → increment consecutive_existing
                consecutive_existing += 1
                summary["skipped_existing"] += 1
                
                # STOP if consecutive_existing >= 5
                if consecutive_existing >= 5:
                    summary["stopped_after_consecutive"] = True
                    logging.info(f"🛑 Stopped repair after {consecutive_existing} consecutive existing vectors")
                    break
            else:
                # Vector missing → generate embedding and add to FAISS
                try:
                    # Reset consecutive_existing when we find a missing vector
                    consecutive_existing = 0
                    
                    # Read stored resume text from DB
                    raw_text = profile.get("raw_text", "") or ""
                    
                    # Build composite text from profile data
                    composite_text = build_resume_composite_text(raw_text, profile)
                    
                    if not composite_text.strip():
                        logging.warning(f"⚠️ No text available for profile {profile_id}, skipping")
                        summary["errors"].append(f"Profile {profile_id}: No text available")
                        continue
                    
                    # Generate embedding (use generate_single_embedding for direct embedding without expansion)
                    embedding = generate_single_embedding(composite_text)
                    
                    # Add vector + profile_id to FAISS
                    faiss_index.add(embedding.reshape(1, -1))
                    current_idx = faiss_index.ntotal - 1
                    
                    # Store metadata
                    vector_store[current_idx] = {
                        "id": profile_id,
                        "metadata": {
                            "profile_id": profile_id,
                            "email": profile.get("email"),
                            "name": profile.get("name"),
                            "skills": profile.get("skills", []),
                            "skill_domains": profile.get("skill_domains", []),
                            "education": profile.get("education", []),
                            "certifications": profile.get("certifications", []),
                            "companies": profile.get("companies", []),
                            "clients": profile.get("clients", []),
                            "experience_years": profile.get("experience_years"),
                            "location": profile.get("location"),
                        }
                    }
                    
                    # Update faiss_ids set for next iteration
                    faiss_ids.add(profile_id)
                    
                    summary["added_vectors"] += 1
                    logging.info(f"➕ Added vector for profile {profile_id} (index={current_idx})")
                    
                except Exception as e:
                    error_msg = f"Profile {profile_id}: {str(e)}"
                    summary["errors"].append(error_msg)
                    logging.warning(f"⚠️ Failed to add vector for profile {profile_id}: {e}")
                    continue
        
        # Save FAISS index and vector metadata after adding vectors
        if summary["added_vectors"] > 0:
            save_faiss_index()
            logging.info(f"💾 Saved FAISS index after adding {summary['added_vectors']} vectors")
        
        summary["checked"] = checked
        summary["success"] = True
        
        logging.info(f"✅ Repair completed: checked={checked}, added={summary['added_vectors']}, skipped={summary['skipped_existing']}, stopped={summary['stopped_after_consecutive']}")
        
        return summary
        
    except Exception as e:
        summary["success"] = False
        error_msg = f"Repair failed: {str(e)}"
        summary["errors"].append(error_msg)
        logging.error(f"❌ repair_missing_vectors failed: {e}")
        return summary


def generate_explanation(jd_text: str, resume_text: str) -> str:
    prompt = f"""
    Job Description:
    {jd_text}

    Resume Text:
    {resume_text}

    Explain in 2 sentences why this resume is a good semantic match for the job description.
    """
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=200
        )
        explanation = (
            response.choices[0].message.content.strip()
            if response and response.choices and len(response.choices) > 0
            else ""
        )
        explanation = explanation or "Explanation not available."
        logging.warning(f"💬 Match Explanation: {explanation[:200]}...")
        return explanation
    except Exception as e:
        logging.warning(f"⚠️ Explanation generation failed: {e}")
        return "Explanation not available."


# ============================================================================
# MULTI-VECTOR HYBRID RAG ARCHITECTURE
# ============================================================================

# Multi-vector FAISS index and store
MULTI_VECTOR_INDEX_PATH = DATA_DIR / "faiss_multi_index.bin"
MULTI_VECTOR_STORE_PATH = DATA_DIR / "vector_multi_store.pkl"

# Multi-vector index: maps chunk_index -> (profile_id, chunk_type, chunk_data)
multi_vector_index: Optional[faiss.Index] = None
multi_vector_store: Dict[int, Dict[str, Any]] = {}

# Chunk type weights for hierarchical scoring
CHUNK_TYPE_WEIGHTS = {
    "skills": 1.0,  # Highest weight
    "experience": 0.9,
    "projects": 0.8,
    "certifications": 0.7,
    "raw_chunks": 0.6,
}

# ============================================================================
# SEMANTIC DOMAIN CLASSIFIER - LLM-Based (No Hard-Coded Mappings)
# ============================================================================

def get_semantic_domain_embedding(domain_name: str) -> np.ndarray:
    """
    Get semantic embedding for a domain using LLM.
    Uses domain examples to create a representative embedding.
    """
    global _semantic_domain_cache
    
    if domain_name in _semantic_domain_cache:
        return _semantic_domain_cache[domain_name]
    
    from services.embeddings import get_embedding_service
    embedding_service = get_embedding_service()
    
    # Create a representative text for the domain
    domain_text = f"{domain_name} professional with expertise in related technologies"
    embedding = embedding_service.embed_single(domain_text, normalize=True, use_cache=True)
    
    _semantic_domain_cache[domain_name] = embedding
    return embedding


def detect_semantic_domain(query: str, profile_skills: List[str] = None, profile_text: str = None) -> Optional[str]:
    """
    Detect semantic domain using embedding similarity.
    OPTIMIZED: Uses keyword-based quick check first, only uses embeddings if needed.
    
    Returns:
        Domain name if detected, None otherwise
    """
    query_lower = query.lower()
    
    # OPTIMIZATION: Quick keyword-based check first (no API calls)
    domain_keywords = {
        "data engineering": ["data engineer", "etl", "hadoop", "spark", "airflow", "data pipeline", "big data"],
        "cloud computing": ["cloud", "aws", "azure", "gcp", "cloud architect", "cloud infrastructure"],
        "web development": ["web developer", "react", "javascript", "node.js", "frontend", "backend"],
        "devops": ["devops", "ci/cd", "jenkins", "kubernetes", "docker", "terraform"],
        "ai machine learning": ["ai engineer", "machine learning", "ml", "deep learning", "nlp", "tensorflow"],
        "enterprise software": ["sap", "hana", "erp", "enterprise"],
        "mobile development": ["mobile", "ios", "android", "react native", "flutter"],
        "cybersecurity": ["cybersecurity", "security", "penetration testing", "ethical hacking"],
        "database administration": ["dba", "database", "sql", "oracle", "mysql", "postgresql"],
        "system administration": ["system admin", "sysadmin", "linux", "windows server", "networking"]
    }
    
    # Quick keyword match (fast, no API calls)
    for domain, keywords in domain_keywords.items():
        if any(kw in query_lower for kw in keywords):
            return domain
    
    # If no keyword match, use embedding-based detection (cached, so fast after first call)
    from services.embeddings import get_embedding_service
    embedding_service = get_embedding_service()
    
    query_embedding = embedding_service.embed_single(query, normalize=True, use_cache=True)
    
    domains = list(domain_keywords.keys())
    best_domain = None
    best_similarity = -1.0
    
    # OPTIMIZATION: Pre-fetch all domain embeddings in batch if not cached
    # (get_semantic_domain_embedding already caches, so this is just for first-time)
    for domain in domains:
        domain_embedding = get_semantic_domain_embedding(domain)  # Cached after first call
        similarity = np.dot(query_embedding, domain_embedding)
        
        if similarity > best_similarity:
            best_similarity = similarity
            best_domain = domain
    
    # Threshold: only return domain if similarity is high enough
    if best_similarity > 0.7:
        return best_domain
    
    return None


# Cache for similarity calculations to avoid redundant embedding calls
_similarity_cache: Dict[Tuple[str, str], float] = {}

def compute_semantic_similarity(text1: str, text2: str) -> float:
    """
    Compute semantic similarity between two texts using embeddings.
    Returns similarity score between 0 and 1.
    OPTIMIZED: Uses batch embedding and caching.
    """
    # Check cache first
    cache_key = (text1.lower().strip(), text2.lower().strip())
    if cache_key in _similarity_cache:
        return _similarity_cache[cache_key]
    
    from services.embeddings import get_embedding_service
    embedding_service = get_embedding_service()
    
    # OPTIMIZATION: Batch embedding call (1 API call instead of 2)
    embeddings = embedding_service.embed([text1, text2], normalize=True, use_cache=True)
    emb1, emb2 = embeddings[0], embeddings[1]
    
    similarity = np.dot(emb1, emb2)
    similarity = max(0.0, min(1.0, similarity))  # Clamp to [0, 1]
    
    # Cache result
    _similarity_cache[cache_key] = similarity
    return similarity


def expand_skills_semantic(skills: List[str], min_terms: int = 8, max_terms: int = 12) -> List[str]:
    """
    Expand skills using semantic similarity (embedding-based).
    OPTIMIZED: Uses graph-based expansion first, only uses embeddings for top candidates.
    """
    if not skills:
        return skills
    
    # OPTIMIZATION: Use graph-based expansion first (fast, no API calls)
    valid_skills = get_all_resume_skills()
    graph_expanded = expand_skills_with_graph(skills, max_terms=max_terms * 2)
    
    # Filter to only valid skills
    graph_validated = [s for s in graph_expanded if s in valid_skills]
    
    # If we have enough from graph, use it (no API calls needed)
    if len(graph_validated) >= min_terms:
        result = list(skills)
        for skill in graph_validated:
            if skill.lower() not in [s.lower() for s in result]:
                result.append(skill)
        return result[:max_terms]
    
    # Only use expensive embedding-based expansion if graph didn't give enough
    from services.embeddings import get_embedding_service
    embedding_service = get_embedding_service()
    
    # Create single embedding for all input skills combined (1 API call instead of N)
    combined_skill_text = " ".join(skills)
    avg_input_embedding = embedding_service.embed_single(combined_skill_text, normalize=True, use_cache=True)
    
    # Only check top graph candidates with embeddings (limit to 50 to avoid too many API calls)
    candidates_to_check = graph_validated[:50] if graph_validated else list(valid_skills)[:100]
    
    # Batch embed candidates (more efficient)
    if candidates_to_check:
        candidate_embeddings = embedding_service.embed(candidates_to_check, normalize=True, use_cache=True)
        
        # Find semantically similar skills
        skill_similarities = []
        for skill, skill_emb in zip(candidates_to_check, candidate_embeddings):
            if skill.lower() in [s.lower() for s in skills]:
                continue
            similarity = np.dot(avg_input_embedding, skill_emb)
            skill_similarities.append((skill, similarity))
        
        # Sort and take top matches
        skill_similarities.sort(key=lambda x: x[1], reverse=True)
        expanded = [s for s, sim in skill_similarities if sim > 0.6][:max_terms]
    else:
        expanded = []
    
    # Combine results
    result = list(skills)
    for skill in expanded:
        if skill.lower() not in [s.lower() for s in result]:
            result.append(skill)
    
    return result[:max_terms]


def initialize_multi_vector_index(dimension: int) -> faiss.Index:
    """Initialize or load multi-vector FAISS index."""
    global multi_vector_index, multi_vector_store
    
    if MULTI_VECTOR_INDEX_PATH.exists() and MULTI_VECTOR_STORE_PATH.exists():
        try:
            multi_vector_index = faiss.read_index(str(MULTI_VECTOR_INDEX_PATH))
            with open(MULTI_VECTOR_STORE_PATH, "rb") as f:
                multi_vector_store = pickle.load(f)
            logging.info(f"✅ Loaded multi-vector index with {multi_vector_index.ntotal} chunks")
            return multi_vector_index
        except Exception as e:
            logging.warning(f"⚠️ Error loading multi-vector index: {e}. Creating new.")
    
    # Create new HNSW index
    if USE_HNSW:
        multi_vector_index = faiss.IndexHNSWFlat(dimension, HNSW_M)
        multi_vector_index.hnsw.efConstruction = HNSW_EF_CONSTRUCTION
        multi_vector_index.hnsw.efSearch = HNSW_EF_SEARCH
        logging.info(f"✅ Created new HNSW multi-vector index (M={HNSW_M}, efSearch={HNSW_EF_SEARCH})")
    else:
        multi_vector_index = faiss.IndexFlatIP(dimension)
        logging.info("✅ Created new FlatIP multi-vector index")
    
    multi_vector_store = {}
    return multi_vector_index


def save_multi_vector_index():
    """Save multi-vector index and store to disk."""
    try:
        if multi_vector_index is not None:
            faiss.write_index(multi_vector_index, str(MULTI_VECTOR_INDEX_PATH))
        with open(MULTI_VECTOR_STORE_PATH, "wb") as f:
            pickle.dump(multi_vector_store, f)
        logging.info("💾 Persisted multi-vector FAISS index to disk")
    except Exception as e:
        logging.warning(f"⚠️ Failed to save multi-vector index: {e}")


def upsert_multi_vector(profile_id: str, raw_text: str, metadata: Dict[str, Any]) -> None:
    """
    Upsert multi-vector chunks for a profile.
    
    This is the new multi-vector version that chunks resumes and stores
    multiple vectors per profile for better semantic matching.
    """
    try:
        # Validate inputs
        if not profile_id:
            raise ValueError("profile_id is required")
        
        if not raw_text or not isinstance(raw_text, str):
            raise ValueError(f"raw_text must be a non-empty string (got: {type(raw_text)})")
        
        if len(raw_text.strip()) < 10:
            raise ValueError(f"raw_text is too short (minimum 10 characters, got {len(raw_text.strip())})")
        
        if not metadata:
            raise ValueError("metadata is required")
        
        from services.chunker import get_chunker
        from services.embeddings import get_embedding_service
        
        chunker = get_chunker()
        embedding_service = get_embedding_service()
        
        # Chunk the resume
        chunks_dict = chunker.chunk_resume(metadata, raw_text)
        
        # Remove existing chunks for this profile
        remove_multi_vector(profile_id)
        
        # Embed and store each chunk
        all_chunk_texts = []
        all_chunk_metadata = []
        
        for chunk_type, chunks in chunks_dict.items():
            for chunk in chunks:
                all_chunk_texts.append(chunk["text"])
                all_chunk_metadata.append({
                    "profile_id": profile_id,
                    "chunk_type": chunk_type,
                    "chunk_index": chunk["metadata"].get("chunk_index", 0),
                    "metadata": chunk["metadata"],
                })
        
        if not all_chunk_texts:
            logging.warning(f"⚠️ No chunks generated for profile {profile_id} - skipping")
            return
        
        # Validate chunk texts (filter out empty or invalid chunks)
        valid_chunks = []
        valid_metadata = []
        for chunk_text, chunk_meta in zip(all_chunk_texts, all_chunk_metadata):
            if chunk_text and isinstance(chunk_text, str) and len(chunk_text.strip()) > 0:
                valid_chunks.append(chunk_text)
                valid_metadata.append(chunk_meta)
            else:
                logging.debug(f"⚠️ Skipping invalid chunk for profile {profile_id}: empty or invalid text")
        
        if not valid_chunks:
            logging.warning(f"⚠️ No valid chunks after filtering for profile {profile_id} - skipping")
            return
        
        # Batch embed all chunks
        try:
            embeddings = embedding_service.embed(valid_chunks, normalize=True, use_cache=False)
        except Exception as embed_error:
            raise ValueError(f"Embedding generation failed: {str(embed_error)}") from embed_error
        
        # Initialize index if needed
        if multi_vector_index is None:
            initialize_multi_vector_index(embedding_service.get_dimension())
        
        # Validate embeddings match chunks
        if len(embeddings) != len(valid_chunks):
            raise ValueError(f"Embedding count mismatch: {len(embeddings)} embeddings for {len(valid_chunks)} chunks")
        
        # Add chunks to index
        try:
            for embedding, chunk_meta in zip(embeddings, valid_metadata):
                # Validate embedding shape
                if embedding is None or embedding.size == 0:
                    logging.warning(f"⚠️ Skipping invalid embedding for profile {profile_id}")
                    continue
                
                embedding_reshaped = embedding.reshape(1, -1)
                if embedding_reshaped.shape[1] != multi_vector_index.d:
                    raise ValueError(f"Embedding dimension mismatch: {embedding_reshaped.shape[1]} != {multi_vector_index.d}")
                
                multi_vector_index.add(embedding_reshaped)
            chunk_idx = multi_vector_index.ntotal - 1
            multi_vector_store[chunk_idx] = chunk_meta
        except Exception as index_error:
            raise ValueError(f"Failed to add chunks to index: {str(index_error)}") from index_error
        
        logging.info(f"➕ Indexed {len(valid_chunks)} chunks for profile {profile_id}")
        
        # Save index (with error handling)
        try:
            save_multi_vector_index()
        except Exception as save_error:
            logging.warning(f"⚠️ Failed to save index after indexing profile {profile_id}: {save_error}")
            # Don't raise - indexing succeeded even if save failed
        
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        
        # Provide more helpful error messages
        if "chunk" in error_msg.lower() or "chunker" in error_msg.lower():
            logging.warning(f"⚠️ Chunking error for profile {profile_id}: {error_msg}")
        elif "embed" in error_msg.lower() or "embedding" in error_msg.lower():
            logging.warning(f"⚠️ Embedding error for profile {profile_id}: {error_msg}")
        elif "index" in error_msg.lower() or "faiss" in error_msg.lower():
            logging.warning(f"⚠️ Index error for profile {profile_id}: {error_msg}")
        else:
            logging.warning(f"⚠️ Failed to upsert multi-vector for {profile_id}: {error_type}: {error_msg}")
        
        # Only log full traceback for unexpected errors
        if error_type not in ["ValueError", "KeyError", "AttributeError"]:
            import traceback
            logging.debug(f"Traceback for profile {profile_id}:\n{traceback.format_exc()}")
        
        # Re-raise to let caller handle
        raise


def remove_multi_vector(profile_id: str) -> None:
    """Remove all chunks for a profile from the multi-vector index."""
    global multi_vector_index, multi_vector_store
    
    if multi_vector_index is None:
        return
    
    # Find all chunk indices for this profile
    indices_to_remove = []
    for chunk_idx, chunk_data in multi_vector_store.items():
        if chunk_data.get("profile_id") == profile_id:
            indices_to_remove.append(chunk_idx)
    
    if not indices_to_remove:
        return
    
    # HNSW doesn't support removal, so we need to rebuild
    if isinstance(multi_vector_index, faiss.IndexHNSWFlat):
        # Rebuild index without removed chunks
        kept_vectors = []
        kept_metadata = []
        
        for idx in range(multi_vector_index.ntotal):
            if idx not in indices_to_remove:
                try:
                    vec = multi_vector_index.reconstruct(idx)
                    kept_vectors.append(vec)
                    kept_metadata.append(multi_vector_store[idx])
                except:
                    continue
        
        # Rebuild index
        dimension = multi_vector_index.d
        initialize_multi_vector_index(dimension)
        
        if kept_vectors:
            vectors_array = np.array(kept_vectors, dtype=np.float32)
            multi_vector_index.add(vectors_array)
            for new_idx, meta in enumerate(kept_metadata):
                multi_vector_store[new_idx] = meta
        
        save_multi_vector_index()
        logging.info(f"🗑️ Removed {len(indices_to_remove)} chunks for profile {profile_id}")
    else:
        # For FlatIP, mark as removed in store
        for idx in indices_to_remove:
            multi_vector_store.pop(idx, None)
        logging.info(f"🗑️ Marked {len(indices_to_remove)} chunks as removed for profile {profile_id}")


def fetch_mandatory_skill_filter(mandatory_skill: Optional[str], query: Optional[str] = None) -> Optional[Set[str]]:
    """
    Fetch profile IDs that have the mandatory skill from MongoDB.
    This MUST run BEFORE vector search to filter profiles.
    
    Args:
        mandatory_skill: The mandatory skill to filter by
        query: Original query text (for domain-aware filtering)
        
    Returns:
        Set of profile_ids that have the mandatory skill, or None if no mandatory skill
    """
    if not mandatory_skill:
        return None
    
    try:
        client_conn = get_db_client()
        db = client_conn[db_name]
        trainer_profiles = db["trainer_profiles"]
        
        mandatory_skill_clean = mandatory_skill.strip().lower()
        
        # Determine query domain using semantic detection (no hard-coded mappings)
        query_domain = detect_semantic_domain(query) if query else None
        
        # Build regex pattern for STRICT matching
        # For multi-word skills like "data engineer", match the full phrase
        # For single words like "data", be very strict to avoid false matches
        regex_pattern = None
        if len(mandatory_skill_clean) >= 3:
            escaped_skill = re.escape(mandatory_skill_clean)
            
            if " " in mandatory_skill_clean:
                # Multi-word: match as whole phrase with word boundaries
                words = mandatory_skill_clean.split()
                pattern_parts = []
                pattern_parts.append("\\b")
                for i, word in enumerate(words):
                    pattern_parts.append(re.escape(word))
                    if i < len(words) - 1:
                        pattern_parts.append("[\\s\\-_]+")
                pattern_parts.append("\\b")
                regex_pattern = "".join(pattern_parts)
            else:
                # Single word: VERY STRICT - exact word boundary match
                regex_pattern = f"\\b{escaped_skill}\\b"
        
        # OPTIMIZED: Build efficient MongoDB query for multi-word skills
        query_conditions = []
        
        # 1. Exact match (fastest - uses indexes)
        query_conditions.extend([
            {"skills": {"$in": [mandatory_skill_clean]}},
            {"skill_domains": {"$in": [mandatory_skill_clean]}}
        ])
        
        # 2. For multi-word skills, use flexible matching
        if " " in mandatory_skill_clean:
            # Multi-word: phrase match (case-insensitive)
            phrase_pattern = re.escape(mandatory_skill_clean)
            query_conditions.extend([
                {"skills": {"$regex": phrase_pattern, "$options": "i"}},
                {"skill_domains": {"$regex": phrase_pattern, "$options": "i"}}
            ])
            
            # Also check if both words exist (flexible matching)
            words = mandatory_skill_clean.split()
            if len(words) == 2:
                word1, word2 = words[0], words[1]
                # Both words in skills
                query_conditions.append({
                    "$and": [
                        {"skills": {"$regex": f"\\b{re.escape(word1)}\\b", "$options": "i"}},
                        {"skills": {"$regex": f"\\b{re.escape(word2)}\\b", "$options": "i"}}
                    ]
                })
                # Both words in skill_domains
                query_conditions.append({
                    "$and": [
                        {"skill_domains": {"$regex": f"\\b{re.escape(word1)}\\b", "$options": "i"}},
                        {"skill_domains": {"$regex": f"\\b{re.escape(word2)}\\b", "$options": "i"}}
                    ]
                })
        else:
            # Single word: strict word boundary match
            if regex_pattern:
                query_conditions.extend([
                    {"skills": {"$regex": regex_pattern, "$options": "i"}},
                    {"skill_domains": {"$regex": regex_pattern, "$options": "i"}}
                ])
        
        mandatory_query = {"$or": query_conditions}
        
        # OPTIMIZED: Use projection and limit for faster queries
        cursor = trainer_profiles.find(
            mandatory_query, 
            {"_id": 0, "profile_id": 1, "skills": 1, "skill_domains": 1}
        ).limit(2000)
        all_profiles = list(cursor)
        
        logging.info(f"🔍 MongoDB query found {len(all_profiles)} profiles with mandatory skill '{mandatory_skill_clean}' (before domain filtering)")
        
        # Semantic filtering: Use semantic similarity to filter profiles
        if query_domain:
            filtered_profiles = []
            
            for profile in all_profiles:
                profile_skills = [str(s).lower() for s in profile.get("skills", [])]
                profile_domains = [str(d).lower() for d in profile.get("skill_domains", [])]
                all_profile_terms = set(profile_skills + profile_domains)
                
                # Check if mandatory skill is present (exact or semantic match)
                has_mandatory = False
                
                # 1. Exact match check
                if mandatory_skill_clean in all_profile_terms:
                    has_mandatory = True
                else:
                    # 2. Word-boundary match for single words
                    if " " not in mandatory_skill_clean:
                        for term in all_profile_terms:
                            if (term == mandatory_skill_clean or 
                                term.startswith(mandatory_skill_clean + " ") or 
                                term.startswith(mandatory_skill_clean + "-")):
                                has_mandatory = True
                                break
                    else:
                        # 3. Multi-word: check if all words are present (flexible matching)
                        words = mandatory_skill_clean.split()
                        words_found = sum(1 for word in words if any(word in term for term in all_profile_terms))
                        if words_found == len(words):
                            has_mandatory = True
                        
                        # Also check phrase match
                        if not has_mandatory:
                            for term in all_profile_terms:
                                if mandatory_skill_clean in term or term in mandatory_skill_clean:
                                    has_mandatory = True
                                    break
                        
                        # 4. If still no match, use semantic similarity (lower threshold for multi-word)
                        if not has_mandatory:
                            profile_text = " ".join(list(all_profile_terms)[:10])
                            similarity = compute_semantic_similarity(mandatory_skill_clean, profile_text)
                            if similarity > 0.70:  # Slightly lower threshold for multi-word skills
                                has_mandatory = True
                                logging.debug(f"✅ Semantic match for mandatory skill '{mandatory_skill_clean}': {similarity:.2f}")
                
                if not has_mandatory:
                    continue
                
                # OPTIMIZED: Domain filtering - only for clearly wrong matches
                # Skip expensive domain checks if mandatory skill matches exactly
                if mandatory_skill_clean not in all_profile_terms:
                    profile_text = " ".join(profile_skills[:5] + profile_domains[:5])
                    domain_similarity = compute_domain_similarity(query, profile_skills, profile_text)
                    
                    # Only exclude if domain similarity is very low (<0.3)
                    if domain_similarity < 0.3:
                        # Double-check: if profile domain is very different from query domain, exclude
                        profile_domain = detect_semantic_domain(profile_text)
                        if profile_domain and query_domain and profile_domain != query_domain:
                            # Check if domains are semantically similar
                            domain_sim = compute_semantic_similarity(query_domain, profile_domain)
                            if domain_sim < 0.5:  # Low similarity between domains
                                logging.debug(f"🚫 Excluding profile {profile.get('profile_id')}: domain mismatch ({query_domain} vs {profile_domain})")
                                continue
                
                # Include the profile
                filtered_profiles.append(profile)
            
            profile_ids = {p.get("profile_id") for p in filtered_profiles if p.get("profile_id")}
        else:
            # No domain detected - use flexible matching
            filtered_profiles = []
            for profile in all_profiles:
                profile_skills = [str(s).lower() for s in profile.get("skills", [])]
                profile_domains = [str(d).lower() for d in profile.get("skill_domains", [])]
                all_profile_terms = set(profile_skills + profile_domains)
                
                has_mandatory = False
                # Exact match
                if mandatory_skill_clean in all_profile_terms:
                    has_mandatory = True
                elif " " in mandatory_skill_clean:
                    # Multi-word: check if all words present
                    words = mandatory_skill_clean.split()
                    words_found = sum(1 for word in words if any(word in term for term in all_profile_terms))
                    has_mandatory = (words_found == len(words)) or any(mandatory_skill_clean in term for term in all_profile_terms)
                else:
                    # Single word: substring match
                    has_mandatory = any(mandatory_skill_clean in term for term in all_profile_terms)
                
                if has_mandatory:
                    filtered_profiles.append(profile)
            
            profile_ids = {p.get("profile_id") for p in filtered_profiles if p.get("profile_id")}
        
        logging.info(f"🔒 Mandatory skill filter: Found {len(profile_ids)} profiles with skill '{mandatory_skill_clean}' (domain: {query_domain})")
        
        return profile_ids if profile_ids else None
        
    except Exception as e:
        logging.warning(f"⚠️ Failed to fetch mandatory skill filter: {e}")
        return None


def get_query_domain(query: str) -> Optional[str]:
    """
    Infer the target domain from the query using semantic detection.
    No hard-coded mappings - pure semantic matching.
    """
    return detect_semantic_domain(query)


def compute_domain_similarity(query: str, profile_skills: List[str], profile_text: str = None) -> float:
    """
    Compute semantic similarity between query domain and profile domain.
    Returns similarity score between 0 and 1.
    No hard-coded mappings - pure semantic matching.
    """
    query_domain = detect_semantic_domain(query)
    if not query_domain:
        return 0.5  # Neutral if domain can't be detected
    
    # Create profile domain representation
    profile_skills_text = " ".join(profile_skills) if profile_skills else ""
    profile_domain_text = f"{profile_skills_text} {profile_text or ''}".strip()
    
    if not profile_domain_text:
        return 0.0
    
    profile_domain = detect_semantic_domain(profile_domain_text)
    if not profile_domain:
        # Fallback: compute similarity directly
        return compute_semantic_similarity(query, profile_domain_text)
    
    # If domains match exactly, high similarity
    if query_domain == profile_domain:
        return 1.0
    
    # Otherwise, compute semantic similarity
    return compute_semantic_similarity(query_domain, profile_domain)


def compute_title_alignment(query: str, profile_name: str = None, profile_skills: List[str] = None) -> float:
    """
    Compute alignment between query title/role and profile title/role.
    Returns score between 0 and 1.
    """
    if not profile_name and not profile_skills:
        return 0.0
    
    # Create profile representation
    profile_text = f"{profile_name or ''} {' '.join(profile_skills or [])}".strip()
    if not profile_text:
        return 0.0
    
    # Compute semantic similarity between query and profile
    return compute_semantic_similarity(query, profile_text)


def compute_semantic_skill_alignment(query_skills: List[str], profile_skills: List[str]) -> float:
    """
    Compute semantic alignment between query skills and profile skills.
    Returns score between 0 and 1.
    """
    if not query_skills or not profile_skills:
        return 0.0
    
    from services.embeddings import get_embedding_service
    embedding_service = get_embedding_service()
    
    # Create embeddings for skill sets
    query_text = " ".join(query_skills)
    profile_text = " ".join(profile_skills)
    
    # OPTIMIZATION: Batch embedding call (1 API call instead of 2)
    embeddings = embedding_service.embed([query_text, profile_text], normalize=True, use_cache=True)
    query_emb, profile_emb = embeddings[0], embeddings[1]
    
    similarity = np.dot(query_emb, profile_emb)
    return max(0.0, min(1.0, similarity))


def search_multi_vector(
    query: str,
    top_k: int = 200,
    filter_ids: Optional[Set[str]] = None,
    expanded_skills: Optional[List[str]] = None,
    mandatory_skill: Optional[str] = None,
    use_reranker: bool = True,
) -> List[Dict[str, Any]]:
    """
    Multi-vector search with hierarchical scoring and reranking.
    
    Args:
        query: Search query text
        top_k: Number of chunks to retrieve (before reranking)
        filter_ids: Optional set of profile_ids to filter
        expanded_skills: Expanded skills for scoring
        mandatory_skill: Mandatory skill for filtering
        use_reranker: Whether to use cross-encoder reranking
    
    Returns:
        List of chunk results with hierarchical scores aggregated to profile level
    """
    try:
        from services.embeddings import get_embedding_service
        from services.reranker import get_reranker_service
        
        if multi_vector_index is None or multi_vector_index.ntotal == 0:
            logging.warning("⚠️ Multi-vector index empty, falling back to single-vector search")
            return []
        
        embedding_service = get_embedding_service()
        
        # Embed query
        query_embedding = embedding_service.embed_single(query, normalize=True, use_cache=True)
        
        # Search FAISS
        search_size = min(top_k * 2, multi_vector_index.ntotal)
        query_vec = query_embedding.reshape(1, -1)
        
        if isinstance(multi_vector_index, faiss.IndexHNSWFlat):
            original_ef = multi_vector_index.hnsw.efSearch
            multi_vector_index.hnsw.efSearch = min(HNSW_EF_SEARCH * 2, 200)
            distances, indices = multi_vector_index.search(query_vec, search_size)
            multi_vector_index.hnsw.efSearch = original_ef
        else:
            distances, indices = multi_vector_index.search(query_vec, search_size)
        
        # Collect chunk results with enhanced filtering
        chunk_results = []
        seen_chunks = set()
        
        for position, (idx, raw_score) in enumerate(zip(indices[0], distances[0])):
            if idx < 0 or idx not in multi_vector_store:
                continue
            
            chunk_data = multi_vector_store[idx]
            profile_id = chunk_data.get("profile_id")
            
            # Apply pre-filter (mandatory skill filter)
            if filter_ids is not None and profile_id not in filter_ids:
                continue
            
            # Skip duplicates
            chunk_key = (profile_id, chunk_data.get("chunk_type"), chunk_data.get("chunk_index"))
            if chunk_key in seen_chunks:
                continue
            seen_chunks.add(chunk_key)
            
            # Calculate base similarity score
            similarity = float(raw_score)
            similarity = max(-1.0, min(1.0, similarity))
            base_score = similarity * 100.0
            
            # Get chunk text and metadata
            chunk_meta = chunk_data.get("metadata", {})
            chunk_text = chunk_meta.get("text", "")
            if not chunk_text:
                # Try to reconstruct from chunk type
                chunk_type = chunk_data.get("chunk_type", "")
                if chunk_type == "skills":
                    skills = chunk_meta.get("skills", [])
                    chunk_text = "Skills: " + ", ".join([str(s) for s in skills if s])
            
            # Get skills and domains from chunk metadata
            chunk_skills = chunk_meta.get("skills", [])
            chunk_domains = chunk_meta.get("skill_domains", [])
            
            # Base chunk score (scoring happens at profile level with new semantic formula)
            chunk_score = base_score
            
            chunk_results.append({
                "profile_id": profile_id,
                "chunk_type": chunk_data.get("chunk_type", "raw_chunks"),
                "chunk_index": chunk_data.get("chunk_index", 0),
                "chunk_text": chunk_text,
                "similarity": similarity,
                "base_score": base_score,
                "chunk_score": max(0.0, chunk_score),  # Ensure non-negative
                "metadata": chunk_meta,
            })
        
        # Rerank chunks using cross-encoder
        if use_reranker and chunk_results:
            try:
                reranker = get_reranker_service()
                chunk_texts = [chunk["chunk_text"] for chunk in chunk_results]
                reranked = reranker.rerank_chunks(query, chunk_results, top_k=top_k, use_cache=True)
                chunk_results = reranked
            except Exception as e:
                logging.warning(f"⚠️ Reranking failed: {e}, using FAISS scores only")
        
        # Aggregate chunks to profiles with hierarchical scoring
        profile_scores: Dict[str, Dict[str, Any]] = {}
        
        for chunk in chunk_results[:top_k]:
            profile_id = chunk["profile_id"]
            chunk_type = chunk["chunk_type"]
            
            if profile_id not in profile_scores:
                profile_scores[profile_id] = {
                    "profile_id": profile_id,
                    "chunks": [],
                    "chunk_scores": {},
                    "max_chunk_score": 0.0,
                    "weighted_sum": 0.0,
                    "weight_sum": 0.0,
                }
            
            # Get chunk weight
            chunk_weight = CHUNK_TYPE_WEIGHTS.get(chunk_type, 0.6)
            
            # Use enhanced chunk_score (with penalties/boosts) if available, otherwise fall back to rerank/base
            chunk_score = chunk.get("chunk_score")
            if chunk_score is None:
                # Fall back to rerank score or base score
                chunk_score = chunk.get("rerank_score", chunk.get("base_score", 0.0))
            if chunk_score == 0.0:
                chunk_score = chunk.get("base_score", 0.0)
            
            # Convert rerank score (0-1) to 0-100 scale if needed
            if chunk_score < 1.0 and chunk_score > 0.0 and chunk_score == chunk.get("rerank_score"):
                chunk_score = chunk_score * 100.0
            
            profile_scores[profile_id]["chunks"].append(chunk)
            profile_scores[profile_id]["chunk_scores"][chunk_type] = max(
                profile_scores[profile_id]["chunk_scores"].get(chunk_type, 0.0),
                chunk_score
            )
            profile_scores[profile_id]["max_chunk_score"] = max(
                profile_scores[profile_id]["max_chunk_score"],
                chunk_score
            )
            
            # Weighted sum for hierarchical scoring
            profile_scores[profile_id]["weighted_sum"] += chunk_score * chunk_weight
            profile_scores[profile_id]["weight_sum"] += chunk_weight
        
        # Calculate final profile scores with enhanced filtering
        final_results = []
        for profile_id, profile_data in profile_scores.items():
            # Collect all profile skills and domains for scoring
            profile_skills_list = []
            profile_domains_list = []
            profile_text_parts = []
            
            for chunk in profile_data["chunks"]:
                chunk_meta = chunk.get("metadata", {})
                skills = chunk_meta.get("skills", [])
                skill_domains = chunk_meta.get("skill_domains", [])
                chunk_text = chunk.get("chunk_text", "")
                
                if skills:
                    profile_skills_list.extend([str(s) for s in skills if s])
                if skill_domains:
                    profile_domains_list.extend([str(d) for d in skill_domains if d])
                if chunk_text:
                    profile_text_parts.append(chunk_text)
            
            # Get profile metadata for scoring (need to fetch from MongoDB)
            # For now, use skills and domains from chunks
            profile_skills_set = set([s.lower().strip() for s in profile_skills_list])
            profile_domains_set = set([d.lower().strip() for d in profile_domains_list])
            profile_text = " ".join(profile_text_parts)
            
            # Check mandatory skill requirement (flexible matching)
            # Note: Profiles have already been pre-filtered by fetch_mandatory_skill_filter
            # This is a secondary check for safety, but should be more flexible
            if mandatory_skill:
                mandatory_lower = mandatory_skill.lower().strip()
                all_profile_terms = profile_skills_set.union(profile_domains_set)
                
                # Flexible matching: Check for exact match, word match, or domain-relevant terms
                has_mandatory_skill = False
                
                # Check for exact or word-boundary match
                for term in all_profile_terms:
                    term_lower = term.lower()
                    if (mandatory_lower == term_lower or 
                        (mandatory_lower in term_lower and (term_lower.startswith(mandatory_lower) or f" {mandatory_lower}" in f" {term_lower}"))):
                        has_mandatory_skill = True
                        break
                
                # If no exact match, use semantic similarity for multi-word skills
                if not has_mandatory_skill and " " in mandatory_lower:
                    # Use semantic similarity to check if profile is related to mandatory skill
                    profile_text_for_check = " ".join(list(all_profile_terms)[:10])  # Use top terms
                    similarity = compute_semantic_similarity(mandatory_lower, profile_text_for_check)
                    if similarity > 0.7:  # High similarity threshold
                        has_mandatory_skill = True
                        logging.debug(f"✅ Semantic match for mandatory skill '{mandatory_skill}': {similarity:.2f}")
                
                # Only skip if we're very confident it's not a match
                # Since profiles were pre-filtered, be lenient here
                if not has_mandatory_skill:
                    logging.debug(f"⚠️ Profile {profile_id}: mandatory skill '{mandatory_skill}' not found, but allowing (pre-filtered)")
                    # Don't skip - allow it through since it passed pre-filter
            
            # NEW SCORING FORMULA (MANDATORY):
            # final_score = (
            #     base_faiss_similarity * 0.50 +
            #     semantic_skill_alignment * 0.20 +
            #     resume-title-to-query-title alignment * 0.15 +
            #     domain similarity * 0.10 +
            #     chunk hierarchical relevance * 0.05
            # )
            
            # 1. Base FAISS similarity (0.50 weight)
            # Hierarchical score: weighted average of chunk scores
            if profile_data["weight_sum"] > 0:
                hierarchical_score = profile_data["weighted_sum"] / profile_data["weight_sum"]
            else:
                hierarchical_score = profile_data["max_chunk_score"]
            
            # Normalize hierarchical score to 0-100
            base_faiss_similarity = max(0.0, min(100.0, hierarchical_score))
            
            # 2. Semantic skill alignment (0.20 weight) - INCREASED SCORING
            # OPTIMIZATION: Only compute for top profiles to save API calls
            semantic_skill_alignment_score = 0.0
            if expanded_skills and profile_skills_list and len(final_results) < 20:  # Only for top 20
                alignment = compute_semantic_skill_alignment(expanded_skills, profile_skills_list)
                semantic_skill_alignment_score = alignment * 100.0
            else:
                # Fast fallback: simple keyword overlap - INCREASED SCORING
                if expanded_skills and profile_skills_list:
                    expanded_set = {s.lower() for s in expanded_skills}
                    profile_set = {s.lower() for s in profile_skills_list}
                    overlap = len(expanded_set.intersection(profile_set))
                    # Increased scoring: more generous overlap calculation
                    if expanded_skills:
                        overlap_ratio = overlap / len(expanded_skills)
                        # Boost scores: 50% overlap = 75% score, 100% overlap = 100% score
                        semantic_skill_alignment_score = min(100.0, (overlap_ratio * 100.0) + (overlap_ratio * 50.0))
                    else:
                        semantic_skill_alignment_score = 0.0
            
            # 3. Title/role alignment (0.15 weight) - INCREASED SCORING
            # OPTIMIZATION: Use simple keyword matching instead of embeddings for speed
            profile_name = None
            for chunk in profile_data["chunks"]:
                chunk_meta = chunk.get("metadata", {})
                if "name" in chunk_meta:
                    profile_name = chunk_meta["name"]
                    break
            
            title_alignment_score = 0.0
            if profile_name or profile_skills_list:
                # Fast keyword-based alignment (no API calls) - INCREASED SCORING
                query_words = set(query.lower().split())
                profile_text_for_match = f"{profile_name or ''} {' '.join(profile_skills_list[:5])}".lower()
                profile_words = set(profile_text_for_match.split())
                overlap = len(query_words.intersection(profile_words))
                if len(query_words) > 0:
                    overlap_ratio = overlap / len(query_words)
                    # Boost scores: more generous matching
                    title_alignment_score = min(100.0, (overlap_ratio * 100.0) + (overlap_ratio * 30.0))
                else:
                    title_alignment_score = 50.0  # Default score if no query words
            
            # 4. Domain similarity (0.10 weight) - INCREASED SCORING
            # OPTIMIZATION: Use cached domain detection, avoid per-profile embeddings
            domain_similarity_score = 60.0  # Increased default neutral score
            if profile_skills_list or profile_text:
                # Quick check: if query domain matches profile domain keywords
                query_domain = detect_semantic_domain(query)  # Cached after first call
                if query_domain:
                    profile_text_for_domain = " ".join(profile_skills_list[:5] + [profile_text or ""])
                    profile_domain = detect_semantic_domain(profile_text_for_domain)
                    if profile_domain == query_domain:
                        domain_similarity_score = 100.0
                    elif profile_domain:
                        # Domains don't match, but give partial credit
                        domain_similarity_score = 40.0  # Increased from 20.0
            
            # 5. Chunk hierarchical relevance (0.05 weight)
            # Already computed as hierarchical_score, use max chunk score
            chunk_relevance_score = profile_data["max_chunk_score"]
            
            # Calculate final score using new formula - INCREASED SCORING
            # Adjusted weights to give higher scores overall
            final_score = (
                base_faiss_similarity * 0.45 +  # Slightly reduced to boost other components
                semantic_skill_alignment_score * 0.25 +  # Increased from 0.20
                title_alignment_score * 0.18 +  # Increased from 0.15
                domain_similarity_score * 0.10 +
                chunk_relevance_score * 0.02  # Reduced from 0.05
            )
            
            # Add bonus for high skill alignment (encourages better matches)
            if semantic_skill_alignment_score > 70.0:
                final_score += 5.0  # Bonus for high skill matches
            if semantic_skill_alignment_score > 85.0:
                final_score += 5.0  # Additional bonus for very high matches
            
            # Add bonus for domain match
            if domain_similarity_score >= 100.0:
                final_score += 3.0  # Bonus for perfect domain match
            
            # Ensure score is in 0-100 range
            final_score = max(0.0, min(100.0, final_score))
            
            logging.debug(f"📊 Profile {profile_id} scoring: FAISS={base_faiss_similarity:.1f}, Skill={semantic_skill_alignment_score:.1f}, Title={title_alignment_score:.1f}, Domain={domain_similarity_score:.1f}, Chunk={chunk_relevance_score:.1f}, Final={final_score:.1f}")
            
            final_results.append({
                "id": profile_id,
                "score": round(final_score, 2),
                "hierarchical_score": round(hierarchical_score, 2),
                "max_chunk_score": round(profile_data["max_chunk_score"], 2),
                "chunk_count": len(profile_data["chunks"]),
                "chunks": profile_data["chunks"][:5],  # Top 5 chunks
                "metadata": {
                    "profile_id": profile_id,
                    "chunk_types": list(profile_data["chunk_scores"].keys()),
                }
            })
        
        # Sort by final score
        final_results.sort(key=lambda x: x["score"], reverse=True)
        
        logging.info(f"🔍 Multi-vector search returned {len(final_results)} profiles from {len(chunk_results)} chunks")
        return final_results
        
    except Exception as e:
        logging.error(f"❌ Multi-vector search failed: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return []


def query_multi_vector(
    text: str,
    top_k: int = 10,
    filter_ids: Optional[Set[str]] = None,
    mandatory_skill: Optional[str] = None,
    expanded_skills: Optional[List[str]] = None,
    use_reranker: bool = True,
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Query multi-vector index with full pipeline.
    
    This is the new multi-vector version of query_vector().
    Maintains backward compatibility by returning same format.
    
    CRITICAL: Applies mandatory skill filtering BEFORE vector search.
    """
    # STEP 1: Extract skills if not provided
    if not expanded_skills:
        extracted_skills = extract_skills_from_query(text)
        if extracted_skills:
            expanded_skills = expand_skills(extracted_skills, min_terms=10, max_terms=15)
        else:
            expanded_skills = []
    
    # STEP 2: Apply mandatory skill filtering BEFORE vector search
    # This is critical - no profile should be considered unless it has the mandatory skill
    mandatory_skill_ids = fetch_mandatory_skill_filter(mandatory_skill, query=text)
    
    if mandatory_skill_ids:
        # Combine with existing filter_ids if provided
        if filter_ids:
            # Use intersection to ensure both filters are satisfied
            combined_filter_ids = filter_ids.intersection(mandatory_skill_ids)
            if len(combined_filter_ids) < 10:
                # Too few results, use union to avoid over-filtering
                combined_filter_ids = filter_ids.union(mandatory_skill_ids)
                logging.debug(f"⚠️ Filter intersection too narrow ({len(filter_ids.intersection(mandatory_skill_ids))} results), using union")
        else:
            combined_filter_ids = mandatory_skill_ids
        filter_ids = combined_filter_ids
        logging.info(f"🔒 Applied mandatory skill filter: {len(filter_ids)} profiles eligible for search")
    elif mandatory_skill:
        # Mandatory skill specified but no matches found - return empty results
        logging.warning(f"⚠️ No profiles found with mandatory skill '{mandatory_skill}', returning empty results")
        try:
            from services.embeddings import get_embedding_service
            embedding_service = get_embedding_service()
            query_embedding = embedding_service.embed_single(text, normalize=True, use_cache=True)
        except:
            query_embedding = np.zeros(1536, dtype=np.float32)
        return query_embedding, []
    
    # STEP 3: Perform multi-vector search with filters applied
    results = search_multi_vector(
        query=text,
        top_k=top_k * 20,  # Retrieve more chunks for better aggregation
        filter_ids=filter_ids,
        expanded_skills=expanded_skills,
        mandatory_skill=mandatory_skill,
        use_reranker=use_reranker,
    )
    
    # STEP 4: Generate query embedding for return (for compatibility)
    try:
        from services.embeddings import get_embedding_service
        embedding_service = get_embedding_service()
        query_embedding = embedding_service.embed_single(text, normalize=True, use_cache=True)
    except:
        query_embedding = np.zeros(1536, dtype=np.float32)  # Fallback
    
    return query_embedding, results[:top_k]


