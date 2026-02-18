from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Body, Header, Form, Request
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request as StarletteRequest
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from middleware.security import SecurityHeadersMiddleware, HTTPSRedirectMiddleware, OptionsHandlerMiddleware
from tasks.celery_app import cel
from celery.result import AsyncResult
from tasks.tasks import bulk_import_task
from services.parse_service import parse_resume_text, parse_jd_text
from core.utils import decode_jwt
from api.auth import router as auth_router
from api.analytics import router as analytics_router
from services.vector_store import (
    query_vector,
    get_cached_jd_results,
    store_cached_jd_results,
    cleanup_jd_cache,
    jd_text_hash,
    clear_embedding_cache,
    clear_all_caches,
    get_vector_store_ids,
    get_indexed_profile_ids,
    expand_query_with_llm,
    compute_vector_integrity,
    repair_vector_index,
    repair_missing_vectors,
    extract_skills_from_query,
    expand_skills,
    upsert_multi_vector,
    initialize_multi_vector_index,
    save_multi_vector_index,
)
from services.skill_domains import infer_skill_domains
import base64, os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, AsyncGenerator, Optional, Tuple
import asyncio
import json
from core.db import trainer_profiles, admin_users, activity_logs, customer_users, customer_requirements
from pydantic import BaseModel, EmailStr
from models.models import ActivityLogRequest, ActivityLogsFilter, TrainerProfileUpdate, CustomerRequirementPost, RequirementApproval
import re
import hashlib
from dotenv import load_dotenv

EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

def convert_to_python_types(obj):
    """
    Recursively convert numpy types (float32, int32, etc.) to Python native types
    for JSON serialization compatibility.
    """
    import numpy as np
    if isinstance(obj, (np.integer, np.floating)):
        return float(obj) if isinstance(obj, np.floating) else int(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: convert_to_python_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_python_types(item) for item in obj]
    return obj

load_dotenv()

# Cache for skill variations (AI-based, fast lookup)
_skill_variations_cache: Dict[str, Tuple[List[str], datetime]] = {}
_SKILL_VARIATIONS_CACHE_TTL = timedelta(hours=24)

def generate_skill_variations(skill: str) -> List[str]:
    """
    AI-powered skill variation generator using semantic similarity and embeddings.
    Fast, cached, and works for ANY skill without hardcoding.
    
    Strategy:
    1. Fast format variations (spaces, hyphens, case) - instant
    2. Match against actual resume skills to find all format variations - fast
    3. Fuzzy matching for similar skills - fast
    4. All results cached for 24 hours
    
    Examples:
    - "data warehousing" → finds "datawarehousing", "data warehouse", "data-warehousing", etc.
    - "datawarehousing" (normalized) → finds "data warehousing", "data-warehousing", "datawarehousing", etc.
    - "cloud computing" → finds "cloudcomputing", "cloud-computing", etc.
    """
    if not skill or not skill.strip():
        return []
    
    skill_clean = skill.strip().lower()
    
    # Check cache first (very fast)
    cache_key = skill_clean
    if cache_key in _skill_variations_cache:
        variations, timestamp = _skill_variations_cache[cache_key]
        if datetime.utcnow() - timestamp < _SKILL_VARIATIONS_CACHE_TTL:
            return variations
        else:
            del _skill_variations_cache[cache_key]
    
    
    try:
        from services.vector_store import get_all_resume_skills
        valid_skills = get_all_resume_skills()
    except Exception as e:
        logging.warning(f"⚠️ Could not get resume skills for variation generation: {e}")
        valid_skills = set()
    
    # Step 2: Normalize skill for comparison (remove spaces, hyphens, underscores)
    def normalize_for_match(s: str) -> str:
        return s.lower().replace(" ", "").replace("-", "").replace("_", "").strip()
    
    skill_normalized = normalize_for_match(skill_clean)
    
    # Step 3: Find ALL matching skills from actual resumes (this is the key!)
    # This finds skills like "data-warehousing", "data warehousing", "datawarehousing", etc.
    matching_skills = set()
    
    for valid_skill in valid_skills:
        valid_normalized = normalize_for_match(valid_skill)
        
        # Exact match after normalization (handles all format variations)
        if skill_normalized == valid_normalized and skill_normalized:
            # Found a match! Add the actual skill and all its format variations
            matching_skills.add(valid_skill.lower().strip())
            # Also add format variations
            matching_skills.add(valid_skill.lower().replace(" ", "").replace("-", "").replace("_", ""))
            matching_skills.add(valid_skill.lower().replace(" ", "-"))
            matching_skills.add(valid_skill.lower().replace("-", " "))
            matching_skills.add(valid_skill.lower().replace(" ", ""))
            matching_skills.add(valid_skill.lower().replace("-", ""))
        
        # Substring match: Check if shorter skill is contained in longer skill (e.g., "cloud" in "cloudcomputing")
        # OR if longer skill contains shorter skill (e.g., "cloud computing" contains "cloud")
        elif len(skill_normalized) >= 3:  # Allow substring matching for skills 3+ chars (e.g., "aws", "cloud")
            # Case 1: Short skill in longer skill (e.g., "cloud" in "cloudcomputing")
            if len(valid_normalized) > len(skill_normalized) and skill_normalized in valid_normalized:
                # Make sure it's a meaningful match (not just a substring like "net" in "networking")
                # Check if skill is at word boundary or start of valid skill
                if valid_normalized.startswith(skill_normalized) or f" {skill_normalized}" in f" {valid_normalized}":
                    matching_skills.add(valid_skill.lower().strip())
                    matching_skills.add(valid_skill.lower().replace(" ", "-"))
                    matching_skills.add(valid_skill.lower().replace("-", " "))
                    matching_skills.add(valid_skill.lower().replace(" ", ""))
            
            # Case 2: Longer skill contains shorter skill (e.g., "cloudcomputing" contains "cloud")
            # Also check for both directions if both are long enough
            elif len(skill_normalized) >= 5 and len(valid_normalized) >= 5:
                if valid_normalized in skill_normalized or skill_normalized in valid_normalized:
                    # Calculate similarity ratio to avoid false matches
                    common_chars = sum(1 for c in skill_normalized if c in valid_normalized)
                    similarity = common_chars / max(len(skill_normalized), len(valid_normalized))
                    if similarity > 0.75:  # 75% similarity threshold
                        matching_skills.add(valid_skill.lower().strip())
                        matching_skills.add(valid_skill.lower().replace(" ", "-"))
                        matching_skills.add(valid_skill.lower().replace("-", " "))
                        matching_skills.add(valid_skill.lower().replace(" ", ""))
    
    # Step 4: Generate format variations from the original skill
    # This handles cases where the skill might not be in the database yet
    format_variations = set()
    format_variations.add(skill_clean)  # Original: "data warehousing" or "datawarehousing"
    
    # If skill has spaces, generate no-space and hyphen versions
    if " " in skill_clean:
        format_variations.add(skill_clean.replace(" ", ""))  # "datawarehousing"
        format_variations.add(skill_clean.replace(" ", "-"))  # "data-warehousing"
        format_variations.add(skill_clean.replace(" ", "_"))  # "data_warehousing"
    
    # If skill has hyphens, generate space and no-separator versions
    if "-" in skill_clean:
        format_variations.add(skill_clean.replace("-", " "))  # "data warehousing"
        format_variations.add(skill_clean.replace("-", ""))  # "datawarehousing"
        format_variations.add(skill_clean.replace("-", "_"))  # "data_warehousing"
    
    # If skill has no separators (normalized), try to find word boundaries
    # This is tricky - we'll rely on matching against actual skills above
    if " " not in skill_clean and "-" not in skill_clean and "_" not in skill_clean:
        # Normalized skill like "datawarehousing" - we already found matches above
        # Just add the original
        format_variations.add(skill_clean)
    
    # Combine all variations
    all_variations = list(set(matching_skills | format_variations))
    
    # Add case variations for all unique variations
    final_variations = set()
    for var in all_variations:
        if var and var.strip():
            var_lower = var.strip().lower()
            final_variations.add(var_lower)
            final_variations.add(var_lower.capitalize())
            final_variations.add(var_lower.title())
            # Don't add uppercase - too noisy
    
    # Remove empty strings and normalize
    unique_variations = []
    seen = set()
    for var in final_variations:
        if var and var.strip():
            var_lower = var.strip().lower()
            if var_lower not in seen:
                unique_variations.append(var_lower)
                seen.add(var_lower)
    
    # Cache the result
    _skill_variations_cache[cache_key] = (unique_variations, datetime.utcnow())
    
    # Cleanup old cache entries (keep last 1000)
    if len(_skill_variations_cache) > 1000:
        sorted_items = sorted(_skill_variations_cache.items(), key=lambda x: x[1][1])
        for key, _ in sorted_items[:len(_skill_variations_cache) - 1000]:
            del _skill_variations_cache[key]
    
    logging.info(f"🎯 Generated {len(unique_variations)} variations for '{skill_clean}': {unique_variations[:15]}")
    return unique_variations


def normalize_keyword_to_single_word(query: str) -> str:
    """
    Normalize multi-word keywords, but PRESERVE meaningful multi-word skills.
    Only normalize if it's a job role + skill combination.
    
    Examples:
    - "data engineer" → "data engineer" (preserve - it's a meaningful skill)
    - "python developer" → "python" (remove job role)
    - "cloud computing" → "cloud computing" (preserve - it's a meaningful skill)
    - "machine learning" → "machine learning" (preserve - it's a meaningful skill)
    """
    if not query or not query.strip():
        return ""
    
    query_lower = query.strip().lower()
    words = query_lower.split()
    
    # Remove stop words only
    stop_words = {"in", "with", "for", "and", "or", "the", "a", "an", "of", "to", "from", "by"}
    job_roles = {
        "developer", "engineer", "architect", "manager", "analyst", "consultant",
        "specialist", "expert", "professional", "trainer", "instructor", "teacher",
        "programmer", "coder", "designer", "administrator", "admin", "lead", "senior",
        "junior", "associate", "director", "head", "chief", "officer", "executive",
        "training", "course", "tutorial", "workshop", "seminar", "class"
    }
    
    # Check if this is a known meaningful multi-word skill first
    # These are skills where the job role word is part of the skill name
    meaningful_multi_word_skills = {
        "data engineer", "data engineering", "data scientist", "data science",
        "cloud engineer", "cloud computing", "cloud architect",
        "devops engineer", "devops engineering",
        "machine learning", "deep learning", "reinforcement learning",
        "full stack", "full stack developer", "full stack engineer",
        "software engineer", "software engineering",
        "network engineer", "network engineering",
        "security engineer", "security engineering"
    }
    
    query_normalized_check = query_lower.strip()
    if query_normalized_check in meaningful_multi_word_skills:
        return query_normalized_check
    
    # Check if query contains a job role - if so, remove it
    # But preserve meaningful multi-word skills like "data engineer", "cloud computing"
    has_job_role = any(word in job_roles for word in words)
    
    if has_job_role and len(words) == 2:
        # Check if it's a meaningful skill first (e.g., "data engineer" is a skill, not "data" + job role)
        # Only remove job role if it's clearly "skill + job_role" like "python developer"
        first_word = words[0]
        second_word = words[1]
        
        # If first word is a known skill domain, preserve the combination
        skill_domains = {"data", "cloud", "devops", "machine", "deep", "reinforcement", 
                        "full", "software", "network", "security", "web", "mobile"}
        
        if first_word in skill_domains:
            # Preserve as meaningful skill (e.g., "data engineer", "cloud architect")
            return " ".join([w for w in words if w not in stop_words])
        
        # Otherwise, it's likely "skill + job_role" (e.g., "python developer")
        meaningful_words = [w for w in words if w not in stop_words and w not in job_roles]
        if meaningful_words:
            return meaningful_words[0]
    elif len(words) >= 2:
        # Multi-word skill - preserve it (e.g., "data engineer", "cloud computing")
        meaningful_words = [w for w in words if w not in stop_words]
        if meaningful_words:
            return " ".join(meaningful_words)
    
    # Filter out stop words and job roles
    meaningful_words = [w for w in words if w not in stop_words and w not in job_roles]
    
    if not meaningful_words:
        # If all words were filtered, use the first word
        meaningful_words = [words[0]] if words else []
    
    # Common abbreviations (keep these for backward compatibility)
    common_abbreviations = {
        "artificial intelligence": "ai",
        "machine learning": "ml",
        "natural language processing": "nlp",
        "information technology": "it",
        "extract transform load": "etl",
    }
    
    query_normalized = " ".join(meaningful_words)
    if query_normalized in common_abbreviations:
        return common_abbreviations[query_normalized]
    
    # If single word, return as is
    if len(meaningful_words) == 1:
        return meaningful_words[0]
    
    # For multi-word phrases, combine them (remove spaces)
    # e.g., "cloud computing" → "cloudcomputing"
    combined = "".join(meaningful_words)
    
    # If combined word is too long (>20 chars), use the primary word
    if len(combined) > 20:
        return meaningful_words[0]
    
    return combined


def extract_location_from_query(query: str) -> Optional[str]:
    """
    Extract location from query text.
    Handles patterns like:
    - "etl trainer from bangalore"
    - "python developer in mumbai"
    - "data engineer at delhi"
    - "cloud architect based in hyderabad"
    
    Returns location string if found, None otherwise.
    """
    if not query or not query.strip():
        return None
    
    query_lower = query.lower().strip()
    
    # Common location indicator phrases (ordered by specificity - longer phrases first)
    location_phrases = [
        "located in", "based in", "based at", "close to",
        "from", "in", "at", "near", "around"
    ]
    
    for phrase in location_phrases:
        # Use word boundaries to avoid matching "at" inside words like "engineer"
        import re
        # Create pattern with word boundaries for single-word phrases
        if len(phrase.split()) == 1:
            pattern = r'\b' + re.escape(phrase) + r'\b'
        else:
            pattern = re.escape(phrase)
        
        match = re.search(pattern, query_lower)
        if match:
            # Get text after the phrase
            start_pos = match.end()
            potential_location = query_lower[start_pos:].strip()
            
            # Remove trailing punctuation and common words
            potential_location = potential_location.rstrip(".,!?;:")
            
            # Split into words and filter
            words = potential_location.split()
            
            # Filter out common stop words
            stop_words = {"the", "a", "an", "and", "or", "with", "for", "to", "of"}
            location_words = [w for w in words if w.lower() not in stop_words]
            
            # Take first 1-3 words as location (cities are usually 1-2 words)
            if location_words:
                location = " ".join(location_words[:3]).strip()
                # Validate: location should be at least 2 characters
                if len(location) >= 2:
                    return location
    
    return None


def _parse_csv_setting(raw_value: str | None, default: list[str]) -> list[str]:
    if not raw_value:
        return default
    value = raw_value.strip()
    if not value:
        return default
    if value == "*":
        return ["*"]
    return [item.strip() for item in value.split(",") if item.strip()]


def _resolve_cors_configuration():
    allowed_origins = _parse_csv_setting(os.getenv("CORS_ALLOWED_ORIGINS"), ["*"])
    allowed_methods = _parse_csv_setting(os.getenv("CORS_ALLOWED_METHODS"), ["*"])
    allowed_headers = _parse_csv_setting(os.getenv("CORS_ALLOWED_HEADERS"), ["*"])
    allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() == "true"
    origin_regex = os.getenv("CORS_ALLOWED_ORIGIN_REGEX")

    # Normalize origins - remove trailing slashes to match browser behavior
    # Browser sends "http://localhost:5173" (no trailing slash)
    normalized_origins = []
    for origin in allowed_origins:
        if origin == "*":
            normalized_origins.append("*")
        else:
            # Remove trailing slash to match browser behavior
            normalized_origins.append(origin.rstrip("/"))
    allowed_origins = normalized_origins

    if "*" in allowed_origins:
        allow_credentials = False

    cors_config = {
        "allow_origins": allowed_origins,
        "allow_methods": allowed_methods,
        "allow_headers": allowed_headers,
        "allow_credentials": allow_credentials,
    }

    if origin_regex:
        cors_config["allow_origin_regex"] = origin_regex

    return cors_config

def extract_email_fallback(text: str) -> str | None:
    if not text:
        return None
    match = EMAIL_REGEX.search(text)
    if match:
        return match.group(0).strip().lower()
    return None

app = FastAPI()

# Security middleware - add before CORS
# HTTPS redirect (only in production)
if os.getenv("ENVIRONMENT") == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# CORS middleware - MUST be added LAST (executes FIRST) to handle OPTIONS and add CORS headers
# CORSMiddleware automatically handles OPTIONS requests and returns 200 OK with CORS headers
_cors_options = _resolve_cors_configuration()
app.add_middleware(CORSMiddleware, **_cors_options)

# OPTIONS handler - Added after CORS middleware (executes after) as a fallback
# This catches any OPTIONS requests that slip through and ensures 200 OK response
app.add_middleware(OptionsHandlerMiddleware)

# Exception handler for OPTIONS requests that get 400 errors
# This catches 400 errors on OPTIONS requests and converts them to 200 OK with CORS headers
@app.exception_handler(StarletteHTTPException)
async def options_exception_handler(request: StarletteRequest, exc: StarletteHTTPException):
    """Handle 400 errors on OPTIONS requests by returning 200 OK with CORS headers"""
    # Only handle OPTIONS requests with 400 errors - let all other exceptions pass through
    if request.method == "OPTIONS" and exc.status_code == 400:
        # Return 200 OK with CORS headers manually added
        origin = request.headers.get("origin")
        response = Response(status_code=200, content="")
        
        # Add CORS headers manually (since we're bypassing CORSMiddleware)
        if origin:
            # CRITICAL: Always use the exact origin from the request header
            # CORS requires exact match - browser sends "http://localhost:5173" (no trailing slash)
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "*"
        
        allowed_methods = _parse_csv_setting(os.getenv("CORS_ALLOWED_METHODS"), ["*"])
        if "*" in allowed_methods:
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        else:
            response.headers["Access-Control-Allow-Methods"] = ", ".join(allowed_methods)
        
        allowed_headers = _parse_csv_setting(os.getenv("CORS_ALLOWED_HEADERS"), ["*"])
        if "*" in allowed_headers:
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        else:
            response.headers["Access-Control-Allow-Headers"] = ", ".join(allowed_headers)
        
        allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() == "true"
        if allow_credentials:
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        response.headers["Access-Control-Max-Age"] = "3600"
        return response
    # For non-OPTIONS or non-400 errors, let FastAPI handle it normally
    # Don't re-raise - let the default exception handling work
    from starlette.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail} if hasattr(exc, "detail") else {"detail": str(exc)},
    )

