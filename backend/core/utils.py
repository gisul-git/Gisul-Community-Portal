import jwt, os
from datetime import datetime, timedelta
from dotenv import load_dotenv
load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
# Session timeout: 30 minutes for all users (admin, customer, trainer)
JWT_EXP_MIN = int(os.getenv("JWT_EXP_MIN", "30"))

if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is not set. Please set it in your .env file or environment.")

def create_jwt(payload: dict):
    payload["exp"] = datetime.utcnow() + timedelta(minutes=JWT_EXP_MIN)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_jwt(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
