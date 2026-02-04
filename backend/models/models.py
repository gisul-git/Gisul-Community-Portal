from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime

class UserIn(BaseModel):
    email: EmailStr
    password: str
    role: Optional[str] = None  # Optional - login endpoints determine role from database

class TrainerSignup(BaseModel):
    email: EmailStr
    password: str
    name: str

class CustomerSignup(BaseModel):
    email: EmailStr
    password: str
    name: str
    company_name: Optional[str] = None

class ResumeParseResult(BaseModel):
    name: Optional[str]
    email: Optional[str]
    skills: List[str] = []
    experience_years: Optional[float]
    education: Optional[str]
    certifications: List[str] = []
    raw_text: Optional[str]
    uploaded_at: datetime = datetime.utcnow()

class ActivityLog(BaseModel):
    action_type: str  # e.g., "search", "upload", "delete", "login", "logout"
    user_email: str
    user_role: str  # "admin", "trainer", "customer"
    details: Optional[Dict[str, Any]] = None  # Additional context (query, file_name, etc.)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime = datetime.utcnow()

class ActivityLogRequest(BaseModel):
    action_type: str
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

class ActivityLogsFilter(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    user_role: Optional[str] = None  # "admin", "trainer", "customer"
    action_type: Optional[str] = None  # "search", "upload", "delete", etc.
    user_email: Optional[str] = None
    page: int = 1
    page_size: int = 50

class TrainerProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None  # Admin can update email
    phone: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    experience_years: Optional[float] = None
    education: Optional[Any] = None  # Can be string or list
    certifications: Optional[List[str]] = None
    current_company: Optional[str] = None
    companies: Optional[List[str]] = None
    clients: Optional[List[str]] = None

class CustomerRequirementPost(BaseModel):
    requirement_text: str
    jd_file_text: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    experience_years: Optional[float] = None
    domain: Optional[str] = None

class RequirementApproval(BaseModel):
    requirement_id: str
    approved: bool
    admin_notes: Optional[str] = None