@app.exception_handler(HTTPException)
async def options_http_exception_handler(request: Request, exc: HTTPException):
    """Handle 400 errors on OPTIONS requests from FastAPI HTTPException"""
    # Only handle OPTIONS requests with 400 errors - let all other exceptions pass through
    if request.method == "OPTIONS" and exc.status_code == 400:
        # Return 200 OK with CORS headers manually added
        origin = request.headers.get("origin")
        response = Response(status_code=200, content="")
        
        # Add CORS headers manually (since we're bypassing CORSMiddleware)
        if origin:
            # CRITICAL: Always use the exact origin from the request header
            # CORS requires exact match - browser sends "http://localhost:5173" (no trailing slash)
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "*"
        
        allowed_methods = _parse_csv_setting(os.getenv("CORS_ALLOWED_METHODS"), ["*"])
        if "*" in allowed_methods:
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        else:
            response.headers["Access-Control-Allow-Methods"] = ", ".join(allowed_methods)
        
        allowed_headers = _parse_csv_setting(os.getenv("CORS_ALLOWED_HEADERS"), ["*"])
        if "*" in allowed_headers:
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        else:
            response.headers["Access-Control-Allow-Headers"] = ", ".join(allowed_headers)
        
        allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() == "true"
        if allow_credentials:
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        response.headers["Access-Control-Max-Age"] = "3600"
        return response
    # For non-OPTIONS or non-400 errors, let FastAPI handle it normally
    # Return a proper JSON response instead of re-raising
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

# Strategy 3: Create MongoDB indexes on startup for faster queries
# Reindex version - increment this to trigger reindex on next startup
REINDEX_VERSION = "1.1.0"  # Incremented to force reindex after refactoring
REINDEX_VERSION_FILE = Path(__file__).parent.parent / "data" / ".reindex_version"

def get_stored_reindex_version() -> Optional[str]:
    """Get the stored reindex version from file."""
    try:
        if REINDEX_VERSION_FILE.exists():
            with open(REINDEX_VERSION_FILE, "r") as f:
                return f.read().strip()
    except Exception as e:
        logging.warning(f"⚠️ Failed to read reindex version: {e}")
    return None

def store_reindex_version(version: str):
    """Store the reindex version to file."""
    try:
        REINDEX_VERSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(REINDEX_VERSION_FILE, "w") as f:
            f.write(version)
        logging.info(f"✅ Stored reindex version: {version}")
    except Exception as e:
        logging.warning(f"⚠️ Failed to store reindex version: {e}")

def should_run_reindex() -> bool:
    """Check if reindex should run based on version."""
    stored_version = get_stored_reindex_version()
    if stored_version is None:
        logging.info(f"🔄 No stored reindex version found, will run reindex (version: {REINDEX_VERSION})")
        return True
    if stored_version != REINDEX_VERSION:
        logging.info(f"🔄 Reindex version changed ({stored_version} → {REINDEX_VERSION}), will run reindex")
        return True
    logging.info(f"✅ Reindex version matches ({REINDEX_VERSION}), skipping reindex")
    return False

def generate_raw_text_from_profile(profile: Dict[str, Any]) -> str:
    """
    Generate raw_text from profile fields if raw_text is missing or too short.
    This allows manually added profiles to be indexed even without raw_text.
    """
    parts = []
    
    # Helper to format list fields
    def format_list_field(field_value) -> str:
        if not field_value:
            return ""
        if isinstance(field_value, str):
            return field_value
        if isinstance(field_value, list):
            if not field_value:
                return ""
            formatted_items = []
            for item in field_value:
                if isinstance(item, str):
                    formatted_items.append(item)
                elif isinstance(item, dict):
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
    
    # Add name
    name = profile.get("name", "")
    if name:
        parts.append(f"Name: {name}")
    
    # Add email
    email = profile.get("email", "")
    if email:
        parts.append(f"Email: {email}")
    
    # Add skills
    skills = profile.get("skills", [])
    if skills:
        parts.append("Skills: " + format_list_field(skills))
    
    # Add skill domains
    skill_domains = profile.get("skill_domains", [])
    if skill_domains:
        parts.append("Skill Domains: " + format_list_field(skill_domains))
    
    # Add companies
    companies = profile.get("companies", [])
    if companies:
        parts.append("Companies: " + format_list_field(companies))
    
    # Add current company
    current_company = profile.get("current_company", "")
    if current_company:
        parts.append(f"Current Company: {current_company}")
    
    # Add clients
    clients = profile.get("clients", [])
    if clients:
        parts.append("Clients: " + format_list_field(clients))
    
    # Add education
    education = profile.get("education", [])
    if education:
        parts.append("Education: " + format_list_field(education))
    
    # Add certifications
    certifications = profile.get("certifications", [])
    if certifications:
        parts.append("Certifications: " + format_list_field(certifications))
    
    # Add location
    location = profile.get("location", "")
    if location:
        parts.append(f"Location: {location}")
    
    # Add experience years
    experience_years = profile.get("experience_years")
    if experience_years is not None:
        parts.append(f"Experience: {experience_years} years")
    
    # Add phone
    phone = profile.get("phone", "")
    if phone:
        parts.append(f"Phone: {phone}")
    
    # Combine all parts
    generated_text = " ".join(parts)
    return generated_text.strip()


async def reindex_all_profiles_multi_vector():
    """
    Reindex all profiles with multi-vector chunks.
    Enhanced to handle manually added profiles without raw_text or profile_id.
    Runs only once per deployment unless version changes.
    """
    try:
        logging.info("🚀 Starting multi-vector reindex of all profiles...")
        
        # Ensure embedding service is initialized
        from services.embeddings import get_embedding_service
        embedding_service = get_embedding_service()
        embedding_dim = embedding_service.get_dimension()
        
        # Ensure multi-vector index is initialized
        from services.vector_store import multi_vector_index
        if multi_vector_index is None:
            logging.info("🔄 Initializing multi-vector index for reindex...")
            initialize_multi_vector_index(embedding_dim)
        
        # Get all profiles from MongoDB
        profiles = []
        async for profile in trainer_profiles.find({}):
            profiles.append(profile)
        
        total_profiles = len(profiles)
        if total_profiles == 0:
            logging.info("ℹ️ No profiles found to reindex")
            return
        
        logging.info(f"📊 Found {total_profiles} profiles to reindex")
        
        # Get already indexed profile IDs to avoid duplicate indexing
        indexed_profile_ids = get_indexed_profile_ids()
        logging.info(f"📋 Found {len(indexed_profile_ids)} profiles already indexed, will skip duplicates")
        
        # Reindex each profile
        success_count = 0
        skipped_count = 0
        error_count = 0
        error_details = []
        profiles_updated = 0  # Track profiles we update in MongoDB
        
        for idx, profile in enumerate(profiles, 1):
            # Generate or use existing profile_id
            profile_id = profile.get("profile_id")
            if not profile_id:
                # Try to generate profile_id from email or _id
                email = profile.get("email", "")
                if email:
                    profile_id = email  # Use email as profile_id fallback
                else:
                    # Use _id as last resort
                    profile_id = str(profile.get("_id", f"profile_{idx}"))
                
                # Update profile in MongoDB with generated profile_id
                try:
                    await trainer_profiles.update_one(
                        {"_id": profile.get("_id")},
                        {"$set": {"profile_id": profile_id}}
                    )
                    profiles_updated += 1
                    logging.info(f"✅ Generated profile_id '{profile_id}' for profile {idx}")
                except Exception as e:
                    logging.warning(f"⚠️ Failed to update profile_id for profile {idx}: {e}")
            
            # Check if profile is already indexed (skip to avoid duplicates)
            if profile_id in indexed_profile_ids:
                skipped_count += 1
                if idx % 50 == 0:
                    logging.debug(f"⏭️ Skipping already indexed profile {profile_id} ({idx}/{total_profiles})")
                continue
            
            try:
                raw_text = profile.get("raw_text", "") or ""
                
                # Generate raw_text from profile fields if missing or too short
                if not raw_text or len(raw_text.strip()) < 10:
                    generated_text = generate_raw_text_from_profile(profile)
                    
                    if generated_text and len(generated_text.strip()) >= 10:
                        raw_text = generated_text
                        # Update profile in MongoDB with generated raw_text
                        try:
                            await trainer_profiles.update_one(
                                {"_id": profile.get("_id")},
                                {"$set": {"raw_text": raw_text}}
                            )
                            profiles_updated += 1
                            logging.info(f"✅ Generated raw_text for profile {profile_id} ({idx}/{total_profiles})")
                        except Exception as e:
                            logging.warning(f"⚠️ Failed to update raw_text for profile {profile_id}: {e}")
                    else:
                        logging.warning(f"⚠️ Profile {profile_id}: Could not generate sufficient raw_text, skipping")
                        error_count += 1
                        error_details.append(f"{profile_id}: Insufficient data to generate raw_text")
                        continue
                
                # Prepare metadata
                metadata = {
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
                    "current_company": profile.get("current_company"),
                }
                
                # Upsert multi-vector chunks
                upsert_multi_vector(profile_id, raw_text, metadata)
                success_count += 1
                
                if idx % 10 == 0:
                    logging.info(f"📊 Reindex progress: {idx}/{total_profiles} ({success_count} indexed, {skipped_count} skipped, {error_count} errors)")
            
            except Exception as e:
                error_count += 1
                error_msg = str(e)
                error_type = type(e).__name__
                
                # Log detailed error information
                logging.warning(f"⚠️ Failed to reindex profile {profile_id} ({idx}/{total_profiles}): {error_type}: {error_msg}")
                
                # Store error details (limit to first 50 to avoid memory issues)
                if len(error_details) < 50:
                    error_details.append(f"{profile_id}: {error_type}: {error_msg[:100]}")
                
                # Log traceback for first few errors to help diagnose
                if error_count <= 5:
                    import traceback
                    logging.debug(f"Traceback for profile {profile_id}:\n{traceback.format_exc()}")
                
                continue
        
        logging.info(f"✅ Multi-vector reindex completed: {success_count} indexed, {skipped_count} skipped (already indexed), {error_count} errors out of {total_profiles} profiles")
        if profiles_updated > 0:
            logging.info(f"📝 Updated {profiles_updated} profiles in MongoDB with generated profile_id/raw_text")
        
        # Log error summary if there were errors
        if error_count > 0:
            logging.warning(f"⚠️ {error_count} profiles failed to index. Common issues:")
            logging.warning(f"   - Missing or empty raw_text")
            logging.warning(f"   - Chunking errors")
            logging.warning(f"   - Embedding generation failures")
            if error_details:
                logging.warning(f"   Sample errors (first {min(10, len(error_details))}):")
                for detail in error_details[:10]:
                    logging.warning(f"     - {detail}")
        
        # Save multi-vector index
        try:
            save_multi_vector_index()
            logging.info("💾 Saved multi-vector index to disk")
        except Exception as e:
            logging.warning(f"⚠️ Failed to save multi-vector index: {e}")
        
    except Exception as e:
        logging.error(f"❌ Multi-vector reindex failed: {e}")
        import traceback
        logging.error(traceback.format_exc())
        raise

@app.on_event("startup")
async def startup_initialization():
    """
    Startup initialization sequence:
    1. Create MongoDB indexes
    2. Initialize embedding service
    3. Initialize FAISS indexes (single-vector and multi-vector)
    4. Initialize vector stores
    5. Run reindex if version changed
    """
    try:
        # Step 1: Create MongoDB indexes
        logging.info("🔧 Step 1/5: Creating MongoDB indexes...")
        try:
            await trainer_profiles.create_index("profile_id", unique=False)
            await trainer_profiles.create_index("location")
            await trainer_profiles.create_index([("profile_id", 1), ("location", 1)])
            await trainer_profiles.create_index("email", unique=False)
            logging.info("✅ MongoDB indexes created successfully")
        except Exception as e:
            logging.warning(f"⚠️ Failed to create MongoDB indexes: {e}")
        
        # Step 2: Initialize embedding service
        logging.info("🔧 Step 2/5: Initializing embedding service...")
        try:
            from services.embeddings import get_embedding_service
            embedding_service = get_embedding_service()
            embedding_dim = embedding_service.get_dimension()
            logging.info(f"✅ Embedding service initialized (model: {embedding_service.model_name}, dimension: {embedding_dim})")
        except Exception as e:
            logging.error(f"❌ Failed to initialize embedding service: {e}")
            import traceback
            logging.error(traceback.format_exc())
            # Continue anyway - system can fall back to OpenAI
        
        # Step 3: Initialize FAISS indexes
        logging.info("🔧 Step 3/5: Initializing FAISS indexes...")
        try:
            # Single-vector index is already loaded by vector_store.py import
            # Multi-vector index needs initialization
            from services.embeddings import get_embedding_service
            try:
                embedding_service = get_embedding_service()
                embedding_dim = embedding_service.get_dimension()
                initialize_multi_vector_index(embedding_dim)
                logging.info("✅ FAISS indexes initialized (single-vector and multi-vector)")
            except Exception as e:
                logging.warning(f"⚠️ Multi-vector index initialization failed: {e}")
                # Continue - single-vector will still work
        except Exception as e:
            logging.warning(f"⚠️ FAISS index initialization warning: {e}")
        
        # Step 4: Initialize vector stores
        logging.info("🔧 Step 4/5: Initializing vector stores...")
        try:
            # Vector stores are loaded by vector_store.py import
            # Just verify they're accessible
            from services.vector_store import faiss_index, multi_vector_index
            single_vector_count = faiss_index.ntotal if faiss_index else 0
            multi_vector_count = multi_vector_index.ntotal if multi_vector_index else 0
            logging.info(f"✅ Vector stores initialized (single-vector: {single_vector_count}, multi-vector: {multi_vector_count})")
        except Exception as e:
            logging.warning(f"⚠️ Vector store initialization warning: {e}")
        
        # Step 5: Always run incremental reindex on startup (only indexes missing profiles)
        logging.info("🔧 Step 5/5: Running incremental reindex (only missing profiles will be indexed)...")
        from services.vector_store import multi_vector_index
        multi_vector_count = multi_vector_index.ntotal if multi_vector_index else 0
        
        try:
            # Always run reindex - it will skip already indexed profiles
            await reindex_all_profiles_multi_vector()
            # Store version after successful reindex (for tracking purposes)
            store_reindex_version(REINDEX_VERSION)
            logging.info("✅ Incremental reindex completed (only missing profiles were indexed)")
        except Exception as e:
            logging.error(f"❌ Reindex failed: {e}")
            import traceback
            logging.error(traceback.format_exc())
            # Don't store version if reindex failed - will retry on next startup
        
        logging.info("🎉 Startup initialization completed successfully")
        
    except Exception as e:
        logging.error(f"❌ Startup initialization failed: {e}")
        import traceback
        logging.error(traceback.format_exc())
        # Don't fail startup - system can still work with partial initialization

app.include_router(auth_router)
app.include_router(analytics_router, prefix="/analytics", tags=["analytics"])

