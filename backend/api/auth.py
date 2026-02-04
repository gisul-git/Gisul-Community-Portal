from fastapi import APIRouter, HTTPException, Body, Request, Depends, Response, Header
from fastapi.responses import RedirectResponse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.models import UserIn, TrainerSignup, CustomerSignup
from core.db import admin_users, trainer_profiles, admin_sessions, customer_users, customer_sessions, activity_logs
import bcrypt
from core.utils import create_jwt, decode_jwt
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import httpx
import secrets
import json
import redis
from typing import Dict, Any, Optional
from middleware.security import (
    hash_password, verify_password, validate_password_strength,
    sanitize_email, sanitize_input,
    check_rate_limit, get_client_identifier,
    check_account_locked, record_failed_login, clear_failed_logins,
    generate_csrf_token, validate_csrf_token,
    generate_email_verification_token, verify_email_token,
    generate_password_reset_token, verify_password_reset_token, mark_password_reset_token_used
)
import logging

logger = logging.getLogger(__name__)

load_dotenv()
router = APIRouter()
ADMIN_MAX_ACTIVE = int(os.getenv("ADMIN_MAX_ACTIVE", "3"))

# Validate JWT secret strength
JWT_SECRET = os.getenv("JWT_SECRET", "")
if JWT_SECRET and len(JWT_SECRET) < 32:
    logger.warning("⚠️ JWT_SECRET is less than 32 characters. Please use a stronger secret for production.")

# OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")

# Redis configuration for OAuth state storage (works across multiple workers)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
OAUTH_STATE_EXPIRY_SECONDS = 600  # 10 minutes

# Initialize Redis client for OAuth state storage
# Always initialize oauth_states dict as fallback (even if Redis is available)
oauth_states: Dict[str, Dict[str, Any]] = {}

try:
    # Parse Redis URL
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    # Test connection
    redis_client.ping()
    logger.info("✅ Redis connected for OAuth state storage (works across multiple workers)")
    USE_REDIS = True
except Exception as e:
    logger.warning(f"⚠️ Redis connection failed for OAuth state storage: {e}")
    logger.warning("⚠️ Falling back to in-memory storage (NOT recommended for multiple workers)")
    redis_client = None
    USE_REDIS = False

# Rate limiting configuration
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "5"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

@router.post("/admin/login")
async def admin_login(user: UserIn, request: Request):
    """Admin login with rate limiting, account lockout, and security features"""
    try:
        # Sanitize inputs
        email = sanitize_email(user.email)
        password = sanitize_input(user.password)
        
        # Rate limiting
        client_id = get_client_identifier(request)
        allowed, remaining = check_rate_limit(client_id, "admin_login", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Too many login attempts. Please try again later."
            )
        
        # Check account lockout
        is_locked, locked_until = check_account_locked(email, "admin")
        if is_locked:
            locked_minutes = int((locked_until - datetime.utcnow()).total_seconds() / 60) if locked_until else 15
            raise HTTPException(
                status_code=423,
                detail=f"Account is locked due to too many failed attempts. Please try again in {locked_minutes} minutes."
            )
        
        logger.info(f"Admin login attempt for email: {email}")
        admin_user = await admin_users.find_one({"email": email})
        if not admin_user:
            logger.warning(f"Admin not found: {email}")
            record_failed_login(email, "admin")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if "password" not in admin_user:
            logger.error(f"Password field missing for admin: {email}")
            raise HTTPException(status_code=500, detail="Admin record is corrupted - missing password")
        
        if not verify_password(password, admin_user["password"]):
            logger.warning(f"Password verification failed for admin: {email}")
            record_failed_login(email, "admin")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Check email verification - mandatory for all users
        email_verified = admin_user.get("email_verified", False)  # Default False - require verification
        if not email_verified:
            raise HTTPException(
                status_code=403,
                detail="Email not verified. Please check your email and verify your account before logging in. If you haven't received a verification email, please contact support."
            )
        
        # Successful login - clear failed attempts
        clear_failed_logins(email, "admin")
        logger.info(f"Password verified successfully for: {email}")
        
        active_admins = await admin_sessions.distinct("admin_email", {"active": True})
        total_active = len(active_admins)
        
        if total_active >= ADMIN_MAX_ACTIVE:
            existing_session = await admin_sessions.find_one({
                "admin_email": admin_user["email"],
                "active": True
            })
            if not existing_session:
                raise HTTPException(status_code=403, detail=f"Maximum {ADMIN_MAX_ACTIVE} admin sessions allowed. Please wait for another admin to logout.")

        token = create_jwt({"email": admin_user["email"], "role": "admin"})
        await admin_sessions.update_many(
            {"admin_email": admin_user["email"], "active": True},
            {"$set": {"active": False}}
        )
        await admin_sessions.insert_one({
            "admin_email": admin_user["email"],
            "token": token,
            "active": True,
            "created_at": datetime.utcnow()
        })
        logger.info(f"Admin login successful for: {email}")
        return {"access_token": token, "token_type": "bearer", "role": "admin"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in admin_login: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/trainer/signup")
async def trainer_signup(signup: TrainerSignup, request: Request):
    """Trainer signup with password strength validation and input sanitization"""
    # Sanitize inputs
    email = sanitize_email(signup.email)
    name = sanitize_input(signup.name)
    password = sanitize_input(signup.password)
    
    # Validate password strength
    is_strong, message = validate_password_strength(password)
    if not is_strong:
        raise HTTPException(status_code=400, detail=message)
    
    # Rate limiting for signup
    client_id = get_client_identifier(request)
    allowed, remaining = check_rate_limit(client_id, "trainer_signup", 3, 3600)  # 3 signups per hour
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many signup attempts. Please try again later."
        )
    
    existing = await trainer_profiles.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = hash_password(password)
    
    # Generate email verification token
    verification_token = generate_email_verification_token(email)
    
    await trainer_profiles.insert_one({
        "email": email,
        "password": hashed,
        "name": name,
        "skills": [],
        "experience_years": None,
        "education": None,
        "certifications": [],
        "email_verified": False,
        "verification_token": verification_token,
        "created_at": datetime.utcnow()
    })
    
    # Send verification email using AWS SES
    try:
        from services.email_service import send_verification_email
        send_verification_email(email, verification_token, "trainer")
        logger.info(f"Verification email sent to: {email} (trainer)")
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {e}")
        # Continue even if email fails (for development/testing)
    
    logger.info(f"Trainer signup successful for: {email}")
    return {
        "status": "Trainer registered successfully",
        "message": "Please check your email to verify your account",
        "email_verification_required": True
    }

