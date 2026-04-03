"""
Program Intake Form Handler
AWS Lambda function for AWS GovCloud (us-gov-west-1 or us-gov-east-1)

Routes:
  POST  /program-intake    – Store referral in DynamoDB + send SES notification
  GET   /referrals         – Return all referrals (requires x-api-key header)
  PATCH /referrals/{id}    – Update referral status (requires x-api-key header)

Required environment variables:
  TABLE_NAME         – DynamoDB table name
  SENDER_EMAIL       – SES-verified sender (e.g. no-reply@haltreferral.org)
  NOTIFICATION_EMAIL – Notification recipient (e.g. support@halt360.org)
  ALLOWED_ORIGIN     – Site domain for CORS (e.g. https://www.haltreferral.org)
  DASHBOARD_API_KEY  – Secret key required to access GET/PATCH /referrals
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
ses      = boto3.client("ses")

GOVCLOUD_CONSOLE = "https://console.amazonaws-us-gov.com"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _cors_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin":  os.environ.get("ALLOWED_ORIGIN", "*"),
        "Access-Control-Allow-Headers": "Content-Type,x-api-key",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    }


def _respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": _cors_headers(),
        "body": json.dumps(body, default=str),
    }


def _check_api_key(event: dict) -> bool:
    """Validate the x-api-key header against the DASHBOARD_API_KEY env var."""
    expected = os.environ.get("DASHBOARD_API_KEY", "")
    if not expected:
        logger.error("DASHBOARD_API_KEY env var is not set")
        return False
    provided = (event.get("headers") or {}).get("x-api-key", "")
    return provided == expected


def _get_table():
    table_name = os.environ.get("TABLE_NAME", "")
    if not table_name:
        raise ValueError("TABLE_NAME environment variable is not set")
    return dynamodb.Table(table_name)


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /program-intake
# ─────────────────────────────────────────────────────────────────────────────

def _handle_intake(body: dict) -> dict:
    name  = (body.get("name")  or "").strip()
    email = (body.get("email") or "").strip()
    if not name or not email:
        return _respond(400, {"error": "Fields 'name' and 'email' are required"})

    zipcode             = (body.get("zipcode")      or "").strip()
    landing_page        = (body.get("landing_page") or "Unknown Program").strip()
    program_of_interest = landing_page
    state               = "Alaska"   # All HALT programs are Alaska DOH programs

    now           = datetime.now(timezone.utc).isoformat()
    submission_id = str(uuid.uuid4())

    item = {
        "submission_id":       submission_id,
        "submitted_at":        now,
        "landing_page":        landing_page,
        "program_of_interest": program_of_interest,
        "state":               state,
        "name":                name,
        "email":               email,
        "phone":               (body.get("phone")      or "").strip(),
        "zipcode":             zipcode,
        "motivation":          (body.get("motivation") or "").strip(),
        "status":              "new",
    }

    # Step 1 — Store in DynamoDB
    try:
        _get_table().put_item(Item=item)
        logger.info("Submission %s stored | program: %s", submission_id, program_of_interest)
    except (ClientError, ValueError) as exc:
        logger.error("DynamoDB put_item failed: %s", exc)
        return _respond(500, {"error": "Failed to store submission"})

    # Step 2 — Send PII-free notification
    _send_notification(submission_id, program_of_interest)

    return _respond(200, {"message": "Submission received. A team member will follow up soon."})


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /referrals
# ─────────────────────────────────────────────────────────────────────────────

def _handle_get_referrals(event: dict) -> dict:
    if not _check_api_key(event):
        return _respond(401, {"error": "Unauthorized"})

    try:
        table    = _get_table()
        response = table.scan()
        items    = response.get("Items", [])

        # Handle DynamoDB pagination
        while "LastEvaluatedKey" in response:
            response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            items.extend(response.get("Items", []))

        # Sort newest first
        items.sort(key=lambda x: x.get("submitted_at", ""), reverse=True)

        logger.info("Returning %d referrals", len(items))
        return _respond(200, {"referrals": items, "count": len(items)})

    except (ClientError, ValueError) as exc:
        logger.error("DynamoDB scan failed: %s", exc)
        return _respond(500, {"error": "Failed to retrieve referrals"})


# ─────────────────────────────────────────────────────────────────────────────
# Route: PATCH /referrals/{submission_id}
# ─────────────────────────────────────────────────────────────────────────────

VALID_STATUSES = {"new", "contacted", "enrolled", "not_eligible", "no_response"}

def _handle_update_referral(event: dict, path: str) -> dict:
    if not _check_api_key(event):
        return _respond(401, {"error": "Unauthorized"})

    # Extract submission_id from path e.g. /referrals/abc-123
    parts         = path.rstrip("/").split("/")
    submission_id = parts[-1] if len(parts) >= 2 else ""
    if not submission_id:
        return _respond(400, {"error": "Missing submission_id in path"})

    try:
        body       = json.loads(event.get("body") or "{}")
        new_status = (body.get("status") or "").strip().lower()
    except (json.JSONDecodeError, TypeError):
        return _respond(400, {"error": "Invalid request body"})

    if new_status not in VALID_STATUSES:
        return _respond(400, {
            "error": f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}"
        })

    try:
        table = _get_table()
        table.update_item(
            Key={"submission_id": submission_id},
            UpdateExpression="SET #s = :s, updated_at = :u",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": new_status,
                ":u": datetime.now(timezone.utc).isoformat(),
            },
            ConditionExpression=Attr("submission_id").exists(),
        )
        logger.info("Submission %s status updated to %s", submission_id, new_status)
        return _respond(200, {"message": f"Status updated to '{new_status}'"})

    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        if error_code == "ConditionalCheckFailedException":
            return _respond(404, {"error": "Submission not found"})
        logger.error("DynamoDB update_item failed: %s", exc)
        return _respond(500, {"error": "Failed to update submission"})


# ─────────────────────────────────────────────────────────────────────────────
# SES notification (no PII)
# ─────────────────────────────────────────────────────────────────────────────

def _send_notification(submission_id: str, program: str) -> None:
    sender     = os.environ.get("SENDER_EMAIL", "")
    recipients = [
        addr.strip()
        for addr in os.environ.get("NOTIFICATION_EMAIL", "").split(",")
        if addr.strip()
    ]
    if not sender or not recipients:
        logger.warning("SENDER_EMAIL or NOTIFICATION_EMAIL not set — skipping")
        return

    allowed_origin = os.environ.get("ALLOWED_ORIGIN", "https://www.haltreferral.org").rstrip("/")
    dashboard_link = (
        f"{allowed_origin}/program_landings/dashboard.html?id={submission_id}"
    )

    subject   = "New Referral Received"
    text_body = (
        f"A new referral has been submitted on the {program} landing page.\n\n"
        f"Click the link below to view this referral in the secure dashboard:\n"
        f"{dashboard_link}\n\n"
        f"You will be prompted for your dashboard API key when the page loads.\n\n"
        f"Submission ID: {submission_id}\n\n"
        f"This is an automated notification. No personal information "
        f"is included in this email for security purposes."
    )
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:#003366;">New Referral Received</h2>
  <p>A new referral has been submitted on the <strong>{program}</strong> landing page.</p>
  <p>Click the button below to view this referral directly in the secure dashboard.
     You will be prompted for your dashboard API key when the page loads.</p>
  <p style="margin:28px 0;">
    <a href="{dashboard_link}"
       style="display:inline-block;background-color:#003366;color:#fff;
              padding:12px 28px;text-decoration:none;border-radius:6px;
              font-weight:bold;font-size:15px;">
      View This Referral
    </a>
  </p>
  <p style="color:#595959;font-size:13px;">Submission ID: {submission_id}</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/>
  <p style="color:#888;font-size:12px;">
    Automated notification from the HALT referral system.
    No personal information is included in this email.
    All referral data is stored securely within the GovCloud environment.
  </p>
</body>
</html>"""

    try:
        ses.send_email(
            Source=sender,
            Destination={"ToAddresses": recipients},
            Message={
                "Subject": {"Data": subject,   "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text_body, "Charset": "UTF-8"},
                    "Html": {"Data": html_body,  "Charset": "UTF-8"},
                },
            },
        )
        logger.info("Notification sent for submission %s", submission_id)
    except ClientError as exc:
        logger.error("Failed to send notification email: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Main handler — route dispatcher
# ─────────────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    http    = event.get("requestContext", {}).get("http", {})
    method  = http.get("method", "").upper()
    path    = http.get("path", "")

    # CORS pre-flight
    if method == "OPTIONS":
        return _respond(200, {})

    # Parse body (for POST and PATCH)
    body = {}
    if method in ("POST", "PATCH"):
        try:
            body = json.loads(event.get("body") or "{}")
        except (json.JSONDecodeError, TypeError):
            return _respond(400, {"error": "Invalid JSON body"})

    # Route dispatch
    if method == "POST" and path == "/program-intake":
        return _handle_intake(body)

    if method == "GET" and path == "/referrals":
        return _handle_get_referrals(event)

    if method == "PATCH" and path.startswith("/referrals/"):
        return _handle_update_referral(event, path)

    return _respond(404, {"error": "Not found"})
