"""
Multi-Vector Chunker Service
Splits resumes into structured chunks for better semantic matching.
"""
import logging
import re
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class ResumeChunker:
    """Chunks resumes into structured semantic units for multi-vector embedding."""
    
    # Chunk types for multi-vector architecture
    CHUNK_TYPES = ["skills", "experience", "projects", "certifications", "raw_chunks"]
    
    def __init__(self, max_chunk_size: int = 512, overlap: int = 50):
        """
        Initialize chunker.
        
        Args:
            max_chunk_size: Maximum tokens/characters per chunk
            overlap: Overlap between chunks for context preservation
        """
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap
    
    def chunk_resume(self, profile: Dict[str, Any], raw_text: str = "") -> Dict[str, List[Dict[str, Any]]]:
        """
        Chunk a resume into structured semantic units.
        
        Returns:
            Dict mapping chunk_type -> List of chunks, each with:
            - text: chunk content
            - metadata: profile_id, chunk_type, chunk_index, etc.
        """
        profile_id = profile.get("profile_id", "unknown")
        chunks: Dict[str, List[Dict[str, Any]]] = {ct: [] for ct in self.CHUNK_TYPES}
        
        # 1. Skills chunk
        skills_chunk = self._chunk_skills(profile)
        if skills_chunk:
            chunks["skills"].append(skills_chunk)
        
        # 2. Experience chunks
        experience_chunks = self._chunk_experience(profile)
        chunks["experience"].extend(experience_chunks)
        
        # 3. Projects chunks
        projects_chunks = self._chunk_projects(profile, raw_text)
        chunks["projects"].extend(projects_chunks)
        
        # 4. Certifications chunk
        certs_chunk = self._chunk_certifications(profile)
        if certs_chunk:
            chunks["certifications"].append(certs_chunk)
        
        # 5. Raw text chunks (fallback for unstructured content)
        raw_chunks = self._chunk_raw_text(raw_text, profile)
        chunks["raw_chunks"].extend(raw_chunks)
        
        # Log chunking statistics
        total_chunks = sum(len(chunk_list) for chunk_list in chunks.values())
        logger.debug(f"📦 Chunked profile {profile_id}: {total_chunks} total chunks "
                    f"(skills: {len(chunks['skills'])}, experience: {len(chunks['experience'])}, "
                    f"projects: {len(chunks['projects'])}, certs: {len(chunks['certifications'])}, "
                    f"raw: {len(chunks['raw_chunks'])})")
        
        return chunks
    
    def _chunk_skills(self, profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a skills chunk from profile skills and domains."""
        skills = profile.get("skills", []) or []
        domains = profile.get("skill_domains", []) or []
        
        if not skills and not domains:
            return None
        
        # Combine skills and domains into a single skills chunk
        skill_texts = []
        if skills:
            skill_texts.extend([str(s).strip() for s in skills if s])
        if domains:
            skill_texts.extend([f"Domain: {str(d).strip()}" for d in domains if d])
        
        if not skill_texts:
            return None
        
        text = "Skills: " + ", ".join(skill_texts)
        
        return {
            "text": text,
            "metadata": {
                "profile_id": profile.get("profile_id"),
                "chunk_type": "skills",
                "chunk_index": 0,
                "skills": skills,
                "skill_domains": domains,
            }
        }
    
    def _chunk_experience(self, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create experience chunks from profile data."""
        chunks = []
        
        # Extract experience from companies, current_company, experience_years
        companies = profile.get("companies", []) or []
        current_company = profile.get("current_company", "")
        experience_years = profile.get("experience_years")
        
        # Build experience text
        experience_parts = []
        
        if current_company:
            experience_parts.append(f"Current Company: {current_company}")
        
        if companies:
            if isinstance(companies, list):
                company_list = ", ".join([str(c) for c in companies if c])
                if company_list:
                    experience_parts.append(f"Previous Companies: {company_list}")
            else:
                experience_parts.append(f"Companies: {companies}")
        
        if experience_years is not None:
            experience_parts.append(f"Experience: {experience_years} years")
        
        # Also check raw_text for experience patterns
        raw_text = profile.get("raw_text", "")
        if raw_text:
            # Extract experience sentences from raw text
            experience_sentences = self._extract_experience_from_text(raw_text)
            if experience_sentences:
                experience_parts.extend(experience_sentences)
        
        if experience_parts:
            text = " | ".join(experience_parts)
            chunks.append({
                "text": text,
                "metadata": {
                    "profile_id": profile.get("profile_id"),
                    "chunk_type": "experience",
                    "chunk_index": 0,
                    "experience_years": experience_years,
                    "companies": companies,
                    "current_company": current_company,
                }
            })
        
        return chunks
    
    def _chunk_projects(self, profile: Dict[str, Any], raw_text: str = "") -> List[Dict[str, Any]]:
        """Extract project information from profile and raw text."""
        chunks = []
        
        # Try to extract projects from raw_text
        if raw_text:
            projects = self._extract_projects_from_text(raw_text)
            for idx, project_text in enumerate(projects):
                if project_text.strip():
                    chunks.append({
                        "text": f"Project: {project_text}",
                        "metadata": {
                            "profile_id": profile.get("profile_id"),
                            "chunk_type": "projects",
                            "chunk_index": idx,
                        }
                    })
        
        # If no projects found, create a chunk from clients
        if not chunks:
            clients = profile.get("clients", []) or []
            if clients:
                if isinstance(clients, list):
                    client_text = ", ".join([str(c) for c in clients if c])
                else:
                    client_text = str(clients)
                
                if client_text.strip():
                    chunks.append({
                        "text": f"Projects/Clients: {client_text}",
                        "metadata": {
                            "profile_id": profile.get("profile_id"),
                            "chunk_type": "projects",
                            "chunk_index": 0,
                        }
                    })
        
        return chunks
    
    def _chunk_certifications(self, profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create certifications chunk."""
        certifications = profile.get("certifications", []) or []
        education = profile.get("education", []) or []
        
        if not certifications and not education:
            return None
        
        cert_parts = []
        
        if certifications:
            if isinstance(certifications, list):
                cert_list = ", ".join([str(c) for c in certifications if c])
                if cert_list:
                    cert_parts.append(f"Certifications: {cert_list}")
            else:
                cert_parts.append(f"Certifications: {certifications}")
        
        if education:
            if isinstance(education, list):
                edu_texts = []
                for edu in education:
                    if isinstance(edu, dict):
                        edu_str = ", ".join([f"{k}: {v}" for k, v in edu.items() if v])
                        if edu_str:
                            edu_texts.append(edu_str)
                    else:
                        edu_texts.append(str(edu))
                if edu_texts:
                    cert_parts.append(f"Education: {' | '.join(edu_texts)}")
            else:
                cert_parts.append(f"Education: {education}")
        
        if not cert_parts:
            return None
        
        text = " | ".join(cert_parts)
        
        return {
            "text": text,
            "metadata": {
                "profile_id": profile.get("profile_id"),
                "chunk_type": "certifications",
                "chunk_index": 0,
                "certifications": certifications,
                "education": education,
            }
        }
    
    def _chunk_raw_text(self, raw_text: str, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Chunk raw text into overlapping segments."""
        if not raw_text or not raw_text.strip():
            return []
        
        chunks = []
        text = raw_text.strip()
        
        # Split into sentences first
        sentences = re.split(r'[.!?]\s+', text)
        
        # Group sentences into chunks
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            sentence_length = len(sentence.split())
            
            # If adding this sentence would exceed max_chunk_size, save current chunk
            if current_length + sentence_length > self.max_chunk_size and current_chunk:
                chunk_text = " ".join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "metadata": {
                        "profile_id": profile.get("profile_id"),
                        "chunk_type": "raw_chunks",
                        "chunk_index": len(chunks),
                    }
                })
                
                # Start new chunk with overlap (last few sentences)
                overlap_sentences = current_chunk[-2:] if len(current_chunk) >= 2 else current_chunk
                current_chunk = overlap_sentences + [sentence]
                current_length = sum(len(s.split()) for s in current_chunk)
            else:
                current_chunk.append(sentence)
                current_length += sentence_length
        
        # Add remaining chunk
        if current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append({
                "text": chunk_text,
                "metadata": {
                    "profile_id": profile.get("profile_id"),
                    "chunk_type": "raw_chunks",
                    "chunk_index": len(chunks),
                }
            })
        
        return chunks
    
    def _extract_experience_from_text(self, text: str) -> List[str]:
        """Extract experience-related sentences from raw text."""
        # Look for patterns like "X years of experience", "worked at", "experience in", etc.
        experience_patterns = [
            r'\d+\s+years?\s+(?:of\s+)?experience',
            r'worked\s+(?:at|with|for)',
            r'experience\s+in',
            r'responsible\s+for',
            r'managed\s+',
            r'led\s+',
        ]
        
        sentences = re.split(r'[.!?]\s+', text)
        experience_sentences = []
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            for pattern in experience_patterns:
                if re.search(pattern, sentence_lower, re.IGNORECASE):
                    experience_sentences.append(sentence.strip())
                    break
        
        return experience_sentences[:5]  # Limit to top 5
    
    def _extract_projects_from_text(self, text: str) -> List[str]:
        """Extract project descriptions from text."""
        # Look for project indicators
        project_patterns = [
            r'project[:\s]+([^.!?]+)',
            r'developed\s+([^.!?]+)',
            r'built\s+([^.!?]+)',
            r'implemented\s+([^.!?]+)',
            r'designed\s+([^.!?]+)',
        ]
        
        projects = []
        for pattern in project_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                project_text = match.group(1) if match.groups() else match.group(0)
                if project_text.strip() and len(project_text.strip()) > 10:
                    projects.append(project_text.strip())
        
        # Remove duplicates while preserving order
        seen = set()
        unique_projects = []
        for proj in projects:
            proj_lower = proj.lower()
            if proj_lower not in seen:
                seen.add(proj_lower)
                unique_projects.append(proj)
        
        return unique_projects[:10]  # Limit to top 10 projects


# Global chunker instance
_chunker_instance: Optional[ResumeChunker] = None


def get_chunker() -> ResumeChunker:
    """Get or create global chunker instance."""
    global _chunker_instance
    if _chunker_instance is None:
        _chunker_instance = ResumeChunker()
    return _chunker_instance