@router.post("/trainer/login")
async def trainer_login(user: UserIn, request: Request):
    """Trainer login with rate limiting, account lockout, and security features"""
    try:
        # Sanitize inputs
        email = sanitize_email(user.email)
        password = sanitize_input(user.password)
        
        # Rate limiting
        client_id = get_client_identifier(request)
        allowed, remaining = check_rate_limit(client_id, "trainer_login", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Too many login attempts. Please try again later."
            )
        
        # Check account lockout
        is_locked, locked_until = check_account_locked(email, "trainer")
        if is_locked:
            locked_minutes = int((locked_until - datetime.utcnow()).total_seconds() / 60) if locked_until else 15
            raise HTTPException(
                status_code=423,
                detail=f"Account is locked due to too many failed attempts. Please try again in {locked_minutes} minutes."
            )
        
        trainer = await trainer_profiles.find_one({"email": email})
        if not trainer:
            record_failed_login(email, "trainer")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if "password" not in trainer:
            raise HTTPException(status_code=500, detail="Trainer record is corrupted - missing password")
        
        if not verify_password(password, trainer["password"]):
            record_failed_login(email, "trainer")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Email verification is optional - users can login immediately after signup
        # Verification email is still sent, but login is not blocked if not verified
        
        # Successful login - clear failed attempts
        clear_failed_logins(email, "trainer")
        
        token = create_jwt({"email": trainer["email"], "role": "trainer"})
        
        # Log trainer login activity
        try:
            def get_client_ip_from_request(req):
                """Extract client IP from request"""
                try:
                    if isinstance(req, Request):
                        forwarded = req.headers.get("X-Forwarded-For")
                        if forwarded:
                            return forwarded.split(",")[0].strip()
                        real_ip = req.headers.get("X-Real-IP")
                        if real_ip:
                            return real_ip
                        if hasattr(req, "client") and req.client:
                            return req.client.host
                except Exception:
                    pass
                return None
            
            import asyncio
            asyncio.create_task(activity_logs.insert_one({
                "action_type": "login",
                "user_email": trainer["email"],
                "user_role": "trainer",
                "details": {"login_method": "email_password"},
                "ip_address": get_client_ip_from_request(request) if request else None,
                "user_agent": request.headers.get("User-Agent", None) if request else None,
                "timestamp": datetime.utcnow()
            }))
        except Exception as e:
            # Don't fail login if logging fails
            print(f"⚠️ Failed to log trainer login activity: {e}")
        
        return {"access_token": token, "token_type": "bearer", "role": "trainer"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in trainer_login: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/customer/signup")
async def customer_signup(signup: CustomerSignup, request: Request):
    """Customer signup with password strength validation and input sanitization"""
    # Sanitize inputs
    email = sanitize_email(signup.email)
    name = sanitize_input(signup.name)
    company_name = sanitize_input(signup.company_name)
    password = sanitize_input(signup.password)
    
    # Validate password strength
    is_strong, message = validate_password_strength(password)
    if not is_strong:
        raise HTTPException(status_code=400, detail=message)
    
    # Rate limiting for signup
    client_id = get_client_identifier(request)
    allowed, remaining = check_rate_limit(client_id, "customer_signup", 3, 3600)  # 3 signups per hour
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many signup attempts. Please try again later."
        )
    
    existing = await customer_users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = hash_password(password)
    
    # Generate email verification token
    verification_token = generate_email_verification_token(email)
    
    await customer_users.insert_one({
        "email": email,
        "password": hashed,
        "name": name,
        "company_name": company_name,
        "email_verified": False,
        "verification_token": verification_token,
        "created_at": datetime.utcnow(),
        "active": True
    })
    
    # Send verification email using AWS SES
    try:
        from services.email_service import send_verification_email
        send_verification_email(email, verification_token, "customer")
        logger.info(f"Verification email sent to: {email} (customer)")
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {e}")
        # Continue even if email fails (for development/testing)
    
    logger.info(f"Customer signup successful for: {email}")
    return {
        "status": "Customer registered successfully",
        "message": "Please check your email to verify your account",
        "email_verification_required": True
    }