def get_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")
    _, _, token = authorization.partition(" ")
    try:
        return decode_jwt(token)
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_admin_user(user=Depends(get_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def get_trainer_user(user=Depends(get_user)):
    if user.get("role") != "trainer":
        raise HTTPException(status_code=403, detail="Trainer access required")
    return user

def get_customer_user(user=Depends(get_user)):
    if user.get("role") != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")
    return user

# Activity logging helper function
async def log_activity(
    action_type: str,
    user_email: str,
    user_role: str,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """Log an activity to the database"""
    try:
        log_entry = {
            "action_type": action_type,
            "user_email": user_email,
            "user_role": user_role,
            "details": details or {},
            "ip_address": ip_address,
            "user_agent": user_agent,
            "timestamp": datetime.utcnow()
        }
        await activity_logs.insert_one(log_entry)
    except Exception as e:
        # Don't fail the request if logging fails
        logging.warning(f"⚠️ Failed to log activity: {e}")

def get_client_ip(request) -> Optional[str]:
    """Extract client IP from request"""
    try:
        from fastapi import Request
        if isinstance(request, Request):
            # Check for forwarded IP first
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
            # Check for real IP
            real_ip = request.headers.get("X-Real-IP")
            if real_ip:
                return real_ip
            # Fallback to client host
            if hasattr(request, "client") and request.client:
                return request.client.host
    except Exception:
        pass
    return None

@app.post("/admin/bulk_upload_start")
async def bulk_upload(files: list[UploadFile] = File(...), http_request: Request = None, user=Depends(get_admin_user)):
    """
    Optimized bulk upload endpoint - processes files in parallel and returns immediately
    """
    file_names = [f.filename for f in files]
    
    # Process files in parallel for faster upload
    async def process_file(f: UploadFile):
        """Process a single file asynchronously"""
        try:
            # Read file content
            b = await f.read()
            # Base64 encode
            content_b64 = base64.b64encode(b).decode()
            return {"filename": f.filename, "content_b64": content_b64}
        except Exception as e:
            logging.error(f"Error processing file {f.filename}: {e}")
            return {"filename": f.filename, "content_b64": None, "error": str(e)}
    
    # Process all files in parallel (much faster than sequential)
    payload = await asyncio.gather(*[process_file(f) for f in files])
    
    # Filter out files with errors (optional - you might want to include them)
    payload = [p for p in payload if p.get("content_b64") is not None]
    
    # Log the upload activity (non-blocking)
    if http_request:
        asyncio.create_task(log_activity(
            action_type="upload",
            user_email=user["email"],
            user_role="admin",
            details={"file_count": len(files), "file_names": file_names[:5]},  # Limit to first 5
            ip_address=get_client_ip(http_request),
            user_agent=http_request.headers.get("User-Agent", None)
        ))
    
    # Queue the task (this is fast - just queues, doesn't process)
    try:
        logging.info(f"📤 Queuing bulk import task with {len(payload)} files")
        task = bulk_import_task.delay(payload, user["email"])
        logging.info(f"✅ Task queued successfully with ID: {task.id}")
        return {"task_id": task.id}
    except Exception as e:
        logging.error(f"❌ Failed to queue task: {e}")
        import traceback
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to queue upload task: {str(e)}")

@app.get("/tasks/{tid}")
def task_status(tid: str):
    """
    Get task status endpoint
    Returns JSON response with task state and info
    Properly handles all Celery task states including exceptions
    """
    try:
        r = AsyncResult(tid, app=cel)
        
        print(f"[Task Status] Task {tid}: state={r.state}")
        
        # Handle PENDING state
        if r.state == "PENDING":
            return {
                "state": r.state,
                "info": {"status": "Task is pending, waiting to be processed..."}
            }
        
        # Handle PROGRESS state (task is running)
        elif r.state == "PROGRESS":
            try:
                info = r.info if r.info else {"current": 0, "total": 1, "status": "Processing..."}
                return {
                    "state": r.state, 
                    "info": info
                }
            except Exception as e:
                logging.warning(f"[Task Status] Error accessing PROGRESS info for task {tid}: {e}")
                return {
                    "state": r.state,
                    "info": {"status": "Task is in progress..."}
                }
        
        # Handle SUCCESS state
        elif r.state == "SUCCESS":
            try:
                result = r.result if r.result else {}
                print(f"[Task Status] Task {tid} SUCCESS: {result}")
                return {
                    "state": r.state, 
                    "result": result
                }
            except Exception as e:
                logging.warning(f"[Task Status] Error accessing SUCCESS result for task {tid}: {e}")
                return {
                    "state": r.state,
                    "result": {"status": "Task completed successfully"}
                }
        
        # Handle FAILURE state - safely extract error information
        elif r.state == "FAILURE":
            error_info = "Task failed with unknown error"
            try:
                # For FAILURE state, r.info contains the exception
                # We need to safely extract it without causing serialization errors
                if r.info:
                    # If r.info is a string, use it directly
                    if isinstance(r.info, str):
                        error_info = r.info
                    # If it's a dict, try to extract error message
                    elif isinstance(r.info, dict):
                        error_info = r.info.get("error", r.info.get("message", str(r.info)))
                    # If it's an exception tuple (type, value, traceback), extract the value
                    elif isinstance(r.info, tuple) and len(r.info) >= 2:
                        error_info = str(r.info[1])  # Exception value
                    else:
                        error_info = str(r.info)
            except Exception as e:
                # If accessing r.info fails, try to get traceback
                logging.warning(f"[Task Status] Error accessing FAILURE info for task {tid}: {e}")
                try:
                    if hasattr(r, 'traceback') and r.traceback:
                        error_info = "Task failed. Check logs for details."
                except:
                    pass
            
            print(f"[Task Status] Task {tid} FAILURE: {error_info}")
            return {
                "state": r.state, 
                "info": {"error": error_info, "status": "Task failed"}
            }
        
        # Handle REVOKED state (task was cancelled)
        elif r.state == "REVOKED":
            return {
                "state": r.state,
                "info": {"status": "Task was cancelled/revoked"}
            }
        
        # Handle RETRY state
        elif r.state == "RETRY":
            try:
                info = r.info if r.info else {"status": "Task is being retried..."}
                return {
                    "state": r.state,
                    "info": info
                }
            except Exception as e:
                logging.warning(f"[Task Status] Error accessing RETRY info for task {tid}: {e}")
                return {
                    "state": r.state,
                    "info": {"status": "Task is being retried..."}
                }
        
        # Handle any other state (STARTED, etc.)
        else:
            try:
                # Safely try to get info
                if r.info is not None:
                    state_info = r.info
                else:
                    state_info = {"status": f"Task is {r.state.lower()}"}
                return {
                    "state": r.state,
                    "info": state_info
                }
            except Exception as e:
                # If accessing info fails, return basic state
                logging.warning(f"[Task Status] Error accessing info for task {tid} in state {r.state}: {e}")
                return {
                    "state": r.state,
                    "info": {"status": f"Task is {r.state.lower()}"}
                }
                
    except Exception as e:
        logging.error(f"[Task Status] Error checking task {tid}: {e}")
        import traceback
        traceback.print_exc()
        return {
            "state": "ERROR",
            "info": {"error": f"Error checking task status: {str(e)}", "status": "Unable to retrieve task status"}
        }

@app.post("/admin/tasks/{tid}/cancel")
async def cancel_task(tid: str, user=Depends(get_admin_user)):
    """
    Cancel an active upload/reindex task
    """
    try:
        r = AsyncResult(tid, app=cel)
        
        # Check if task is still running
        if r.state in ["PENDING", "PROGRESS"]:
            # Revoke the task
            cel.control.revoke(tid, terminate=True)
            logging.info(f"🛑 Task {tid} cancelled by admin {user.get('email', 'unknown')}")
            return {
                "success": True,
                "message": f"Task {tid} has been cancelled"
            }
        else:
            # Task is already completed or failed
            return {
                "success": False,
                "message": f"Task {tid} is already {r.state.lower()} and cannot be cancelled"
            }
    except Exception as e:
        logging.error(f"❌ Error cancelling task {tid}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error cancelling task: {str(e)}")

class JDSearchRequest(BaseModel):
    jd_text: str
    location: str = ""
    top_k: int = 10

class TextSearchRequest(BaseModel):
    query: str
    location: str = ""
    top_k: int = 10
    skill_domain: Optional[str] = None

# Add this class to your models
class AdminSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

# Add this endpoint to main.py
@app.post("/admin/add_admin")
async def add_new_admin(admin_data: AdminSignup, user=Depends(get_admin_user)):
    """
    Super Admin endpoint to create new admins.
    """
    # 1. Security Check: Ensure the requester is a Super Admin
    # You can move this list to .env
    SUPER_ADMINS = [
        "team@gisul.co.in", 
        "shaveta.goyal@gisul.co.in", 
        "sahil.goyal@gisul.co.in",
        "super@gisul.com"
    ]
    
    # Case-insensitive check
    user_email_lower = user["email"].lower().strip()
    super_admin_emails_lower = [email.lower().strip() for email in SUPER_ADMINS]
    
    if user_email_lower not in super_admin_emails_lower:
        raise HTTPException(status_code=403, detail="Only Super Admins can add new admins.")

    # 2. Check if email already exists
    existing_admin = await admin_users.find_one({"email": admin_data.email})
    if existing_admin:
        raise HTTPException(status_code=400, detail="Admin with this email already exists")

    # 3. Hash Password
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    hashed_password = pwd_context.hash(admin_data.password)

    # 4. Create Admin Document
    new_admin = {
        "name": admin_data.name,
        "email": admin_data.email,
        "password": hashed_password, 
        "role": "admin",
        "created_by": user["email"],
        "created_at": datetime.utcnow(),
        "email_verified": True
    }

    await admin_users.insert_one(new_admin)

    # 5. Log Activity
    asyncio.create_task(log_activity(
        action_type="create_admin",
        user_email=user["email"],
        user_role="admin",
        details={"new_admin_email": admin_data.email}
    ))

    return {"status": "success", "message": f"Admin {admin_data.email} created successfully"}    

@app.post("/admin/upload_jd")
async def upload_jd(file: UploadFile = File(...), user=Depends(get_admin_user)):
    
    try:
        from services.extract_text import extract_text_from_bytes
        file_bytes = await file.read()
        jd_text = extract_text_from_bytes(file.filename, file_bytes)
        if not jd_text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        
        parsed_jd = {}
        try:
            parsed_jd = parse_jd_text(jd_text)
        except Exception as parse_error:
            print(f"Warning: Could not parse JD (will return raw text): {parse_error}")
            parsed_jd = {"skills": [], "experience_years": None, "domain": "", "requirements": ""}
        
        return {
            "jd_text": jd_text,
            "parsed": parsed_jd
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing JD file: {str(e)}")

@app.post("/customer/upload_jd")
async def customer_upload_jd(file: UploadFile = File(...), user=Depends(get_customer_user)):
    """Customer upload JD file for requirement posting"""
    try:
        from services.extract_text import extract_text_from_bytes
        file_bytes = await file.read()
        jd_text = extract_text_from_bytes(file.filename, file_bytes)
        if not jd_text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        
        parsed_jd = {}
        try:
            parsed_jd = parse_jd_text(jd_text)
        except Exception as parse_error:
            logging.warning(f"Warning: Could not parse JD (will return raw text): {parse_error}")
            parsed_jd = {"skills": [], "experience_years": None, "domain": "", "requirements": ""}
        
        return {
            "jd_text": jd_text,
            "parsed": parsed_jd
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing JD file: {str(e)}")

@app.post("/admin/search_by_jd")
async def search_by_jd(request: JDSearchRequest, http_request: Request, user=Depends(get_admin_user)):
    
    try:
        # Log the admin JD search activity
        asyncio.create_task(log_activity(
            action_type="search",
            user_email=user.get("email", "unknown"),
            user_role="admin",
            details={"search_type": "jd", "location": request.location, "top_k": request.top_k},
            ip_address=get_client_ip(http_request),
            user_agent=http_request.headers.get("User-Agent", None)
        ))
        
        cleanup_jd_cache()
        jd_hash = jd_text_hash(request.jd_text, request.location, request.top_k)
        cache_entry = get_cached_jd_results(jd_hash)
        cached = False
        enriched_results: List[Dict[str, Any]] = []
        parsed_jd = {}
        
        if cache_entry:
            logging.info(f"✅ JD cache HIT for hash {jd_hash[:8]}")
            enriched_results = cache_entry.get("results", [])
            parsed_jd = cache_entry.get("parsed_jd", {})
            cached = True
        else:
            logging.info(f"🔍 JD cache MISS for hash {jd_hash[:8]}")
            try:
                parsed_jd = parse_jd_text(request.jd_text)
            except Exception as parse_error:
                logging.warning(f"⚠️ Could not parse JD text: {parse_error}")
                parsed_jd = {"skills": [], "experience_years": None, "domain": "", "requirements": ""}
            
            top_k = max(1, min(request.top_k, 50))
            query_embedding, results = query_vector(request.jd_text, top_k=top_k)
            matched_ids = [result.get("id") for result in results if result.get("id")]
            
            if matched_ids:
                profiles_cursor_all = trainer_profiles.find(
                    {"profile_id": {"$in": matched_ids}},
                    {
                        "_id": 0,
                        "profile_id": 1,
                        "name": 1,
                        "email": 1,
                        "phone": 1,
                        "location": 1,
                        "skills": 1,
                        "skill_domains": 1,
                        "experience_years": 1,
                        "education": 1,
                        "certifications": 1,
                        "companies": 1,
                        "current_company": 1,
                        "clients": 1,
                        "raw_text": 1,
                    },
                )
                profiles_dict_all = {}
                for profile in await profiles_cursor_all.to_list(length=len(matched_ids)):
                    pid = profile.get("profile_id")
                    if not pid:
                        continue
                    profiles_dict_all[pid] = profile
                
                filtered_ids = set()
                if request.location and request.location.strip():
                    location_query = {
                        "profile_id": {"$in": matched_ids},
                        "location": {"$regex": request.location.strip(), "$options": "i"},
                    }
                    profiles_cursor_filtered = trainer_profiles.find(
                        location_query,
                        {"_id": 0, "profile_id": 1},
                    )
                    filtered_ids = set()
                    for profile in await profiles_cursor_filtered.to_list(length=len(matched_ids)):
                        pid = profile.get("profile_id")
                        if pid:
                            filtered_ids.add(pid)
                
                # Extract experience_years requirement from parsed JD
                jd_experience_years = None
                if parsed_jd and parsed_jd.get("experience_years") is not None:
                    try:
                        jd_experience_years = float(parsed_jd.get("experience_years"))
                        logging.info(f"📊 JD requires experience: {jd_experience_years} years")
                    except (ValueError, TypeError):
                        jd_experience_years = None
                
                # Extract skills from JD for skill-based matching boost
                jd_skills = []
                if parsed_jd and parsed_jd.get("skills"):
                    jd_skills = [s.lower().strip() for s in parsed_jd.get("skills", []) if s]
                
                # Also extract skills from JD text itself for better matching
                if not jd_skills and request.jd_text:
                    jd_skills = extract_skills_from_query(request.jd_text)
                    if jd_skills:
                        logging.info(f"🎯 Extracted {len(jd_skills)} skills from JD text: {jd_skills[:5]}")
                
                for result in results:
                    result_id = result.get("id")
                    # Convert numpy float32 to Python float for JSON serialization
                    score = float(result.get("score", 0))
                    
                    if request.location and request.location.strip():
                        if result_id not in filtered_ids:
                            continue
                    
                    if result_id and result_id in profiles_dict_all:
                        profile = profiles_dict_all[result_id]
                        
                        # Filter by experience_years if JD has experience requirement
                        if jd_experience_years is not None:
                            profile_experience = profile.get("experience_years")
                            if profile_experience is not None:
                                profile_experience = float(profile_experience)
                            if profile_experience is None or profile_experience < jd_experience_years:
                                # Skip profiles that don't meet experience requirement
                                continue
                        
                        # Apply skill-based boost if JD has skills
                        profile_skills = profile.get("skills", [])
                        skill_boost = 0.0
                        if jd_skills and profile_skills:
                            skill_boost = calculate_skill_overlap_boost(jd_skills, profile_skills)
                        
                        # Boost the score with skill overlap
                        boosted_score = float(score) + float(skill_boost)
                        boosted_match_percentage = min(100, max(0, int(boosted_score)))
                        
                        # Convert experience_years to Python float if it's a numpy type
                        experience_years = profile.get("experience_years")
                        if experience_years is not None:
                            experience_years = float(experience_years)
                        
                        enriched_results.append({
                            "name": profile.get("name", ""),
                            "email": profile.get("email", ""),
                            "profile_id": profile.get("profile_id", result_id),
                            "phone": profile.get("phone", ""),
                            "location": profile.get("location", ""),
                            "skills": profile.get("skills", []),
                            "skill_domains": profile.get("skill_domains", []),
                            "experience_years": experience_years,
                            "education": profile.get("education"),
                            "certifications": profile.get("certifications", []),
                            "companies": profile.get("companies", []),
                            "current_company": profile.get("current_company", ""),
                            "clients": profile.get("clients", []),
                            "score": round(boosted_score, 3),
                            "match_percentage": boosted_match_percentage,
                            "raw_text": profile.get("raw_text", ""),
                        })
                    elif result_id:
                        metadata = result.get("metadata", {})
                        
                        # Filter by experience_years if JD has experience requirement
                        if jd_experience_years is not None:
                            profile_experience = metadata.get("experience_years")
                            if profile_experience is not None:
                                profile_experience = float(profile_experience)
                            if profile_experience is None or profile_experience < jd_experience_years:
                                # Skip profiles that don't meet experience requirement
                                continue
                        
                        # Apply skill-based boost if JD has skills
                        profile_skills = metadata.get("skills", [])
                        skill_boost = 0.0
                        if jd_skills and profile_skills:
                            skill_boost = calculate_skill_overlap_boost(jd_skills, profile_skills)
                        
                        # Boost the score with skill overlap
                        boosted_score = float(score) + float(skill_boost)
                        boosted_match_percentage = min(100, max(0, int(boosted_score)))
                        
                        # Convert experience_years to Python float if it's a numpy type
                        experience_years = metadata.get("experience_years")
                        if experience_years is not None:
                            experience_years = float(experience_years)
                        
                        enriched_results.append({
                            "name": metadata.get("name", ""),
                            "email": metadata.get("email", ""),
                            "profile_id": metadata.get("profile_id", result_id),
                            "phone": "",
                            "location": metadata.get("location", ""),
                            "skills": metadata.get("skills", []),
                            "skill_domains": metadata.get("skill_domains", []),
                            "experience_years": experience_years,
                            "education": metadata.get("education"),
                            "certifications": metadata.get("certifications", []),
                            "companies": metadata.get("companies", []),
                            "current_company": metadata.get("current_company", ""),
                            "clients": metadata.get("clients", []),
                            "score": round(boosted_score, 3),
                            "match_percentage": boosted_match_percentage,
                            "raw_text": "",
                        })
            
            # Sort by match percentage first (highest first), then by experience
            # Convert to Python float to handle numpy float32 types
            enriched_results.sort(key=lambda x: (
                float(x.get("match_percentage", 0) or 0),  # Primary: match percentage (highest first)
                float(x.get("experience_years", 0) or 0)  # Secondary: experience years (highest first)
            ), reverse=True)
            store_cached_jd_results(jd_hash, request.jd_text, query_embedding, enriched_results, parsed_jd)
        
        return {
            "cached": cached,
            "parsed_jd": parsed_jd,
            "total_matches": len(enriched_results),
            "matches": convert_to_python_types(enriched_results),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ JD search error: {error_msg}")
        import traceback
        logging.error(f"❌ JD search traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Search error: {error_msg}")

def extract_skills_from_query(query: str) -> List[str]:
    """
    Extract skills from search query (comma-separated or space-separated)
    Returns normalized list of skills (lowercase, trimmed)
    Handles special cases like "UI/UX", "C++", etc.
    """
    if not query or not query.strip():
        return []
    
    # Split by comma first
    parts = [p.strip() for p in query.split(",")]
    
    skills = []
    for part in parts:
        if not part:
            continue
        
        # Check for special patterns like "UI/UX", "C++", "ASP.NET" that shouldn't be split
        # These patterns typically don't have spaces and have special chars
        if "/" in part or "++" in part or "." in part or "-" in part:
            # Keep as single skill if it looks like a technical term
            skills.append(part.strip())
        else:
            # Split by space for normal skills
            sub_parts = [s.strip() for s in part.split() if s.strip()]
            skills.extend(sub_parts)
    
    # Normalize: lowercase and remove duplicates
    normalized_skills = []
    seen = set()
    for skill in skills:
        normalized = skill.lower().strip()
        if normalized and normalized not in seen:
            normalized_skills.append(normalized)
            seen.add(normalized)
    
    return normalized_skills


def calculate_skill_overlap_boost(query_skills: List[str], profile_skills: List[str]) -> float:
    """
    Calculate skill-based score boost based on overlap percentage.
    Uses AI to dynamically determine skill relationships (e.g., Python <-> AI/ML).
    Returns boost value to add to existing score.
    """
    if not query_skills:
        return 0.0
    
    if not profile_skills:
        return 0.0
    
    # Normalize profile skills (lowercase, strip, remove empty)
    profile_skills_normalized = [s.lower().strip() for s in profile_skills if s and s.strip()]
    
    # Helper to normalize skill for comparison (handle variants and special chars)
    def normalize_for_match(skill: str) -> str:
        """Normalize skill name for better matching"""
        normalized = skill.lower().strip()
        # Handle common variants and synonyms
        replacements = {
            "ui/ux": "uiux",
            "ui-ux": "uiux",
            "ui ux": "uiux",
            "user interface": "ui",
            "user experience": "ux",
            "enterprise resource planning": "erp",
            "machine learning": "ml",
            "artificial intelligence": "ai",
            "data science": "datascience",
        }
        for old, new in replacements.items():
            normalized = normalized.replace(old, new)
        # Remove spaces and special chars for comparison
        normalized = normalized.replace(" ", "").replace("/", "").replace("-", "").replace(".", "")
        return normalized
    
    # Skill synonyms mapping for flexible matching (kept minimal, AI will handle domain relationships)
    skill_synonyms = {
        "analytics": ["analytics", "data analytics", "business analytics", "data analysis", "analytical"],
        "backend": ["backend", "back-end", "back end", "server-side", "server side"],
        "database": ["database", "db", "sql", "databases"],
        "erp": ["erp", "enterprise resource planning", "sap", "oracle erp"],
        "networking": ["networking", "network", "networks", "computer networks"],
        "testing": ["testing", "qa", "quality assurance", "test", "test automation"],
        "ui/ux": ["ui/ux", "ui-ux", "ui ux", "user interface", "user experience", "ux/ui", "uiux"],
        "ui": ["ui", "user interface", "ui/ux", "ui-ux"],
        "ux": ["ux", "user experience", "ui/ux", "ui-ux"],
    }
    
    # Count exact and fuzzy matches FIRST (fast, no API calls)
    matched_count = 0
    matched_skills = []
    semantic_relationship_boost = 0.0  # Additional boost for semantic relationships
    
    # Now do exact and fuzzy matching
    for q_skill in query_skills:
        q_normalized = normalize_for_match(q_skill)
        matched = False
        
        # Get synonyms for this query skill
        q_key = q_skill.lower().strip()
        synonyms = skill_synonyms.get(q_key, [q_key]) + [q_normalized]
        
        # No hardcoded domain matching - will use semantic matching via embeddings instead
        
        # Limit to first 30 profile skills for performance
        for p_skill in profile_skills_normalized[:30]:
            p_normalized = normalize_for_match(p_skill)
            p_original_lower = p_skill.lower()
            
            # Check 1: Exact normalized match
            if q_normalized == p_normalized:
                matched_count += 1
                matched_skills.append((q_skill, p_skill))
                matched = True
                break
            
            # Check 2: Synonym match (semantic relationships handled by AI expansion and embeddings)
            for synonym in synonyms[:5]:  # Limit synonyms check for speed
                if synonym.lower() in p_original_lower or p_original_lower in synonym.lower():
                    matched_count += 1
                    matched_skills.append((q_skill, p_skill))
                    matched = True
                    break
            
            if matched:
                break
            
            # Check 3: Substring match (for longer skills)
            if len(q_normalized) >= 4:
                if q_normalized in p_normalized or p_normalized in q_normalized:
                    matched_count += 1
                    matched_skills.append((q_skill, p_skill))
                    matched = True
                    break
            
            # Check 4: Word boundary match (avoid partial matches like "net" in "internet")
            q_words = set(q_normalized.split()) if q_normalized else set()
            p_words = set(p_normalized.split()) if p_normalized else set()
            common_words = q_words.intersection(p_words)
            if common_words and len(common_words) == len(q_words) and len(q_words) > 0:
                matched_count += 1
                matched_skills.append((q_skill, p_skill))
                matched = True
                break
        
        # Check 5: Direct string contains match as last resort (limit to first 30 skills)
        if not matched:
            q_lower = q_skill.lower()
            for p_skill in profile_skills_normalized[:30]:
                p_original_lower = p_skill.lower()
                
                # Check direct contains
                if q_lower in p_original_lower or p_original_lower in q_lower:
                    # Only match if it's a reasonable length (avoid "net" matching "internet")
                    if len(q_lower) >= 3 and (len(q_lower) >= 4 or q_lower in ["ui", "ux", "erp", "qa", "ai", "ml"]):
                        matched_count += 1
                        matched_skills.append((q_skill, p_skill))
                        matched = True
                        break
    
    # OPTIMIZED: Use embeddings-based similarity ONLY when absolutely necessary
    # Skip semantic matching if we already have good matches (performance optimization)
    semantic_matches = []
    overlap_before_semantic = matched_count / len(query_skills) if query_skills else 0.0
    
    # Only do expensive semantic checks if:
    # 1. Less than 50% of skills matched (need more matches)
    # 2. We have very few unmatched skills (worth the API cost)
    # 3. Not too many profile skills (performance limit)
    should_check_semantic = (overlap_before_semantic < 0.5 and 
                            len(query_skills) <= 2 and  # Only for 1-2 query skills
                            len(profile_skills) <= 5)   # Only for profiles with <= 5 skills
    
    if should_check_semantic:
        unmatched_query_skills = [q for q in query_skills if not any(m[0] == q for m in matched_skills)]
        unmatched_profile_skills = [p for p in profile_skills_normalized if not any(m[1] == p for m in matched_skills)]
        
        if unmatched_query_skills and unmatched_profile_skills:
            from services.vector_store import generate_embedding
            import numpy as np
            
            try:
                # Pre-generate embeddings for unmatched query skills WITHOUT expansion (faster)
                # Expansion adds API call overhead - rely on cached embeddings instead
                query_embeddings = {}
                for q_skill in unmatched_query_skills:
                    # Use expansion=False for speed - rely on cached embeddings from main query
                    query_embeddings[q_skill] = generate_embedding(q_skill, use_cache=True, use_expansion=False)
                
                # Check semantic relationships only for top 3 unmatched profile skills (further limit)
                profile_skills_to_check = unmatched_profile_skills[:3]
                
                for p_skill in profile_skills_to_check:
                    try:
                        # Generate embedding for profile skill WITHOUT expansion (faster)
                        p_embedding = generate_embedding(p_skill, use_cache=True, use_expansion=False)
                        
                        # Check similarity with all unmatched query skills
                        for q_skill, q_embedding in query_embeddings.items():
                            # Calculate cosine similarity (embeddings are already normalized)
                            similarity = np.dot(q_embedding, p_embedding)
                            
                            # Very high threshold to reduce false positives and processing
                            if similarity > 0.75:  # Only very strong relationships (e.g., Python <-> AI/ML)
                                semantic_matches.append((q_skill, p_skill, similarity))
                                logging.info(f"   🎯 Semantic similarity ({similarity:.3f}): '{q_skill}' <-> '{p_skill}'")
                    except Exception as e:
                        logging.warning(f"⚠️ Embedding check failed for profile skill '{p_skill}': {e}")
                
                # Add semantic matches to matched_count with appropriate boost
                for q_skill, p_skill, similarity in semantic_matches:
                    # Boost based on similarity strength
                    if similarity > 0.80:  # Very high similarity
                        matched_count += 1.0
                        matched_skills.append((q_skill, f"{p_skill} (very high semantic match)"))
                        semantic_relationship_boost += 15.0
                    elif similarity > 0.77:  # High similarity (e.g., "python" <-> "AI/ML")
                        matched_count += 1.0
                        matched_skills.append((q_skill, f"{p_skill} (high semantic match)"))
                        semantic_relationship_boost += 12.0  # Increased boost for Python <-> AI/ML relationships
                    else:  # Good similarity (>0.75)
                        matched_count += 0.9
                        matched_skills.append((q_skill, f"{p_skill} (good semantic match)"))
                        semantic_relationship_boost += 8.0
            except Exception as e:
                logging.warning(f"⚠️ Semantic skill matching failed: {e}")
    
    # Calculate overlap percentage (use floor to handle partial matches from semantic relationships)
    overlap_percentage = matched_count / len(query_skills) if query_skills else 0.0
    
    # Boost based on overlap (more aggressive for exact matches):
    # 100% match (all skills) = +50 points (very high priority)
    # 85%+ match (missing 1 skill) = +30 points
    # 70%+ match (missing 2 skills) = +20 points
    # 50%+ match = +10 points
    # Below 50% = +0 points (but semantic relationships still get boost)
    
    base_boost = 0.0
    if overlap_percentage >= 1.0:  # All skills match - highest priority
        base_boost = 50.0
    elif overlap_percentage >= 0.85:  # Missing 1 skill
        base_boost = 30.0
    elif overlap_percentage >= 0.70:  # Missing 2 skills
        base_boost = 20.0
    elif overlap_percentage >= 0.50:  # Missing 3+ skills
        base_boost = 10.0
    elif overlap_percentage > 0.0:  # Some matches (including semantic)
        base_boost = 5.0  # Small boost for partial matches
    
    # Total boost = base boost + semantic relationship boost
    total_boost = base_boost + semantic_relationship_boost
    
    # Log for debugging (always log to see what's happening)
    logging.info(f"🎯 Skill match for query '{query_skills}': {matched_count:.1f}/{len(query_skills)} skills matched ({overlap_percentage*100:.1f}%)")
    logging.info(f"   Base boost: +{base_boost:.1f}, Semantic boost: +{semantic_relationship_boost:.1f}, Total boost: +{total_boost:.1f}")
    if matched_skills:
        logging.info(f"   Matched skills: {matched_skills[:5]}")
    if matched_count < len(query_skills):
        missing = set(query_skills) - {m[0] for m in matched_skills}
        if missing:
            logging.info(f"   Missing skills: {list(missing)}")
    
    return total_boost


async def stream_search_results(query: str, location: str, top_k: int = 10, skill_domain: Optional[str] = None) -> AsyncGenerator[str, None]:
    """
    Optimized search with streaming results - shows 100% matches immediately
    Implements Strategies 3-8: MongoDB optimization, parallelization, pre-filtering, caching
    Enhanced with skill-based matching boost
    OPTIMIZED: Parallel queries, caching, reduced logging
    """
    import time
    start_time = time.time()
    try:
        # COMPLETE REWRITE: Hybrid Search Pipeline
        # Phase 1: Extract & Expand Skills
        # Phase 2: MongoDB Pre-filtering (Mandatory Skill Required)
        # Phase 3: FAISS Semantic Ranking on Filtered Profiles
        # Phase 4: Enhanced Scoring with Skill Overlap + Mandatory Bonus
        
        mandatory_skill = None
        extracted_skills = []
        expanded_skills = []
        
        # STEP 0: Extract location from query if not explicitly provided
        extracted_location = None
        query_for_skills = query  # Keep original query for skill extraction
        if query and not location:
            # Try to extract location from query text (e.g., "etl trainer from bangalore")
            extracted_location = extract_location_from_query(query)
            if extracted_location:
                logging.debug(f"📍 Extracted location from query: '{extracted_location}'")
                # Remove location phrases from query for skill extraction
                import re
                location_phrases = ["from", "in", "at", "located in", "based in", "based at"]
                query_lower = query.lower()
                for phrase in location_phrases:
                    # Use word boundaries for single-word phrases to avoid matching inside words
                    if len(phrase.split()) == 1:
                        pattern = r'\b' + re.escape(phrase) + r'\b'
                    else:
                        pattern = re.escape(phrase)
                    
                    match = re.search(pattern, query_lower)
                    if match:
                        # Remove location phrase and everything after it
                        query_for_skills = query[:match.start()].strip()
                        break
        
        # Use extracted location if no explicit location provided
        search_location = location if location else (extracted_location if extracted_location else None)
        if extracted_location and not location:
            logging.info(f"📍 Using extracted location: '{extracted_location}' (from query text)")
        
        if query_for_skills:
            # STEP 1: Extract skills from query (query may have been cleaned of location)
            extracted_skills = extract_skills_from_query(query_for_skills)
            logging.debug(f"📋 STEP 1 - Extracted skills: {extracted_skills}")
            
            if not extracted_skills:
                # Fallback: use original query
                extracted_skills = [query_for_skills.lower().strip()]
            
            # STEP 2: Expand skills (AI-based, validated against resumes)
            expanded_skills = expand_skills(extracted_skills, min_terms=10, max_terms=15)
            expanded_terms = expanded_skills  # For backward compatibility
            logging.debug(f"🧩 STEP 2 - Expanded skills ({len(expanded_skills)}): {expanded_skills[:10]}")
            
            # STEP 3: Identify mandatory skill (primary skill from query)
            # Prefer extracted multi-word skills over normalized keyword
            if extracted_skills:
                # Use the first extracted skill (prioritizes multi-word like "data engineer")
                mandatory_skill = extracted_skills[0].strip().lower()
            else:
                # Fallback: normalize the query
                normalized_keyword = normalize_keyword_to_single_word(query_for_skills)
                if normalized_keyword:
                    mandatory_skill = normalized_keyword
                else:
                    mandatory_skill = query_for_skills.lower().strip()
            
            logging.debug(f"🔒 STEP 3 - Mandatory skill: '{mandatory_skill}' (profiles MUST have this)")
        
        # STEP 4: MongoDB Pre-filtering - Filter by mandatory skill FIRST
        async def fetch_location_filter():
            """Helper to fetch location filter - optimized with limit and projection"""
            location_to_use = search_location  # Use extracted or explicit location
            if not location_to_use:
                return None
            
            # Use case-insensitive regex
            location_query = {"location": {"$regex": location_to_use, "$options": "i"}}
            # Limit to reasonable number and use projection for faster queries
            location_cursor = trainer_profiles.find(
                location_query, 
                {"_id": 0, "profile_id": 1}
            ).limit(2000)  # Hint removed - index may not exist in all deployments
            location_profiles = await location_cursor.to_list(length=2000)
            location_filter_ids = set()
            for profile in location_profiles:
                pid = profile.get("profile_id")
                if pid:
                    location_filter_ids.add(pid)
            return location_filter_ids
        
        async def fetch_domain_filter():
            """Helper to fetch domain filter"""
            if not skill_domain:
                return None
            
            domain_cursor = trainer_profiles.find(
                {"skill_domains": {"$regex": skill_domain, "$options": "i"}},
                {"_id": 0, "profile_id": 1}
            ).limit(2000)  # Hint removed - index may not exist in all deployments
            domain_profiles = await domain_cursor.to_list(length=2000)
            domain_filter_ids = set()
            for p in domain_profiles:
                pid = p.get("profile_id")
                if pid:
                    domain_filter_ids.add(pid)
            return domain_filter_ids
        
        async def fetch_mandatory_skill_filter():
            """Helper to fetch mandatory skill filter - Domain-aware and strict matching"""
            if not mandatory_skill:
                return None
            
            # Use domain-aware filtering from vector_store
            from services.vector_store import fetch_mandatory_skill_filter as fetch_mandatory_skill_filter_vector
            mandatory_skill_filter_ids = fetch_mandatory_skill_filter_vector(mandatory_skill, query=query)
            
            if mandatory_skill_filter_ids:
                logging.info(f"🔒 Mandatory skill filter (domain-aware): Found {len(mandatory_skill_filter_ids)} profiles with skill '{mandatory_skill}'")
            else:
                logging.warning(f"⚠️ No profiles found with mandatory skill '{mandatory_skill}' (domain-aware filter)")
            
            return mandatory_skill_filter_ids
        
        
        # STEP 5: Fetch mandatory skill filter (preference filter, not hard requirement)
        # This is used to BOOST profiles with the skill, but we still search the vector DB
        mandatory_skill_filter_ids = await fetch_mandatory_skill_filter()
        
        logging.debug(f"🔒 STEP 5 - Found {len(mandatory_skill_filter_ids) if mandatory_skill_filter_ids else 0} profiles with exact skill '{mandatory_skill}' (used for boosting)")
        
        # STEP 6: Apply optional filters (location, domain)
        location_filter_ids, domain_filter_ids = await asyncio.gather(
            fetch_location_filter(),
            fetch_domain_filter()
        )
        
        logging.debug(f"📍 Location filter: {len(location_filter_ids) if location_filter_ids else 0} profiles")
        logging.debug(f"🏷️ Domain filter: {len(domain_filter_ids) if domain_filter_ids else 0} profiles")
        
        # Combine filters: Use mandatory skill as preference, but don't block vector search
        # If we have mandatory skill matches, prefer them. Otherwise, search all profiles.
        combined_filter_ids = None
        
        # Build filter set: Start with mandatory skill if available, then apply location/domain
        if mandatory_skill_filter_ids:
            combined_filter_ids = mandatory_skill_filter_ids.copy()
            
            # Apply location filter if provided
            if location_filter_ids:
                intersection = combined_filter_ids.intersection(location_filter_ids)
                if len(intersection) >= 10:  # Only use intersection if we have enough results
                    combined_filter_ids = intersection
                else:
                    # Too few results, use union to avoid over-filtering
                    combined_filter_ids = combined_filter_ids.union(location_filter_ids)
                    logging.debug(f"⚠️ Location filter too narrow ({len(intersection)} results), using union")
            
            # Apply domain filter if provided
            if domain_filter_ids:
                intersection = combined_filter_ids.intersection(domain_filter_ids)
                if len(intersection) >= 10:  # Only use intersection if we have enough results
                    combined_filter_ids = intersection
                else:
                    # Too few results, use union to avoid over-filtering
                    combined_filter_ids = combined_filter_ids.union(domain_filter_ids)
                    logging.debug(f"⚠️ Domain filter too narrow ({len(intersection)} results), using union")
        elif location_filter_ids or domain_filter_ids:
            # No mandatory skill matches, but we have location/domain filters
            if location_filter_ids and domain_filter_ids:
                combined_filter_ids = location_filter_ids.union(domain_filter_ids)
            elif location_filter_ids:
                combined_filter_ids = location_filter_ids
            elif domain_filter_ids:
                combined_filter_ids = domain_filter_ids
        
        logging.debug(f"✅ STEP 6 - Final filter: {len(combined_filter_ids) if combined_filter_ids else 0} candidate profiles for vector search (None = search all)")
        
        # STEP 7: FAISS Semantic Ranking - ALWAYS run vector search, even if no MongoDB matches
        # The mandatory skill is used for BOOSTING in the vector search, not blocking
        if query and expanded_skills:
            # Use hybrid search: semantic ranking with expanded skills
            # Pass filter_ids if we have them (preference), but don't require them
            # The vector search will find semantically similar profiles even if MongoDB didn't find exact matches
            _, results = query_vector(
                text=query,
                top_k=max(50, top_k * 2),
                filter_ids=combined_filter_ids,  # Optional filter - None means search all
                mandatory_skill=mandatory_skill,  # Used for boosting, not blocking
                expanded_skills=expanded_skills
            )
            logging.debug(f"✅ STEP 7 - FAISS search returned {len(results)} results (searched {'filtered' if combined_filter_ids else 'all'} profiles)")
        else:
            # No query, just location/domain filter
            results = []
        
        # Strategy 3: Optimized MongoDB query - combine profile_id lookup with location filter
        matched_ids = [result.get("id") for result in results if result.get("id")]
        
        if not matched_ids and not location:
            yield json.dumps({"type": "complete", "total_matches": 0, "matches": []}) + "\n"
            return
        
        # Strategy 3: Single optimized query combining profile_id and location
        if matched_ids:
            # Build combined Mongo filter
            mongo_filter: Dict[str, Any] = {"profile_id": {"$in": matched_ids}}
            location_to_filter = search_location  # Use extracted or explicit location
            if location_to_filter:
                mongo_filter["location"] = {"$regex": location_to_filter, "$options": "i"}
            if skill_domain:
                mongo_filter["skill_domains"] = {"$regex": skill_domain, "$options": "i"}
            query_filter = mongo_filter
        else:
            # Only filters present (no matched ids from FAISS)
            filter_only: Dict[str, Any] = {}
            location_to_filter = search_location  # Use extracted or explicit location
            if location_to_filter:
                filter_only["location"] = {"$regex": location_to_filter, "$options": "i"}
            if skill_domain:
                filter_only["skill_domains"] = {"$regex": skill_domain, "$options": "i"}
            query_filter = filter_only if filter_only else {}
        
        # Strategy 3: Fetch all needed fields in one query with projection
        projection = {
            "_id": 0, "profile_id": 1, "name": 1, "email": 1, "phone": 1, 
            "location": 1, "skills": 1, "skill_domains": 1, "experience_years": 1, 
            "education": 1, "certifications": 1, "companies": 1, 
            "current_company": 1, "clients": 1, "raw_text": 1
        }
        
        profiles_cursor = trainer_profiles.find(query_filter, projection)
        profiles_dict = {}
        async for profile in profiles_cursor:
            profiles_dict[profile.get("profile_id")] = profile
        # Do not log missing IDs to reduce noise and avoid extra lookups
        
        # Process and sort ALL results by match score (highest first)
        all_matches = []
        
        # Helper function to check if profile has exact skill match (prevents ".NET" matching "networking")
        def has_exact_skill_match(profile, skill):
            """Check if profile has the skill (case-insensitive, handles multi-word variations)
            Prevents ".NET" from matching "networking" while allowing "data warehousing" variations
            """
            if not skill:
                return True  # No mandatory skill, allow all
            skill_lower = skill.lower().strip()
            profile_skills = profile.get("skills", [])
            profile_domains = profile.get("skill_domains", [])
            
            # Normalize skill for comparison (handle multi-word variations)
            def normalize_for_comparison(s):
                """Normalize skill string for flexible matching"""
                if not isinstance(s, str):
                    return ""
                normalized = s.lower().strip()
                # Handle common variations - remove spaces, hyphens, underscores
                normalized = normalized.replace(" ", "")
                normalized = normalized.replace("-", "")
                normalized = normalized.replace("_", "")
                return normalized
            
            skill_normalized = normalize_for_comparison(skill)
            
            # Check skills array with flexible matching
            for s in profile_skills:
                if isinstance(s, str):
                    s_normalized = normalize_for_comparison(s)
                    # Exact match or contains the skill (for multi-word like "data warehousing")
                    if s_normalized == skill_normalized:
                        return True
                    
                    # Substring matching: Check if skill is contained in profile skill (e.g., "cloud" in "cloudcomputing")
                    # OR if profile skill contains the skill (e.g., "cloud computing" contains "cloud")
                    if len(skill_normalized) >= 3:  # Allow for shorter skills like "aws", "cloud"
                        # Case 1: Short search skill in longer profile skill (e.g., "cloud" in "cloudcomputing")
                        if len(s_normalized) > len(skill_normalized) and skill_normalized in s_normalized:
                            # Make sure it's a meaningful match at word boundary
                            if s_normalized.startswith(skill_normalized) or f" {skill_normalized}" in f" {s_normalized}":
                                return True
                        # Case 2: Longer profile skill contains shorter search skill, or vice versa
                        elif len(skill_normalized) >= 5 and len(s_normalized) >= 5:
                            if skill_normalized in s_normalized or s_normalized in skill_normalized:
                                return True
                    
                    # Also check original case-insensitive match
                    if s.lower().strip() == skill_lower:
                        return True
            
            # Check skill_domains array with flexible matching
            for d in profile_domains:
                if isinstance(d, str):
                    d_normalized = normalize_for_comparison(d)
                    if d_normalized == skill_normalized:
                        return True
                    
                    # Substring matching: Check if skill is contained in domain (e.g., "cloud" in "Cloud Computing")
                    if len(skill_normalized) >= 3:
                        # Case 1: Short search skill in longer domain
                        if len(d_normalized) > len(skill_normalized) and skill_normalized in d_normalized:
                            if d_normalized.startswith(skill_normalized) or f" {skill_normalized}" in f" {d_normalized}":
                                return True
                        # Case 2: Longer domain contains shorter skill, or vice versa
                        elif len(skill_normalized) >= 5 and len(d_normalized) >= 5:
                            if skill_normalized in d_normalized or d_normalized in skill_normalized:
                                return True
                    
                    if d.lower().strip() == skill_lower:
                        return True
            
            return False
        
        # Process vector search results - results are already scored and sorted by FAISS
        # Score already includes: base_score + overlap_bonus + mandatory_bonus + experience_boost
        mandatory_skill_clean = mandatory_skill.strip().lower() if mandatory_skill else None
        
        for result in results:
            result_id = result.get("id")
            if not result_id:
                continue
            
            # Score is already calculated in perform_faiss_search with all bonuses
            # Convert numpy float32 to Python float for JSON serialization
            score = float(result.get("score", 0))
            # Score is already in 0-100 range, use round() instead of int() to preserve accuracy
            match_percentage = min(100, max(0, round(score)))
            
            if result_id in profiles_dict:
                profile = profiles_dict[result_id]
                
                # Final verification - lenient check (profiles already passed pre-filtering and vector search)
                # Only exclude clearly wrong profiles, trust the vector search scores
                if mandatory_skill_clean:
                    from services.vector_store import get_query_domain
                    query_domain = get_query_domain(query)
                    
                    profile_skills = [str(s).lower() for s in profile.get("skills", [])]
                    profile_domains = [str(d).lower() for d in profile.get("skill_domains", [])]
                    all_profile_terms = set(profile_skills + profile_domains)
                    
                    # Only exclude if it's clearly a wrong domain match (e.g., Java for data engineer)
                    if query_domain in ["data engineer", "data engineering"]:
                        java_indicators = ["java", "j2ee", "jee", "spring", "hibernate", "jpa", "jsp", "servlet", "struts"]
                        java_count = sum(1 for term in all_profile_terms if any(ji in term for ji in java_indicators))
                        
                        # Only exclude if it's heavily Java-focused (5+ indicators) AND has no data engineering skills
                        if java_count >= 5:
                            # Use semantic check for data engineering skills
                            data_eng_keywords = ["etl", "spark", "hadoop", "airflow", "snowflake", "data pipeline", "big data", "pyspark", "data engineer", "data engineering"]
                            has_data_eng = any(keyword in term for keyword in data_eng_keywords for term in all_profile_terms)
                            if not has_data_eng:
                                logging.debug(f"🚫 FILTERED OUT profile '{profile.get('name')}': heavily Java-focused without data engineering skills")
                                continue
                    
                    # For other cases, trust the vector search score
                    # If profile has a good score, it's likely relevant
                
                # Score is already boosted in FAISS search, no need to add more boosts
                boosted_score = float(score)  # Ensure Python float for JSON serialization
                boosted_match_percentage = match_percentage
                
                # Convert experience_years to Python float if it's a numpy type
                experience_years = profile.get("experience_years")
                if experience_years is not None:
                    experience_years = float(experience_years)
                
                match_data = {
                    "name": profile.get("name", ""),
                    "email": profile.get("email", ""),
                    "profile_id": profile.get("profile_id", result_id),
                    "phone": profile.get("phone", ""),
                    "location": profile.get("location", ""),
                    "skills": profile.get("skills", []),
                    "skill_domains": profile.get("skill_domains", []),
                    "experience_years": experience_years,
                    "education": profile.get("education"),
                    "certifications": profile.get("certifications", []),
                    "companies": profile.get("companies", []),
                    "current_company": profile.get("current_company", ""),
                    "clients": profile.get("clients", []),
                    "score": round(boosted_score, 3),
                    "match_percentage": boosted_match_percentage,
                    "raw_text": profile.get("raw_text", "")
                }
                all_matches.append(match_data)
        
        # Handle location-only search
        if not query and location:
            for profile_id, profile in profiles_dict.items():
                # Convert experience_years to Python float if it's a numpy type
                experience_years = profile.get("experience_years")
                if experience_years is not None:
                    experience_years = float(experience_years)
                
                match_data = {
                    "name": profile.get("name", ""),
                    "email": profile.get("email", ""),
                    "profile_id": profile.get("profile_id", ""),
                    "phone": profile.get("phone", ""),
                    "location": profile.get("location", ""),
                    "skills": profile.get("skills", []),
                    "skill_domains": profile.get("skill_domains", []),
                    "experience_years": experience_years,
                    "education": profile.get("education"),
                    "certifications": profile.get("certifications", []),
                    "companies": profile.get("companies", []),
                    "current_company": profile.get("current_company", ""),
                    "clients": profile.get("clients", []),
                    "score": 1.0,
                    "match_percentage": 100,
                    "raw_text": profile.get("raw_text", "")
                }
                all_matches.append(match_data)
        
        # CRITICAL: Sort ALL matches by match percentage first (highest first), then by experience
        # Primary sort: match percentage (highest first)
        # Secondary sort: experience years (highest first)
        # Convert to Python float to handle numpy float32 types
        all_matches.sort(key=lambda x: (
            float(x.get("match_percentage", 0) or 0),  # Primary: match percentage (highest first)
            float(x.get("experience_years", 0) or 0)  # Secondary: experience years (highest first)
        ), reverse=True)
        
        # Separate perfect matches (100%) for immediate streaming, but keep them sorted
        perfect_matches = [m for m in all_matches if m.get("match_percentage", 0) >= 100]
        other_matches = [m for m in all_matches if m.get("match_percentage", 0) < 100]
        
        # Ensure perfect matches are also sorted by match percentage first, then experience
        # Convert to Python float to handle numpy float32 types
        perfect_matches.sort(key=lambda x: (
            float(x.get("match_percentage", 0) or 0),  # Primary: match percentage
            float(x.get("experience_years", 0) or 0)  # Secondary: experience years
        ), reverse=True)
        
        # Stream 100% matches immediately (already sorted by score)
        # Convert numpy types to Python types for JSON serialization
        if perfect_matches:
            yield json.dumps({
                "type": "matches",
                "matches": convert_to_python_types(perfect_matches),
                "is_perfect": True
            }) + "\n"
        
        # Stream other matches progressively (already sorted by score, highest first)
        for match in other_matches:
            yield json.dumps({
                "type": "match",
                "match": convert_to_python_types(match),
                "is_perfect": False
            }) + "\n"
            await asyncio.sleep(0.01)  # Small delay for progressive rendering
        
        # Send completion with ALL matches sorted by score (highest first)
        elapsed_ms = (time.time() - start_time) * 1000
        logging.info(f"⏱️ Admin search completed in {elapsed_ms:.0f}ms - {len(all_matches)} results")
        yield json.dumps({
            "type": "complete",
            "total_matches": len(all_matches),
            "matches": convert_to_python_types(all_matches),  # Already sorted by score, highest first
            "search_time_ms": round(elapsed_ms, 2)
        }) + "\n"
        
    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ Streaming search error: {error_msg}")
        yield json.dumps({
            "type": "error",
            "error": error_msg
        }) + "\n"

@app.post("/admin/search_by_text")
async def search_by_text(request: TextSearchRequest, http_request: Request, user=Depends(get_admin_user)):
    """
    Optimized search endpoint with streaming support
    Returns streaming results for progressive display, especially 100% matches
    """
    try:
        query = request.query.strip() if request.query else ""
        location = request.location.strip() if request.location else ""
        top_k = max(1, min(getattr(request, "top_k", 10) or 10, 50))
        skill_domain = (getattr(request, "skill_domain", None) or "").strip() or None
        
        # Log the search activity
        asyncio.create_task(log_activity(
            action_type="search",
            user_email=user.get("email", "unknown"),
            user_role=user.get("role", "admin"),
            details={"query": query[:100], "location": location, "skill_domain": skill_domain, "top_k": top_k, "search_type": "text"},
            ip_address=get_client_ip(http_request),
            user_agent=http_request.headers.get("User-Agent", None)
        ))
        
        # If both query and location are empty, return empty results
        if not query and not location and not skill_domain:
            return {"total_matches": 0, "matches": []}
        
        # Return streaming response
        return StreamingResponse(
            stream_search_results(query, location, top_k=top_k, skill_domain=skill_domain),
            media_type="application/x-ndjson"
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ Search error: {error_msg}")
        import traceback
        traceback.print_exc()
        
        if "api_key" in error_msg.lower() or "401" in error_msg or "invalid" in error_msg.lower():
            status_code = 401
            detail = f"Search error: {error_msg}"
        else:
            status_code = 500
            detail = f"Search error: {error_msg}"
        
        raise HTTPException(status_code=status_code, detail=detail)

@app.get("/admin/trainers_list")
async def get_all_trainers(user=Depends(get_admin_user)):
    
    try:
        try:
            await trainer_profiles.database.client.admin.command('ping')
        except Exception as conn_err:
            error_msg = str(conn_err)
            logging.error(f"❌ MongoDB connection test failed: {error_msg}")
            
            if "SSL" in error_msg or "TLS" in error_msg or "handshake" in error_msg:
                raise HTTPException(
                    status_code=503,
                    detail=f"MongoDB connection failed (SSL/TLS error). Please check: 1) IP whitelist in MongoDB Atlas, 2) Network connectivity, 3) Connection string format. Error: {error_msg}"
                )
            else:
                raise HTTPException(
                    status_code=503,
                    detail=f"MongoDB connection failed: {error_msg}"
                )
        
        pipeline = [
            {
                "$project": {
                    "name": 1,
                    "email": 1,
                    "phone": 1,  # Include phone for editing
                    "location": 1,  # Include location for editing
                    "profile_id": 1,  # Include profile_id for trainers without email
                    "skills": 1,  # Include skills for editing
                    "experience_years": 1,
                    "skill_domains": {
                        "$ifNull": ["$skill_domains", []]
                    },
                    "updated_at": 1,
                    "uploaded_at": 1,
                    "sort_date": {
                        "$ifNull": [
                            {"$ifNull": ["$updated_at", "$uploaded_at"]},
                            datetime(1970, 1, 1)
                        ]
                    },
                    "is_available": 1,
                    "min_commercial": 1,
                    "max_commercial": 1
                }
            },
            {
                "$sort": {"sort_date": -1}
            }
        ]
        
        trainers = []
        async for trainer in trainer_profiles.aggregate(pipeline):
            trainers.append(trainer)
        
        logging.info(f"✅ Fetched {len(trainers)} trainers, sorted by most recent first")
        
        trainers_list = []
        for trainer in trainers:
            # Normalize skills
            skills = trainer.get("skills", [])
            
            # Normalize skills
            if isinstance(skills, str):
                skills = [s.strip() for s in skills.split(",") if s.strip()]
            elif isinstance(skills, dict):
                skills = [str(v).strip() for v in skills.values() if str(v).strip()]
            elif not isinstance(skills, list):
                skills = []
            
            # Final cleanup
            skills = [s for s in skills if isinstance(s, str) and s.strip()]
            
            skill_domains = trainer.get("skill_domains", [])
            if (not skill_domains) and skills:
                skill_domains = infer_skill_domains(skills)
            # Get name, default to empty string if None/null, but preserve actual values
            trainer_name = trainer.get("name")
            if trainer_name is None:
                trainer_name = ""
            
            trainers_list.append({
                "name": trainer_name,
                "email": trainer.get("email", ""),
                "phone": trainer.get("phone", ""),  # Include phone for editing
                "location": trainer.get("location", ""),  # Include location for editing
                "profile_id": trainer.get("profile_id", ""),  # Include profile_id for deletion support
                "skills": skills,  # Include normalized skills for editing
                "experience_years": trainer.get("experience_years"),
                "skill_domains": skill_domains,
                "is_available": trainer.get("is_available", False),
                "min_commercial": trainer.get("min_commercial"),
                "max_commercial": trainer.get("max_commercial")
            })
        
        logging.info(f"✅ Returning {len(trainers_list)} trainers (sorted by updated_at/uploaded_at descending)")
        
        return {
            "status": "success",
            "total": len(trainers_list),
            "trainers": trainers_list
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ Error fetching trainers: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error fetching trainers: {error_msg}")

@app.get("/admin/vector_integrity")
async def vector_integrity(user=Depends(get_admin_user)):
    """
    Report FAISS–Mongo vector integrity.
    """
    try:
        report = compute_vector_integrity()
        return report
    except Exception as e:
        logging.error(f"❌ Vector integrity check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Vector integrity check failed: {e}")

@app.post("/admin/repair_vectors")
async def repair_vectors_endpoint(user=Depends(get_admin_user)):
    """
    Admin endpoint to repair missing FAISS vectors.
    Performs controlled repair: stops after 5 consecutive existing vectors.
    """
    try:
        summary = repair_missing_vectors()
        return {
            "status": "success" if summary.get("success") else "error",
            **summary
        }
    except Exception as e:
        logging.error(f"❌ Repair vectors endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Repair failed: {str(e)}")

@app.post("/admin/clear_caches")
@app.get("/admin/clear_caches")  # Also allow GET for easy browser testing
async def clear_caches_endpoint(user=Depends(get_admin_user)):
    """Admin endpoint to clear all caches (embedding, expansion, skill extraction)
    
    Supports both POST and GET methods for flexibility.
    """
    try:
        result = clear_all_caches()
        return {
            "status": "success",
            "message": "All caches cleared successfully",
            **result
        }
    except Exception as e:
        logging.error(f"❌ Clear caches error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/vector_integrity/repair")
async def vector_integrity_repair(user=Depends(get_admin_user)):
    """
    Repair FAISS–Mongo vector integrity: remove orphans, embed missing, save index.
    """
    try:
        summary = repair_vector_index()
        return summary
    except Exception as e:
        logging.error(f"❌ Vector integrity repair failed: {e}")
        raise HTTPException(status_code=500, detail=f"Vector integrity repair failed: {e}")

# In-memory cache for domain expansion (fast responses)
_domain_expansion_cache: Dict[str, Dict[str, Any]] = {}
_domain_expansion_cache_ttl = 3600  # 1 hour TTL

@app.get("/admin/skill_domains")
async def get_skill_domains(user=Depends(get_admin_user)):
    """Get available skill domains from CATEGORY_KEYWORDS in skill_domains.py"""
    from services.skill_domains import CATEGORY_KEYWORDS
    return {
        "status": "success",
        "domains": list(CATEGORY_KEYWORDS.keys())
    }

@app.post("/admin/expand_domain")
async def expand_domain(request: Request, user=Depends(get_admin_user)):
    """
    Expand a domain keyword using OpenAI to find related skills/technologies.
    Uses caching for fast responses.
    """
    import time
    from services.parse_service import client as openai_client
    
    try:
        body = await request.json()
        domain = body.get("domain", "").strip().lower()
        
        if not domain:
            raise HTTPException(status_code=400, detail="Domain is required")
        
        # Check cache first (fast path)
        cache_key = domain
        if cache_key in _domain_expansion_cache:
            cached = _domain_expansion_cache[cache_key]
            if time.time() - cached.get("timestamp", 0) < _domain_expansion_cache_ttl:
                logging.info(f"✅ Domain expansion cache hit for: {domain}")
                return {
                    "status": "success",
                    "domain": domain,
                    "keywords": cached["keywords"],
                    "cached": True
                }
        
        # First, check if it matches a known domain from CATEGORY_KEYWORDS
        from services.skill_domains import CATEGORY_KEYWORDS
        
        # Check for exact match or partial match in known domains
        for known_domain, keywords in CATEGORY_KEYWORDS.items():
            if known_domain.lower() == domain or domain in known_domain.lower():
                # Use predefined keywords as base
                expanded_keywords = list(keywords)
                _domain_expansion_cache[cache_key] = {
                    "keywords": expanded_keywords,
                    "timestamp": time.time()
                }
                logging.info(f"✅ Domain expansion from predefined for: {domain} -> {len(expanded_keywords)} keywords")
                return {
                    "status": "success",
                    "domain": domain,
                    "keywords": expanded_keywords,
                    "cached": False
                }
        
        # If not found in predefined, use OpenAI to expand
        try:
            prompt = f"""Given the technology/skill domain "{domain}", list the most relevant and related technologies, tools, certifications, and keywords that a trainer in this domain would typically know.

Return ONLY a JSON array of lowercase strings (10-20 keywords), nothing else.
Example for "cloud": ["aws", "azure", "gcp", "ec2", "s3", "lambda", "kubernetes", "docker", "terraform"]

Domain: {domain}
"""
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=300
            )
            
            content = response.choices[0].message.content.strip()
            
            # Parse JSON array
            import json
            import re
            
            # Clean up response
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r"```(?:json)?\s*", "", content)
                content = re.sub(r"```$", "", content)
            
            keywords = json.loads(content)
            
            if not isinstance(keywords, list):
                keywords = [domain]
            
            # Always include the original domain
            if domain not in [k.lower() for k in keywords]:
                keywords.insert(0, domain)
            
            # Cache the result
            _domain_expansion_cache[cache_key] = {
                "keywords": keywords,
                "timestamp": time.time()
            }
            
            logging.info(f"✅ Domain expansion via OpenAI for: {domain} -> {len(keywords)} keywords")
            
            return {
                "status": "success",
                "domain": domain,
                "keywords": keywords,
                "cached": False
            }
            
        except Exception as openai_error:
            logging.warning(f"OpenAI expansion failed for {domain}: {openai_error}")
            # Fallback: return just the original domain
            return {
                "status": "success",
                "domain": domain,
                "keywords": [domain],
                "cached": False,
                "fallback": True
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Domain expansion error: {e}")
        raise HTTPException(status_code=500, detail=f"Domain expansion failed: {str(e)}")

@app.put("/admin/trainers/{identifier}")
async def update_trainer_by_admin(identifier: str, update_data: TrainerProfileUpdate, request: Request, user=Depends(get_admin_user)):
    """
    Admin endpoint to update trainer profile by email or profile_id
    Allows updating email, phone, skills, and other fields
    """
    try:
        # Try to find trainer by email first, then by profile_id
        trainer = await trainer_profiles.find_one({"email": identifier})
        if not trainer:
            trainer = await trainer_profiles.find_one({"profile_id": identifier})
        
        if not trainer:
            raise HTTPException(status_code=404, detail="Trainer not found")
        
        trainer_email = trainer.get("email", "")
        trainer_profile_id = trainer.get("profile_id", "")
        
        # Build update document - only include fields that are provided
        update_doc = {"updated_at": datetime.utcnow()}
        
        # Allow updating email (admin privilege)
        if update_data.name is not None:
            update_doc["name"] = update_data.name.strip() if update_data.name else ""
        if hasattr(update_data, 'email') and update_data.email is not None:
            # Validate email format
            if update_data.email and "@" in update_data.email:
                update_doc["email"] = update_data.email.strip()
        if update_data.phone is not None:
            update_doc["phone"] = update_data.phone.strip() if update_data.phone else ""
        if update_data.location is not None:
            update_doc["location"] = update_data.location.strip() if update_data.location else ""
        if update_data.skills is not None:
            update_doc["skills"] = [s.strip() for s in update_data.skills if s.strip()] if update_data.skills else []
        if update_data.experience_years is not None:
            update_doc["experience_years"] = update_data.experience_years
        if update_data.education is not None:
            update_doc["education"] = update_data.education
        if update_data.certifications is not None:
            update_doc["certifications"] = [c.strip() for c in update_data.certifications if c.strip()] if update_data.certifications else []
        if update_data.current_company is not None:
            update_doc["current_company"] = update_data.current_company.strip() if update_data.current_company else ""
        if update_data.companies is not None:
            update_doc["companies"] = [c.strip() for c in update_data.companies if c.strip()] if update_data.companies else []
        if update_data.clients is not None:
            update_doc["clients"] = [c.strip() for c in update_data.clients if c.strip()] if update_data.clients else []
        if update_data.is_available is not None:
            update_doc["is_available"] = update_data.is_available
        if update_data.min_commercial is not None:
            update_doc["min_commercial"] = update_data.min_commercial
        if update_data.max_commercial is not None:
            update_doc["max_commercial"] = update_data.max_commercial    



        # Update skill domains if skills were updated
        if "skills" in update_doc:
            from services.skill_domains import infer_skill_domains
            raw_text = trainer.get("raw_text", "")
            update_doc["skill_domains"] = infer_skill_domains(update_doc["skills"], raw_text)
        
        # Update the profile (use email if available, otherwise profile_id)
        if trainer_email:
            await trainer_profiles.update_one(
                {"email": trainer_email},
                {"$set": update_doc}
            )
        else:
            await trainer_profiles.update_one(
                {"profile_id": trainer_profile_id},
                {"$set": update_doc}
            )
        
        # Update vector store metadata if relevant fields changed
        # Note: For major changes like skills, a full re-embedding would be ideal, but for now we update metadata
        if "skills" in update_doc or "experience_years" in update_doc or "location" in update_doc:
            try:
                import services.vector_store as vs
                vector_id = trainer_email or trainer_profile_id
                if vector_id:
                    # Find and update metadata in vector_store
                    for idx, stored in vs.vector_store.items():
                        if stored.get("id") == vector_id:
                            if "metadata" not in stored:
                                stored["metadata"] = {}
                            if "skills" in update_doc:
                                stored["metadata"]["skills"] = update_doc["skills"]
                            if "experience_years" in update_doc:
                                stored["metadata"]["experience_years"] = update_doc["experience_years"]
                            if "location" in update_doc:
                                stored["metadata"]["location"] = update_doc["location"]
                            # Save the updated vector store
                            vs.save_faiss_index()
                            break
            except Exception as e:
                logging.warning(f"Vector store metadata update failed: {e}")
        
        # Log the update activity
        updated_fields = [key for key in update_doc.keys() if key not in ["updated_at", "skill_domains"]]
        asyncio.create_task(log_activity(
            action_type="update",
            user_email=user["email"],
            user_role="admin",
            details={"identifier": identifier, "updated_fields": updated_fields, "trainer_name": trainer.get("name", "")},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent", None)
        ))
        
        # Return updated profile
        updated_trainer = await trainer_profiles.find_one(
            {"email": trainer_email} if trainer_email else {"profile_id": trainer_profile_id}
        )
        
        return {
            "status": "success",
            "message": "Trainer profile updated successfully",
            "profile": {
                "name": updated_trainer.get("name"),
                "email": updated_trainer.get("email"),
                "phone": updated_trainer.get("phone", ""),
                "location": updated_trainer.get("location", ""),
                "skills": updated_trainer.get("skills", []),
                "skill_domains": updated_trainer.get("skill_domains", []),
                "experience_years": updated_trainer.get("experience_years"),
                "education": updated_trainer.get("education"),
                "certifications": updated_trainer.get("certifications", []),
                "current_company": updated_trainer.get("current_company", ""),
                "companies": updated_trainer.get("companies", []),
                "clients": updated_trainer.get("clients", []),
                "profile_id": updated_trainer.get("profile_id", "")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update trainer profile by admin: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update trainer profile: {str(e)}")

@app.delete("/admin/trainers/{identifier}")
async def delete_trainer_by_admin(identifier: str, request: Request, user=Depends(get_admin_user)):
    """
    Delete trainer by email or profile_id
    Supports deletion of trainers with partial details (no email) using profile_id
    """
    try:
        # Try to find trainer by email first, then by profile_id
        trainer = await trainer_profiles.find_one({"email": identifier})
        if not trainer:
            trainer = await trainer_profiles.find_one({"profile_id": identifier})
        
        if not trainer:
            raise HTTPException(status_code=404, detail="Trainer not found")
        
        # Get identifier for vector deletion (prefer email, fallback to profile_id)
        vector_id = trainer.get("email") or trainer.get("profile_id")
        trainer_email = trainer.get("email", "")
        trainer_name = trainer.get("name", "")
        trainer_profile_id = trainer.get("profile_id", "")
        
        # Delete from database (use email if available, otherwise profile_id)
        if trainer_email:
            result = await trainer_profiles.delete_one({"email": trainer_email})
        else:
            result = await trainer_profiles.delete_one({"profile_id": trainer_profile_id})

        # Delete from vector store
        if vector_id:
            try:
                from services.vector_store import delete_vector
                delete_vector(vector_id)
            except Exception as e:
                logging.warning(f"Vector mapping removal failed for {vector_id}: {e}")

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Trainer not found")

        # Log the delete activity
        asyncio.create_task(log_activity(
            action_type="delete",
            user_email=user["email"],
            user_role="admin",
            details={"identifier": identifier, "trainer_name": trainer_name},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent", None)
        ))

        display_name = trainer_name or trainer_email or trainer_profile_id or identifier
        return {
            "status": "success",
            "deleted": True,
            "message": f"Trainer {display_name} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting trainer: {str(e)}")

@app.get("/trainer/profile")
async def get_trainer_profile(user=Depends(get_trainer_user)):
    
    profile = await trainer_profiles.find_one({"email": user["email"]})
    if profile:
        return {
            "name": profile.get("name"),
            "email": profile.get("email"),
            "phone": profile.get("phone", ""),
            "skills": profile.get("skills", []),
            "experience_years": profile.get("experience_years"),
            "education": profile.get("education"),
            "certifications": profile.get("certifications", []),
            "current_company": profile.get("current_company", ""),
            "companies": profile.get("companies", []),
            "clients": profile.get("clients", []),
            "location": profile.get("location", ""),
            "is_available": profile.get("is_available", False),
            "min_commercial": profile.get("min_commercial"),
            "max_commercial": profile.get("max_commercial")
        }
    else:
        return {
            "name": "",
            "email": user["email"],
            "phone": "",
            "skills": [],
            "experience_years": None,
            "education": None,
            "certifications": [],
            "current_company": "",
            "companies": [],
            "clients": [],
            "location": ""
        }

@app.put("/trainer/profile")
async def update_trainer_profile(update_data: TrainerProfileUpdate, http_request: Request = None, user=Depends(get_trainer_user)):
    """Update trainer profile fields"""
    try:
        email = user.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Missing user email")
        
        # Check if profile exists
        existing_profile = await trainer_profiles.find_one({"email": email})
        if not existing_profile:
            raise HTTPException(status_code=404, detail="Profile not found. Please upload your resume first.")
        
        # Build update document - only include fields that are provided
        update_doc = {"updated_at": datetime.utcnow()}
        
        if update_data.name is not None:
            update_doc["name"] = update_data.name.strip() if update_data.name else ""
        if update_data.phone is not None:
            update_doc["phone"] = update_data.phone.strip() if update_data.phone else ""
        if update_data.location is not None:
            update_doc["location"] = update_data.location.strip() if update_data.location else ""
        if update_data.skills is not None:
            update_doc["skills"] = [s.strip() for s in update_data.skills if s.strip()] if update_data.skills else []
        if update_data.experience_years is not None:
            update_doc["experience_years"] = update_data.experience_years
        if update_data.education is not None:
            update_doc["education"] = update_data.education
        if update_data.certifications is not None:
            update_doc["certifications"] = [c.strip() for c in update_data.certifications if c.strip()] if update_data.certifications else []
        if update_data.current_company is not None:
            update_doc["current_company"] = update_data.current_company.strip() if update_data.current_company else ""
        if update_data.companies is not None:
            update_doc["companies"] = [c.strip() for c in update_data.companies if c.strip()] if update_data.companies else []
        if update_data.clients is not None:
            update_doc["clients"] = [c.strip() for c in update_data.clients if c.strip()] if update_data.clients else []
        if update_data.is_available is not None:
            update_doc["is_available"] = update_data.is_available
        if update_data.min_commercial is not None:
            update_doc["min_commercial"] = update_data.min_commercial
        if update_data.max_commercial is not None:
            update_doc["max_commercial"] = update_data.max_commercial


        # Update skill domains if skills were updated
        if "skills" in update_doc:
            from services.skill_domains import infer_skill_domains
            raw_text = existing_profile.get("raw_text", "")
            update_doc["skill_domains"] = infer_skill_domains(update_doc["skills"], raw_text)
        
        # Update the profile
        await trainer_profiles.update_one(
            {"email": email},
            {"$set": update_doc}
        )
        
        # Update vector store if relevant fields changed
        if any(key in update_doc for key in ["name", "skills", "experience_years", "education", "certifications", "companies", "current_company", "clients", "location"]):
            try:
                from services.vector_store import upsert_vector
                updated_profile = await trainer_profiles.find_one({"email": email})
                if updated_profile and updated_profile.get("raw_text"):
                    metadata = {
                        "name": updated_profile.get("name", ""),
                        "email": email,
                        "phone": updated_profile.get("phone", ""),
                        "location": updated_profile.get("location", ""),
                        "skills": updated_profile.get("skills", []),
                        "experience_years": updated_profile.get("experience_years"),
                        "education": updated_profile.get("education"),
                        "certifications": updated_profile.get("certifications", []),
                        "companies": updated_profile.get("companies", []),
                        "current_company": updated_profile.get("current_company", ""),
                        "clients": updated_profile.get("clients", [])
                    }
                    upsert_vector(email, updated_profile.get("raw_text", ""), metadata)
            except Exception as e:
                logging.warning(f"Vector store update failed for {email}: {e}")
        
        # Log the trainer profile update activity
        if http_request:
            updated_fields = [key for key in update_doc.keys() if key != "updated_at" and key != "skill_domains"]
            asyncio.create_task(log_activity(
                action_type="update",
                user_email=email,
                user_role="trainer",
                details={"updated_fields": updated_fields},
                ip_address=get_client_ip(http_request),
                user_agent=http_request.headers.get("User-Agent", None)
            ))
        
        # Return updated profile
        updated_profile = await trainer_profiles.find_one({"email": email})
        return {
            "status": "success",
            "profile": {
                "name": updated_profile.get("name"),
                "email": updated_profile.get("email"),
                "phone": updated_profile.get("phone", ""),
                "location": updated_profile.get("location", ""),
                "skills": updated_profile.get("skills", []),
                "experience_years": updated_profile.get("experience_years"),
                "education": updated_profile.get("education"),
                "certifications": updated_profile.get("certifications", []),
                "current_company": updated_profile.get("current_company", ""),
                "companies": updated_profile.get("companies", []),
                "clients": updated_profile.get("clients", [])
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update trainer profile: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")

@app.delete("/trainer/profile")
async def delete_trainer_profile(http_request: Request = None, user=Depends(get_trainer_user)):
    
    try:
        email = user.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Missing user email")

        result = await trainer_profiles.delete_one({"email": email})

        try:
            from services.vector_store import delete_vector
            delete_vector(email)
        except Exception as e:
            logging.warning(f"Vector mapping removal failed for {email}: {e}")

        # Log the trainer profile deletion activity
        if http_request:
            asyncio.create_task(log_activity(
                action_type="delete",
                user_email=email,
                user_role="trainer",
                details={"profile_deleted": True},
                ip_address=get_client_ip(http_request),
                user_agent=http_request.headers.get("User-Agent", None)
            ))

        if result.deleted_count == 0:
            return {"status": "success", "deleted": False, "message": "No profile found to delete"}

        return {"status": "success", "deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete profile: {str(e)}")

class TrainerUploadRequest(BaseModel):
    name: str
    email: str

@app.post("/trainer/upload_resume")
async def upload_resume(
    name: str = Form(...),
    email: str = Form(...),
    file: UploadFile = File(...),
    http_request: Request = None,
    user=Depends(get_trainer_user)
):
    
    try:
        if email != user["email"]:
            raise HTTPException(status_code=403, detail="Email does not match logged-in trainer")
        
        from services.extract_text import extract_text_from_bytes
        from services.parse_service import parse_resume_text_sync
        from services.vector_store import upsert_vector, clear_embedding_cache
        
        file_bytes = await file.read()
        text = extract_text_from_bytes(file.filename, file_bytes)
        
        if not text or not text.strip():
            raise HTTPException(
                status_code=400, 
                detail="Could not extract text from resume file. Please ensure the file is a valid PDF, DOC, or image format. If using an image, make sure it's clear and readable."
            )
        
        parsed = parse_resume_text_sync(text)
        if not parsed.get("email"):
            fallback_email = extract_email_fallback(text)
            if fallback_email:
                logging.warning(f"📧 Trainer upload email extracted via fallback regex: {fallback_email}")
                parsed["email"] = fallback_email
        
        if not name or not name.strip():
            raise HTTPException(
                status_code=400,
                detail="Name is required. Please enter your name in the form."
            )
        
        if not email or not email.strip():
            raise HTTPException(
                status_code=400,
                detail="Email is required. Please enter your email in the form."
            )
        
        if len(text.strip()) < 50:
            logging.warning(f"⚠️ Uploaded resume for {email} contains very short text ({len(text.strip())} chars) but will be processed.")
        
        final_name = name.strip()
        final_email = email.strip()
        
        resume_file_bytes = file_bytes
        resume_filename = file.filename
        
        if file.filename and file.filename.lower().endswith(('.doc', '.docx')):
            from services.extract_text import convert_doc_to_pdf
            import tempfile
            from pathlib import Path
            
            suffix = '.doc' if file.filename.lower().endswith('.doc') else '.docx'
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(file_bytes)
                temp_doc_path = temp_file.name
            
            try:
                pdf_path = convert_doc_to_pdf(temp_doc_path)
                if pdf_path and os.path.exists(pdf_path):
                    with open(pdf_path, "rb") as pdf_f:
                        resume_file_bytes = pdf_f.read()
                    resume_filename = Path(file.filename).stem + ".pdf"
                    try:
                        os.remove(pdf_path)
                        pdf_dir = Path(pdf_path).parent
                        if pdf_dir.exists():
                            try:
                                os.rmdir(pdf_dir)
                            except:
                                pass
                    except:
                        pass
            except Exception as conv_err:
                print(f"⚠️ Conversion error, storing original file: {conv_err}")
            finally:
                try:
                    if os.path.exists(temp_doc_path):
                        os.unlink(temp_doc_path)
                except:
                    pass
        
        from bson import Binary
        
        profile_data = {
            "email": final_email,
            "name": final_name,
            "phone": parsed.get("phone", ""),
            "location": parsed.get("location", ""),
            "skills": parsed.get("skills", []),
            "skill_domains": infer_skill_domains(parsed.get("skills", []), text),
            "experience_years": parsed.get("experience_years"),
            "education": parsed.get("education"),
            "certifications": parsed.get("certifications", []),
            "companies": parsed.get("companies", []),
            "current_company": parsed.get("current_company", ""),
            "clients": parsed.get("clients", []),
            "raw_text": text,
            "resume_file": Binary(resume_file_bytes),
            "resume_filename": resume_filename,
            "updated_at": datetime.utcnow()
        }
        
        existing_profile = await trainer_profiles.find_one({"email": email})
        
        if existing_profile:
            profile_data["uploaded_at"] = existing_profile.get("uploaded_at", datetime.utcnow())
            await trainer_profiles.update_one(
                {"email": email},
                {"$set": profile_data}
            )
            print(f"🔄 Updated existing profile for email: {email}")
        else:
            profile_data["uploaded_at"] = datetime.utcnow()
            profile_data["created_at"] = datetime.utcnow()
            await trainer_profiles.insert_one(profile_data)
            print(f"➕ Created new profile for email: {email}")
        
        upsert_vector(
            email,
            text,
            {
                "email": email, 
                "name": profile_data["name"],
                "skills": profile_data.get("skills", []),
                "skill_domains": profile_data.get("skill_domains", [])
            }
        )
        
        # Clear embedding cache after upload to ensure new resume can be found in searches
        clear_embedding_cache()
        
        # Log the trainer upload activity
        if http_request:
            asyncio.create_task(log_activity(
                action_type="upload",
                user_email=email,
                user_role="trainer",
                details={"file_name": file.filename, "resume_uploaded": True, "name": final_name},
                ip_address=get_client_ip(http_request),
                user_agent=http_request.headers.get("User-Agent", None)
            ))
        
        return {
            "status": "success",
            "message": "Resume uploaded and processed successfully",
            "profile": {
                "name": profile_data["name"],
                "email": profile_data["email"],
                "skills": profile_data["skills"],
                "experience_years": profile_data["experience_years"],
                "education": profile_data["education"],
                "certifications": profile_data["certifications"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing resume: {str(e)}")

@app.get("/admin/trainer/{trainer_email}/download_pdf")
async def download_trainer_pdf(trainer_email: str, user=Depends(get_admin_user)):
    """Download the original resume file (PDF or converted PDF from DOC/DOCX) by email"""
    try:
        profile = await trainer_profiles.find_one({"email": trainer_email})
        if not profile:
            raise HTTPException(status_code=404, detail="Trainer not found")
        
        resume_file = profile.get("resume_file")
        if not resume_file:
            raise HTTPException(status_code=404, detail="Resume file not found in database")
        
        trainer_name = profile.get("name", "resume")
        resume_filename = f"{trainer_name.replace(' ', '_')}.pdf"
        
        from fastapi.responses import Response
        from bson import Binary
        
        if isinstance(resume_file, Binary):
            file_bytes = bytes(resume_file)
        elif isinstance(resume_file, bytes):
            file_bytes = resume_file
        else:
            file_bytes = bytes(resume_file)
        
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{resume_filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error downloading resume: {str(e)}")

@app.get("/admin/trainer/profile/{profile_id}/download_pdf")
async def download_trainer_pdf_by_profile_id(profile_id: str, user=Depends(get_admin_user)):
    """Download the original resume file (PDF or converted PDF from DOC/DOCX) by profile_id"""
    try:
        profile = await trainer_profiles.find_one({"profile_id": profile_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Trainer not found")
        
        resume_file = profile.get("resume_file")
        if not resume_file:
            raise HTTPException(status_code=404, detail="Resume file not found in database")
        
        trainer_name = profile.get("name", "resume")
        resume_filename = f"{trainer_name.replace(' ', '_')}.pdf"
        
        from fastapi.responses import Response
        from bson import Binary
        
        if isinstance(resume_file, Binary):
            file_bytes = bytes(resume_file)
        elif isinstance(resume_file, bytes):
            file_bytes = resume_file
        else:
            file_bytes = bytes(resume_file)
        
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{resume_filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error downloading resume: {str(e)}")

@app.post("/admin/export_trainers_to_excel")
async def export_trainers_to_excel(request: dict, user=Depends(get_admin_user)):
    """Export selected trainers to Excel file"""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment
        from io import BytesIO
        
        trainer_emails = request.get("trainer_emails", []) or []
        trainer_profile_ids = request.get("trainer_profile_ids", []) or []
        
        if not trainer_emails and not trainer_profile_ids:
            raise HTTPException(status_code=400, detail="No trainers selected")
        
        profiles = []
        # Query by email if provided
        if trainer_emails:
            async for profile in trainer_profiles.find({"email": {"$in": trainer_emails}}):
                profiles.append(profile)
        
        # Query by profile_id if provided (and not already found by email)
        if trainer_profile_ids:
            found_profile_ids = {profile.get("profile_id") for profile in profiles}
            missing_profile_ids = [pid for pid in trainer_profile_ids if pid not in found_profile_ids]
            if missing_profile_ids:
                async for profile in trainer_profiles.find({"profile_id": {"$in": missing_profile_ids}}):
                    profiles.append(profile)
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Trainers"
        
        headers = ["Name", "Email", "Phone", "Experience (Years)", "Skills", "Education", "Certifications", "Current Company", "Companies Worked", "Clients"]
        ws.append(headers)
        
        header_font = Font(bold=True)
        for cell in ws[1]:
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')
        
        for profile in profiles:
            name = profile.get("name", "N/A")
            email = profile.get("email", "N/A")
            phone = profile.get("phone", "")
            experience = profile.get("experience_years", "")
            skills = ", ".join(profile.get("skills", [])) if profile.get("skills") else ""
            education = ""
            if profile.get("education"):
                edu = profile.get("education")
                if isinstance(edu, str):
                    education = edu
                elif isinstance(edu, list):
                    edu_parts = []
                    for e in edu:
                        if isinstance(e, str):
                            edu_parts.append(e)
                        elif isinstance(e, dict):
                            edu_text = f"{e.get('degree', '')} from {e.get('institution', '')}"
                            if e.get('year'):
                                edu_text += f" ({e.get('year')})"
                            edu_parts.append(edu_text)
                    education = "; ".join(edu_parts)
            certifications = ", ".join(profile.get("certifications", [])) if profile.get("certifications") else ""
            current_company = profile.get("current_company", "")
            companies = ", ".join(profile.get("companies", [])) if profile.get("companies") else ""
            clients = ", ".join(profile.get("clients", [])) if profile.get("clients") else ""
            
            ws.append([name, email, phone, experience, skills, education, certifications, current_company, companies, clients])
        
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            ws.column_dimensions[column_letter].width = adjusted_width
        
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        from fastapi.responses import Response
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="trainers_export.xlsx"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")

# ==================== CUSTOMER ENDPOINTS ====================

def filter_sensitive_data(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Remove email and phone from trainer profile for customer view"""
    filtered = profile.copy()
    filtered.pop("email", None)
    filtered.pop("phone", None)
    return filtered

async def stream_customer_search_results(query: str, location: str, top_k: int = 10) -> AsyncGenerator[str, None]:
    """
    Optimized customer search with streaming - filters sensitive data (no email/phone)
    Uses same optimizations as admin search
    Enhanced with skill-based matching boost
    OPTIMIZED: Parallel queries, caching, reduced logging
    """
    import time
    start_time = time.time()
    try:
        # COMPLETE REWRITE: Hybrid Search Pipeline (Customer)
        # Phase 1: Extract & Expand Skills
        # Phase 2: MongoDB Pre-filtering (Mandatory Skill Required)
        # Phase 3: FAISS Semantic Ranking on Filtered Profiles
        # Phase 4: Enhanced Scoring with Skill Overlap + Mandatory Bonus
        
        mandatory_skill = None
        extracted_skills = []
        expanded_skills = []
        
        if query:
            # STEP 1: Extract skills from query
            extracted_skills = extract_skills_from_query(query)
            logging.debug(f"📋 STEP 1 - Extracted skills: {extracted_skills}")
            
            if not extracted_skills:
                # Fallback: use original query
                extracted_skills = [query.lower().strip()]
            
            # STEP 2: Expand skills (AI-based, validated against resumes)
            expanded_skills = expand_skills(extracted_skills, min_terms=10, max_terms=15)
            expanded_terms = expanded_skills  # For backward compatibility
            logging.debug(f"🧩 STEP 2 - Expanded skills ({len(expanded_skills)}): {expanded_skills[:10]}")
            
            # STEP 3: Identify mandatory skill (primary skill from query)
            # Prefer extracted multi-word skills over normalized keyword
            if extracted_skills:
                # Use the first extracted skill (prioritizes multi-word like "data engineer")
                mandatory_skill = extracted_skills[0].strip().lower()
            else:
                # Fallback: normalize the query
                normalized_keyword = normalize_keyword_to_single_word(query)
                if normalized_keyword:
                    mandatory_skill = normalized_keyword
                else:
                    mandatory_skill = query.lower().strip()
            
            logging.debug(f"🔒 STEP 3 - Mandatory skill: '{mandatory_skill}' (profiles MUST have this)")
        
        # STEP 4: MongoDB Pre-filtering - Filter by mandatory skill FIRST
        async def fetch_location_filter_customer():
            """Helper to fetch location filter"""
            if not location:
                return None
            
            location_query = {"location": {"$regex": location, "$options": "i"}}
            # Limit to reasonable number and use projection for faster queries
            location_cursor = trainer_profiles.find(
                location_query, 
                {"_id": 0, "profile_id": 1}
            ).limit(2000)  # Hint removed - index may not exist in all deployments
            location_profiles = await location_cursor.to_list(length=2000)
            location_filter_ids = set()
            for profile in location_profiles:
                pid = profile.get("profile_id")
                if pid:
                    location_filter_ids.add(pid)
            return location_filter_ids
        
        async def fetch_mandatory_skill_filter_customer():
            """Helper to fetch mandatory skill filter - Domain-aware and strict matching"""
            if not mandatory_skill:
                return None
            
            # Use domain-aware filtering from vector_store
            from services.vector_store import fetch_mandatory_skill_filter as fetch_mandatory_skill_filter_vector
            mandatory_skill_filter_ids = fetch_mandatory_skill_filter_vector(mandatory_skill, query=query)
            
            if mandatory_skill_filter_ids:
                logging.info(f"🔒 Mandatory skill filter (domain-aware): Found {len(mandatory_skill_filter_ids)} profiles with skill '{mandatory_skill}'")
            else:
                logging.warning(f"⚠️ No profiles found with mandatory skill '{mandatory_skill}' (domain-aware filter)")
            
            return mandatory_skill_filter_ids
        
        # STEP 5: Fetch mandatory skill filter (preference filter, not hard requirement)
        # This is used to BOOST profiles with the skill, but we still search the vector DB
        mandatory_skill_filter_ids = await fetch_mandatory_skill_filter_customer()
        
        logging.debug(f"🔒 STEP 5 - Found {len(mandatory_skill_filter_ids) if mandatory_skill_filter_ids else 0} profiles with exact skill '{mandatory_skill}' (used for boosting)")
        
        # STEP 6: Apply optional location filter
        location_filter_ids = await fetch_location_filter_customer()
        
        logging.debug(f"📍 Location filter: {len(location_filter_ids) if location_filter_ids else 0} profiles")
        
        # Combine filters: Use mandatory skill as preference, but don't block vector search
        # If we have mandatory skill matches, prefer them. Otherwise, search all profiles.
        combined_filter_ids = None
        
        # Build filter set: Start with mandatory skill if available, then apply location
        if mandatory_skill_filter_ids:
            combined_filter_ids = mandatory_skill_filter_ids.copy()
            
            # Apply location filter if provided
            if location_filter_ids:
                intersection = combined_filter_ids.intersection(location_filter_ids)
                if len(intersection) >= 10:  # Only use intersection if we have enough results
                    combined_filter_ids = intersection
                else:
                    # Too few results, use union to avoid over-filtering
                    combined_filter_ids = combined_filter_ids.union(location_filter_ids)
                    logging.debug(f"⚠️ Location filter too narrow ({len(intersection)} results), using union")
        elif location_filter_ids:
            # No mandatory skill matches, but we have location filter
            combined_filter_ids = location_filter_ids
        
        logging.debug(f"✅ STEP 6 - Final filter: {len(combined_filter_ids) if combined_filter_ids else 0} candidate profiles for vector search (None = search all)")
        
        # STEP 7: FAISS Semantic Ranking - ALWAYS run vector search, even if no MongoDB matches
        # The mandatory skill is used for BOOSTING in the vector search, not blocking
        if query and expanded_skills:
            # Use hybrid search: semantic ranking with expanded skills
            # Pass filter_ids if we have them (preference), but don't require them
            # The vector search will find semantically similar profiles even if MongoDB didn't find exact matches
            _, results = query_vector(
                text=query,
                top_k=max(50, top_k * 2),
                filter_ids=combined_filter_ids,  # Optional filter - None means search all
                mandatory_skill=mandatory_skill,  # Used for boosting, not blocking
                expanded_skills=expanded_skills
            )
            logging.debug(f"✅ STEP 7 - FAISS search returned {len(results)} results (searched {'filtered' if combined_filter_ids else 'all'} profiles)")
        else:
            # No query, just location filter
            results = []
            expanded_terms = []
        
        # Extract profile IDs from FAISS results (with error handling)
        matched_ids = []
        orphan_count = 0
        for result in results:
            result_id = result.get("id")
            if result_id:
                matched_ids.append(result_id)
            else:
                orphan_count += 1
                logging.warning(f"⚠️ FAISS result missing 'id' field: {result}")
        
        if orphan_count > 0:
            logging.warning(f"⚠️ Found {orphan_count} FAISS results without 'id' field")
        
        logging.info(f"📊 STEP 6 - FAISS returned {len(matched_ids)} valid profile IDs")
        
        if not matched_ids and not location:
            yield json.dumps({"type": "complete", "total_matches": 0, "matches": [], "expanded_terms": expanded_terms}) + "\n"
            return
        
        if matched_ids:
            # Note: location filtering is handled in stream_search_results, not here
            query_filter = {"profile_id": {"$in": matched_ids}}
        else:
            if location:
                query_filter = {"location": {"$regex": location, "$options": "i"}}
            else:
                query_filter = {}
        
        projection = {
            "_id": 0, "profile_id": 1, "name": 1, "location": 1, "skills": 1, 
            "skill_domains": 1, "experience_years": 1, "education": 1, 
            "certifications": 1, "companies": 1, "current_company": 1, "clients": 1, "raw_text": 1
        }
        
        profiles_cursor = trainer_profiles.find(query_filter, projection)
        profiles_dict = {}
        missing_profile_count = 0
        async for profile in profiles_cursor:
            profile_id = profile.get("profile_id")
            if profile_id:
                profiles_dict[profile_id] = profile
            else:
                missing_profile_count += 1
                logging.warning(f"⚠️ MongoDB profile missing 'profile_id': {profile.get('name', 'Unknown')}")
        
        if missing_profile_count > 0:
            logging.warning(f"⚠️ Found {missing_profile_count} MongoDB profiles without 'profile_id'")
        
        logging.info(f"📊 STEP 7 - Loaded {len(profiles_dict)} profiles from MongoDB")
        
        # Process ALL results and sort by match score (highest first)
        all_matches = []
        
        # Helper function to check if profile has exact skill match (Flexible matching for multi-word skills)
        def has_exact_skill_match(profile, skill):
            """Check if profile has the skill (case-insensitive, handles multi-word variations)
            Prevents ".NET" from matching "networking" while allowing "data warehousing" variations
            """
            if not skill:
                return True  # No mandatory skill, allow all
            skill_lower = skill.lower().strip()
            profile_skills = profile.get("skills", [])
            profile_domains = profile.get("skill_domains", [])
            
            # Normalize skill for comparison (handle multi-word variations)
            def normalize_for_comparison(s):
                """Normalize skill string for flexible matching"""
                if not isinstance(s, str):
                    return ""
                normalized = s.lower().strip()
                # Handle common variations - remove spaces, hyphens, underscores
                normalized = normalized.replace(" ", "")
                normalized = normalized.replace("-", "")
                normalized = normalized.replace("_", "")
                return normalized
            
            skill_normalized = normalize_for_comparison(skill)
            
            # Check skills array with flexible matching
            for s in profile_skills:
                if isinstance(s, str):
                    s_normalized = normalize_for_comparison(s)
                    # Exact match or contains the skill (for multi-word like "data warehousing")
                    if s_normalized == skill_normalized:
                        return True
                    # For multi-word skills (5+ chars), check if normalized versions match
                    if len(skill_normalized) >= 5 and (skill_normalized in s_normalized or s_normalized in skill_normalized):
                        return True
                    # Also check original case-insensitive match
                    if s.lower().strip() == skill_lower:
                        return True
            
            # Check skill_domains array with flexible matching
            for d in profile_domains:
                if isinstance(d, str):
                    d_normalized = normalize_for_comparison(d)
                    if d_normalized == skill_normalized:
                        return True
                    if len(skill_normalized) >= 5 and (skill_normalized in d_normalized or d_normalized in skill_normalized):
                        return True
                    if d.lower().strip() == skill_lower:
                        return True
            
            return False
        
        # Process vector search results - results are already scored and sorted by FAISS
        # Score already includes: base_score + overlap_bonus + mandatory_bonus + experience_boost
        mandatory_skill_clean = mandatory_skill.strip().lower() if mandatory_skill else None
        
        for result in results:
            result_id = result.get("id")
            if not result_id:
                continue
            if result_id not in profiles_dict:
                logging.warning(f"⚠️ Dropped orphan FAISS vector: {result_id}")
                continue
            
            # Score is already calculated in perform_faiss_search with all bonuses
            # Convert numpy float32 to Python float for JSON serialization
            score = float(result.get("score", 0))
            profile = profiles_dict[result_id]
            if "profile_id" not in profile:
                logging.warning(f"⚠️ Corrupted trainer (missing profile_id) for FAISS id: {result_id}")
                continue
            
            # Final verification - ensure profile has mandatory skill (STRICT domain-aware check)
            if mandatory_skill_clean:
                # Check if it's a multi-word skill that requires domain matching
                if " " in mandatory_skill_clean:
                    # Multi-word skill: check domain-aware matching
                    from services.vector_store import get_query_domain
                    query_domain = get_query_domain(query)
                    
                    if query_domain:
                        # Get profile skills and domains
                        profile_skills = [str(s).lower() for s in profile.get("skills", [])]
                        profile_domains = [str(d).lower() for d in profile.get("skill_domains", [])]
                        all_profile_terms = set(profile_skills + profile_domains)
                        
                        # For "data engineer", exclude profiles with only "Data Structures", "Data Science", etc.
                        if query_domain == "data engineering":
                            # Check for actual data engineering skills
                            data_eng_keywords = ["etl", "spark", "hadoop", "airflow", "snowflake", "data pipeline", "big data", "pyspark", "data engineer", "data engineering"]
                            has_data_eng = any(keyword in term for keyword in data_eng_keywords for term in all_profile_terms)
                            
                            # Exclude profiles with only generic "data" terms
                            exclude_terms = ["data structures", "data structure", "data science", "data analysis"]
                            has_exclude_only = any(ex in term for ex in exclude_terms for term in all_profile_terms)
                            if has_exclude_only and not has_data_eng:
                                logging.debug(f"🚫 FILTERED OUT profile '{profile.get('name')}': has only non-data-engineering 'data' skills")
                                continue
                        
                        # For other domains, trust the semantic matching (already done in vector search)
                        # No need for additional filtering here
                else:
                    # Single-word skill: use exact match check
                    if not has_exact_skill_match(profile, mandatory_skill_clean):
                        profile_name = profile.get("name", "Unknown")
                        profile_skills = profile.get("skills", [])[:5]
                        profile_domains = profile.get("skill_domains", [])[:5]
                        logging.warning(f"🚫 FILTERED OUT profile '{profile_name}' (ID: {result_id}): doesn't have mandatory skill '{mandatory_skill_clean}'")
                        logging.warning(f"   Profile skills: {profile_skills}, domains: {profile_domains}")
                        continue
            
            # Score is already boosted in FAISS search, no need to add more boosts
            # Convert experience_years to Python float if it's a numpy type
            experience_years = profile.get("experience_years")
            if experience_years is not None:
                experience_years = float(experience_years)
            
            match_data = filter_sensitive_data({
                "name": profile.get("name", ""),
                "profile_id": profile.get("profile_id", result_id),
                "location": profile.get("location", ""),
                "skills": profile.get("skills", []),
                "skill_domains": profile.get("skill_domains", []),
                "experience_years": experience_years,
                "education": profile.get("education"),
                "certifications": profile.get("certifications", []),
                "companies": profile.get("companies", []),
                "current_company": profile.get("current_company", ""),
                "clients": profile.get("clients", []),
                "score": round(score, 3),
                "match_percentage": min(100, max(0, round(score)))
            })
            all_matches.append(match_data)
        
        if not query and location:
            for profile_id, profile in profiles_dict.items():
                # Convert experience_years to Python float if it's a numpy type
                experience_years = profile.get("experience_years")
                if experience_years is not None:
                    experience_years = float(experience_years)
                
                match_data = filter_sensitive_data({
                    "name": profile.get("name", ""),
                    "profile_id": profile.get("profile_id", ""),
                    "location": profile.get("location", ""),
                    "skills": profile.get("skills", []),
                    "skill_domains": profile.get("skill_domains", []),
                    "experience_years": experience_years,
                    "education": profile.get("education"),
                    "certifications": profile.get("certifications", []),
                    "companies": profile.get("companies", []),
                    "current_company": profile.get("current_company", ""),
                    "clients": profile.get("clients", []),
                    "score": 1.0,
                    "match_percentage": 100
                })
                all_matches.append(match_data)
        
        # CRITICAL: Sort ALL matches by match percentage first (highest first), then by experience
        # Primary sort: match percentage (highest first)
        # Secondary sort: experience years (highest first)
        # Convert to Python float to handle numpy float32 types
        all_matches.sort(key=lambda x: (
            float(x.get("match_percentage", 0) or 0),  # Primary: match percentage (highest first)
            float(x.get("experience_years", 0) or 0)  # Secondary: experience years (highest first)
        ), reverse=True)
        
        # Separate perfect matches for immediate streaming
        perfect_matches = [m for m in all_matches if m.get("match_percentage", 0) >= 100]
        other_matches = [m for m in all_matches if m.get("match_percentage", 0) < 100]
        
        # Ensure perfect matches are also sorted by match percentage first, then experience
        # Convert to Python float to handle numpy float32 types
        perfect_matches.sort(key=lambda x: (
            float(x.get("match_percentage", 0) or 0),  # Primary: match percentage
            float(x.get("experience_years", 0) or 0)  # Secondary: experience years
        ), reverse=True)
        
        if perfect_matches:
            yield json.dumps({"type": "matches", "matches": convert_to_python_types(perfect_matches), "is_perfect": True}) + "\n"
        
        # Stream other matches (already sorted by score, highest first)
        for match in other_matches:
            yield json.dumps({"type": "match", "match": convert_to_python_types(match), "is_perfect": False}) + "\n"
            await asyncio.sleep(0.01)
        
        # Send completion with ALL matches sorted by score (highest first)
        elapsed_ms = (time.time() - start_time) * 1000
        logging.info(f"⏱️ Customer search completed in {elapsed_ms:.0f}ms - {len(all_matches)} results")
        yield json.dumps({
            "type": "complete", 
            "total_matches": len(all_matches), 
            "matches": convert_to_python_types(all_matches),
            "expanded_terms": expanded_terms,
            "search_time_ms": round(elapsed_ms, 2)
        }) + "\n"
        
    except Exception as e:
        error_msg = str(e)
        logging.error(f"❌ Customer streaming search error: {error_msg}")
        yield json.dumps({"type": "error", "error": error_msg}) + "\n"

@app.post("/customer/search_by_text")
async def customer_search_by_text(request: TextSearchRequest, http_request: Request, user=Depends(get_customer_user)):
    """Customer search by skills/location - returns filtered data (no email/phone) with streaming"""
    try:
        query = request.query.strip() if request.query else ""
        location = request.location.strip() if request.location else ""
        top_k = max(1, min(getattr(request, "top_k", 10) or 10, 50))
        skill_domain = (getattr(request, "skill_domain", None) or "").strip() or None
        
        # Log the customer search activity
        asyncio.create_task(log_activity(
            action_type="search",
            user_email=user.get("email", "unknown"),
            user_role="customer",
            details={"query": query[:100], "location": location, "skill_domain": skill_domain, "top_k": top_k, "search_type": "text"},
            ip_address=get_client_ip(http_request),
            user_agent=http_request.headers.get("User-Agent", None)
        ))
        
        if not query and not location and not skill_domain:
            return {"total_matches": 0, "matches": []}
        
        return StreamingResponse(
            stream_customer_search_results(query, location, top_k=top_k),
            media_type="application/x-ndjson"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

@app.post("/customer/search_by_jd")
async def customer_search_by_jd(request: JDSearchRequest, http_request: Request, user=Depends(get_customer_user)):
    """Customer search by JD - returns filtered data (no email/phone)"""
    try:
        # Log the customer JD search activity
        asyncio.create_task(log_activity(
            action_type="search",
            user_email=user.get("email", "unknown"),
            user_role="customer",
            details={"search_type": "jd", "location": request.location, "top_k": request.top_k},
            ip_address=get_client_ip(http_request),
            user_agent=http_request.headers.get("User-Agent", None)
        ))
        
        cleanup_jd_cache()
        jd_hash = jd_text_hash(request.jd_text, request.location, request.top_k)
        cache_entry = get_cached_jd_results(jd_hash)
        cached = False
        enriched_results: List[Dict[str, Any]] = []
        parsed_jd = {}
        
        if cache_entry:
            enriched_results = cache_entry.get("results", [])
            parsed_jd = cache_entry.get("parsed_jd", {})
            cached = True
        else:
            try:
                parsed_jd = parse_jd_text(request.jd_text)
            except Exception as parse_error:
                parsed_jd = {"skills": [], "experience_years": None, "domain": "", "requirements": ""}
            
            top_k = max(1, min(request.top_k, 50))
            query_embedding, results = query_vector(request.jd_text, top_k=top_k)
            matched_ids = [result.get("id") for result in results if result.get("id")]
            
            if matched_ids:
                profiles_cursor_all = trainer_profiles.find(
                    {"profile_id": {"$in": matched_ids}},
                    {"_id": 0, "profile_id": 1, "name": 1, "location": 1, "skills": 1, "skill_domains": 1,
                     "experience_years": 1, "education": 1, "certifications": 1, "companies": 1,
                     "current_company": 1, "clients": 1}
                )
                profiles_dict_all = {}
                for profile in await profiles_cursor_all.to_list(length=len(matched_ids)):
                    pid = profile.get("profile_id")
                    if pid:
                        profiles_dict_all[pid] = profile
                
                filtered_ids = set()
                # Filter by location if provided
                if request.location and request.location.strip():
                    location_query = {
                        "profile_id": {"$in": matched_ids},
                        "location": {"$regex": request.location.strip(), "$options": "i"},
                    }
                    profiles_cursor_filtered = trainer_profiles.find(
                        location_query,
                        {"_id": 0, "profile_id": 1},
                    )
                    filtered_ids = set()
                    for profile in await profiles_cursor_filtered.to_list(length=len(matched_ids)):
                        pid = profile.get("profile_id")
                        if pid:
                            filtered_ids.add(pid)
                
                # Extract experience_years requirement from parsed JD
                jd_experience_years = None
                if parsed_jd and parsed_jd.get("experience_years") is not None:
                    try:
                        jd_experience_years = float(parsed_jd.get("experience_years"))
                        logging.info(f"📊 JD requires experience: {jd_experience_years} years")
                    except (ValueError, TypeError):
                        jd_experience_years = None
                
                # Extract skills from JD for skill-based matching boost
                jd_skills = []
                if parsed_jd and parsed_jd.get("skills"):
                    jd_skills = [s.lower().strip() for s in parsed_jd.get("skills", []) if s]
                
                # Also extract skills from JD text itself for better matching
                if not jd_skills and request.jd_text:
                    jd_skills = extract_skills_from_query(request.jd_text)
                    if jd_skills:
                        logging.info(f"🎯 Extracted {len(jd_skills)} skills from JD text: {jd_skills[:5]}")
                
                for result in results:
                    result_id = result.get("id")
                    # Convert numpy float32 to Python float for JSON serialization
                    score = float(result.get("score", 0))
                    
                    # Filter by location if provided
                    if request.location and request.location.strip():
                        if result_id not in filtered_ids:
                            continue
                    
                    if result_id and result_id in profiles_dict_all:
                        profile = profiles_dict_all[result_id]
                        
                        # Filter by experience_years if JD has experience requirement
                        if jd_experience_years is not None:
                            profile_experience = profile.get("experience_years")
                            if profile_experience is not None:
                                profile_experience = float(profile_experience)
                            if profile_experience is None or profile_experience < jd_experience_years:
                                # Skip profiles that don't meet experience requirement
                                continue
                        
                        # Apply skill-based boost if JD has skills
                        profile_skills = profile.get("skills", [])
                        skill_boost = 0.0
                        if jd_skills and profile_skills:
                            skill_boost = calculate_skill_overlap_boost(jd_skills, profile_skills)
                        
                        # Boost the score with skill overlap
                        boosted_score = float(score) + float(skill_boost)
                        # Use round() instead of int() to preserve decimal accuracy
                        match_percentage = min(100, max(0, round(boosted_score)))
                        
                        # Convert experience_years to Python float if it's a numpy type
                        experience_years = profile.get("experience_years")
                        if experience_years is not None:
                            experience_years = float(experience_years)
                        
                        enriched_results.append(filter_sensitive_data({
                            "name": profile.get("name", ""),
                            "profile_id": profile.get("profile_id", result_id),
                            "location": profile.get("location", ""),
                            "skills": profile.get("skills", []),
                            "skill_domains": profile.get("skill_domains", []),
                            "experience_years": experience_years,
                            "education": profile.get("education"),
                            "certifications": profile.get("certifications", []),
                            "companies": profile.get("companies", []),
                            "current_company": profile.get("current_company", ""),
                            "clients": profile.get("clients", []),
                            "score": round(boosted_score, 3),
                            "match_percentage": match_percentage
                        }))
            
            # Sort by match percentage first (highest first), then by experience
            # Convert to Python float to handle numpy float32 types
            enriched_results.sort(key=lambda x: (
                float(x.get("match_percentage", 0) or 0),  # Primary: match percentage (highest first)
                float(x.get("experience_years", 0) or 0)  # Secondary: experience years (highest first)
            ), reverse=True)
            store_cached_jd_results(jd_hash, request.jd_text, query_embedding, enriched_results, parsed_jd)
        
        # Filter results for customer
        filtered_results = [filter_sensitive_data(r) for r in enriched_results]
        
        return {
            "cached": cached,
            "parsed_jd": parsed_jd,
            "total_matches": len(filtered_results),
            "matches": convert_to_python_types(filtered_results),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

# ==================== ACTIVITY LOGGING ENDPOINTS ====================

@app.post("/log_activity")
async def log_user_activity(
    activity: ActivityLogRequest,
    request: Request,
    user=Depends(get_user)
):
    """Log an activity from the frontend"""
    try:
        user_email = user.get("email", "unknown")
        user_role = user.get("role", "unknown")
        ip_address = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", None)
        
        await log_activity(
            action_type=activity.action_type,
            user_email=user_email,
            user_role=user_role,
            details=activity.details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        return {"status": "success"}
    except Exception as e:
        logging.error(f"❌ Activity logging error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/admin/activity_logs")
async def get_activity_logs(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_role: Optional[str] = None,
    action_type: Optional[str] = None,
    user_email: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    user=Depends(get_admin_user)
):
    """Get paginated activity logs with filters (Admin only)"""
    try:
        from datetime import datetime as dt
        
        # Build query filter
        query_filter = {}
        
        if start_date:
            try:
                start_dt = dt.fromisoformat(start_date.replace("Z", "+00:00"))
                query_filter["timestamp"] = {"$gte": start_dt}
            except Exception as e:
                logging.warning(f"Invalid start_date format: {e}")
        
        if end_date:
            try:
                end_dt = dt.fromisoformat(end_date.replace("Z", "+00:00"))
                if "timestamp" in query_filter:
                    query_filter["timestamp"]["$lte"] = end_dt
                else:
                    query_filter["timestamp"] = {"$lte": end_dt}
            except Exception as e:
                logging.warning(f"Invalid end_date format: {e}")
        
        if user_role:
            query_filter["user_role"] = user_role
        
        if action_type:
            query_filter["action_type"] = action_type
        
        if user_email:
            query_filter["user_email"] = {"$regex": user_email, "$options": "i"}
        
        # Calculate pagination
        skip = (page - 1) * page_size
        
        # Get total count
        total_count = await activity_logs.count_documents(query_filter)
        
        # Fetch logs (most recent first)
        cursor = activity_logs.find(query_filter).sort("timestamp", -1).skip(skip).limit(page_size)
        logs = []
        async for log in cursor:
            log["_id"] = str(log["_id"])
            logs.append(log)
        
        return {
            "logs": logs,
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": (total_count + page_size - 1) // page_size
        }
    except Exception as e:
        logging.error(f"❌ Error fetching activity logs: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching activity logs: {str(e)}")

@app.get("/customer/profile")
async def get_customer_profile(user=Depends(get_customer_user)):
    """Get customer profile information"""
    try:
        email = user.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        customer = await customer_users.find_one({"email": email})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Get the full name from the database - ensure we get the actual stored name
        stored_name = customer.get("name")
        if stored_name:
            # If name exists, use it (can be string or already trimmed)
            name = str(stored_name).strip() if stored_name else ""
        else:
            name = ""
        
        logging.info(f"Customer profile fetched for {email}: name='{name}'")
        
        return {
            "name": name,
            "email": customer.get("email", ""),
            "company_name": customer.get("company_name", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting customer profile: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/customer/trainers_list")
async def customer_trainers_list(user=Depends(get_customer_user)):
    """Get all trainers list for customer - filtered data (no email/phone)"""
    try:
        cursor = trainer_profiles.find(
            {},
            {
                "_id": 0,
                "profile_id": 1,
                "name": 1,
                "location": 1,
                "skills": 1,
                "skill_domains": 1,
                "experience_years": 1,
                "education": 1,
                "certifications": 1,
                "companies": 1,
                "current_company": 1,
                "clients": 1,
            }
        )
        trainers = await cursor.to_list(length=10000)
        
        # Filter sensitive data
        filtered_trainers = [filter_sensitive_data(trainer) for trainer in trainers]
        
        return {"trainers": filtered_trainers, "total": len(filtered_trainers)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trainers: {str(e)}")

@app.post("/customer/post_requirement")
async def post_requirement(request: CustomerRequirementPost, user=Depends(get_customer_user)):
    """Customer posts a requirement for admin approval"""
    try:
        customer_email = user.get("email")
        if not customer_email:
            raise HTTPException(status_code=400, detail="Missing customer email")
        
        requirement_doc = {
            "customer_email": customer_email,
            "requirement_text": request.requirement_text,
            "jd_file_text": request.jd_file_text,
            "location": request.location,
            "skills": request.skills or [],
            "experience_years": request.experience_years,
            "domain": request.domain,
            "status": "pending",  # pending, approved, rejected
            "admin_notes": None,
            "approved_by": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        result = await customer_requirements.insert_one(requirement_doc)
        requirement_id = str(result.inserted_id)
        
        return {
            "status": "success",
            "requirement_id": requirement_id,
            "message": "Requirement posted successfully. Waiting for admin approval."
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error posting requirement: {e}")
        raise HTTPException(status_code=500, detail=f"Error posting requirement: {str(e)}")

@app.get("/customer/requirements")
async def get_customer_requirements(user=Depends(get_customer_user)):
    """Get all requirements posted by the customer"""
    try:
        customer_email = user.get("email")
        if not customer_email:
            raise HTTPException(status_code=400, detail="Missing customer email")
        
        cursor = customer_requirements.find(
            {"customer_email": customer_email}
        ).sort("created_at", -1)
        
        requirements = await cursor.to_list(length=100)
        
        # Convert ObjectId to string
        from bson import ObjectId
        for req in requirements:
            if "_id" in req:
                req["requirement_id"] = str(req["_id"])
                req["_id"] = str(req["_id"])  # Keep as string for JSON serialization
        
        return {"requirements": requirements, "total": len(requirements)}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching requirements: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching requirements: {str(e)}")

@app.get("/admin/requirements")
async def get_all_requirements(user=Depends(get_admin_user)):
    """Admin gets all customer requirements"""
    try:
        cursor = customer_requirements.find({}).sort("created_at", -1)
        requirements = await cursor.to_list(length=1000)
        
        # Convert ObjectId to string and include customer info
        from bson import ObjectId
        for req in requirements:
            if "_id" in req:
                req["requirement_id"] = str(req["_id"])
                req["_id"] = str(req["_id"])  # Keep as string for JSON serialization
            # Get customer name
            customer = await customer_users.find_one({"email": req.get("customer_email")})
            if customer:
                req["customer_name"] = customer.get("name", req.get("customer_email"))
        
        return {"requirements": requirements, "total": len(requirements)}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching requirements: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching requirements: {str(e)}")

@app.get("/admin/requirements/pending_count")
async def get_pending_requirements_count(user=Depends(get_admin_user)):
    """Get count of pending requirements for notification"""
    try:
        count = await customer_requirements.count_documents({"status": "pending"})
        return {"pending_count": count}
    except Exception as e:
        logging.error(f"Error fetching pending count: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching pending count: {str(e)}")

@app.get("/admin/dashboard")
async def get_admin_dashboard(user=Depends(get_admin_user)):
    """Admin dashboard endpoint - returns basic dashboard info"""
    try:
        admin_email = user.get("email")
        
        # Get some basic stats for the dashboard
        total_trainers = await trainer_profiles.count_documents({})
        pending_requirements = await customer_requirements.count_documents({"status": "pending"})
        
        return {
            "status": "success",
            "message": "Admin dashboard accessible",
            "admin_email": admin_email,
            "stats": {
                "total_trainers": total_trainers,
                "pending_requirements": pending_requirements
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching admin dashboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard data: {str(e)}")

@app.post("/admin/approve_requirement")
async def approve_requirement(request: RequirementApproval, user=Depends(get_admin_user)):
    """Admin approves or rejects a customer requirement"""
    try:
        admin_email = user.get("email")
        if not admin_email:
            raise HTTPException(status_code=400, detail="Missing admin email")
        
        from bson import ObjectId
        
        # Find requirement
        requirement = await customer_requirements.find_one({"_id": ObjectId(request.requirement_id)})
        if not requirement:
            raise HTTPException(status_code=404, detail="Requirement not found")
        
        # Update requirement
        update_doc = {
            "status": "approved" if request.approved else "rejected",
            "admin_notes": request.admin_notes,
            "approved_by": admin_email,
            "updated_at": datetime.utcnow(),
        }
        
        await customer_requirements.update_one(
            {"_id": ObjectId(request.requirement_id)},
            {"$set": update_doc}
        )
        
        return {
            "status": "success",
            "message": f"Requirement {'approved' if request.approved else 'rejected'} successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error approving requirement: {e}")
        raise HTTPException(status_code=500, detail=f"Error approving requirement: {str(e)}")
