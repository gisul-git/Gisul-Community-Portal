"""
WhatsApp Integration Test Script
Run this to test WhatsApp functionality without sending actual messages
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from services.whatsapp_service import whatsapp_service


async def test_whatsapp_service():
    """Test WhatsApp service configuration and methods"""
    
    print("=" * 60)
    print("WhatsApp Service Test")
    print("=" * 60)
    
    # Check configuration
    print("\n1. Configuration Check:")
    print(f"   Phone Number ID: {whatsapp_service.phone_number_id or '❌ Not set'}")
    print(f"   Access Token: {'✅ Set' if whatsapp_service.access_token else '❌ Not set'}")
    print(f"   Base URL: {whatsapp_service.base_url}")
    
    if not whatsapp_service.phone_number_id or not whatsapp_service.access_token:
        print("\n⚠️  WhatsApp credentials not configured!")
        print("   Please update backend/.env with:")
        print("   - WHATSAPP_PHONE_NUMBER_ID")
        print("   - WHATSAPP_ACCESS_TOKEN")
        return
    
    # Test message formatting
    print("\n2. Message Formatting Test:")
    
    # Test search results formatting
    sample_results = [
        {
            "name": "John Doe",
            "skills": ["Python", "Django", "FastAPI", "PostgreSQL", "Docker"],
            "location": "Bangalore",
            "experience_years": 5
        },
        {
            "name": "Jane Smith",
            "skills": ["React", "Node.js", "MongoDB", "AWS"],
            "location": "Mumbai",
            "experience_years": 3
        }
    ]
    
    formatted_search = whatsapp_service.format_search_results(sample_results, max_results=5)
    print("\n   Search Results Format:")
    print("   " + "-" * 50)
    print("   " + formatted_search.replace("\n", "\n   "))
    print("   " + "-" * 50)
    
    # Test upload status formatting
    formatted_status = whatsapp_service.format_upload_status(
        task_id="abc123def456",
        status="PROCESSING",
        processed=3,
        total=5,
        errors=["File1.pdf: Invalid format", "File2.doc: Parsing error"]
    )
    print("\n   Upload Status Format:")
    print("   " + "-" * 50)
    print("   " + formatted_status.replace("\n", "\n   "))
    print("   " + "-" * 50)
    
    # Test sending (optional - uncomment to actually send)
    print("\n3. Send Test Message (Skipped):")
    print("   To test actual sending, uncomment the code below")
    print("   and provide a valid test phone number")
    
    # Uncomment to test actual sending:
    # test_phone = "919876543210"  # Replace with your test number
    # try:
    #     result = await whatsapp_service.send_text_message(
    #         to=test_phone,
    #         message="🤖 Test message from WhatsApp Bot"
    #     )
    #     print(f"   ✅ Message sent successfully: {result}")
    # except Exception as e:
    #     print(f"   ❌ Failed to send message: {e}")
    
    print("\n" + "=" * 60)
    print("Test Complete!")
    print("=" * 60)


async def test_database_operations():
    """Test database operations for WhatsApp users"""
    from core.db import get_db_client, db_name
    from datetime import datetime
    
    print("\n" + "=" * 60)
    print("Database Operations Test")
    print("=" * 60)
    
    try:
        client = get_db_client()
        db = client[db_name]
        collection = db["whatsapp_users"]
        
        # Check if collection exists
        collections = await db.list_collection_names()
        print(f"\n1. Collections in database: {len(collections)}")
        print(f"   WhatsApp users collection exists: {'whatsapp_users' in collections}")
        
        # Count existing users
        count = await collection.count_documents({})
        print(f"\n2. Registered WhatsApp users: {count}")
        
        if count > 0:
            # Show sample users
            users = await collection.find({}).limit(3).to_list(length=3)
            print("\n3. Sample users:")
            for user in users:
                print(f"   - {user.get('phone_number')} ({user.get('user_email')})")
                print(f"     Permissions: {user.get('permissions')}")
                print(f"     Active: {user.get('active')}")
        
        print("\n" + "=" * 60)
        print("Database Test Complete!")
        print("=" * 60)
    
    except Exception as e:
        print(f"\n❌ Database test failed: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run all tests"""
    await test_whatsapp_service()
    await test_database_operations()
    
    print("\n📝 Next Steps:")
    print("   1. Configure WhatsApp credentials in backend/.env")
    print("   2. Setup webhook using ngrok (see WHATSAPP_SETUP_GUIDE.md)")
    print("   3. Register WhatsApp users via API")
    print("   4. Test by sending messages to your WhatsApp Business number")


if __name__ == "__main__":
    asyncio.run(main())