@router.post("/customer/login")
async def customer_login(user: UserIn, request: Request):
    """Customer login with rate limiting, account lockout, and security features"""
    try:
        # Sanitize inputs
        email = sanitize_email(user.email)
        password = sanitize_input(user.password)
        
        # Rate limiting
        client_id = get_client_identifier(request)
        allowed, remaining = check_rate_limit(client_id, "customer_login", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Too many login attempts. Please try again later."
            )
        
        # Check account lockout
        is_locked, locked_until = check_account_locked(email, "customer")
        if is_locked:
            locked_minutes = int((locked_until - datetime.utcnow()).total_seconds() / 60) if locked_until else 15
            raise HTTPException(
                status_code=423,
                detail=f"Account is locked due to too many failed attempts. Please try again in {locked_minutes} minutes."
            )
        
        customer = await customer_users.find_one({"email": email})
        if not customer:
            record_failed_login(email, "customer")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if "password" not in customer:
            raise HTTPException(status_code=500, detail="Customer record is corrupted - missing password")
        
        if not verify_password(password, customer["password"]):
            record_failed_login(email, "customer")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Email verification is optional - users can login immediately after signup
        # Verification email is still sent, but login is not blocked if not verified
        
        if not customer.get("active", True):
            raise HTTPException(status_code=403, detail="Account is deactivated")
        
        # Successful login - clear failed attempts
        clear_failed_logins(email, "customer")
        
        token = create_jwt({"email": customer["email"], "role": "customer"})
        await customer_sessions.insert_one({
            "customer_email": customer["email"],
            "token": token,
            "active": True,
            "created_at": datetime.utcnow()
        })
        return {"access_token": token, "token_type": "bearer", "role": "customer"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in customer_login: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/verify-email/{token}")
async def verify_email(token: str):
    """Verify email address with verification token"""
    try:
        is_valid, email = verify_email_token(token)
        if not is_valid or not email:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired verification token. Please request a new verification email."
            )
        
        # Find user in all collections
        admin = await admin_users.find_one({"email": email})
        trainer = await trainer_profiles.find_one({"email": email})
        customer = await customer_users.find_one({"email": email})
        
        if admin:
            await admin_users.update_one(
                {"email": email},
                {"$set": {"email_verified": True, "verification_token": None}}
            )
            role = "admin"
        elif trainer:
            await trainer_profiles.update_one(
                {"email": email},
                {"$set": {"email_verified": True, "verification_token": None}}
            )
            role = "trainer"
        elif customer:
            await customer_users.update_one(
                {"email": email},
                {"$set": {"email_verified": True, "verification_token": None}}
            )
            role = "customer"
        else:
            raise HTTPException(status_code=404, detail="User not found")
        
        logger.info(f"Email verified successfully for: {email} (role: {role})")
        
        # Redirect to appropriate login page
        # Use domain from env or default to localhost for development
        # In production (reverse proxy), use https://community.gisul.co.in
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        login_path = {
            "admin": "/admin/login",
            "trainer": "/trainer/login",
            "customer": "/customer/login"
        }.get(role, "/")
        
        return RedirectResponse(
            url=f"{frontend_url}{login_path}?verified=true",
            status_code=302
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying email: {e}")
        raise HTTPException(status_code=500, detail=f"Error verifying email: {str(e)}")

@router.post("/resend-verification")
async def resend_verification(email: str = Body(...), request: Request = None):
    """Resend email verification token"""
    try:
        # Sanitize email
        email = sanitize_email(email)
        
        # Rate limiting
        if request:
            client_id = get_client_identifier(request)
            allowed, remaining = check_rate_limit(client_id, "resend_verification", 3, 3600)  # 3 per hour
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail="Too many verification email requests. Please try again later."
                )
        
        # Find user
        admin = await admin_users.find_one({"email": email})
        trainer = await trainer_profiles.find_one({"email": email})
        customer = await customer_users.find_one({"email": email})
        
        if not admin and not trainer and not customer:
            # Don't reveal if email exists (security)
            return {"status": "success", "message": "If the email exists, a verification link has been sent."}
        
        # Check if already verified
        user = admin or trainer or customer
        if user.get("email_verified", False):
            return {"status": "success", "message": "Email is already verified."}
        
        # Generate new verification token
        verification_token = generate_email_verification_token(email)
        
        # Update user with new token
        if admin:
            await admin_users.update_one(
                {"email": email},
                {"$set": {"verification_token": verification_token}}
            )
        elif trainer:
            await trainer_profiles.update_one(
                {"email": email},
                {"$set": {"verification_token": verification_token}}
            )
        elif customer:
            await customer_users.update_one(
                {"email": email},
                {"$set": {"verification_token": verification_token}}
            )
        
        # Send verification email using AWS SES
        try:
            from services.email_service import send_verification_email
            # Determine role
            if admin:
                role = "admin"
            elif trainer:
                role = "trainer"
            else:
                role = "customer"
            send_verification_email(email, verification_token, role)
            logger.info(f"Verification email sent to: {email} (role: {role})")
        except Exception as e:
            logger.error(f"Failed to send verification email to {email}: {e}")
            # Continue even if email fails (for development/testing)
        
        logger.info(f"Verification email token regenerated for: {email}")
        return {
            "status": "success",
            "message": "Verification email sent. Please check your inbox."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resending verification: {e}")
        raise HTTPException(status_code=500, detail=f"Error resending verification: {str(e)}")

@router.post("/forgot-password")
async def forgot_password(email: str = Body(...), request: Request = None):
    """Request password reset - sends reset token to email"""
    try:
        # Sanitize email
        email = sanitize_email(email)
        
        # Rate limiting
        if request:
            client_id = get_client_identifier(request)
            allowed, remaining = check_rate_limit(client_id, "forgot_password", 3, 3600)  # 3 per hour
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail="Too many password reset requests. Please try again later."
                )
        
        # Find user in all collections
        admin = await admin_users.find_one({"email": email})
        trainer = await trainer_profiles.find_one({"email": email})
        customer = await customer_users.find_one({"email": email})
        
        # Security: Don't reveal if email exists (prevent email enumeration)
        if not admin and not trainer and not customer:
            # Return success even if email doesn't exist (security best practice)
            return {
                "status": "success",
                "message": "If the email exists, a password reset link has been sent."
            }
        
        # Generate password reset token
        reset_token = generate_password_reset_token(email)
        
        # Store token in user record
        if admin:
            await admin_users.update_one(
                {"email": email},
                {"$set": {"password_reset_token": reset_token, "password_reset_expires": datetime.utcnow() + timedelta(hours=1)}}
            )
            role = "admin"
        elif trainer:
            await trainer_profiles.update_one(
                {"email": email},
                {"$set": {"password_reset_token": reset_token, "password_reset_expires": datetime.utcnow() + timedelta(hours=1)}}
            )
            role = "trainer"
        elif customer:
            await customer_users.update_one(
                {"email": email},
                {"$set": {"password_reset_token": reset_token, "password_reset_expires": datetime.utcnow() + timedelta(hours=1)}}
            )
            role = "customer"
        
        # Send password reset email using AWS SES
        try:
            from services.email_service import send_password_reset_email
            send_password_reset_email(email, reset_token, role)
            logger.info(f"Password reset email sent to: {email} (role: {role})")
        except Exception as e:
            logger.error(f"Failed to send password reset email to {email}: {e}")
            # Continue even if email fails (for development/testing)
        
        return {
            "status": "success",
            "message": "If the email exists, a password reset link has been sent.",
            "reset_token": reset_token  # Remove this in production - only for testing
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in forgot_password: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing password reset request: {str(e)}")

@router.post("/reset-password")
async def reset_password(
    token: str = Body(...),
    new_password: str = Body(...),
    request: Request = None
):
    """Reset password using reset token"""
    try:
        # Sanitize inputs
        new_password = sanitize_input(new_password)
        
        # Validate password strength
        is_strong, message = validate_password_strength(new_password)
        if not is_strong:
            raise HTTPException(status_code=400, detail=message)
        
        # Rate limiting
        if request:
            client_id = get_client_identifier(request)
            allowed, remaining = check_rate_limit(client_id, "reset_password", 5, 3600)  # 5 per hour
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail="Too many password reset attempts. Please try again later."
                )
        
        # Find user by checking database for stored token (more reliable than in-memory storage)
        admin = await admin_users.find_one({"password_reset_token": token})
        trainer = await trainer_profiles.find_one({"password_reset_token": token})
        customer = await customer_users.find_one({"password_reset_token": token})
        
        user = admin or trainer or customer
        
        if not user:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired password reset token. Please request a new password reset."
            )
        
        email = user.get("email")
        token_expires = user.get("password_reset_expires")
        
        # Check if token has expired
        if token_expires and datetime.utcnow() > token_expires:
            raise HTTPException(
                status_code=400,
                detail="Password reset token has expired. Please request a new password reset."
            )
        
        # Also verify with security module for double-check
        is_valid, verified_email = verify_password_reset_token(token)
        if not is_valid or verified_email != email:
            logger.warning(f"Token verification mismatch for {email}")
            raise HTTPException(
                status_code=400,
                detail="Invalid password reset token."
            )
        
        # Hash new password
        hashed_password = hash_password(new_password)
        
        # Update password and clear reset token
        update_data = {
            "$set": {
                "password": hashed_password,
                "password_reset_token": None,
                "password_reset_expires": None,
                "updated_at": datetime.utcnow()
            }
        }
        
        if admin:
            await admin_users.update_one({"email": email}, update_data)
            role = "admin"
        elif trainer:
            await trainer_profiles.update_one({"email": email}, update_data)
            role = "trainer"
        elif customer:
            await customer_users.update_one({"email": email}, update_data)
            role = "customer"
        
        # Mark token as used
        mark_password_reset_token_used(token)
        
        # Clear any account lockouts
        clear_failed_logins(email, role)
        
        logger.info(f"Password reset successful for: {email} (role: {role})")
        
        return {
            "status": "success",
            "message": "Password has been reset successfully. Please login with your new password."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password: {e}")
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")

@router.post("/api/auth/logout")
async def logout(token: str = Body(...)):
    
    try:
        from core.utils import decode_jwt
        user = decode_jwt(token)
        if user.get("role") == "admin":
            await admin_sessions.update_many(
                {"token": token, "active": True},
                {"$set": {"active": False}}
            )
        elif user.get("role") == "customer":
            await customer_sessions.update_many(
                {"token": token, "active": True},
                {"$set": {"active": False}}
            )
        return {"status": "Logged out successfully"}
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

# OAuth Helper Functions
async def get_google_user_info(access_token: str):
    """Get user info from Google"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if response.status_code == 200:
            return response.json()
        raise HTTPException(status_code=400, detail="Failed to get Google user info")

async def get_microsoft_user_info(access_token: str):
    """Get user info from Microsoft"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json"
            }
        )
        print(f"Microsoft Graph API response status: {response.status_code}")
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 403:
            error_text = response.text[:500] if response.text else "No error message"
            print(f"Microsoft Graph API 403 Forbidden: {error_text}")
            raise HTTPException(
                status_code=403, 
                detail=f"Permission denied by Microsoft Graph API. Make sure your Azure app has 'User.Read' permission. Error: {error_text}"
            )
        else:
            error_text = response.text[:500] if response.text else "No error message"
            print(f"Microsoft Graph API error: {error_text}")
            raise HTTPException(
                status_code=400, 
                detail=f"Failed to get Microsoft user info. Status: {response.status_code}. Error: {error_text}"
            )

