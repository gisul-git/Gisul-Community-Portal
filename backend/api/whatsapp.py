"""
WhatsApp Business API Integration
Handles webhook verification, incoming messages, and message processing
"""
import os
import logging
import asyncio
import base64
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Request, HTTPException, Depends, Header, UploadFile, File
from fastapi.responses import PlainTextResponse, JSONResponse

from services.whatsapp_service import whatsapp_service
from core.db import client, db_name
from models.models import WhatsAppUser, WhatsAppUserCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

# WhatsApp webhook verification token
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "your_verify_token_12345")


# ============================================================================
# DEPENDENCY HELPERS (lazy imports to avoid circular dependency)
# ============================================================================

def get_admin_dependency():
    """Lazy import of get_admin_user to avoid circular dependency"""
    from api.main import get_admin_user
    return get_admin_user


# ============================================================================
# WEBHOOK VERIFICATION & MESSAGE RECEIVING
# ============================================================================

@router.get("/webhook")
async def verify_webhook(request: Request):
    """
    Webhook verification endpoint for WhatsApp Cloud API
    Meta will call this endpoint to verify your webhook
    
    Query params:
        hub.mode: Should be "subscribe"
        hub.verify_token: Your verification token
        hub.challenge: Random string to echo back
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    
    logger.info(f"📞 Webhook verification request: mode={mode}, token={token}")
    
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        logger.info("✅ Webhook verified successfully")
        return PlainTextResponse(content=challenge, status_code=200)
    else:
        logger.warning("❌ Webhook verification failed")
        raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request):
    """
    Receive incoming WhatsApp messages and status updates
    
    This endpoint receives:
    - Text messages
    - Media messages (documents, images)
    - Interactive message responses (button clicks, list selections)
    - Message status updates (sent, delivered, read)
    """
    try:
        body = await request.json()
        logger.info(f"📨 Received webhook: {body}")
        
        # Extract message data
        entry = body.get("entry", [])
        if not entry:
            return JSONResponse({"status": "ok"})
        
        changes = entry[0].get("changes", [])
        if not changes:
            return JSONResponse({"status": "ok"})
        
        value = changes[0].get("value", {})
        
        # Handle incoming messages
        messages = value.get("messages", [])
        if messages:
            for message in messages:
                # Process message asynchronously (don't block webhook response)
                asyncio.create_task(process_incoming_message(message, value))
        
        # Handle message status updates
        statuses = value.get("statuses", [])
        if statuses:
            for status in statuses:
                logger.info(f"📊 Message status: {status.get('id')} - {status.get('status')}")
        
        return JSONResponse({"status": "ok"})
    
    except Exception as e:
        logger.error(f"❌ Error processing webhook: {e}")
        import traceback
        traceback.print_exc()
        # Always return 200 to WhatsApp to avoid retries
        return JSONResponse({"status": "error", "message": str(e)})


# ============================================================================
# MESSAGE PROCESSING
# ============================================================================

async def process_incoming_message(message: Dict[str, Any], value: Dict[str, Any]):
    """
    Process incoming WhatsApp message
    
    Args:
        message: Message object from webhook
        value: Value object containing metadata
    """
    try:
        message_id = message.get("id")
        from_number = message.get("from")
        timestamp = message.get("timestamp")
        message_type = message.get("type")
        
        logger.info(f"📩 Processing message from {from_number}, type: {message_type}")
        
        # Mark message as read
        try:
            await whatsapp_service.mark_message_as_read(message_id)
        except Exception as e:
            logger.warning(f"⚠️ Could not mark message as read: {e}")
        
        # Check if user is authorized
        user_data = await get_whatsapp_user(from_number)
        if not user_data:
            await whatsapp_service.send_text_message(
                from_number,
                "❌ Unauthorized. Please contact admin to register your WhatsApp number."
            )
            return
        
        if not user_data.get("active"):
            await whatsapp_service.send_text_message(
                from_number,
                "❌ Your account is inactive. Please contact admin."
            )
            return
        
        # Update last interaction
        await update_last_interaction(from_number)
        
        # Process based on message type
        if message_type == "text":
            text_body = message.get("text", {}).get("body", "").strip()
            await handle_text_message(from_number, text_body, user_data)
        
        elif message_type == "document":
            await handle_document_message(from_number, message, user_data)
        
        elif message_type == "interactive":
            await handle_interactive_message(from_number, message, user_data)
        
        else:
            await whatsapp_service.send_text_message(
                from_number,
                f"ℹ️ Message type '{message_type}' is not supported yet."
            )
    
    except Exception as e:
        logger.error(f"❌ Error processing message: {e}")
        import traceback
        traceback.print_exc()
        try:
            await whatsapp_service.send_text_message(
                from_number,
                "❌ An error occurred processing your message. Please try again."
            )
        except:
            pass


async def handle_text_message(from_number: str, text: str, user_data: Dict):
    """Handle incoming text messages"""
    text_lower = text.lower().strip()
    
    # Help command
    if text_lower in ["help", "menu", "start", "hi", "hello"]:
        await send_help_menu(from_number, user_data)
        return
    
    # Status check command
    if text_lower.startswith("status"):
        task_id = text_lower.replace("status", "").strip()
        if task_id:
            await handle_status_check(from_number, task_id, user_data)
        else:
            await whatsapp_service.send_text_message(
                from_number,
                "Please provide task ID: status <task_id>"
            )
        return
    
    # Search command
    if "search" in user_data.get("permissions", []):
        # Treat any other text as search query
        await handle_search_request(from_number, text, user_data)
    else:
        await whatsapp_service.send_text_message(
            from_number,
            "❌ You don't have permission to search. Contact admin."
        )


async def handle_document_message(from_number: str, message: Dict, user_data: Dict):
    """Handle incoming document uploads"""
    if "bulk_upload" not in user_data.get("permissions", []):
        await whatsapp_service.send_text_message(
            from_number,
            "❌ You don't have permission to upload documents. Contact admin."
        )
        return
    
    try:
        document = message.get("document", {})
        media_id = document.get("id")
        filename = document.get("filename", "document")
        mime_type = document.get("mime_type", "")
        
        logger.info(f"📄 Received document: {filename} ({mime_type})")
        
        # Validate file type
        allowed_types = ["application/pdf", "application/msword", 
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
        if mime_type not in allowed_types:
            await whatsapp_service.send_text_message(
                from_number,
                f"❌ Unsupported file type. Please send PDF or DOC/DOCX files only."
            )
            return
        
        # Send acknowledgment
        await whatsapp_service.send_text_message(
            from_number,
            f"⏳ Downloading {filename}..."
        )
        
        # Download file from WhatsApp
        file_content = await whatsapp_service.download_media(media_id)
        
        # Process upload
        await process_bulk_upload(from_number, filename, file_content, user_data)
    
    except Exception as e:
        logger.error(f"❌ Error handling document: {e}")
        await whatsapp_service.send_text_message(
            from_number,
            f"❌ Error processing document: {str(e)}"
        )


async def handle_interactive_message(from_number: str, message: Dict, user_data: Dict):
    """Handle interactive message responses (buttons, lists)"""
    interactive = message.get("interactive", {})
    interactive_type = interactive.get("type")
    
    if interactive_type == "button_reply":
        button_reply = interactive.get("button_reply", {})
        button_id = button_reply.get("id")
        logger.info(f"🔘 Button clicked: {button_id}")
        
        # Handle button actions
        if button_id == "help":
            await send_help_menu(from_number, user_data)
        elif button_id.startswith("status_"):
            task_id = button_id.replace("status_", "")
            await handle_status_check(from_number, task_id, user_data)
    
    elif interactive_type == "list_reply":
        list_reply = interactive.get("list_reply", {})
        row_id = list_reply.get("id")
        logger.info(f"📋 List item selected: {row_id}")
        
        # Handle list selections
        # Add custom logic here based on your needs


# ============================================================================
# BUSINESS LOGIC HANDLERS
# ============================================================================

async def handle_search_request(from_number: str, query: str, user_data: Dict):
    """
    Handle search request from WhatsApp
    Calls the internal search endpoint and formats results
    """
    try:
        # Lazy import to avoid circular dependency
        from api.main import log_activity
        
        await whatsapp_service.send_text_message(
            from_number,
            "🔍 Searching trainers..."
        )
        
        # Parse query to extract location if present
        location = extract_location_from_text(query)
        search_query = query
        
        # Import here to avoid circular dependency
        from api.main import stream_search_results
        
        # Collect streaming results
        results = []
        async for chunk in stream_search_results(search_query, location or "", top_k=10):
            import json
            try:
                data = json.loads(chunk)
                if data.get("type") == "match":
                    results.append(data.get("data"))
            except:
                pass
        
        # Format and send results
        if results:
            formatted_message = whatsapp_service.format_search_results(results, max_results=5)
            await whatsapp_service.send_text_message(from_number, formatted_message)
            
            # Log activity
            await log_activity(
                action_type="whatsapp_search",
                user_email=user_data.get("user_email"),
                user_role=user_data.get("user_role"),
                details={"query": query, "results_count": len(results), "via": "whatsapp"},
                ip_address=None,
                user_agent="WhatsApp"
            )
        else:
            await whatsapp_service.send_text_message(
                from_number,
                "❌ No trainers found matching your criteria."
            )
    
    except Exception as e:
        logger.error(f"❌ Search error: {e}")
        await whatsapp_service.send_text_message(
            from_number,
            f"❌ Search failed: {str(e)}"
        )


async def process_bulk_upload(from_number: str, filename: str, file_content: bytes, user_data: Dict):
    """
    Process bulk upload from WhatsApp
    Calls the internal bulk upload endpoint
    """
    try:
        # Lazy import to avoid circular dependency
        from api.main import log_activity
        
        # Import here to avoid circular dependency
        from tasks.tasks import bulk_import_task
        
        # Encode file content to base64
        content_b64 = base64.b64encode(file_content).decode()
        
        # Prepare payload
        payload = [{
            "filename": filename,
            "content_b64": content_b64
        }]
        
        # Queue the task
        task = bulk_import_task.delay(payload, user_data.get("user_email"))
        task_id = task.id
        
        logger.info(f"✅ Bulk upload task queued: {task_id}")
        
        # Send confirmation with task ID
        message = (
            f"✅ Upload started!\n\n"
            f"📄 File: {filename}\n"
            f"🆔 Task ID: {task_id[:8]}...\n\n"
            f"Check status: status {task_id}"
        )
        
        await whatsapp_service.send_text_message(from_number, message)
        
        # Send interactive button for status check
        await whatsapp_service.send_interactive_buttons(
            from_number,
            "Track your upload progress:",
            [
                {"id": f"status_{task_id}", "title": "Check Status"}
            ]
        )
        
        # Log activity
        await log_activity(
            action_type="whatsapp_upload",
            user_email=user_data.get("user_email"),
            user_role=user_data.get("user_role"),
            details={"filename": filename, "task_id": task_id, "via": "whatsapp"},
            ip_address=None,
            user_agent="WhatsApp"
        )
    
    except Exception as e:
        logger.error(f"❌ Bulk upload error: {e}")
        await whatsapp_service.send_text_message(
            from_number,
            f"❌ Upload failed: {str(e)}"
        )


async def handle_status_check(from_number: str, task_id: str, user_data: Dict):
    """Check and send task status"""
    try:
        from celery.result import AsyncResult
        
        result = AsyncResult(task_id)
        status = result.state
        
        # Get task info
        info = result.info if result.info else {}
        
        if status == "SUCCESS":
            processed = info.get("processed", 0)
            total = info.get("total", 0)
            errors = info.get("errors", [])
            
            message = whatsapp_service.format_upload_status(
                task_id, status, processed, total, errors
            )
        elif status == "FAILURE":
            error_msg = str(info) if info else "Unknown error"
            message = f"❌ Task Failed\n\nTask ID: {task_id[:8]}...\nError: {error_msg}"
        elif status == "PENDING":
            message = f"⏳ Task Pending\n\nTask ID: {task_id[:8]}...\nStatus: Waiting in queue"
        else:
            processed = info.get("processed", 0)
            total = info.get("total", 0)
            message = whatsapp_service.format_upload_status(
                task_id, status, processed, total
            )
        
        await whatsapp_service.send_text_message(from_number, message)
    
    except Exception as e:
        logger.error(f"❌ Status check error: {e}")
        await whatsapp_service.send_text_message(
            from_number,
            f"❌ Could not retrieve status for task {task_id[:8]}..."
        )


async def send_help_menu(from_number: str, user_data: Dict):
    """Send help menu with available commands"""
    permissions = user_data.get("permissions", [])
    
    message_parts = [
        "📱 *WhatsApp Bot Commands*\n",
        "\n*Available Actions:*\n"
    ]
    
    if "search" in permissions:
        message_parts.append(
            "🔍 *Search Trainers*\n"
            "Just type your search query\n"
            "Example: Python developer in Bangalore\n\n"
        )
    
    if "bulk_upload" in permissions:
        message_parts.append(
            "📤 *Upload Resumes*\n"
            "Send PDF/DOC files directly\n"
            "Supports multiple files\n\n"
        )
    
    message_parts.append(
        "📊 *Check Status*\n"
        "Type: status <task_id>\n\n"
        "❓ *Help*\n"
        "Type: help or menu\n"
    )
    
    await whatsapp_service.send_text_message(from_number, "".join(message_parts))


# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

async def get_whatsapp_user(phone_number: str) -> Optional[Dict]:
    """Get WhatsApp user from database"""
    try:
<<<<<<< HEAD
        db = client[db_name]
        collection = db["whatsapp_users"]
=======
        whatsapp_db = client[db_name]
        collection = whatsapp_db["whatsapp_users"]
>>>>>>> dev
        
        user = await collection.find_one({"phone_number": phone_number})
        return user
    except Exception as e:
        logger.error(f"❌ Error fetching WhatsApp user: {e}")
        return None


async def update_last_interaction(phone_number: str):
    """Update last interaction timestamp"""
    try:
<<<<<<< HEAD
        db = client[db_name]
        collection = db["whatsapp_users"]
=======
        whatsapp_db = client[db_name]
        collection = whatsapp_db["whatsapp_users"]
>>>>>>> dev
        
        await collection.update_one(
            {"phone_number": phone_number},
            {"$set": {"last_interaction": datetime.utcnow()}}
        )
    except Exception as e:
        logger.error(f"❌ Error updating last interaction: {e}")


# ============================================================================
# ADMIN ENDPOINTS FOR MANAGING WHATSAPP USERS
# ============================================================================

def _get_admin_dep():
    """Wrapper to delay import until request time"""
    return get_admin_dependency()

@router.post("/users/register")
async def register_whatsapp_user(user_data: WhatsAppUserCreate, admin=Depends(_get_admin_dep)):
    """
    Register a WhatsApp number for API access (Admin only)
    
    Args:
        user_data: WhatsApp user registration data
    
    Returns:
        Created user data
    """
    try:
<<<<<<< HEAD
        db = client[db_name]
        collection = db["whatsapp_users"]
=======
        whatsapp_db = client[db_name]
        collection = whatsapp_db["whatsapp_users"]
>>>>>>> dev
        
        # Check if phone number already registered
        existing = await collection.find_one({"phone_number": user_data.phone_number})
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")
        
        # Check if email exists in users collection
        users_collection = whatsapp_db["users"]
        user = await users_collection.find_one({"email": user_data.user_email})
        if not user:
            raise HTTPException(status_code=404, detail="User email not found")
        
        # Create WhatsApp user
        whatsapp_user = WhatsAppUser(
            phone_number=user_data.phone_number,
            user_email=user_data.user_email,
            user_role=user.get("role", "admin"),
            permissions=user_data.permissions,
            active=True,
            registered_at=datetime.utcnow()
        )
        
        result = await collection.insert_one(whatsapp_user.dict())
        
        logger.info(f"✅ Registered WhatsApp user: {user_data.phone_number}")
        
        return {
            "message": "WhatsApp user registered successfully",
            "phone_number": user_data.phone_number,
            "user_email": user_data.user_email,
            "permissions": user_data.permissions
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error registering WhatsApp user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users")
async def list_whatsapp_users(admin=Depends(_get_admin_dep)):
    """List all registered WhatsApp users (Admin only)"""
    try:
<<<<<<< HEAD
        db = client[db_name]
        collection = db["whatsapp_users"]
=======
        whatsapp_db = client[db_name]
        collection = whatsapp_db["whatsapp_users"]
>>>>>>> dev
        
        users = await collection.find({}).to_list(length=None)
        
        # Convert ObjectId to string
        for user in users:
            user["_id"] = str(user["_id"])
        
        return {"users": users, "total": len(users)}
    
    except Exception as e:
        logger.error(f"❌ Error listing WhatsApp users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{phone_number}")
async def delete_whatsapp_user(phone_number: str, admin=Depends(_get_admin_dep)):
    """Delete WhatsApp user registration (Admin only)"""
    try:
<<<<<<< HEAD
        db = client[db_name]
        collection = db["whatsapp_users"]
=======
        whatsapp_db = client[db_name]
        collection = whatsapp_db["whatsapp_users"]
>>>>>>> dev
        
        result = await collection.delete_one({"phone_number": phone_number})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="WhatsApp user not found")
        
        logger.info(f"✅ Deleted WhatsApp user: {phone_number}")
        
        return {"message": "WhatsApp user deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting WhatsApp user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{phone_number}/toggle")
async def toggle_whatsapp_user(phone_number: str, admin=Depends(_get_admin_dep)):
    """Toggle WhatsApp user active status (Admin only)"""
    try:
<<<<<<< HEAD
        db = client[db_name]
        collection = db["whatsapp_users"]
=======
        whatsapp_db = client[db_name]
        collection = whatsapp_db["whatsapp_users"]
>>>>>>> dev
        
        user = await collection.find_one({"phone_number": phone_number})
        if not user:
            raise HTTPException(status_code=404, detail="WhatsApp user not found")
        
        new_status = not user.get("active", True)
        
        await collection.update_one(
            {"phone_number": phone_number},
            {"$set": {"active": new_status}}
        )
        
        logger.info(f"✅ Toggled WhatsApp user {phone_number}: active={new_status}")
        
        return {
            "message": "Status updated successfully",
            "phone_number": phone_number,
            "active": new_status
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error toggling WhatsApp user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def extract_location_from_text(text: str) -> Optional[str]:
    """Extract location from search text"""
    # Simple pattern matching for common location indicators
    patterns = [
        r"in\s+([A-Za-z\s]+?)(?:\s|$)",
        r"at\s+([A-Za-z\s]+?)(?:\s|$)",
        r"from\s+([A-Za-z\s]+?)(?:\s|$)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    
    return None
