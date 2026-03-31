"""
Program Intake Form Handler
AWS Lambda function for AWS GovCloud (us-gov-west-1 or us-gov-east-1)

Receives a POST from API Gateway HTTP API, validates the payload,
and sends a notification email via Amazon SES.

Required environment variables:
  SENDER_EMAIL    – SES-verified "From" address (e.g. no-reply@yourdomain.gov)
  RECIPIENT_EMAIL – Address(es) that should receive intake notifications;
                    comma-separated for multiple recipients
  ALLOWED_ORIGIN  – CloudFront domain for CORS (e.g. https://d1abc.cloudfront.net)
                    Use '*' only for development/testing
"""

import json
import logging
import os

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ses = boto3.client("ses")  # inherits region from Lambda execution environment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cors_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
    }


def _respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": _cors_headers(),
        "body": json.dumps(body),
    }


def _build_email(data: dict) -> tuple[str, str, str]:
    """Return (subject, plain-text body, HTML body) for the SES message."""
    landing_page = data.get("landing_page", "Unknown Program")
    name         = data.get("name", "")
    email        = data.get("email", "")
    phone        = data.get("phone", "")
    zipcode      = data.get("zipcode", "")
    motivation   = data.get("motivation", "")

    subject = f"New Program Intake – {landing_page}: {name}"

    text_body = (
        f"New program intake submission received.\n\n"
        f"Program:    {landing_page}\n"
        f"Name:       {name}\n"
        f"Email:      {email}\n"
        f"Phone:      {phone}\n"
        f"ZIP Code:   {zipcode}\n"
        f"Motivation: {motivation}\n"
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<body style="font-family: Arial, sans-serif; color: #1a1a1a;">
  <h2>New Program Intake Submission</h2>
  <table cellpadding="6" style="border-collapse: collapse;">
    <tr><td><strong>Program</strong></td><td>{landing_page}</td></tr>
    <tr><td><strong>Name</strong></td><td>{name}</td></tr>
    <tr><td><strong>Email</strong></td><td><a href="mailto:{email}">{email}</a></td></tr>
    <tr><td><strong>Phone</strong></td><td>{phone}</td></tr>
    <tr><td><strong>ZIP Code</strong></td><td>{zipcode}</td></tr>
    <tr><td><strong>Motivation</strong></td><td>{motivation}</td></tr>
  </table>
  <p style="color:#595959; font-size:12px;">
    This message was generated automatically by the HALT program intake form.
  </p>
</body>
</html>"""

    return subject, text_body, html_body


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    logger.info("Event received: %s", json.dumps(event))

    # CORS pre-flight
    http_method = (
        event.get("requestContext", {})
             .get("http", {})
             .get("method", "")
             .upper()
    )
    if http_method == "OPTIONS":
        return _respond(200, {})

    # Parse body
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Could not parse request body: %s", exc)
        return _respond(400, {"error": "Invalid JSON body"})

    # Basic validation
    name  = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    if not name or not email:
        return _respond(400, {"error": "Fields 'name' and 'email' are required"})

    # Retrieve config
    sender    = os.environ.get("SENDER_EMAIL", "")
    recipient = os.environ.get("RECIPIENT_EMAIL", "")
    if not sender or not recipient:
        logger.error("SENDER_EMAIL or RECIPIENT_EMAIL env vars are not set")
        return _respond(500, {"error": "Server configuration error"})

    recipients = [r.strip() for r in recipient.split(",") if r.strip()]

    subject, text_body, html_body = _build_email(body)

    # Send via SES
    try:
        ses.send_email(
            Source=sender,
            Destination={"ToAddresses": recipients},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body,  "Charset": "UTF-8"},
                },
            },
            ReplyToAddresses=[email],
        )
        logger.info(
            "Intake email sent for '%s' (program: %s)",
            name,
            body.get("landing_page"),
        )
        return _respond(200, {"message": "Submission received. A team member will follow up soon."})

    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        logger.error("SES send_email failed [%s]: %s", error_code, exc)
        return _respond(500, {"error": "Failed to send notification email"})