# Google OAuth Endpoints
@router.get("/api/auth/google/login/{role}")
async def google_login(role: str, request: Request):
    """Initiate Google OAuth login"""
    if role not in ["admin", "trainer", "customer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    # Generate state
    state = secrets.token_urlsafe(32)
    
    # Store state in Redis (works across multiple workers)
    state_data = {"role": role, "provider": "google", "timestamp": datetime.utcnow().isoformat()}
    try:
        if USE_REDIS and redis_client:
            redis_key = f"oauth_state:{state}"
            redis_client.setex(
                redis_key,
                OAUTH_STATE_EXPIRY_SECONDS,
                json.dumps(state_data)
            )
            logger.info(f"🔐 Generated OAuth state: {state[:20]}... (stored in Redis)")
        else:
            # Fallback to in-memory (single worker only)
            oauth_states[state] = state_data
            logger.info(f"🔐 Generated OAuth state: {state[:20]}... (stored in memory)")
    except Exception as e:
        logger.error(f"❌ Failed to store OAuth state: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize OAuth login")
    
    # Build Google OAuth URL
    # Ensure base_url doesn't have trailing slash (consistent with Microsoft)
    base_url = str(request.base_url).rstrip('/')
    redirect_uri = f"{base_url}/api/auth/callback/google"
    logger.info(f"Google OAuth login - Redirect URI: {redirect_uri}, State: {state[:20]}...")
    
    from urllib.parse import quote
    encoded_redirect_uri = quote(redirect_uri, safe='')
    
    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={encoded_redirect_uri}"
        f"&response_type=code"
        f"&scope=openid email profile"
        f"&state={state}"
    )
    
    return RedirectResponse(url=google_auth_url)

