"""
Program Intake Form Handler
AWS Lambda function for AWS GovCloud (us-gov-west-1 or us-gov-east-1)

Routes:
  POST   /program-intake            – Store referral in DynamoDB + send SES notification
  GET    /referrals                 – Return referrals for caller's state (requires Cognito JWT)
  PATCH  /referrals/{id}            – Update referral status (requires Cognito JWT)
  GET    /admin/users               – List Cognito dashboard users (supports pagination; requires admin group)
  POST   /admin/users               – Create a new Cognito dashboard user (requires admin group)
  PATCH  /admin/users               – Enable/disable or edit state/admin role (requires admin group)
  DELETE /admin/users               – Permanently delete a Cognito dashboard user (requires admin group)
  POST   /admin/users/resend        – Resend an invite to a pending user (requires admin group)
  POST   /admin/users/reset-password – Send a password reset to a confirmed user (requires admin group)

Required environment variables:
  TABLE_NAME         – DynamoDB table name
  USER_POOL_ID       – Cognito User Pool ID for admin user management
  SENDER_EMAIL       – SES-verified sender (e.g. no-reply@haltreferral.org)
  NOTIFICATION_EMAIL – Notification recipient (e.g. support@halt360.org)
  ALLOWED_ORIGIN     – Site domain for CORS (e.g. https://www.haltreferral.org)

Authentication:
  All routes except POST /program-intake are protected by an API Gateway JWT
  authorizer backed by Cognito. The Lambda receives the validated claims in
  event["requestContext"]["authorizer"]["jwt"]["claims"]. No auth code is needed
  here — API Gateway rejects unauthenticated requests before Lambda is invoked.

  Each Cognito user has a custom:state attribute (e.g. "Alaska") that determines
  which referrals they can see. The by-state GSI is queried using this value.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
ses      = boto3.client("ses")
cognito  = boto3.client("cognito-idp")
ssm      = boto3.client("ssm")

# Maps landing_page values (submitted by intake forms) to US states.
# Add new entries here when programs in new states are launched.
PROGRAM_STATE = {
    "Lose Weight":          "Alaska",
    "Lower Blood Pressure": "Alaska",
    "Lower Blood Sugar":    "Alaska",
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _cors_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin":  os.environ.get("ALLOWED_ORIGIN", ""),
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    }


def _respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": _cors_headers(),
        "body": json.dumps(body, default=str),
    }


def _get_table():
    table_name = os.environ.get("TABLE_NAME", "")
    if not table_name:
        raise ValueError("TABLE_NAME environment variable is not set")
    return dynamodb.Table(table_name)


def _get_jwt_claims(event: dict) -> dict:
    return (
        event.get("requestContext", {})
             .get("authorizer", {})
             .get("jwt", {})
             .get("claims", {})
    )


def _get_caller_state(event: dict) -> str:
    """Extract the custom:state claim from the Cognito JWT (already validated by API GW)."""
    claims = _get_jwt_claims(event)
    return claims.get("custom:state", "").strip()


def _get_caller_username(event: dict) -> str:
    claims = _get_jwt_claims(event)
    return (
        claims.get("cognito:username")
        or claims.get("username")
        or claims.get("email")
        or ""
    ).strip()


def _parse_group_claims(raw_groups) -> list[str]:
    if isinstance(raw_groups, list):
        return [str(group).strip() for group in raw_groups if str(group).strip()]

    if isinstance(raw_groups, str):
        raw_groups = raw_groups.strip()
        if not raw_groups:
            return []
        try:
            parsed = json.loads(raw_groups)
        except json.JSONDecodeError:
            return [group.strip() for group in raw_groups.split(",") if group.strip()]
        if isinstance(parsed, list):
            return [str(group).strip() for group in parsed if str(group).strip()]
        parsed_value = str(parsed).strip()
        return [parsed_value] if parsed_value else []

    return []


def _is_admin_caller(event: dict) -> bool:
    claims = _get_jwt_claims(event)
    admin_group_name = _get_admin_group_name()
    groups = _parse_group_claims(claims.get("cognito:groups") or claims.get("groups") or "")

    if admin_group_name in groups:
        return True

    username = _get_caller_username(event)
    if not username:
        return False

    pool_id = _get_user_pool_id()
    response = cognito.admin_list_groups_for_user(
        UserPoolId=pool_id,
        Username=username,
        Limit=60,
    )
    return any(group.get("GroupName") == admin_group_name for group in response.get("Groups", []))


# ─────────────────────────────────────────────────────────────────────────────
# Route: POST /program-intake
# ─────────────────────────────────────────────────────────────────────────────

def _handle_intake(body: dict) -> dict:
    name  = (body.get("name")  or "").strip()
    email = (body.get("email") or "").strip()
    if not name or not email:
        return _respond(400, {"error": "Fields 'name' and 'email' are required"})

    zipcode      = (body.get("zipcode")      or "").strip()
    landing_page = (body.get("landing_page") or "Unknown Program").strip()
    state        = PROGRAM_STATE.get(landing_page, "Unknown")

    now           = datetime.now(timezone.utc).isoformat()
    submission_id = str(uuid.uuid4())

    item = {
        "submission_id":       submission_id,
        "submitted_at":        now,
        "landing_page":        landing_page,
        "program_of_interest": landing_page,
        "state":               state,
        "name":                name,
        "email":               email,
        "phone":               (body.get("phone")      or "").strip(),
        "zipcode":             zipcode,
        "motivation":          (body.get("motivation") or "").strip(),
        "status":              "new",
    }

    try:
        _get_table().put_item(Item=item)
        logger.info("Submission %s stored | program: %s | state: %s", submission_id, landing_page, state)
    except (ClientError, ValueError) as exc:
        logger.error("DynamoDB put_item failed: %s", exc)
        return _respond(500, {"error": "Failed to store submission"})

    _send_notification(submission_id, landing_page)

    return _respond(200, {"message": "Submission received. A team member will follow up soon."})


# ─────────────────────────────────────────────────────────────────────────────
# Route: GET /referrals
# ─────────────────────────────────────────────────────────────────────────────

def _handle_get_referrals(event: dict) -> dict:
    is_admin  = _is_admin_caller(event)
    user_state = _get_caller_state(event)

    if not is_admin and not user_state:
        logger.error("No custom:state claim in JWT — cannot filter referrals")
        return _respond(403, {"error": "User account is missing a state assignment. Contact an administrator."})

    try:
        table = _get_table()
        items = []

        if is_admin:
            # Admins see all referrals across every state via a full table scan.
            kwargs = {"ScanIndexForward": False}
            response = table.scan()
            items.extend(response.get("Items", []))
            while "LastEvaluatedKey" in response:
                response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
                items.extend(response.get("Items", []))
            # Sort newest first by submitted_at
            items.sort(key=lambda x: x.get("submitted_at", ""), reverse=True)
            logger.info("Admin caller — returning all %d referrals", len(items))
            return _respond(200, {"referrals": items, "count": len(items), "state": "all"})
        else:
            response = table.query(
                IndexName="by-state",
                KeyConditionExpression=Key("state").eq(user_state),
                ScanIndexForward=False,
            )
            items = response.get("Items", [])
            while "LastEvaluatedKey" in response:
                response = table.query(
                    IndexName="by-state",
                    KeyConditionExpression=Key("state").eq(user_state),
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                    ScanIndexForward=False,
                )
                items.extend(response.get("Items", []))
            logger.info("Returning %d referrals for state=%s", len(items), user_state)
            return _respond(200, {"referrals": items, "count": len(items), "state": user_state})

    except (ClientError, ValueError) as exc:
        logger.error("DynamoDB query failed: %s", exc)
        return _respond(500, {"error": "Failed to retrieve referrals"})


# ─────────────────────────────────────────────────────────────────────────────
# Route: PATCH /referrals/{submission_id}
# ─────────────────────────────────────────────────────────────────────────────

VALID_STATUSES = {"new", "contacted", "enrolled", "not_eligible", "no_response"}

def _handle_update_referral(event: dict, path: str) -> dict:
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

def _get_notification_emails(state: str) -> list[str]:
    """
    Look up notification recipients for the given state from SSM Parameter Store.
    The parameter value is a JSON object keyed by state name, e.g.:
      {"Alaska": "a@example.gov,b@example.gov", "Default": "support@halt360.org"}
    Falls back to the "Default" key, then to the NOTIFICATION_EMAIL env var.
    """
    try:
        resp  = ssm.get_parameter(Name="/halt-landing/notification-emails")
        email_map = json.loads(resp["Parameter"]["Value"])
        raw = email_map.get(state) or email_map.get("Default") or ""
        recipients = [e.strip() for e in raw.split(",") if e.strip()]
        if recipients:
            return recipients
    except Exception as exc:
        logger.warning("Could not load notification emails from SSM: %s", exc)

    # Fallback to environment variable
    return [
        addr.strip()
        for addr in os.environ.get("NOTIFICATION_EMAIL", "").split(",")
        if addr.strip()
    ]


def _send_notification(submission_id: str, program: str) -> None:
    sender     = os.environ.get("SENDER_EMAIL", "")
    recipients = _get_notification_emails(PROGRAM_STATE.get(program, ""))
    if not sender or not recipients:
        logger.warning("SENDER_EMAIL or NOTIFICATION_EMAIL not set — skipping")
        return

    allowed_origin = os.environ.get("ALLOWED_ORIGIN", "").rstrip("/")
    if not allowed_origin or allowed_origin == "*":
        logger.warning("ALLOWED_ORIGIN not set or is '*' — dashboard link omitted from notification email")
        dashboard_link = None
    else:
        dashboard_link = f"{allowed_origin}/program_landings/dashboard.html?id={submission_id}"

    subject = "New Referral Received"
    if dashboard_link:
        text_body = (
            f"A new referral has been submitted on the {program} landing page.\n\n"
            f"Click the link below to view this referral in the secure HALT dashboard:\n"
            f"{dashboard_link}\n\n"
            f"Sign in with your HALT dashboard email address and password when prompted.\n"
            f"If you have not yet set up your account, contact your administrator.\n\n"
            f"Submission ID: {submission_id}\n\n"
            f"This is an automated notification. No personal information "
            f"is included in this email for security purposes."
        )
        dashboard_button = f"""
  <p>Click the button below to view this referral in the secure HALT dashboard.</p>
  <p style="margin:28px 0;">
    <a href="{dashboard_link}"
       style="display:inline-block;background-color:#003366;color:#fff;
              padding:12px 28px;text-decoration:none;border-radius:6px;
              font-weight:bold;font-size:15px;">
      View This Referral
    </a>
  </p>
  <p style="font-size:13px;color:#595959;">
    Sign in with your HALT dashboard email address and password when prompted.
    If you have not yet set up your account, contact your administrator.
  </p>"""
    else:
        text_body = (
            f"A new referral has been submitted on the {program} landing page.\n\n"
            f"Sign in to the HALT dashboard with your email address and password to view this referral.\n"
            f"If you have not yet set up your account, contact your administrator.\n\n"
            f"Submission ID: {submission_id}\n\n"
            f"This is an automated notification. No personal information "
            f"is included in this email for security purposes."
        )
        dashboard_button = (
            "<p>Sign in to the HALT dashboard with your email address and password to view this referral.</p>"
            "<p style='font-size:13px;color:#595959;'>If you have not yet set up your account, contact your administrator.</p>"
        )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:#003366;">New Referral Received</h2>
  <p>A new referral has been submitted on the <strong>{program}</strong> landing page.</p>
  {dashboard_button}
  <p style="color:#595959;font-size:13px;">Submission ID: {submission_id}</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/>
  <p style="color:#595959;font-size:12px;">
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
# Routes: GET / POST / PATCH /admin/users
# ─────────────────────────────────────────────────────────────────────────────

def _get_user_pool_id() -> str:
    pool_id = os.environ.get("USER_POOL_ID", "")
    if not pool_id:
        raise ValueError("USER_POOL_ID environment variable is not set")
    return pool_id


def _get_admin_group_name() -> str:
    group_name = os.environ.get("ADMIN_GROUP_NAME", "").strip()
    if not group_name:
        raise ValueError("ADMIN_GROUP_NAME environment variable is not set")
    return group_name


def _handle_list_users(event: dict) -> dict:
    try:
        pool_id     = _get_user_pool_id()
        admin_group = _get_admin_group_name()
        params = event.get("queryStringParameters") or {}
        pagination_token = (params.get("pagination_token") or "").strip()

        # Fetch admin group members — use sub (UUID) for reliable cross-call matching.
        # Email-based matching fails when the email attribute is absent or differs in
        # casing between list_users_in_group and list_users.
        admin_subs: set = set()
        kwargs = {"UserPoolId": pool_id, "GroupName": admin_group, "Limit": 60}
        while True:
            resp = cognito.list_users_in_group(**kwargs)
            for u in resp.get("Users", []):
                attrs = {a["Name"]: a["Value"] for a in u.get("Attributes", [])}
                sub = attrs.get("sub", "")
                if sub:
                    admin_subs.add(sub)
            next_token = resp.get("NextToken")
            if not next_token:
                break
            kwargs["NextToken"] = next_token

        # Fetch one page of users and annotate with group membership.
        users  = []
        kwargs = {"UserPoolId": pool_id, "Limit": 60}
        if pagination_token:
            kwargs["PaginationToken"] = pagination_token

        resp = cognito.list_users(**kwargs)
        for u in resp.get("Users", []):
            attrs     = {a["Name"]: a["Value"] for a in u.get("Attributes", [])}
            email     = attrs.get("email", u["Username"])
            sub       = attrs.get("sub", "")
            last_mod  = u.get("UserLastModifiedDate")
            users.append({
                "email":         email,
                "state":         attrs.get("custom:state", ""),
                "status":        u.get("UserStatus", ""),
                "enabled":       u.get("Enabled", True),
                "created":       u.get("UserCreateDate").isoformat() if u.get("UserCreateDate") else "",
                "last_modified": last_mod.isoformat() if last_mod else "",
                "is_admin":      bool(sub and sub in admin_subs),
            })

        next_pagination_token = resp.get("PaginationToken", "")

        users.sort(key=lambda u: u["email"])
        logger.info(
            "Listed %d users (%d admins) next_token=%s",
            len(users),
            len(admin_subs),
            bool(next_pagination_token),
        )
        return _respond(
            200,
            {
                "users": users,
                "count": len(users),
                "next_pagination_token": next_pagination_token,
            },
        )

    except ClientError as exc:
        logger.error("list_users failed: %s", exc)
        return _respond(500, {"error": "Failed to list users"})
    except ValueError as exc:
        logger.error("list_users config error: %s", exc)
        return _respond(500, {"error": "Admin group is not configured correctly."})


def _handle_create_user(body: dict) -> dict:
    email = (body.get("email") or "").strip().lower()
    state = (body.get("state") or "").strip()
    is_admin = body.get("is_admin") is True
    if not email or not state:
        return _respond(400, {"error": "Fields 'email' and 'state' are required"})

    try:
        pool_id = _get_user_pool_id()
        cognito.admin_create_user(
            UserPoolId=pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email",         "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "custom:state",  "Value": state},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
        if is_admin:
            cognito.admin_add_user_to_group(
                UserPoolId=pool_id,
                Username=email,
                GroupName=_get_admin_group_name(),
            )

        logger.info("Created user %s for state %s admin=%s", email, state, is_admin)
        return _respond(200, {"message": f"User {email} created. Temporary password sent by email."})

    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UsernameExistsException":
            return _respond(409, {"error": f"A user with email {email} already exists."})
        if code == "ResourceNotFoundException" and is_admin:
            return _respond(500, {"error": "Admin group is not configured correctly."})
        logger.error("admin_create_user failed: %s", exc)
        return _respond(500, {"error": "Failed to create user"})
    except ValueError as exc:
        logger.error("create_user config error: %s", exc)
        return _respond(500, {"error": "Admin group is not configured correctly."})


def _handle_delete_user(event: dict) -> dict:
    params = event.get("queryStringParameters") or {}
    email  = (params.get("email") or "").strip().lower()
    if not email:
        return _respond(400, {"error": "Query parameter 'email' is required"})

    try:
        pool_id = _get_user_pool_id()
        cognito.admin_delete_user(UserPoolId=pool_id, Username=email)
        logger.info("Deleted user %s", email)
        return _respond(200, {"message": f"User {email} deleted."})

    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UserNotFoundException":
            return _respond(404, {"error": f"User {email} not found."})
        logger.error("admin_delete_user failed: %s", exc)
        return _respond(500, {"error": "Failed to delete user"})


def _handle_resend_invite(body: dict) -> dict:
    email = (body.get("email") or "").strip().lower()
    if not email:
        return _respond(400, {"error": "Field 'email' is required"})
    try:
        pool_id = _get_user_pool_id()
        user = cognito.admin_get_user(UserPoolId=pool_id, Username=email)
        status = user.get("UserStatus", "")
        enabled = user.get("Enabled", True)

        if not enabled:
            return _respond(409, {"error": f"User {email} is disabled. Re-enable the account before resending the invite."})
        if status != "FORCE_CHANGE_PASSWORD":
            return _respond(409, {"error": f"User {email} is not in invite-pending status."})

        cognito.admin_create_user(
            UserPoolId=pool_id,
            Username=email,
            MessageAction="RESEND",
            DesiredDeliveryMediums=["EMAIL"],
        )
        logger.info("Resent invite for %s", email)
        return _respond(200, {"message": f"Invite resent to {email}."})
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UserNotFoundException":
            return _respond(404, {"error": f"User {email} not found."})
        logger.error("resend_invite failed: %s", exc)
        return _respond(500, {"error": "Failed to resend invite"})


def _handle_reset_password(body: dict) -> dict:
    email = (body.get("email") or "").strip().lower()
    if not email:
        return _respond(400, {"error": "Field 'email' is required"})

    try:
        pool_id = _get_user_pool_id()
        user = cognito.admin_get_user(UserPoolId=pool_id, Username=email)
        status = user.get("UserStatus", "")
        enabled = user.get("Enabled", True)

        if not enabled:
            return _respond(409, {"error": f"User {email} is disabled. Re-enable the account before resetting the password."})
        if status != "CONFIRMED":
            if status == "FORCE_CHANGE_PASSWORD":
                return _respond(409, {"error": f"User {email} is still pending setup. Use resend invite instead."})
            return _respond(409, {"error": f"User {email} is not eligible for an admin password reset."})

        cognito.admin_reset_user_password(UserPoolId=pool_id, Username=email)
        logger.info("Password reset initiated for %s", email)
        return _respond(200, {"message": f"Password reset sent to {email}."})
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UserNotFoundException":
            return _respond(404, {"error": f"User {email} not found."})
        logger.error("reset_password failed: %s", exc)
        return _respond(500, {"error": "Failed to reset password"})


def _handle_edit_user(body: dict) -> dict:
    email    = (body.get("email") or "").strip().lower()
    state    = body.get("state")    # None means don't change
    is_admin = body.get("is_admin") # None means don't change

    if not email:
        return _respond(400, {"error": "Field 'email' is required"})
    if state is None and is_admin is None:
        return _respond(400, {"error": "At least one of 'state' or 'is_admin' must be provided"})

    try:
        pool_id     = _get_user_pool_id()
        admin_group = _get_admin_group_name()

        if state is not None:
            state = state.strip()
            if not state:
                return _respond(400, {"error": "Field 'state' cannot be empty"})
            cognito.admin_update_user_attributes(
                UserPoolId=pool_id,
                Username=email,
                UserAttributes=[{"Name": "custom:state", "Value": state}],
            )
            logger.info("Updated state for user %s to %s", email, state)

        if is_admin is not None:
            if is_admin:
                cognito.admin_add_user_to_group(
                    UserPoolId=pool_id,
                    Username=email,
                    GroupName=admin_group,
                )
                logger.info("Added user %s to admin group", email)
            else:
                cognito.admin_remove_user_from_group(
                    UserPoolId=pool_id,
                    Username=email,
                    GroupName=admin_group,
                )
                logger.info("Removed user %s from admin group", email)

        return _respond(200, {"message": f"User {email} updated."})

    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UserNotFoundException":
            return _respond(404, {"error": f"User {email} not found."})
        logger.error("edit_user failed: %s", exc)
        return _respond(500, {"error": "Failed to update user"})
    except ValueError as exc:
        logger.error("edit_user config error: %s", exc)
        return _respond(500, {"error": "Admin group is not configured correctly."})


def _handle_toggle_user(body: dict) -> dict:
    email   = (body.get("email") or "").strip().lower()
    enabled = body.get("enabled")
    if not email or enabled is None:
        return _respond(400, {"error": "Fields 'email' and 'enabled' are required"})

    try:
        pool_id = _get_user_pool_id()
        if enabled:
            cognito.admin_enable_user(UserPoolId=pool_id, Username=email)
            logger.info("Enabled user %s", email)
        else:
            cognito.admin_disable_user(UserPoolId=pool_id, Username=email)
            logger.info("Disabled user %s", email)
        return _respond(200, {"message": f"User {email} {'enabled' if enabled else 'disabled'}."})

    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UserNotFoundException":
            return _respond(404, {"error": f"User {email} not found."})
        logger.error("admin_enable/disable_user failed: %s", exc)
        return _respond(500, {"error": "Failed to update user"})


# ─────────────────────────────────────────────────────────────────────────────
# Main handler — route dispatcher
# ─────────────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    request_context = event.get("requestContext", {})
    http = request_context.get("http", {})
    logger.info(
        "Request received method=%s path=%s requestId=%s",
        http.get("method", "").upper(),
        http.get("path", ""),
        request_context.get("requestId", ""),
    )
    method = http.get("method", "").upper()
    path   = http.get("path", "")

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

    _admin_paths = {"/admin/users", "/admin/users/resend", "/admin/users/reset-password"}
    if path in _admin_paths and method in {"GET", "POST", "PATCH", "DELETE"}:
        try:
            if not _is_admin_caller(event):
                return _respond(403, {"error": "Administrator access is required."})
        except ValueError as exc:
            logger.error("admin authorization config error: %s", exc)
            return _respond(500, {"error": "Admin authorization is not configured correctly."})

    if method == "GET" and path == "/admin/users":
        return _handle_list_users(event)

    if method == "POST" and path == "/admin/users":
        return _handle_create_user(body)

    if method == "PATCH" and path == "/admin/users":
        if "enabled" in body:
            return _handle_toggle_user(body)
        return _handle_edit_user(body)

    if method == "POST" and path == "/admin/users/resend":
        return _handle_resend_invite(body)

    if method == "POST" and path == "/admin/users/reset-password":
        return _handle_reset_password(body)

    if method == "DELETE" and path == "/admin/users":
        return _handle_delete_user(event)

    return _respond(404, {"error": "Not found"})
