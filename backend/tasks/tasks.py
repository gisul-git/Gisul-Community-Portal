import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from tasks.celery_app import cel
from services.extract_text import extract_text_from_bytes, convert_doc_to_pdf
from services.parse_service import parse_resume_text_sync
from services.vector_store import upsert_vector, clear_embedding_cache
from db_sync import get_db_client, db_name
from services.skill_domains import infer_skill_domains
import base64, os, tempfile, logging, re
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from bson import Binary
from uuid import uuid4
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

@cel.task(name="tasks.convert_doc_to_pdf_task")
def convert_doc_to_pdf_task(file_data):
    
    try:
        filename = file_data.get("filename", "unknown")
        content_b64 = file_data.get("content_b64")
        
        if not content_b64:
            logger.warning(f"❌ No content provided for {filename}")
            return None
        
        logger.warning(f"🧾 Converting {filename} to PDF...")
        
        file_bytes = base64.b64decode(content_b64)
        
        suffix = '.doc' if filename.lower().endswith('.doc') else '.docx'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_doc_path = temp_file.name
        
        try:
            pdf_path = convert_doc_to_pdf(temp_doc_path)
            
            if not pdf_path or not os.path.exists(pdf_path):
                logger.warning(f"❌ Conversion failed for {filename}")
                return None
            
            with open(pdf_path, "rb") as pdf_f:
                pdf_bytes = pdf_f.read()
            
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
            
            pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
            pdf_filename = Path(filename).stem + ".pdf"
            
            logger.warning(f"✅ Converted {filename} → {pdf_filename} ({len(pdf_bytes)} bytes)")
            return {
                "filename": pdf_filename,
                "content_b64": pdf_b64,
                "original_filename": filename
            }
            
        finally:
            try:
                if os.path.exists(temp_doc_path):
                    os.unlink(temp_doc_path)
            except:
                pass
                
    except Exception as e:
        logger.warning(f"❌ Conversion error for {file_data.get('filename', 'unknown')}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def convert_doc_to_pdf_local(file_data):
    
    filename = file_data.get("filename", "unknown")
    content_b64 = file_data.get("content_b64")
    
    if not content_b64:
        raise ValueError(f"No content provided for {filename}")
    
    logger.warning(f"🧾 (local) Converting {filename} to PDF...")
    
    file_bytes = base64.b64decode(content_b64)
    
    suffix = '.doc' if filename.lower().endswith('.doc') else '.docx'
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(file_bytes)
        temp_doc_path = temp_file.name
    
    pdf_path = None
    try:
        pdf_path = convert_doc_to_pdf(temp_doc_path)
        
        if not pdf_path or not os.path.exists(pdf_path):
            raise RuntimeError(f"Conversion failed for {filename}")
        
        with open(pdf_path, "rb") as pdf_f:
            pdf_bytes = pdf_f.read()
        
        pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
        pdf_filename = Path(filename).stem + ".pdf"
        
        logger.warning(f"✅ (local) Converted {filename} → {pdf_filename} ({len(pdf_bytes)} bytes)")
        return {
            "filename": pdf_filename,
            "content_b64": pdf_b64,
            "original_filename": filename
        }
    finally:
        try:
            if pdf_path and os.path.exists(pdf_path):
                os.remove(pdf_path)
                pdf_dir = Path(pdf_path).parent
                if pdf_dir.exists():
                    try:
                        os.rmdir(pdf_dir)
                    except:
                        pass
        except:
            pass
        try:
            if os.path.exists(temp_doc_path):
                os.unlink(temp_doc_path)
        except:
            pass

EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

def extract_email_fallback(text: str) -> str | None:
    if not text:
        return None
    match = EMAIL_REGEX.search(text)
    if match:
        return match.group(0).strip().lower()
    return None

def clean_text_content(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\r", " ")
    text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def default_parsed_profile() -> Dict[str, Any]:
    return {
        "name": None,
        "email": None,
        "phone": None,
        "location": None,
        "skills": [],
        "experience_years": None,
        "education": [],
        "certifications": [],
        "companies": [],
        "current_company": None,
        "clients": []
    }

def normalize_list_field(value: Any) -> List[str]:
    if value is None:
        return []
    normalized: List[str] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, (str, int, float)):
                text = str(item).strip()
                if text:
                    normalized.append(text)
            elif isinstance(item, dict):
                text = " ".join(str(v).strip() for v in item.values() if v)
                text = text.strip()
                if text:
                    normalized.append(text)
    elif isinstance(value, (str, int, float)):
        text = str(value).strip()
        if text:
            normalized.append(text)
    return normalized

def sanitize_scalar(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).strip()
    return text or None

def extract_text_from_file(filename: str, file_bytes: bytes) -> str:
    text = extract_text_from_bytes(filename, file_bytes)
    return clean_text_content(text)

def parse_resume_data(filename: str, text: str) -> Dict[str, Any]:
    parsed_raw = {}
    try:
        parsed_raw = parse_resume_text_sync(text) or {}
        if not isinstance(parsed_raw, dict):
            logger.warning(f"⚠️ OpenAI parsing returned non-dict for {filename}, using empty dict")
            parsed_raw = {}
    except Exception as e:
        logger.exception(f"❌ OpenAI parsing failed for {filename}: {e}")
        # Don't raise - return empty dict instead so we can still store the resume
        parsed_raw = {}
    
    profile = default_parsed_profile()
    name_value = sanitize_scalar(parsed_raw.get("name"))
    # Only use parsed name if it's valid (not empty, not N/A)
    if name_value and name_value.strip().lower() not in ["", "n/a", "na", "none", "null"]:
        profile["name"] = name_value
        logger.warning(f"✅ Using parsed name from OpenAI: '{name_value}' for {filename}")
    else:
        profile["name"] = None  # Will trigger fallback extraction
        if parsed_raw.get("name"):
            logger.warning(f"⚠️ Parsed name '{parsed_raw.get('name')}' was invalid for {filename}, will try fallback")
    
    email_value = sanitize_scalar(parsed_raw.get("email"))
    profile["email"] = email_value.lower() if email_value else None
    
    profile["phone"] = sanitize_scalar(parsed_raw.get("phone"))
    profile["location"] = sanitize_scalar(parsed_raw.get("location"))
    profile["skills"] = normalize_list_field(parsed_raw.get("skills"))
    
    experience_raw = parsed_raw.get("experience_years")
    if isinstance(experience_raw, (int, float)):
        profile["experience_years"] = experience_raw
    elif isinstance(experience_raw, str):
        experience_raw = experience_raw.strip()
        try:
            profile["experience_years"] = float(experience_raw)
        except ValueError:
            profile["experience_years"] = None
    else:
        profile["experience_years"] = None
    
    education_value = parsed_raw.get("education")
    profile["education"] = normalize_list_field(education_value)
    
    profile["certifications"] = normalize_list_field(parsed_raw.get("certifications"))
    profile["companies"] = normalize_list_field(parsed_raw.get("companies"))
    profile["clients"] = normalize_list_field(parsed_raw.get("clients"))
    profile["current_company"] = sanitize_scalar(parsed_raw.get("current_company"))
    
    return profile

def identify_missing_fields(profile: Dict[str, Any]) -> List[str]:
    missing = []
    if not profile.get("email"):
        missing.append("email")
    if not profile.get("phone"):
        missing.append("phone")
    if not profile.get("location"):
        missing.append("location")
    if not profile.get("skills"):
        missing.append("skills")
    if profile.get("experience_years") is None:
        missing.append("experience_years")
    if not profile.get("education"):
        missing.append("education")
    if not profile.get("certifications"):
        missing.append("certifications")
    if not profile.get("companies"):
        missing.append("companies")
    if not profile.get("current_company"):
        missing.append("current_company")
    if not profile.get("clients"):
        missing.append("clients")
    return missing

def prepare_resume_bytes(file_data: Dict[str, Any], filename: str, original_bytes: bytes) -> Tuple[bytes, str, List[str]]:
    issues: List[str] = []
    stored_bytes = original_bytes
    stored_filename = filename
    
    if filename.lower().endswith((".doc", ".docx")):
        try:
            converted = convert_doc_to_pdf_local(file_data)
            stored_bytes = base64.b64decode(converted["content_b64"])
            stored_filename = converted["filename"]
        except Exception as conv_err:
            logger.exception(f"⚠️ DOC/DOCX conversion failed for {filename}: {conv_err}")
            issues.append(f"DOC conversion failed: {conv_err}")
            stored_bytes = original_bytes
            stored_filename = filename
    return stored_bytes, stored_filename, issues

def build_profile_document(
    parsed_profile: Dict[str, Any],
    text: str,
    original_filename: str,
    stored_filename: str,
    stored_bytes: bytes,
    uploaded_by_admin: str,
    missing_fields: List[str],
    issues: List[str],
    skill_domains: List[str]
) -> Dict[str, Any]:
    profile_id = str(uuid4())
    now = datetime.utcnow()
    status = "partial" if missing_fields or issues else "complete"
    
    profile_doc: Dict[str, Any] = {
        "_id": profile_id,
        "profile_id": profile_id,
        "name": parsed_profile.get("name"),
        "email": parsed_profile.get("email"),
        "phone": parsed_profile.get("phone"),
        "location": parsed_profile.get("location"),
        "skills": parsed_profile.get("skills", []),
        "skill_domains": skill_domains,
        "experience_years": parsed_profile.get("experience_years"),
        "education": parsed_profile.get("education", []),
        "certifications": parsed_profile.get("certifications", []),
        "companies": parsed_profile.get("companies", []),
        "current_company": parsed_profile.get("current_company"),
        "clients": parsed_profile.get("clients", []),
        "missing_fields": missing_fields,
        "issues": issues,
        "status": status,
        "raw_text": text,
        "resume_file": Binary(stored_bytes),
        "resume_filename": stored_filename,
        "source_filename": original_filename,
        "uploaded_by": uploaded_by_admin,
        "uploaded_at": now,
        "updated_at": now,
        "file_size_bytes": len(stored_bytes),
    }
    return profile_doc

def normalize_phone(phone: str) -> str:
    """Normalize phone number by removing spaces, dashes, parentheses, and plus signs for comparison"""
    if not phone:
        return ""
    # Remove all non-digit characters except leading +
    normalized = re.sub(r'[^\d+]', '', str(phone).strip())
    # Remove leading + if present (we'll compare digits only)
    if normalized.startswith('+'):
        normalized = normalized[1:]
    return normalized

def store_profile_document(profile_doc: Dict[str, Any]) -> bool:
    client = None
    try:
        client = get_db_client()
        db = client[db_name]
        trainer_profiles = db["trainer_profiles"]
        
        email = profile_doc.get("email")
        phone = profile_doc.get("phone")
        source_filename = profile_doc.get("source_filename", "unknown")
        
        # Normalize phone for comparison
        normalized_phone = normalize_phone(phone) if phone else None
        
        # Check for existing profile by email OR phone number
        existing_profile = None
        match_criteria = {}
        
        if email:
            existing_profile = trainer_profiles.find_one({"email": email})
            if existing_profile:
                match_criteria = {"email": email}
                logger.warning(f"🔍 Found existing profile by email: {email}")
        
        # If not found by email, check by phone number (exact match first, then normalized)
        if not existing_profile and phone:
            # First try exact match
            existing_profile = trainer_profiles.find_one({"phone": phone})
            if existing_profile:
                match_criteria = {"phone": phone}
                logger.warning(f"🔍 Found existing profile by phone (exact match): {phone}")
            elif normalized_phone:
                # Try to find by normalized phone - check all profiles with phone numbers
                all_profiles_with_phone = trainer_profiles.find({"phone": {"$exists": True, "$ne": None}})
                for profile in all_profiles_with_phone:
                    existing_phone = profile.get("phone")
                    if existing_phone and normalize_phone(existing_phone) == normalized_phone:
                        existing_profile = profile
                        match_criteria = {"phone": existing_phone}  # Use original format for update
                        logger.warning(f"🔍 Found existing profile by phone (normalized match): {phone} matches {existing_phone}")
                        break
        
        # If still not found and no email/phone, try profile_id or source_filename as fallback
        if not existing_profile and not email and not phone:
            logger.warning(f"⚠️ No email or phone found for {source_filename}, using profile_id/source_filename for identification")
            existing_by_id = trainer_profiles.find_one({"profile_id": profile_doc.get("profile_id")})
            existing_by_filename = trainer_profiles.find_one({"source_filename": source_filename})
            
            if existing_by_id or existing_by_filename:
                existing_profile = existing_by_id or existing_by_filename
                match_criteria = {"_id": existing_profile["_id"]}
                logger.warning(f"🔍 Found existing profile by profile_id or source_filename for {source_filename}")
        
        if existing_profile:
            # Update existing profile
            match_by = "email" if email and "email" in match_criteria else ("phone" if phone and "phone" in match_criteria else "profile_id/filename")
            logger.warning(f"🔄 Updating existing profile (matched by {match_by}) for {source_filename}")
            
            # Remove immutable/identity fields from update doc
            # Keep existing _id, profile_id, and uploaded_at
            fields_to_exclude = {"_id", "uploaded_at"}
            update_doc = {k: v for k, v in profile_doc.items() if k not in fields_to_exclude}
            
            # Smart name update logic:
            # 1. If new name is valid and existing name is invalid (N/A, etc.), use new name
            # 2. If new name is invalid and existing name is valid, preserve existing name
            # 3. If both are valid, use new name (update)
            existing_name = existing_profile.get("name")
            new_name = update_doc.get("name")
            
            # Check if names are valid (not None, not empty, not N/A variants)
            invalid_names = ["", "N/A", "n/a", "na", "none", "null"]
            existing_is_valid = existing_name and str(existing_name).strip() not in invalid_names
            new_is_valid = new_name and str(new_name).strip() not in invalid_names
            
            if new_is_valid and not existing_is_valid:
                # New name is valid, existing is invalid - use new name
                logger.warning(f"   ✅ Updating name from invalid '{existing_name}' to valid '{new_name}'")
                update_doc["name"] = new_name
            elif not new_is_valid and existing_is_valid:
                # New name is invalid, existing is valid - preserve existing
                logger.warning(f"   ⚠️ Preserving existing name '{existing_name}' (new name is invalid: '{new_name}')")
                update_doc["name"] = existing_name
            elif new_is_valid and existing_is_valid:
                # Both are valid - use new name (allow updates)
                logger.warning(f"   ✅ Updating name from '{existing_name}' to '{new_name}'")
                update_doc["name"] = new_name
            # If both are invalid, let the update proceed with whatever is in update_doc
            
            # Preserve existing profile_id if it exists
            if existing_profile.get("profile_id"):
                update_doc["profile_id"] = existing_profile["profile_id"]
            
            # Merge email and phone if one is missing in existing but present in new
            if email and not existing_profile.get("email"):
                update_doc["email"] = email
                logger.warning(f"   ✅ Adding missing email: {email}")
            if phone and not existing_profile.get("phone"):
                update_doc["phone"] = phone
                logger.warning(f"   ✅ Adding missing phone: {phone}")
            
            # Always update updated_at
            update_doc["updated_at"] = datetime.utcnow()
            
            # Use the appropriate match criteria for update
            if "_id" in match_criteria:
                trainer_profiles.update_one(
                    {"_id": existing_profile["_id"]},
                    {"$set": update_doc}
                )
            else:
                trainer_profiles.update_one(
                    match_criteria,
                    {"$set": update_doc}
                )
            return True
        else:
            # Insert new profile
            identifier = email or phone or source_filename
            logger.warning(f"➕ Inserting new profile for {identifier}")
            trainer_profiles.insert_one(profile_doc)
            return True
    except Exception as db_err:
        logger.exception(f"❌ Database insert failed for {profile_doc.get('source_filename', 'unknown')}: {db_err}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return False
    finally:
        if client:
            try:
                client.close()
            except Exception:
                pass

def embed_profile_text(profile_doc: Dict[str, Any], text: str) -> None:
    upsert_vector(
        profile_doc["profile_id"],
        text,
        {
            "profile_id": profile_doc["profile_id"],
            "email": profile_doc.get("email"),
            "name": profile_doc.get("name"),
            "skills": profile_doc.get("skills", []),
            "skill_domains": profile_doc.get("skill_domains", []),
            "education": profile_doc.get("education", []),
            "certifications": profile_doc.get("certifications", []),
            "companies": profile_doc.get("companies", []),
            "clients": profile_doc.get("clients", []),
            "experience_years": profile_doc.get("experience_years"),
            "location": profile_doc.get("location"),
            "current_company": profile_doc.get("current_company"),
        }
    )

def process_resume_entry(file_data: Dict[str, Any], uploaded_by_admin: str) -> Dict[str, Any]:
    filename = file_data.get("filename", "unknown")
    result: Dict[str, Any] = {"filename": filename}
    issues: List[str] = []
    
    try:
        content_b64 = file_data.get("content_b64")
        if not content_b64:
            raise ValueError("Missing content_b64 payload")
        original_bytes = base64.b64decode(content_b64)
    except Exception as decode_err:
        logger.exception(f"❌ Base64 decode failed for {filename}: {decode_err}")
        return {
            "filename": filename,
            "status": "failed",
            "error": f"Base64 decode failed: {decode_err}",
            "missing_fields": []
        }
    
    stored_bytes, stored_filename, conversion_issues = prepare_resume_bytes(file_data, filename, original_bytes)
    issues.extend(conversion_issues)
    
    text = ""
    try:
        text = extract_text_from_file(filename, original_bytes)
        if not text and stored_filename != filename:
            text = extract_text_from_file(stored_filename, stored_bytes)
    except Exception as extraction_err:
        logger.exception(f"❌ Text extraction failed for {filename}: {extraction_err}")
        return {
            "filename": filename,
            "status": "failed",
            "error": f"Text extraction failed: {extraction_err}",
            "missing_fields": []
        }
    
    if not text or len(text.strip()) < 10:
        logger.warning(f"⚠️ No text or very little text extracted from {filename} (length: {len(text) if text else 0})")
        # Try to store anyway with minimal data - might be a scanned image or corrupted file
        # But we need at least some text for parsing
        if not text or len(text.strip()) < 10:
            return {
                "filename": filename,
                "status": "failed",
                "error": f"No text extracted from file (extracted {len(text) if text else 0} characters). File may be corrupted, password-protected, or in an unsupported format.",
                "missing_fields": []
            }
    
    try:
        parsed_profile = parse_resume_data(filename, text)
        if not parsed_profile or not isinstance(parsed_profile, dict):
            logger.warning(f"⚠️ OpenAI parsing returned invalid result for {filename}, using defaults")
            parsed_profile = default_parsed_profile()
            issues.append("OpenAI parsing returned invalid result")
    except Exception as parse_err:
        logger.exception(f"❌ OpenAI parsing failed for {filename}: {parse_err}")
        issues.append(f"OpenAI parsing failed: {parse_err}")
        parsed_profile = default_parsed_profile()
    
    # ALWAYS try to extract name from text if it's missing (even if parsing partially succeeded)
    if not parsed_profile.get("name") or (isinstance(parsed_profile.get("name"), str) and parsed_profile.get("name").strip().lower() in ["", "n/a", "na"]):
        # Try to extract name from first few lines
        lines = text.split('\n')[:10]  # Check more lines
        for line in lines:
            line = line.strip()
            # Skip empty lines, email addresses, URLs, phone numbers, addresses
            if line and len(line.split()) <= 5 and len(line) > 2:
                # Skip if it looks like email, URL, phone, or address
                if any(char in line for char in ['@', 'http', 'www', '+', '(', ')']) or re.search(r'\d{10,}', line):
                    continue
                # Skip common header words
                if line.lower() in ['resume', 'cv', 'curriculum vitae', 'contact', 'phone', 'email', 'address']:
                    continue
                # This might be a name
                parsed_profile["name"] = line
                issues.append("Name extracted from text fallback")
                logger.warning(f"✅ Extracted name '{line}' from text fallback for {filename}")
                break
    
    if not parsed_profile.get("email"):
        fallback_email = extract_email_fallback(text)
        if fallback_email:
            parsed_profile["email"] = fallback_email
            issues.append("Email inferred via fallback regex")
        else:
            # Generate a fallback email based on filename or profile_id
            logger.warning(f"⚠️ No email found for {filename}, will use profile_id for identification")
            issues.append("No email found in resume")
    
    missing_fields = identify_missing_fields(parsed_profile)
    skill_domains = infer_skill_domains(parsed_profile.get("skills", []), text)
    
    profile_doc = build_profile_document(
        parsed_profile,
        text,
        filename,
        stored_filename,
        stored_bytes,
        uploaded_by_admin,
        missing_fields,
        issues.copy(),
        skill_domains
    )
    
    # Log the name that will be stored
    final_name = profile_doc.get("name")
    if final_name:
        logger.warning(f"📝 Profile document created for {filename} with name: '{final_name}'")
    else:
        logger.warning(f"⚠️ Profile document created for {filename} with NO name (None/empty)")
    
    # Retry database insert up to 3 times
    stored_successfully = False
    max_retries = 3
    for attempt in range(max_retries):
        try:
            stored_successfully = store_profile_document(profile_doc)
            if stored_successfully:
                logger.warning(f"✅ Successfully stored profile for {filename} (attempt {attempt + 1})")
                break
        except Exception as store_err:
            logger.error(f"❌ Exception in store_profile_document for {filename} (attempt {attempt + 1}): {store_err}")
            stored_successfully = False
        
        if attempt < max_retries - 1:
            logger.warning(f"⚠️ Database insert attempt {attempt + 1} failed for {filename}, retrying...")
            import time
            time.sleep(0.5 * (attempt + 1))  # Exponential backoff
    
    if not stored_successfully:
        logger.error(f"❌ Database insert failed after {max_retries} attempts for {filename}")
        return {
            "filename": filename,
            "status": "failed",
            "error": f"Database insert failed after {max_retries} attempts. Check MongoDB connection and logs.",
            "missing_fields": missing_fields
        }
    
    try:
        embed_profile_text(profile_doc, text)
    except Exception as embed_err:
        logger.exception(f"⚠️ Embedding failed for {filename}: {embed_err}")
        issues.append(f"Embedding failed: {embed_err}")
    
    status = "partial" if missing_fields or issues else "ok"
    result.update({
        "status": status,
        "profile_id": profile_doc["profile_id"],
        "missing_fields": missing_fields,
    })
    if issues:
        result["issues"] = issues
    return result

@cel.task(bind=True, name="tasks.bulk_import_task")
def bulk_import_task(self, files_payload, uploaded_by_admin):
    """
    Bulk import task - processes multiple resume files
    """
    # Safe fallback for is_aborted() method
    if not hasattr(self, "is_aborted"):
        self.is_aborted = lambda: False
    
    try:
        logger.warning("\n" + "=" * 80)
        logger.warning("🚀 STARTING BULK IMPORT TASK (resilient pipeline)")
        logger.warning("=" * 80)
        
        files_payload = files_payload or []
        total = len(files_payload)
        
        logger.warning(f"Total files: {total}")
        logger.warning(f"Uploaded by: {uploaded_by_admin}")
        logger.warning(f"Task ID: {self.request.id}")
        logger.warning("=" * 80 + "\n")
        
        if total == 0:
            summary = {
                "imported": 0,
                "failed": 0,
                "failed_files": [],
                "partial_imports": 0,
                "timestamp": datetime.utcnow().isoformat(),
                "failed_details": []
            }
            return summary
        
        results: List[Dict[str, Any]] = []
        try:
            self.update_state(state="PROGRESS", meta={"current": 0, "total": total, "status": "Starting bulk processing"})
        except Exception:
            pass
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_filename = {
                executor.submit(process_resume_entry, file_data, uploaded_by_admin): file_data.get("filename", f"file_{idx}")
                for idx, file_data in enumerate(files_payload, start=1)
            }
            
            for index, future in enumerate(as_completed(future_to_filename), start=1):
                # Check if task has been revoked/cancelled
                if self.is_aborted():
                    logger.warning(f"🛑 Task {self.request.id} has been cancelled. Stopping processing at file {index}/{total}")
                    # Mark remaining files as cancelled
                    remaining_files = total - index + 1
                    for remaining_future in future_to_filename:
                        if remaining_future != future and not remaining_future.done():
                            remaining_filename = future_to_filename[remaining_future]
                            results.append({
                                "filename": remaining_filename,
                                "status": "cancelled",
                                "error": "Upload was cancelled",
                                "missing_fields": []
                            })
                    break
                
                filename = future_to_filename[future]
                try:
                    result = future.result()
                except Exception as unexpected_err:
                    logger.exception(f"❌ Unexpected error while processing {filename}: {unexpected_err}")
                    result = {
                        "filename": filename,
                        "status": "failed",
                        "error": str(unexpected_err),
                        "missing_fields": []
                    }
                results.append(result)
                
                status = result.get("status", "failed")
                if status == "ok":
                    logger.warning(f"✅ Processed file {index}/{total}: {filename}")
                elif status == "partial":
                    logger.warning(f"✅ Processed file {index}/{total}: {filename} (partial)")
                    missing = result.get("missing_fields", [])
                    if missing:
                        logger.warning(f"⚠️ Missing fields for {filename}: {', '.join(missing)}")
                    for note in result.get("issues", []):
                        logger.warning(f"⚠️ {filename}: {note}")
                else:
                    logger.warning(f"❌ Failed file {index}/{total}: {filename} - {result.get('error', 'Unknown error')}")
                
                try:
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "current": index,
                            "total": total,
                            "status": f"Processed {index}/{total} files"
                        }
                    )
                except Exception:
                    pass
        
        # Check if task was cancelled
        if self.is_aborted():
            cancelled_count = sum(1 for r in results if r.get("status") == "cancelled")
            summary = {
                "imported": 0,
                "failed": len(results) - cancelled_count,
                "cancelled": cancelled_count,
                "failed_files": [r.get("filename", "unknown") for r in results if r.get("status") == "failed"],
                "partial_imports": 0,
                "timestamp": datetime.utcnow().isoformat(),
                "failed_details": [
                    {"filename": r.get("filename", "unknown"), "error": r.get("error", "Unknown error")}
                    for r in results if r.get("status") == "failed"
                ],
                "cancelled": True,
                "message": f"Upload was cancelled. {cancelled_count} file(s) were not processed."
            }
            try:
                self.update_state(state="REVOKED", meta=summary)
            except Exception:
                pass
            logger.warning("=" * 80)
            logger.warning(f"🛑 BULK IMPORT TASK CANCELLED")
            logger.warning(f"   Processed: {len(results) - cancelled_count}, Cancelled: {cancelled_count}")
            logger.warning("=" * 80 + "\n")
            return summary
        
        imported_count = sum(1 for r in results if r.get("status") in {"ok", "partial"})
        failed_records = [r for r in results if r.get("status") == "failed"]
        failed_files = [r.get("filename", "unknown") for r in failed_records]
        failed_details = [
            {"filename": r.get("filename", "unknown"), "error": r.get("error", "Unknown error")}
            for r in failed_records
        ]
        partial_imports = sum(1 for r in results if r.get("status") == "partial")
        
        logger.warning("=" * 80)
        logger.warning(f"✅ Bulk import complete — Imported (including partial): {imported_count}/{total}")
        logger.warning(f"⚠️ Partial imports: {partial_imports}")
        if failed_files:
            logger.warning(f"⚠️ Failed files ({len(failed_files)}):")
            for item in failed_details:
                logger.warning(f"   ❌ {item['filename']}: {item['error']}")
        else:
            logger.warning("🎉 No failed files")
        logger.warning("=" * 80)
        
        # Clear embedding cache after successful bulk import to ensure new resumes can be found
        if imported_count > 0:
            try:
                clear_embedding_cache()
                logger.warning(f"🗑️ Cleared embedding cache - {imported_count} new resume(s) uploaded")
            except Exception as cache_err:
                logger.warning(f"⚠️ Failed to clear embedding cache: {cache_err}")
        
        summary = {
            "imported": imported_count,
            "failed": len(failed_files),
            "failed_files": failed_files,
            "partial_imports": partial_imports,
            "timestamp": datetime.utcnow().isoformat(),
            "failed_details": failed_details
        }
        
        try:
            self.update_state(state="SUCCESS", meta=summary)
        except Exception:
            pass
        
        logger.warning("=" * 80)
        logger.warning(f"✅ BULK IMPORT TASK COMPLETED")
        logger.warning(f"   Imported: {imported_count}, Failed: {len(failed_files)}")
        logger.warning("=" * 80 + "\n")
        
        return summary
    except Exception as e:
        logger.exception(f"❌ CRITICAL ERROR in bulk_import_task: {e}")
        import traceback
        logger.error(traceback.format_exc())
        error_summary = {
            "imported": 0,
            "failed": total if 'total' in locals() else 0,
            "failed_files": [],
            "partial_imports": 0,
            "timestamp": datetime.utcnow().isoformat(),
            "failed_details": [{"error": str(e), "traceback": traceback.format_exc()}]
        }
        try:
            self.update_state(state="FAILURE", meta=error_summary)
        except Exception:
            pass
        raise  # Re-raise to mark task as failed