@router.get("/api/auth/callback/google")
async def google_callback(request: Request, code: str = None, state: str = None):
    """Handle Google OAuth callback"""
    if not code or not state:
        logger.warning("❌ OAuth callback missing code or state")
        raise HTTPException(status_code=400, detail="Missing code or state")
    
    logger.info(f"🔍 Google OAuth callback received - State: {state[:20]}..., Code present: {bool(code)}")
    
    # Retrieve state from Redis or in-memory storage
    state_data = None
    try:
        if USE_REDIS and redis_client:
            redis_key = f"oauth_state:{state}"
            state_json = redis_client.get(redis_key)
            if state_json:
                state_data = json.loads(state_json)
                # Delete state after retrieval (one-time use)
                redis_client.delete(redis_key)
                logger.info(f"✅ State validated from Redis: {state[:20]}...")
            else:
                logger.warning(f"❌ State not found in Redis: {state[:20]}...")
        else:
            # Fallback to in-memory (single worker only)
            if state in oauth_states:
                state_data = oauth_states.pop(state)
                logger.info(f"✅ State validated from memory: {state[:20]}...")
            else:
                logger.warning(f"❌ State not found in memory: {state[:20]}...")
                logger.warning(f"📋 Available states in memory: {list(oauth_states.keys())[:5]}")
    except Exception as e:
        logger.error(f"❌ Error retrieving OAuth state: {e}")
        raise HTTPException(status_code=500, detail="Error validating OAuth state")
    
    if not state_data:
        logger.error(f"❌ Invalid or expired OAuth state: {state[:20]}...")
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired state. Please try logging in again."
        )
    
    role = state_data.get("role")
    if not role:
        logger.error(f"❌ OAuth state missing role: {state_data}")
        raise HTTPException(status_code=400, detail="Invalid state data")
    
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    # Exchange code for token
    # Use the same base URL but ensure it matches what was sent to Google
    base_url = str(request.base_url).rstrip('/')
    redirect_uri = f"{base_url}/api/auth/callback/google"
    print(f"Google token exchange - Redirect URI: {redirect_uri}")
    
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")
        
        token_data = token_response.json()
        access_token = token_data["access_token"]
        
        # Get user info
        user_info = await get_google_user_info(access_token)
        email = user_info.get("email")
        name = user_info.get("name", email.split("@")[0])
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")
        
        # Create or get user
        token = await handle_oauth_user(email, name, role, "google", request)
        
        # Redirect to frontend with token
        # Use absolute URL to prevent redirect loops
        frontend_url = os.getenv("FRONTEND_URL", "https://community.gisul.co.in")
        redirect_path = {
            "admin": "/admin/dashboard",
            "trainer": "/trainer/dashboard",
            "customer": "/customer/dashboard"
        }.get(role, "/")
        
        return RedirectResponse(f"{frontend_url}{redirect_path}?token={token}")

