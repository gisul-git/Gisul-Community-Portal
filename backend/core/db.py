from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import asyncio
import logging

load_dotenv()

logger = logging.getLogger(__name__)

# MongoDB URI - use service name in Docker network (mongo:27017) or env variable
# For Docker: mongodb://mongo:27017
# For local dev: mongodb://localhost:27017
default_mongo_uri = "mongodb://mongo:27017"  # Docker service name
mongo_uri = os.getenv("MONGO_URI", default_mongo_uri)
db_name = os.getenv("MONGO_DB_NAME", "resume_app")

connection_options = {
    "serverSelectionTimeoutMS": 30000,
    "connectTimeoutMS": 20000,
    "socketTimeoutMS": 20000,
    "retryWrites": True,
    "retryReads": True,
    "maxPoolSize": 50,
    "minPoolSize": 10,
}

try:
    client = AsyncIOMotorClient(mongo_uri, **connection_options)
    db = client[db_name]
    logger.info(f"✅ MongoDB client initialized (database: {db_name})")
except Exception as e:
    logger.error(f"❌ Failed to initialize MongoDB client: {e}")
    raise

async def test_connection():
    try:
        info = await db.command("ping")
        print("✅ MongoDB connected successfully!", info)
    except Exception as e:
        print("❌ Connection failed:", e)

if __name__ == "__main__":
    asyncio.run(test_connection())

admin_users = db["admin_users"]
trainer_profiles = db["trainer_profiles"]
admin_sessions = db["admin_sessions"]
customer_users = db["customer_users"]
customer_sessions = db["customer_sessions"]
activity_logs = db["activity_logs"]
customer_requirements = db["customer_requirements"]
