"""
WhatsApp Business Cloud API Service
Handles sending/receiving messages via Meta WhatsApp Cloud API
"""
import os
import logging
import httpx
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# WhatsApp Cloud API Configuration
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v21.0")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "your_verify_token_12345")

# Base URL for WhatsApp Cloud API
WHATSAPP_API_BASE_URL = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"


class WhatsAppService:
    """Service for interacting with WhatsApp Cloud API"""
    
    def __init__(self):
        self.phone_number_id = WHATSAPP_PHONE_NUMBER_ID
        self.access_token = WHATSAPP_ACCESS_TOKEN
        self.base_url = WHATSAPP_API_BASE_URL
        
        if not self.phone_number_id or not self.access_token:
            logger.warning("⚠️ WhatsApp credentials not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for WhatsApp API requests"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
    
    async def send_text_message(self, to: str, message: str) -> Dict[str, Any]:
        """
        Send a text message to a WhatsApp number
        
        Args:
            to: Recipient phone number (with country code, no + sign)
            message: Text message to send
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()
                logger.info(f"✅ Message sent to {to}: {result}")
                return result
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Failed to send message: {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"❌ Error sending WhatsApp message: {e}")
            raise
    
    async def send_template_message(self, to: str, template_name: str, language_code: str = "en", 
                                   components: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """
        Send a template message (pre-approved by Meta)
        
        Args:
            to: Recipient phone number
            template_name: Name of approved template
            language_code: Language code (e.g., 'en', 'en_US')
            components: Template components (parameters, buttons, etc.)
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": language_code
                }
            }
        }
        
        if components:
            payload["template"]["components"] = components
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()
                logger.info(f"✅ Template message sent to {to}")
                return result
        except Exception as e:
            logger.error(f"❌ Error sending template message: {e}")
            raise

    async def send_interactive_list(self, to: str, body_text: str, button_text: str, 
                                   sections: List[Dict]) -> Dict[str, Any]:
        """
        Send an interactive list message
        
        Args:
            to: Recipient phone number
            body_text: Main message text
            button_text: Text on the list button
            sections: List sections with rows
                Example: [
                    {
                        "title": "Section 1",
                        "rows": [
                            {"id": "1", "title": "Option 1", "description": "Description 1"}
                        ]
                    }
                ]
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "body": {
                    "text": body_text
                },
                "action": {
                    "button": button_text,
                    "sections": sections
                }
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()
                logger.info(f"✅ Interactive list sent to {to}")
                return result
        except Exception as e:
            logger.error(f"❌ Error sending interactive list: {e}")
            raise
    
    async def send_interactive_buttons(self, to: str, body_text: str, 
                                      buttons: List[Dict]) -> Dict[str, Any]:
        """
        Send an interactive button message (max 3 buttons)
        
        Args:
            to: Recipient phone number
            body_text: Main message text
            buttons: List of buttons
                Example: [
                    {"id": "btn1", "title": "Button 1"},
                    {"id": "btn2", "title": "Button 2"}
                ]
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        # Format buttons for API
        formatted_buttons = [
            {
                "type": "reply",
                "reply": {
                    "id": btn["id"],
                    "title": btn["title"]
                }
            }
            for btn in buttons[:3]  # Max 3 buttons
        ]
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {
                    "text": body_text
                },
                "action": {
                    "buttons": formatted_buttons
                }
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()
                logger.info(f"✅ Interactive buttons sent to {to}")
                return result
        except Exception as e:
            logger.error(f"❌ Error sending interactive buttons: {e}")
            raise
    
    async def download_media(self, media_id: str) -> bytes:
        """
        Download media file from WhatsApp
        
        Args:
            media_id: Media ID from webhook
        
        Returns:
            File content as bytes
        """
        # Step 1: Get media URL
        url = f"{self.base_url}/{media_id}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Get media URL
                response = await client.get(url, headers=self._get_headers())
                response.raise_for_status()
                media_data = response.json()
                media_url = media_data.get("url")
                
                if not media_url:
                    raise ValueError("No media URL in response")
                
                # Download media content
                media_response = await client.get(media_url, headers=self._get_headers())
                media_response.raise_for_status()
                
                logger.info(f"✅ Downloaded media {media_id}")
                return media_response.content
        except Exception as e:
            logger.error(f"❌ Error downloading media: {e}")
            raise
    
    async def mark_message_as_read(self, message_id: str) -> Dict[str, Any]:
        """
        Mark a message as read
        
        Args:
            message_id: Message ID from webhook
        
        Returns:
            API response dict
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()
                logger.info(f"✅ Marked message {message_id} as read")
                return result
        except Exception as e:
            logger.error(f"❌ Error marking message as read: {e}")
            raise
    
    def format_search_results(self, results: List[Dict], max_results: int = 5) -> str:
        """
        Format search results for WhatsApp message (respecting character limits)
        
        Args:
            results: List of trainer profiles
            max_results: Maximum number of results to include
        
        Returns:
            Formatted message string
        """
        if not results:
            return "No trainers found matching your criteria."
        
        message_parts = [f"🔍 Found {len(results)} trainer(s):\n"]
        
        for idx, profile in enumerate(results[:max_results], 1):
            name = profile.get("name", "N/A")
            skills = ", ".join(profile.get("skills", [])[:5])  # First 5 skills
            location = profile.get("location", "N/A")
            experience = profile.get("experience_years", "N/A")
            
            message_parts.append(
                f"\n{idx}. {name}\n"
                f"   📍 {location}\n"
                f"   💼 {experience} years exp\n"
                f"   🛠️ {skills}\n"
            )
        
        if len(results) > max_results:
            message_parts.append(f"\n... and {len(results) - max_results} more results")
            message_parts.append("\nReply 'MORE' to see additional results")
        
        return "".join(message_parts)
    
    def format_upload_status(self, task_id: str, status: str, 
                           processed: int = 0, total: int = 0, 
                           errors: Optional[List[str]] = None) -> str:
        """
        Format upload task status for WhatsApp message
        
        Args:
            task_id: Celery task ID
            status: Task status (PENDING, PROCESSING, SUCCESS, FAILURE)
            processed: Number of files processed
            total: Total number of files
            errors: List of error messages
        
        Returns:
            Formatted status message
        """
        status_emoji = {
            "PENDING": "⏳",
            "PROCESSING": "🔄",
            "SUCCESS": "✅",
            "FAILURE": "❌"
        }
        
        emoji = status_emoji.get(status, "ℹ️")
        
        message_parts = [
            f"{emoji} Upload Status\n",
            f"Task ID: {task_id[:8]}...\n",
            f"Status: {status}\n"
        ]
        
        if total > 0:
            message_parts.append(f"Progress: {processed}/{total} files\n")
        
        if errors:
            message_parts.append(f"\n⚠️ Errors:\n")
            for error in errors[:3]:  # Show first 3 errors
                message_parts.append(f"  • {error}\n")
            if len(errors) > 3:
                message_parts.append(f"  ... and {len(errors) - 3} more errors\n")
        
        return "".join(message_parts)


# Singleton instance
whatsapp_service = WhatsAppService()