# Microsoft OAuth Endpoints
@router.get("/api/auth/microsoft/login/{role}")
async def microsoft_login(role: str, request: Request):
    """Initiate Microsoft OAuth login"""
    if role not in ["admin", "trainer", "customer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    if not MICROSOFT_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Microsoft OAuth not configured")
    
    # Generate state
    state = secrets.token_urlsafe(32)
    
    # Store state in Redis (works across multiple workers)
    state_data = {"role": role, "provider": "microsoft", "timestamp": datetime.utcnow().isoformat()}
    try:
        if USE_REDIS and redis_client:
            redis_key = f"oauth_state:{state}"
            redis_client.setex(
                redis_key,
                OAUTH_STATE_EXPIRY_SECONDS,
                json.dumps(state_data)
            )
            logger.info(f"🔐 Generated OAuth state: {state[:20]}... (stored in Redis)")
        else:
            # Fallback to in-memory (single worker only)
            oauth_states[state] = state_data
            logger.info(f"🔐 Generated OAuth state: {state[:20]}... (stored in memory)")
    except Exception as e:
        logger.error(f"❌ Failed to store OAuth state: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize OAuth login")
    
    # Build Microsoft OAuth URL
    # Ensure base_url doesn't have trailing slash
    base_url = str(request.base_url).rstrip('/')
    redirect_uri = f"{base_url}/api/auth/callback/azure-ad"
    logger.info(f"Microsoft OAuth login - Redirect URI: {redirect_uri}, State: {state[:20]}...")
    
    from urllib.parse import quote
    encoded_redirect_uri = quote(redirect_uri, safe='')
    
    microsoft_auth_url = (
        f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        f"?client_id={MICROSOFT_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={encoded_redirect_uri}"
        f"&response_mode=query"
        f"&scope=openid profile email User.Read"
        f"&state={state}"
    )
    
    return RedirectResponse(url=microsoft_auth_url)

