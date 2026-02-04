import openai
import os
import json
import re
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key or openai_api_key.startswith("sk-xxxxx") or len(openai_api_key) < 20:
    print("⚠️  WARNING: OPENAI_API_KEY is not set or appears to be a placeholder!")
    print("   Please set OPENAI_API_KEY in your .env file or environment variables.")
    print("   Get your API key from: https://platform.openai.com/account/api-keys")
    print("   Example .env file location: backend/.env or project root .env")

client = openai.OpenAI(api_key=openai_api_key)


def robust_json_parse(json_str: str) -> dict:
    """
    Robustly parse JSON with multiple fallback strategies for handling
    truncated, malformed, or incomplete responses.
    """
    if not json_str or not json_str.strip():
        return {}
    
    txt = json_str.strip()
    
    # Remove markdown code blocks if present
    txt = re.sub(r"^```json\s*", "", txt, flags=re.MULTILINE)
    txt = re.sub(r"^```\s*", "", txt, flags=re.MULTILINE)
    txt = re.sub(r"```$", "", txt, flags=re.MULTILINE)
    txt = txt.strip()
    
    # Find the first { and extract JSON object
    start_idx = txt.find('{')
    if start_idx != -1:
        # Try to find matching closing brace
        brace_count = 0
        end_idx = start_idx
        for i in range(start_idx, len(txt)):
            if txt[i] == '{':
                brace_count += 1
            elif txt[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_idx = i + 1
                    break
        if end_idx > start_idx:
            txt = txt[start_idx:end_idx]
        elif start_idx != -1:
            txt = txt[start_idx:]
    
    # Strategy 1: Direct parse
    try:
        return json.loads(txt)
    except json.JSONDecodeError as e:
        pass
    
    # Strategy 2: Fix trailing commas and common issues
    txt_fixed = re.sub(r',(\s*[}\]])', r'\1', txt)  # Remove trailing commas
    txt_fixed = re.sub(r',\s*}', '}', txt_fixed)
    txt_fixed = re.sub(r',\s*]', ']', txt_fixed)
    
    try:
        return json.loads(txt_fixed)
    except json.JSONDecodeError as e:
        pass
    
    # Strategy 3: Handle "Expecting value" errors - reconstruct incomplete values
    try:
        # Try parsing again to get the error for this strategy
        json.loads(txt_fixed)
    except json.JSONDecodeError as e3:
        error_pos = e3.pos if hasattr(e3, 'pos') else len(txt_fixed)
        
        # If error is "Expecting value", try to close incomplete structures
        if "Expecting value" in str(e3):
            # Find the last complete property
            last_comma = txt_fixed.rfind(',', 0, error_pos)
            if last_comma > 0:
                # Extract up to last complete property and close the object
                truncated_txt = txt_fixed[:last_comma + 1]
                # Find the last valid property name before the comma
                before_comma = txt_fixed[:last_comma].rstrip()
                last_colon = before_comma.rfind(':')
                if last_colon > 0:
                    last_quote = before_comma.rfind('"', 0, last_colon)
                    if last_quote > 0:
                        # Try to close after the last complete property
                        # Remove trailing comma and close the object
                        truncated_txt = txt_fixed[:last_comma].rstrip().rstrip(',') + '}'
                        try:
                            return json.loads(truncated_txt)
                        except:
                            pass
    except:
        pass
    
    # Strategy 4: Handle unterminated strings
    try:
        # Try parsing again to get the error for this strategy
        json.loads(txt_fixed)
    except json.JSONDecodeError as e4:
        if "Unterminated string" in str(e4) and hasattr(e4, 'pos'):
            error_pos = e4.pos
            # Find the start of the unterminated string
            last_quote_before_error = txt.rfind('"', 0, error_pos)
            if last_quote_before_error > 0:
                # Check if it's an opening quote (not escaped)
                if last_quote_before_error == 0 or txt[last_quote_before_error - 1] != '\\':
                    # Close the string and the object
                    truncated_txt = txt[:last_quote_before_error] + '"}'
                    # Make sure we close any arrays too
                    truncated_txt = re.sub(r'(\[.*?)([,\]])', r'\1]\2', truncated_txt)
                    try:
                        return json.loads(truncated_txt)
                    except:
                        pass
    except:
        pass
    
    # Strategy 5: Extract all complete key-value pairs using regex
    partial_result = {}
    
    # Extract complete fields (those with both key and value properly closed)
    patterns = {
        'name': r'"name"\s*:\s*"([^"]*)"',
        'email': r'"email"\s*:\s*"([^"]*)"',
        'phone': r'"phone"\s*:\s*"([^"]*)"',
        'location': r'"location"\s*:\s*"([^"]*)"',
        'current_company': r'"current_company"\s*:\s*"([^"]*)"',
        'experience_years': r'"experience_years"\s*:\s*(\d+(?:\.\d+)?)',
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, txt)
        if match:
            if key == 'experience_years':
                try:
                    partial_result[key] = float(match.group(1))
                except:
                    pass
            else:
                partial_result[key] = match.group(1)
    
    # Extract skills array (handle truncated arrays)
    skills_matches = re.findall(r'"skills"\s*:\s*\[(.*?)(?:\]|$)', txt, re.DOTALL)
    if skills_matches:
        skills_str = skills_matches[0]
        skills = re.findall(r'"([^"]+)"', skills_str)
        if skills:
            partial_result['skills'] = skills
    
    # Extract companies array
    companies_matches = re.findall(r'"companies"\s*:\s*\[(.*?)(?:\]|$)', txt, re.DOTALL)
    if companies_matches:
        companies_str = companies_matches[0]
        companies = re.findall(r'"([^"]+)"', companies_str)
        if companies:
            partial_result['companies'] = companies
    
    # Extract certifications array
    certs_matches = re.findall(r'"certifications"\s*:\s*\[(.*?)(?:\]|$)', txt, re.DOTALL)
    if certs_matches:
        certs_str = certs_matches[0]
        certs = re.findall(r'"([^"]+)"', certs_str)
        if certs:
            partial_result['certifications'] = certs
    
    # If we extracted some data, return it; otherwise return empty dict
    if partial_result:
        logger.warning(f"✅ Extracted partial JSON data: {list(partial_result.keys())}")
        return partial_result
    
    logger.warning(f"⚠️ Could not parse JSON even with fallback strategies")
    return {}

async def parse_resume_text(text: str) -> dict:
    prompt = f"""Extract the following information from this resume text and return it as a JSON object with the following structure:
{{
    "name": "Full name of the person (only the name, no address or location details)",
    "email": "Email address",
    "phone": "Phone number if available (format: +country code and number, or just number)",
    "location": "City, State/Province, Country (e.g., 'Mangalore, Karnataka, India' or 'Bangalore, India')",
    "skills": ["skill1", "skill2", ...],
    "experience_years": number of years of experience (as a number, not text),
    "education": "Education details or array of education objects",
    "certifications": ["cert1", "cert2", ...],
    "companies": ["Company 1", "Company 2", ...],
    "current_company": "Current company name if working, or empty string",
    "clients": ["Client 1", "Client 2", ...]
}}

Extract:
- "location": City and state/province where the person is located (extract from address, contact info, or work location mentioned in resume). If location is not found or not mentioned, return empty string "".
- "companies": List of all companies/organizations the person has worked for (past and present)
- "current_company": Name of the company they are currently working at (if employed), or empty string if not specified
- "clients": List of client companies they have worked with (if mentioned in resume)

Note: All fields are optional. Always include every field in the JSON output. If information is not available, use null for scalar values (e.g., name, email, phone, location, experience_years, current_company) and empty array [] for list fields (skills, education, certifications, companies, clients).

Resume text:
{text}

Return only valid JSON, no additional text or markdown."""
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,  # Increased to handle large resumes with many skills
            response_format={"type": "json_object"}
        )
        raw_response = resp.choices[0].message.content
        
        txt = raw_response.strip()
        txt = re.sub(r"^```json\s*", "", txt, flags=re.MULTILINE)
        txt = re.sub(r"^```\s*", "", txt, flags=re.MULTILINE)
        txt = re.sub(r"```$", "", txt, flags=re.MULTILINE)
        txt = txt.strip()
        
        start_idx = txt.find('{')
        if start_idx != -1:
            brace_count = 0
            end_idx = start_idx
            for i in range(start_idx, len(txt)):
                if txt[i] == '{':
                    brace_count += 1
                elif txt[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            if end_idx > start_idx:
                txt = txt[start_idx:end_idx]
            elif start_idx != -1:
                txt = txt[start_idx:]
        
        # Use robust JSON parsing function - handles all error cases
        parsed_result = robust_json_parse(txt)
        
        if not parsed_result:
            logger.warning(f"⚠️ JSON parsing failed completely for resume, returning empty dict")
            return {}
        
        if "name" in parsed_result and parsed_result["name"]:
            name = str(parsed_result["name"]).strip()
            address_patterns = [
                r'\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Circle|Cir|Court|Ct|Place|Pl|Way|Parkway|Pkwy).*',
                r'\s+\d+\s+.*',
                r'\s+(?:Bantwal|taluk|district|state|country|pin|pincode|zip).*',
                r'\s+[A-Z]{2}\s+\d{5,6}.*',
            ]
            for pattern in address_patterns:
                name = re.sub(pattern, '', name, flags=re.IGNORECASE)
            name_parts = name.split()
            if len(name_parts) > 3:
                name = ' '.join(name_parts[:3])
            parsed_result["name"] = name.strip()
        
        return parsed_result
    except Exception as e:
        print(f"Error parsing resume: {e}")
        return {}

def parse_resume_text_sync(text: str) -> dict:
    prompt = f"""Extract the following information from this resume text and return it as a JSON object with the following structure:
{{
    "name": "Full name of the person (only the name, no address or location details)",
    "email": "Email address",
    "phone": "Phone number if available (format: +country code and number, or just number)",
    "location": "City, State/Province, Country (e.g., 'Mangalore, Karnataka, India' or 'Bangalore, India')",
    "skills": ["skill1", "skill2", ...],
    "experience_years": number of years of experience (as a number, not text),
    "education": "Education details or array of education objects",
    "certifications": ["cert1", "cert2", ...],
    "companies": ["Company 1", "Company 2", ...],
    "current_company": "Current company name if working, or empty string",
    "clients": ["Client 1", "Client 2", ...]
}}

Extract:
- "location": City and state/province where the person is located (extract from address, contact info, or work location mentioned in resume). If location is not found or not mentioned, return empty string "".
- "companies": List of all companies/organizations the person has worked for (past and present)
- "current_company": Name of the company they are currently working at (if employed), or empty string if not specified
- "clients": List of client companies they have worked with (if mentioned in resume)

Note: All fields are optional. Always include every field in the JSON output. If information is not available, use null for scalar values (e.g., name, email, phone, location, experience_years, current_company) and empty array [] for list fields (skills, education, certifications, companies, clients).

Resume text:
{text}

Return only valid JSON, no additional text or markdown."""
    try:
        print("📤 Sending request to OpenAI API...")
        print(f"   Model: gpt-4o-mini")
        print(f"   Text length: {len(text)} characters")
        print(f"   Prompt length: {len(prompt)} characters")
        
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,  # Increased to handle large resumes with many skills
            response_format={"type": "json_object"}
        )
        
        raw_response = resp.choices[0].message.content
        print(f"📥 Received raw response from OpenAI (length: {len(raw_response)} chars):")
        print(f"   Raw response: {raw_response[:500]}...")
        
        txt = raw_response.strip()
        txt = re.sub(r"^```json\s*", "", txt, flags=re.MULTILINE)
        txt = re.sub(r"^```\s*", "", txt, flags=re.MULTILINE)
        txt = re.sub(r"```$", "", txt, flags=re.MULTILINE)
        txt = txt.strip()
        
        if not txt:
            print("❌ Error: Empty response from OpenAI")
            return {}
        
        start_idx = txt.find('{')
        if start_idx != -1:
            brace_count = 0
            end_idx = start_idx
            for i in range(start_idx, len(txt)):
                if txt[i] == '{':
                    brace_count += 1
                elif txt[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            if end_idx > start_idx:
                txt = txt[start_idx:end_idx]
            elif start_idx != -1:
                txt = txt[start_idx:]
        
        # Use robust JSON parsing function
        parsed_result = robust_json_parse(txt)
        if not parsed_result:
            # Fallback to old error handling if robust parsing fails
            try:
                parsed_result = json.loads(txt)
            except json.JSONDecodeError as json_err:
                error_msg = str(json_err)
                is_unterminated_string = "Unterminated string" in error_msg
                error_msg = str(json_err)
                is_unterminated_string = "Unterminated string" in error_msg
                logger.warning(f"❌ JSON decode error: {json_err}")
                logger.warning(f"   Attempted to parse: {txt[:500]}...")
                if is_unterminated_string:
                    logger.warning(f"   ⚠️ Unterminated string detected - response likely truncated by max_tokens limit")
                    logger.warning(f"   📍 Error position: char {json_err.pos if hasattr(json_err, 'pos') else 'unknown'}")
                # Try to close the unterminated string and parse what we have
                if hasattr(json_err, 'pos') and json_err.pos < len(txt):
                    truncate_pos = json_err.pos
                    # Find the start of the unterminated string
                    last_quote_before_truncate = txt.rfind('"', 0, truncate_pos)
                    if last_quote_before_truncate > 0:
                        # Check if this quote is an opening quote (not escaped)
                        check_pos = last_quote_before_truncate - 1
                        if check_pos < 0 or txt[check_pos] != '\\':
                            # Try to extract everything before this string and close it
                            txt_unterminated_fixed = txt[:last_quote_before_truncate] + '"'
                            # Find the key for this unterminated string and close it properly
                            # Look backwards for the key name
                            key_start = txt.rfind('"', 0, last_quote_before_truncate - 1)
                            if key_start > 0:
                                key_end = txt.find('"', key_start + 1)
                                if key_end > 0:
                                    # Try to close the string value and the object
                                    txt_unterminated_fixed = txt[:last_quote_before_truncate] + '"}'
                                    try:
                                        fixed_parsed = json.loads(txt_unterminated_fixed)
                                        if fixed_parsed:
                                            print(f"   ✅ Successfully recovered JSON by closing unterminated string")
                                            return fixed_parsed
                                    except:
                                        pass  # Continue with normal cleanup
            
            # Try multiple cleanup strategies
            txt_fixed = re.sub(r',\s*}', '}', txt)
            txt_fixed = re.sub(r',\s*]', ']', txt_fixed)
            txt_fixed = re.sub(r'([{,]\s*)([^",{\[\s][^,}\]]*?)(\s*[,}])', r'\1"\2"\3', txt_fixed)  # Quote unquoted keys
            try:
                parsed_result = json.loads(txt_fixed)
            except:
                # Try one more time with more aggressive cleanup
                try:
                    # Remove any trailing commas and fix common issues
                    txt_fixed2 = re.sub(r',(\s*[}\]])', r'\1', txt_fixed)
                    txt_fixed2 = re.sub(r'(["\'])([^"\']*?)\1\s*:', r'"\2":', txt_fixed2)  # Normalize quotes
                    parsed_result = json.loads(txt_fixed2)
                except:
                    print("❌ Could not parse JSON even after multiple cleanup attempts")
                    print(f"   Raw response length: {len(raw_response)}")
                    print(f"   Cleaned text length: {len(txt)}")
                    # Last resort: Extract what we can from partial JSON
                    print("⚠️ Attempting partial extraction from truncated JSON...")
                    if is_unterminated_string:
                        print(f"   ⚠️ Handling unterminated string error at char {json_err.pos if hasattr(json_err, 'pos') else 'unknown'}")
                    partial_result = {}
                    
                    # Try to find where the unterminated string starts and close it
                    # This helps us extract more data before the truncation point
                    txt_for_extraction = txt
                    if hasattr(json_err, 'pos') and json_err.pos < len(txt):
                        # Try to close the unterminated string and continue extraction
                        truncate_pos = json_err.pos
                        # Find the start of the unterminated string
                        last_quote_before_truncate = txt.rfind('"', 0, truncate_pos)
                        if last_quote_before_truncate > 0:
                            # Check if this quote is an opening quote (not escaped)
                            check_pos = last_quote_before_truncate - 1
                            if check_pos < 0 or txt[check_pos] != '\\':
                                # Try to extract everything before this string
                                txt_for_extraction = txt[:last_quote_before_truncate] + '"}'
                                # Try one more JSON parse with the fixed string
                                try:
                                    fixed_parsed = json.loads(txt_for_extraction)
                                    if fixed_parsed:
                                        print(f"   ✅ Successfully recovered JSON by closing unterminated string")
                                        return fixed_parsed
                                except:
                                    pass  # Continue with regex extraction
                    
                    # Extract name if present (even from unterminated strings)
                    name_match = re.search(r'"name"\s*:\s*"([^"]*)"', txt)
                    if name_match:
                        partial_result["name"] = name_match.group(1)
                        print(f"   ✅ Name extracted: '{partial_result['name']}'")
                    # Also try to extract name from unterminated string (before truncation)
                    elif '"name"' in txt:
                        # Find name field and extract value even if string is unterminated
                        name_start = txt.find('"name"')
                        if name_start != -1:
                            colon_pos = txt.find(':', name_start)
                            if colon_pos != -1:
                                quote_start = txt.find('"', colon_pos)
                                if quote_start != -1:
                                    # Extract until end or truncation
                                    name_value = txt[quote_start+1:].split('"')[0].split(',')[0].split('}')[0].split('\n')[0].strip()
                                    if name_value and len(name_value) > 0:
                                        partial_result["name"] = name_value
                                        print(f"   ✅ Name extracted (from unterminated string): '{name_value}'")
                    
                    # Extract email if present
                    email_match = re.search(r'"email"\s*:\s*"([^"]*)"', txt)
                    if email_match:
                        partial_result["email"] = email_match.group(1)
                        print(f"   ✅ Email extracted: '{partial_result['email']}'")
                    # Extract phone if present
                    phone_match = re.search(r'"phone"\s*:\s*"([^"]*)"', txt)
                    if phone_match:
                        partial_result["phone"] = phone_match.group(1)
                    # Extract location if present
                    location_match = re.search(r'"location"\s*:\s*"([^"]*)"', txt)
                    if location_match:
                        partial_result["location"] = location_match.group(1)
                    # Extract experience_years if present
                    exp_match = re.search(r'"experience_years"\s*:\s*(\d+(?:\.\d+)?)', txt)
                    if exp_match:
                        try:
                            partial_result["experience_years"] = float(exp_match.group(1))
                        except:
                            pass
                    # Extract skills array (partial) - handle truncated arrays
                    skills_match = re.search(r'"skills"\s*:\s*\[(.*)', txt, re.DOTALL)
                    if skills_match:
                        skills_str = skills_match.group(1)
                        skills = re.findall(r'"([^"]+)"', skills_str)
                        if skills:
                            partial_result["skills"] = skills
                            print(f"   ✅ Extracted {len(skills)} skills")
                    # Extract current_company if present
                    company_match = re.search(r'"current_company"\s*:\s*"([^"]*)"', txt)
                    if company_match:
                        partial_result["current_company"] = company_match.group(1)
                    # Extract companies array (partial)
                    companies_match = re.search(r'"companies"\s*:\s*\[(.*)', txt, re.DOTALL)
                    if companies_match:
                        companies_str = companies_match.group(1)
                        companies = re.findall(r'"([^"]+)"', companies_str)
                        if companies:
                            partial_result["companies"] = companies
                    if partial_result:
                        print(f"   ✅ Extracted partial data (sync): {list(partial_result.keys())}")
                        return partial_result
                    return {}
        
        if "name" in parsed_result and parsed_result["name"]:
            name = str(parsed_result["name"]).strip()
            address_patterns = [
                r'\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Circle|Cir|Court|Ct|Place|Pl|Way|Parkway|Pkwy).*',
                r'\s+\d+\s+.*',
                r'\s+(?:Bantwal|taluk|district|state|country|pin|pincode|zip).*',
                r'\s+[A-Z]{2}\s+\d{5,6}.*',
            ]
            for pattern in address_patterns:
                name = re.sub(pattern, '', name, flags=re.IGNORECASE)
            name_parts = name.split()
            if len(name_parts) > 3:
                name = ' '.join(name_parts[:3])
            parsed_result["name"] = name.strip()
        
        print(f"✅ Successfully parsed JSON response")
        return parsed_result
    except openai.APIError as api_err:
        print(f"❌ OpenAI API error: {api_err}")
        print(f"   Error type: {type(api_err).__name__}")
        print(f"   Error message: {str(api_err)}")
        # Return empty dict but log the error
        return {}
    except Exception as e:
        print(f"❌ Error parsing resume: {e}")
        print(f"   Error type: {type(e).__name__}")
        import traceback
        print(f"   Traceback: {traceback.format_exc()}")
        return {}

def parse_jd_text(text: str) -> dict:
    
    prompt = f"""Extract the following information from this job description and return it as a JSON object:
{{
    "skills": ["required skill1", "required skill2", ...],
    "related_skills": {{
        "skill1": ["related skill", "synonym", ...],
        "skill2": ["related skill", ...]
    }},
    "experience_years": number of years required (as a number),
    "domain": "Industry or domain name",
    "requirements": "Key requirements summary"
}}

Job description text:
{text}

Return only valid JSON."""
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )
        txt = re.sub(r"```json|```", "", resp.choices[0].message.content).strip()
        # Use robust JSON parsing
        parsed = robust_json_parse(txt)
        if not parsed:
            # Fallback
            try:
                parsed = json.loads(txt)
            except:
                parsed = {}
        
        skills = parsed.get("skills", [])
        related_skills_map = parsed.get("related_skills", {})
        
        expanded_skills = list(skills)
        for skill, related_list in related_skills_map.items():
            if isinstance(related_list, list):
                expanded_skills.extend(related_list)
        
        return {
            "skills": skills,
            "related_skills": related_skills_map,
            "expanded_skills": expanded_skills,
            "experience_years": parsed.get("experience_years"),
            "domain": parsed.get("domain", ""),
            "requirements": parsed.get("requirements", "")
        }
    except Exception as e:
        print(f"Error parsing JD: {e}")
        return {"skills": [], "related_skills": {}, "expanded_skills": [], "experience_years": None, "domain": "", "requirements": ""}
