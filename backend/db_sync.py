from pymongo import MongoClient
import os
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)


mongo_uri_env = os.getenv("MONGO_URI", "").strip()
if not mongo_uri_env:
    is_docker = os.getenv("DOCKER_CONTAINER") or os.path.exists("/.dockerenv")
    default_mongo_uri = "mongodb://mongo:27017" if is_docker else "mongodb://localhost:27017"
    mongo_uri = default_mongo_uri
else:
    mongo_uri = mongo_uri_env

db_name = os.getenv("MONGO_DB_NAME", "resume_app")

# Build connection options - only set directConnection for non-SRV connections
connection_options = {
    "serverSelectionTimeoutMS": 60000,  # Increased to 60 seconds for Atlas
    "connectTimeoutMS": 60000,  # Increased to 60 seconds
    "socketTimeoutMS": 60000,  # Increased to 60 seconds
    "retryWrites": True,
    "retryReads": True,
    "maxPoolSize": 50,
    "minPoolSize": 10,
    "maxIdleTimeMS": 45000,  # Close idle connections after 45 seconds
    "heartbeatFrequencyMS": 10000,  # Check server status every 10 seconds
    "w": "majority",  # Write concern
    "readPreference": "primaryPreferred",  # Prefer primary, fallback to secondary
}

# Only set directConnection for non-SRV (standard) connections
# SRV connections (mongodb+srv://) handle this automatically
if mongo_uri and not mongo_uri.startswith("mongodb+srv://"):
    connection_options["directConnection"] = False  # Use replica set connection for standard URIs

def get_db_client():
    try:
        client = MongoClient(mongo_uri, **connection_options)
        return client
    except Exception as e:
        logger.error(f"❌ Failed to create MongoDB client: {e}")
        raise

def get_db():
    client = get_db_client()
    return client[db_name]

def save_trainer_profile(profile_data):
    client = None
    try:
        client = get_db_client()
        db = client[db_name]
        trainer_profiles = db["trainer_profiles"]
        
        existing_profile = trainer_profiles.find_one({"email": profile_data.get("email")})
        
        if existing_profile:
            trainer_profiles.update_one(
                {"email": profile_data.get("email")},
                {"$set": profile_data},
                upsert=False
            )
            logger.warning(f"🔄 Updated existing profile for: {profile_data.get('email')}")
        else:
            if "uploaded_at" not in profile_data:
                from datetime import datetime
                profile_data["uploaded_at"] = datetime.utcnow()
            trainer_profiles.insert_one(profile_data)
            logger.warning(f"➕ Created new profile for: {profile_data.get('email')}")
        return True
    except Exception as e:
        logger.error(f"❌ Database operation failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False
    finally:
        if client:
            try:
                client.close()
            except:
                pass

def get_existing_filenames():
    client = None
    try:
        client = get_db_client()
        db = client[db_name]
        trainer_profiles = db["trainer_profiles"]
        filenames = trainer_profiles.distinct("source_filename")
        return [f for f in filenames if f]
    except Exception as e:
        logger.error(f"❌ Error fetching existing filenames: {e}")
        return []
    finally:
        if client:
            try:
                client.close()
            except:
                pass