@router.get("/api/auth/callback/azure-ad")
async def microsoft_callback(request: Request, code: str = None, state: str = None):
    """Handle Microsoft OAuth callback"""
    try:
        if not code or not state:
            print(f"Microsoft OAuth callback error: Missing code or state. Code: {bool(code)}, State: {bool(state)}")
            raise HTTPException(status_code=400, detail=f"Missing code or state. Code: {bool(code)}, State: {bool(state)}")
        
        logger.info(f"🔍 Microsoft OAuth callback received - State: {state[:20]}..., Code present: {bool(code)}")
        
        # Retrieve state from Redis or in-memory storage
        state_data = None
        try:
            if USE_REDIS and redis_client:
                redis_key = f"oauth_state:{state}"
                state_json = redis_client.get(redis_key)
                if state_json:
                    state_data = json.loads(state_json)
                    # Delete state after retrieval (one-time use)
                    redis_client.delete(redis_key)
                    logger.info(f"✅ State validated from Redis: {state[:20]}...")
                else:
                    logger.warning(f"❌ State not found in Redis: {state[:20]}...")
            else:
                # Fallback to in-memory (single worker only)
                if state in oauth_states:
                    state_data = oauth_states.pop(state)
                    logger.info(f"✅ State validated from memory: {state[:20]}...")
                else:
                    logger.warning(f"❌ State not found in memory: {state[:20]}...")
                    logger.warning(f"📋 Available states in memory: {list(oauth_states.keys())[:5]}")
        except Exception as e:
            logger.error(f"❌ Error retrieving OAuth state: {e}")
            raise HTTPException(status_code=500, detail="Error validating OAuth state")
        
        if not state_data:
            logger.error(f"❌ Invalid or expired OAuth state: {state[:20]}...")
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired state. Please try logging in again."
            )
        
        role = state_data.get("role")
        if not role:
            logger.error(f"❌ OAuth state missing role: {state_data}")
            raise HTTPException(status_code=400, detail="Invalid state data")
        
        logger.info(f"✅ State validated. Role: {role}")
        
        if not MICROSOFT_CLIENT_ID or not MICROSOFT_CLIENT_SECRET:
            print("Microsoft OAuth credentials not configured")
            raise HTTPException(status_code=500, detail="Microsoft OAuth not configured")
        
        # Exchange code for token
        # Use the same base URL but ensure it matches what was sent to Microsoft
        base_url = str(request.base_url).rstrip('/')
        redirect_uri = f"{base_url}/api/auth/callback/azure-ad"
        print(f"Token exchange - Redirect URI: {redirect_uri}")
        
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                data={
                    "client_id": MICROSOFT_CLIENT_ID,
                    "client_secret": MICROSOFT_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            
            print(f"Token exchange response status: {token_response.status_code}")
            if token_response.status_code != 200:
                error_text = token_response.text[:500] if token_response.text else "No error message"
                print(f"Token exchange failed: {error_text}")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Failed to exchange code for token. Status: {token_response.status_code}. Error: {error_text}"
                )
            
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            
            if not access_token:
                print("No access token in response")
                raise HTTPException(status_code=400, detail="No access token received from Microsoft")
            
            # Get user info
            user_info = await get_microsoft_user_info(access_token)
            email = user_info.get("mail") or user_info.get("userPrincipalName")
            name = user_info.get("displayName") or (email.split("@")[0] if email else "User")
            
            print(f"Microsoft user info - Email: {email}, Name: {name}")
            
            if not email:
                raise HTTPException(status_code=400, detail="Email not provided by Microsoft")
            
            # Create or get user
            token = await handle_oauth_user(email, name, role, "microsoft", request)
            
            # Redirect to frontend with token
            # Use absolute URL to prevent redirect loops
            frontend_url = os.getenv("FRONTEND_URL", "https://community.gisul.co.in")
            redirect_path = {
                "admin": "/admin/dashboard",
                "trainer": "/trainer/dashboard",
                "customer": "/customer/dashboard"
            }.get(role, "/")
            
            print(f"OAuth success. Redirecting to: {frontend_url}{redirect_path}")
            return RedirectResponse(f"{frontend_url}{redirect_path}?token={token}")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in Microsoft OAuth callback: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OAuth callback error: {str(e)}")

