import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)

# AWS SES Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "no-reply@example.com")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Gisul Team")

# Initialize SES client if credentials are available
ses_client = None
if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    try:
        ses_client = boto3.client(
            'ses',
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY
        )
        logger.info(f"✅ AWS SES client initialized for region: {AWS_REGION}")
    except Exception as e:
        logger.error(f"❌ Failed to initialize AWS SES client: {e}")
        ses_client = None
else:
    logger.warning(" ")

def send_email(to_email, subject, body, html_body=None):
    """
    Send an email using AWS SES.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        body: Plain text email body
        html_body: Optional HTML email body
    
    Returns:
        Message ID if successful, None otherwise
    """
    if not ses_client:
        logger.warning(f"⚠️ AWS SES not configured, skipping email send to {to_email}")
        return None
    
    # Verify sender email is verified in SES
    try:
        # Try to send email
        destination = {
            'ToAddresses': [to_email]
        }
        
        message = {
            'Subject': {
                'Data': subject,
                'Charset': 'UTF-8'
            },
            'Body': {
                'Text': {
                    'Data': body,
                    'Charset': 'UTF-8'
                }
            }
        }
        
        # Add HTML body if provided
        if html_body:
            message['Body']['Html'] = {
                'Data': html_body,
                'Charset': 'UTF-8'
            }
        
        response = ses_client.send_email(
            Source=f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>",
            Destination=destination,
            Message=message
        )
        
        message_id = response.get('MessageId')
        logger.info(f"✅ Email sent to {to_email}, MessageId: {message_id}")
        return message_id
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        if error_code == 'MessageRejected':
            logger.error(f"❌ Email rejected by SES for {to_email}: {error_message}")
            logger.error(f"   Make sure {EMAIL_FROM} is verified in AWS SES")
        elif error_code == 'MailFromDomainNotVerifiedException':
            logger.error(f"❌ Mail from domain not verified: {error_message}")
        else:
            logger.error(f"❌ Failed to send email to {to_email}: {error_code} - {error_message}")
        return None
    except Exception as e:
        logger.error(f"❌ Unexpected error sending email to {to_email}: {str(e)}")
        return None

def send_verification_email(to_email, verification_token, role="user"):
    """
    Send email verification email with token.
    
    Args:
        to_email: Recipient email address
        verification_token: Email verification token
        role: User role (admin, trainer, customer)
    
    Returns:
        Message ID if successful, None otherwise
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    verification_url = f"{frontend_url}/verify-email/{verification_token}"
    
    subject = "Verify Your Email Address"
    
    plain_text = f"""
Hello,

Thank you for signing up! Please verify your email address to complete your {role} account registration.

Click the following link to verify your email:
{verification_url}

This link will expire in 24 hours.

If you did not create an account, please ignore this email.

Best regards,
{EMAIL_FROM_NAME}
"""
    
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #6953a3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
        .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <h2>Verify Your Email Address</h2>
        <p>Hello,</p>
        <p>Thank you for signing up! Please verify your email address to complete your {role} account registration.</p>
        <p>
            <a href="{verification_url}" class="button">Verify Email Address</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6953a3;">{verification_url}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you did not create an account, please ignore this email.</p>
        <div class="footer">
            <p>Best regards,<br>{EMAIL_FROM_NAME}</p>
        </div>
    </div>
</body>
</html>
"""
    
    return send_email(to_email, subject, plain_text, html_body)

def send_password_reset_email(to_email, reset_token, role="user"):
    """
    Send password reset email with token.
    
    Args:
        to_email: Recipient email address
        reset_token: Password reset token
        role: User role (admin, trainer, customer)
    
    Returns:
        Message ID if successful, None otherwise
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    
    subject = "Password Reset Request"
    
    plain_text = f"""
Hello,

You have requested to reset your password for your {role} account.

Click the following link to reset your password:
{reset_url}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
{EMAIL_FROM_NAME}
"""
    
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #6953a3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
        .warning {{ background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }}
        .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <h2>Password Reset Request</h2>
        <p>Hello,</p>
        <p>You have requested to reset your password for your {role} account.</p>
        <p>
            <a href="{reset_url}" class="button">Reset Password</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6953a3;">{reset_url}</p>
        <div class="warning">
            <strong>⚠️ Important:</strong> This link will expire in 1 hour.
        </div>
        <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
        <div class="footer">
            <p>Best regards,<br>{EMAIL_FROM_NAME}</p>
        </div>
    </div>
</body>
</html>
"""
    
    return send_email(to_email, subject, plain_text, html_body)
