"""
Database Migration Script for WhatsApp Integration
Creates necessary collections and indexes
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.db import get_db_client, db_name
from datetime import datetime


async def create_whatsapp_collections():
    """Create WhatsApp-related collections and indexes"""
    
    print("=" * 60)
    print("WhatsApp Database Migration")
    print("=" * 60)
    
    try:
        client = get_db_client()
        db = client[db_name]
        
        # Create whatsapp_users collection
        print("\n1. Creating whatsapp_users collection...")
        
        # Check if collection exists
        collections = await db.list_collection_names()
        
        if "whatsapp_users" not in collections:
            await db.create_collection("whatsapp_users")
            print("   ✅ Collection created")
        else:
            print("   ℹ️  Collection already exists")
        
        # Create indexes
        print("\n2. Creating indexes...")
        
        whatsapp_users = db["whatsapp_users"]
        
        # Unique index on phone_number
        await whatsapp_users.create_index("phone_number", unique=True)
        print("   ✅ Unique index on phone_number")
        
        # Index on user_email for lookups
        await whatsapp_users.create_index("user_email")
        print("   ✅ Index on user_email")
        
        # Index on active status
        await whatsapp_users.create_index("active")
        print("   ✅ Index on active")
        
        # Index on last_interaction for cleanup queries
        await whatsapp_users.create_index("last_interaction")
        print("   ✅ Index on last_interaction")
        
        # Create whatsapp_conversations collection (optional, for context tracking)
        print("\n3. Creating whatsapp_conversations collection...")
        
        if "whatsapp_conversations" not in collections:
            await db.create_collection("whatsapp_conversations")
            print("   ✅ Collection created")
        else:
            print("   ℹ️  Collection already exists")
        
        whatsapp_conversations = db["whatsapp_conversations"]
        
        # Index on phone_number
        await whatsapp_conversations.create_index("phone_number")
        print("   ✅ Index on phone_number")
        
        # Index on conversation_id
        await whatsapp_conversations.create_index("conversation_id", unique=True)
        print("   ✅ Unique index on conversation_id")
        
        # TTL index on expires_at (auto-delete expired conversations)
        await whatsapp_conversations.create_index("expires_at", expireAfterSeconds=0)
        print("   ✅ TTL index on expires_at")
        
        # Verify collections
        print("\n4. Verifying collections...")
        collections = await db.list_collection_names()
        
        if "whatsapp_users" in collections and "whatsapp_conversations" in collections:
            print("   ✅ All collections created successfully")
        else:
            print("   ⚠️  Some collections may be missing")
        
        # Show collection stats
        print("\n5. Collection Statistics:")
        
        users_count = await whatsapp_users.count_documents({})
        print(f"   WhatsApp Users: {users_count}")
        
        conversations_count = await whatsapp_conversations.count_documents({})
        print(f"   Active Conversations: {conversations_count}")
        
        print("\n" + "=" * 60)
        print("Migration Complete!")
        print("=" * 60)
        
        print("\n📝 Next Steps:")
        print("   1. Register WhatsApp users via API")
        print("   2. Test webhook integration")
        print("   3. Monitor logs for any issues")
        
        return True
    
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def create_sample_user():
    """Create a sample WhatsApp user for testing"""
    
    print("\n" + "=" * 60)
    print("Create Sample WhatsApp User")
    print("=" * 60)
    
    try:
        client = get_db_client()
        db = client[db_name]
        whatsapp_users = db["whatsapp_users"]
        
        # Check if sample user already exists
        sample_phone = "919876543210"
        existing = await whatsapp_users.find_one({"phone_number": sample_phone})
        
        if existing:
            print(f"\n⚠️  Sample user already exists: {sample_phone}")
            print("   Skipping creation")
            return
        
        # Check if admin user exists
        users = db["users"]
        admin = await users.find_one({"role": "admin"})
        
        if not admin:
            print("\n⚠️  No admin user found in database")
            print("   Please create an admin user first")
            return
        
        # Create sample WhatsApp user
        sample_user = {
            "phone_number": sample_phone,
            "user_email": admin["email"],
            "user_role": "admin",
            "permissions": ["search", "bulk_upload"],
            "active": True,
            "registered_at": datetime.utcnow(),
            "last_interaction": None
        }
        
        await whatsapp_users.insert_one(sample_user)
        
        print(f"\n✅ Sample user created:")
        print(f"   Phone: {sample_phone}")
        print(f"   Email: {admin['email']}")
        print(f"   Permissions: {sample_user['permissions']}")
        print(f"\n⚠️  Note: This is a sample. Replace with your actual WhatsApp number!")
        
    except Exception as e:
        print(f"\n❌ Failed to create sample user: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run migration"""
    success = await create_whatsapp_collections()
    
    if success:
        # Ask if user wants to create sample user
        print("\n" + "=" * 60)
        response = input("Create sample WhatsApp user for testing? (y/n): ")
        if response.lower() == 'y':
            await create_sample_user()


if __name__ == "__main__":
    asyncio.run(main())