async def handle_oauth_user(email: str, name: str, role: str, provider: str, request: Request = None):
    """Create or get user from OAuth, return JWT token"""
    if role == "admin":
        user = await admin_users.find_one({"email": email})
        if not user:
            # Create admin user if doesn't exist
            await admin_users.insert_one({
                "email": email,
                "password": "",  # OAuth users don't have passwords
                "name": name,
                "oauth_provider": provider,
                "email_verified": True,  # OAuth emails are pre-verified by provider
                "created_at": datetime.utcnow()
            })
        else:
            # Update OAuth provider if exists and auto-verify email (OAuth emails are pre-verified)
            await admin_users.update_one(
                {"email": email},
                {"$set": {"oauth_provider": provider, "name": name, "email_verified": True}}
            )
        
        # Check admin session limit
        active_admins = await admin_sessions.distinct("admin_email", {"active": True})
        total_active = len(active_admins)
        
        if total_active >= ADMIN_MAX_ACTIVE:
            existing_session = await admin_sessions.find_one({
                "admin_email": email,
                "active": True
            })
            if not existing_session:
                raise HTTPException(
                    status_code=403,
                    detail=f"Maximum {ADMIN_MAX_ACTIVE} admin sessions allowed. Please wait for another admin to logout."
                )
        
        token = create_jwt({"email": email, "role": "admin"})
        await admin_sessions.update_many(
            {"admin_email": email, "active": True},
            {"$set": {"active": False}}
        )
        await admin_sessions.insert_one({
            "admin_email": email,
            "token": token,
            "active": True,
            "created_at": datetime.utcnow()
        })
        
        # Log admin OAuth login activity
        try:
            def get_client_ip_from_request(req):
                """Extract client IP from request"""
                try:
                    if isinstance(req, Request):
                        forwarded = req.headers.get("X-Forwarded-For")
                        if forwarded:
                            return forwarded.split(",")[0].strip()
                        real_ip = req.headers.get("X-Real-IP")
                        if real_ip:
                            return real_ip
                        if hasattr(req, "client") and req.client:
                            return req.client.host
                except Exception:
                    pass
                return None
            
            import asyncio
            asyncio.create_task(activity_logs.insert_one({
                "action_type": "login",
                "user_email": email,
                "user_role": "admin",
                "details": {"login_method": provider, "oauth": True},
                "ip_address": get_client_ip_from_request(request) if request else None,
                "user_agent": request.headers.get("User-Agent", None) if request else None,
                "timestamp": datetime.utcnow()
            }))
        except Exception as e:
            # Don't fail login if logging fails
            print(f"⚠️ Failed to log admin OAuth login activity: {e}")
        
        return token
        
    elif role == "trainer":
        user = await trainer_profiles.find_one({"email": email})
        if not user:
            # Create trainer user if doesn't exist
            await trainer_profiles.insert_one({
                "email": email,
                "password": "",  # OAuth users don't have passwords
                "name": name,
                "skills": [],
                "experience_years": None,
                "education": None,
                "certifications": [],
                "oauth_provider": provider,
                "email_verified": True,  # OAuth emails are pre-verified by provider
                "created_at": datetime.utcnow()
            })
        else:
            # Update OAuth provider if exists and auto-verify email (OAuth emails are pre-verified)
            await trainer_profiles.update_one(
                {"email": email},
                {"$set": {"oauth_provider": provider, "name": name, "email_verified": True}}
            )
        
        token = create_jwt({"email": email, "role": "trainer"})
        
        # Log trainer OAuth login activity
        try:
            def get_client_ip_from_request(req):
                """Extract client IP from request"""
                try:
                    if isinstance(req, Request):
                        forwarded = req.headers.get("X-Forwarded-For")
                        if forwarded:
                            return forwarded.split(",")[0].strip()
                        real_ip = req.headers.get("X-Real-IP")
                        if real_ip:
                            return real_ip
                        if hasattr(req, "client") and req.client:
                            return req.client.host
                except Exception:
                    pass
                return None
            
            import asyncio
            asyncio.create_task(activity_logs.insert_one({
                "action_type": "login",
                "user_email": email,
                "user_role": "trainer",
                "details": {"login_method": provider, "oauth": True},
                "ip_address": get_client_ip_from_request(request) if request else None,
                "user_agent": request.headers.get("User-Agent", None) if request else None,
                "timestamp": datetime.utcnow()
            }))
        except Exception as e:
            # Don't fail login if logging fails
            print(f"⚠️ Failed to log trainer OAuth login activity: {e}")
        
        return token
        
    elif role == "customer":
        user = await customer_users.find_one({"email": email})
        if not user:
            # Create customer user if doesn't exist
            await customer_users.insert_one({
                "email": email,
                "password": "",  # OAuth users don't have passwords
                "name": name,
                "company_name": "",  # Can be updated later
                "oauth_provider": provider,
                "email_verified": True,  # OAuth emails are pre-verified by provider
                "created_at": datetime.utcnow(),
                "active": True
            })
        else:
            # Update OAuth provider if exists and auto-verify email (OAuth emails are pre-verified)
            await customer_users.update_one(
                {"email": email},
                {"$set": {"oauth_provider": provider, "name": name, "active": True, "email_verified": True}}
            )
        
        token = create_jwt({"email": email, "role": "customer"})
        await customer_sessions.insert_one({
            "customer_email": email,
            "token": token,
            "active": True,
            "created_at": datetime.utcnow()
        })
        
        # Log customer OAuth login activity
        try:
            def get_client_ip_from_request(req):
                """Extract client IP from request"""
                try:
                    if isinstance(req, Request):
                        forwarded = req.headers.get("X-Forwarded-For")
                        if forwarded:
                            return forwarded.split(",")[0].strip()
                        real_ip = req.headers.get("X-Real-IP")
                        if real_ip:
                            return real_ip
                        if hasattr(req, "client") and req.client:
                            return req.client.host
                except Exception:
                    pass
                return None
            
            import asyncio
            asyncio.create_task(activity_logs.insert_one({
                "action_type": "login",
                "user_email": email,
                "user_role": "customer",
                "details": {"login_method": provider, "oauth": True},
                "ip_address": get_client_ip_from_request(request) if request else None,
                "user_agent": request.headers.get("User-Agent", None) if request else None,
                "timestamp": datetime.utcnow()
            }))
        except Exception as e:
            # Don't fail login if logging fails
            print(f"⚠️ Failed to log customer OAuth login activity: {e}")
        
        return token
    
    raise HTTPException(status_code=400, detail="Invalid role")
