"""
Security utilities for authentication and authorization
Implements comprehensive security features for the application
"""
import bcrypt
import re
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from fastapi import HTTPException, Request
from collections import defaultdict
import os
import hashlib
import secrets
import time
from functools import wraps
from fastapi import Depends, Header
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, RedirectResponse
import logging

logger = logging.getLogger(__name__)

# ==================== PASSWORD SECURITY ====================

# Bcrypt rounds (12 minimum for security)
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))

def hash_password(password: str) -> str:
    """Hash password with bcrypt using 12+ rounds"""
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash"""
    try:
        plain_bytes = plain_password.encode('utf-8')
        if len(plain_bytes) > 72:
            plain_bytes = plain_bytes[:72]
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception as e:
        logger.error(f"Error in verify_password: {e}")
        return False

def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validate password strength"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if len(password) > 72:
        return False, "Password must be less than 72 characters"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character"
    return True, "Password is strong"

# ==================== JWT SECURITY ====================

def validate_jwt_secret(secret: str) -> bool:
    """Validate JWT secret is strong enough (32+ chars)"""
    if not secret:
        return False
    if len(secret) < 32:
        return False
    return True

# ==================== INPUT SANITIZATION ====================

# MongoDB operators that should be sanitized
MONGO_OPERATORS = [
    "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists",
    "$regex", "$where", "$text", "$search", "$near", "$geoWithin",
    "$and", "$or", "$not", "$nor", "$all", "$elemMatch", "$size",
    "$type", "$mod", "$slice", "$bitsAllSet", "$bitsAnySet", "$bitsAllClear",
    "$bitsAnyClear", "$comment", "$explain", "$hint", "$max", "$min",
    "$natural", "$orderby", "$query", "$returnKey", "$showDiskLoc",
    "$snapshot", "$meta", "$projection", "$isolated"
]

def sanitize_input(value: Any) -> Any:
    """Sanitize input to prevent NoSQL injection"""
    if isinstance(value, str):
        # Remove MongoDB operators
        sanitized = value
        for op in MONGO_OPERATORS:
            sanitized = sanitized.replace(op, "")
        # Remove null bytes and other dangerous characters
        sanitized = sanitized.replace("\x00", "")
        sanitized = sanitized.replace("\r", "")
        sanitized = sanitized.replace("\n", "")
        # Remove leading/trailing whitespace
        sanitized = sanitized.strip()
        return sanitized
    elif isinstance(value, dict):
        return {k: sanitize_input(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [sanitize_input(item) for item in value]
    return value

def sanitize_email(email: str) -> str:
    """Sanitize and validate email"""
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    email = email.strip().lower()
    email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    if not email_pattern.match(email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    return sanitize_input(email)

def sanitize_query_string(query: str) -> str:
    """Sanitize search query strings"""
    if not query:
        return ""
    # Remove dangerous characters and MongoDB operators
    sanitized = sanitize_input(query)
    # Limit length
    if len(sanitized) > 500:
        sanitized = sanitized[:500]
    return sanitized

# ==================== RATE LIMITING ====================

# In-memory rate limiting (use Redis in production)
_rate_limit_store: Dict[str, Dict[str, Any]] = defaultdict(dict)

def get_rate_limit_key(identifier: str, endpoint: str) -> str:
    """Get rate limit key"""
    return f"{identifier}:{endpoint}"

def check_rate_limit(
    identifier: str,
    endpoint: str,
    max_requests: int = 5,
    window_seconds: int = 60
) -> Tuple[bool, int]:
    """
    Check if request exceeds rate limit
    Returns: (allowed, remaining_attempts)
    """
    key = get_rate_limit_key(identifier, endpoint)
    now = time.time()
    
    # Get current rate limit data
    rate_data = _rate_limit_store[key]
    
    # Clean old entries
    if "requests" in rate_data:
        rate_data["requests"] = [
            req_time for req_time in rate_data["requests"]
            if now - req_time < window_seconds
        ]
    else:
        rate_data["requests"] = []
    
    # Check if limit exceeded
    request_count = len(rate_data["requests"])
    if request_count >= max_requests:
        return False, 0
    
    # Add current request
    rate_data["requests"].append(now)
    remaining = max_requests - request_count - 1
    
    return True, remaining

def get_client_identifier(request: Request) -> str:
    """Get client identifier for rate limiting"""
    # Try to get IP address
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            ip = real_ip
        else:
            ip = request.client.host if request.client else "unknown"
    return ip

# ==================== ACCOUNT LOCKOUT ====================

# Account lockout storage (use Redis in production)
_account_lockouts: Dict[str, Dict[str, Any]] = {}

MAX_FAILED_ATTEMPTS = int(os.getenv("MAX_FAILED_ATTEMPTS", "5"))
LOCKOUT_DURATION_MINUTES = int(os.getenv("LOCKOUT_DURATION_MINUTES", "15"))

def record_failed_login(email: str, role: str = "unknown"):
    """Record a failed login attempt"""
    key = f"{role}:{email}"
    now = datetime.utcnow()
    
    if key not in _account_lockouts:
        _account_lockouts[key] = {
            "attempts": 0,
            "last_attempt": now,
            "locked_until": None
        }
    
    lockout_data = _account_lockouts[key]
    
    # Check if lockout expired
    if lockout_data["locked_until"] and now < lockout_data["locked_until"]:
        # Still locked
        return
    
    # Reset if lockout expired
    if lockout_data["locked_until"] and now >= lockout_data["locked_until"]:
        lockout_data["attempts"] = 0
        lockout_data["locked_until"] = None
    
    # Increment attempts
    lockout_data["attempts"] += 1
    lockout_data["last_attempt"] = now
    
    # Lock account if threshold reached
    if lockout_data["attempts"] >= MAX_FAILED_ATTEMPTS:
        lockout_data["locked_until"] = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        logger.warning(f"Account locked: {email} (role: {role}) after {lockout_data['attempts']} failed attempts")
    
    # Reset attempts if enough time passed (30 minutes)
    if (now - lockout_data["last_attempt"]).total_seconds() > 1800:
        lockout_data["attempts"] = 0

def clear_failed_logins(email: str, role: str = "unknown"):
    """Clear failed login attempts (on successful login)"""
    key = f"{role}:{email}"
    if key in _account_lockouts:
        _account_lockouts[key]["attempts"] = 0
        _account_lockouts[key]["locked_until"] = None

def check_account_locked(email: str, role: str = "unknown") -> Tuple[bool, Optional[datetime]]:
    """
    Check if account is locked
    Returns: (is_locked, locked_until)
    """
    key = f"{role}:{email}"
    if key not in _account_lockouts:
        return False, None
    
    lockout_data = _account_lockouts[key]
    now = datetime.utcnow()
    
    # Check if still locked
    if lockout_data.get("locked_until") and now < lockout_data["locked_until"]:
        return True, lockout_data["locked_until"]
    
    # Lock expired, clear it
    if lockout_data.get("locked_until") and now >= lockout_data["locked_until"]:
        lockout_data["attempts"] = 0
        lockout_data["locked_until"] = None
    
    return False, None

# ==================== CSRF PROTECTION ====================

_csrf_tokens: Dict[str, Dict[str, Any]] = {}

def generate_csrf_token() -> str:
    """Generate a CSRF token"""
    return secrets.token_urlsafe(32)

def store_csrf_token(token: str, session_id: str, expiry_minutes: int = 30):
    """Store CSRF token"""
    _csrf_tokens[token] = {
        "session_id": session_id,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=expiry_minutes)
    }

def validate_csrf_token(token: str, session_id: str) -> bool:
    """Validate CSRF token"""
    if not token or token not in _csrf_tokens:
        return False
    
    token_data = _csrf_tokens[token]
    
    # Check expiration
    if datetime.utcnow() > token_data["expires_at"]:
        del _csrf_tokens[token]
        return False
    
    # Check session match
    if token_data["session_id"] != session_id:
        return False
    
    return True

def cleanup_expired_csrf_tokens():
    """Cleanup expired CSRF tokens"""
    now = datetime.utcnow()
    expired = [
        token for token, data in _csrf_tokens.items()
        if now > data["expires_at"]
    ]
    for token in expired:
        del _csrf_tokens[token]

# ==================== SECURITY HEADERS ====================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        # Content Security Policy
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://accounts.google.com https://login.microsoftonline.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://accounts.google.com https://login.microsoftonline.com https://oauth2.googleapis.com https://graph.microsoft.com; "
            "frame-src https://accounts.google.com https://login.microsoftonline.com; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none';"
        )
        response.headers["Content-Security-Policy"] = csp
        
        # HSTS (only in production/HTTPS)
        if os.getenv("ENVIRONMENT") == "production" or request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        # CRITICAL: Always override CORS header with exact origin from request
        # CORSMiddleware may add header with trailing slash from config, but browser sends without trailing slash
        # CORS requires exact match, so we must use the exact origin from the request header
        origin = request.headers.get("origin")
        if origin:
            # Always use the exact origin from the request header (no trailing slash)
            # This ensures CORS validation passes
            response.headers["Access-Control-Allow-Origin"] = origin
        elif "Access-Control-Allow-Origin" not in response.headers:
            # Fallback if no origin header and CORSMiddleware didn't add it
            allowed_origins = _parse_csv_setting(os.getenv("CORS_ALLOWED_ORIGINS"), ["*"])
            # Normalize origins (remove trailing slashes)
            normalized_origins = [o.rstrip("/") if o != "*" else "*" for o in allowed_origins]
            response.headers["Access-Control-Allow-Origin"] = normalized_origins[0] if normalized_origins else "*"
        
        return response

class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """Redirect HTTP to HTTPS in production"""
    
    async def dispatch(self, request: Request, call_next):
        # Only redirect in production
        if os.getenv("ENVIRONMENT") == "production" and request.url.scheme == "http":
            https_url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(https_url), status_code=301)
        
        return await call_next(request)

def _parse_csv_setting(raw_value: str | None, default: list[str]) -> list[str]:
    """Parse CSV setting from environment variable"""
    if not raw_value:
        return default
    value = raw_value.strip()
    if not value:
        return default
    if value == "*":
        return ["*"]
    return [item.strip() for item in value.split(",") if item.strip()]

class OptionsHandlerMiddleware(BaseHTTPMiddleware):
    """Handle OPTIONS requests - returns 200 OK with CORS headers"""
    
    async def dispatch(self, request: Request, call_next):
        # Intercept OPTIONS requests and return 200 OK with CORS headers
        # We need to add CORS headers manually since we're returning early
        if request.method == "OPTIONS":
            origin = request.headers.get("origin")
            response = Response(status_code=200, content="")
            
            # Add CORS headers manually
            # Get CORS configuration
            allowed_origins = _parse_csv_setting(os.getenv("CORS_ALLOWED_ORIGINS"), ["*"])
            if origin:
                # Normalize origins (remove trailing slashes for comparison)
                origin_normalized = origin.rstrip("/")
                allowed_origins_normalized = [o.rstrip("/") for o in allowed_origins]
                
                if "*" in allowed_origins or origin in allowed_origins or origin_normalized in allowed_origins_normalized:
                    # CRITICAL: Always use the exact origin from the request header
                    # CORS requires exact match - browser sends "http://localhost:5173" (no trailing slash)
                    response.headers["Access-Control-Allow-Origin"] = origin
                else:
                    response.headers["Access-Control-Allow-Origin"] = allowed_origins[0] if allowed_origins else "*"
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
        
        # For non-OPTIONS requests, let CORSMiddleware handle CORS headers
        response = await call_next(request)
        return response

# ==================== EMAIL VERIFICATION ====================

# Email verification tokens (use Redis in production)
_email_verification_tokens: Dict[str, Dict[str, Any]] = {}

def generate_email_verification_token(email: str) -> str:
    """Generate email verification token"""
    token = secrets.token_urlsafe(32)
    _email_verification_tokens[token] = {
        "email": email,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=24),
        "verified": False
    }
    return token

def verify_email_token(token: str) -> Tuple[bool, Optional[str]]:
    """
    Verify email token
    Returns: (is_valid, email)
    """
    if not token or token not in _email_verification_tokens:
        return False, None
    
    token_data = _email_verification_tokens[token]
    
    # Check expiration
    if datetime.utcnow() > token_data["expires_at"]:
        del _email_verification_tokens[token]
        return False, None
    
    # Mark as verified
    token_data["verified"] = True
    email = token_data["email"]
    
    return True, email

# ==================== PASSWORD RESET ====================

# Password reset tokens (use Redis in production)
_password_reset_tokens: Dict[str, Dict[str, Any]] = {}

def generate_password_reset_token(email: str) -> str:
    """Generate password reset token"""
    token = secrets.token_urlsafe(32)
    _password_reset_tokens[token] = {
        "email": email,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=1),  # 1 hour expiry
        "used": False
    }
    return token

def verify_password_reset_token(token: str) -> Tuple[bool, Optional[str]]:
    """
    Verify password reset token
    Returns: (is_valid, email)
    """
    if not token or token not in _password_reset_tokens:
        return False, None
    
    token_data = _password_reset_tokens[token]
    
    # Check if already used
    if token_data["used"]:
        return False, None
    
    # Check expiration
    if datetime.utcnow() > token_data["expires_at"]:
        del _password_reset_tokens[token]
        return False, None
    
    email = token_data["email"]
    return True, email

def mark_password_reset_token_used(token: str):
    """Mark password reset token as used"""
    if token in _password_reset_tokens:
        _password_reset_tokens[token]["used"] = True

