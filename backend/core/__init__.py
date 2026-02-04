"""Core module - database connections, utilities, and configuration"""
from .db import (
    db, client,
    admin_users, trainer_profiles, admin_sessions,
    customer_users, customer_sessions, activity_logs
)
from .utils import create_jwt, decode_jwt

__all__ = [
    'db', 'client',
    'admin_users', 'trainer_profiles', 'admin_sessions',
    'customer_users', 'customer_sessions', 'activity_logs',
    'create_jwt', 'decode_jwt'
]
