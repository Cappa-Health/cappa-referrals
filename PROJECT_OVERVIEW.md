# cappa-referrals — Project Overview

## Project Summary

**cappa-referrals** is a healthcare referral intake system for HALT (Healthy ALaska Transformation) programs, deployed entirely on **AWS GovCloud** (us-gov-west-1). It is a FedRAMP-compliant, fully serverless system built with vanilla HTML/CSS/JS (no frontend framework).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Authentication | AWS Cognito (User Pools) |
| API | AWS API Gateway v2 (HTTP API) + Lambda (Python 3.11) |
| Storage | DynamoDB |
| Email | Amazon SES |
| Hosting | S3 + CloudFront |
| Infrastructure | CloudFormation (IaC) |

---

## Directory Structure

```
cappa-referrals/
├── index.html                          # Main program directory/index
├── web.css                             # Shared brand styles (Cappa brand colors)
├── README.md                           # Project description
├── program_landings/                   # All public-facing web pages
│   ├── auth.js                         # Core Cognito auth module (835 lines)
│   ├── auth-config.js                  # Generated Cognito config (region/client ID)
│   ├── dashboard.html                  # Referral dashboard for state staff
│   ├── admin.html                      # Admin user management page
│   ├── intake-shared.js                # Shared form submission logic
│   ├── intake-shared.css               # Intake form styles
│   ├── dashboard-shared.css            # Shared dashboard/admin styles
│   ├── lose_weight.html                # Program landing page: weight loss / diabetes prevention
│   ├── lower_blood_pressure.html       # Program landing page: hypertension management
│   ├── lower_blood_sugar.html          # Program landing page: diabetes education
│   ├── assets/                         # Brand assets & favicons
│   └── public/                         # Photos & videos for pages
└── govcloud-deployment/                # Infrastructure & backend code
    ├── cloudformation.yaml             # IaC — defines all AWS resources
    ├── cloudfront-function.js          # URL rewriting for short paths
    ├── generate_auth_config.py         # Generates auth-config.js from CF outputs
    ├── lambda/
    │   ├── handler.py                  # All API business logic (563+ lines)
    │   └── handler.zip                 # Compiled ZIP for deployment
    └── *.md                            # Deployment guides
```

---

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `program_landings/auth.js` | 835 | Core Cognito auth library: login, password reset, MFA, token refresh |
| `program_landings/admin.html` | 2,170 | Admin dashboard: create/delete users, reset passwords, assign states |
| `program_landings/dashboard.html` | 1,178 | Referral dashboard: view/filter/update referral statuses |
| `govcloud-deployment/lambda/handler.py` | 563+ | API endpoints: form intake, referral CRUD, user management |
| `govcloud-deployment/cloudformation.yaml` | 230+ | Infrastructure: S3, DynamoDB, Cognito, API GW, Lambda, CloudFront, IAM |
| `program_landings/intake-shared.js` | 90 | Shared form submission → API Gateway → SES |
| `program_landings/auth-config.js` | — | Generated at deploy time; contains Cognito region & user pool client ID |

---

## Features & Routes

### Public Pages (no auth required)

| Route | Page |
|---|---|
| `/` or `/lose-weight` | Lose Weight program landing |
| `/lower-blood-pressure` | Blood Pressure program landing |
| `/lower-blood-sugar` | Blood Sugar program landing |
| `POST /program-intake` | Form submission → DynamoDB + SES email |

### Dashboard (Cognito-authenticated state staff)

- View referrals filtered by their assigned state (`custom:state` claim)
- Search/filter by email, status, program
- Update referral status: new → contacted → enrolled, etc.
- Expandable detail rows with full referral info

### Admin Page (admin Cognito group only)

- Create / disable / delete Cognito users
- Assign states and admin roles
- Reset passwords
- Resend invite emails

---

## Authentication & Authorization

**Implementation:** AWS Cognito User Pools with a custom JavaScript auth module (`auth.js`)

**Auth Flow:**
1. `auth.js` bootstraps on page load, checking `sessionStorage` for valid tokens
2. Login modal shown if unauthenticated
3. Cognito `InitiateAuth` → receives ID token, access token, refresh token
4. Tokens stored in `sessionStorage` (client-side only, no cookies)
5. Automatic silent refresh 60 seconds before expiry

**User Types:**

| Type | Access |
|---|---|
| Dashboard Users | `custom:state` attribute restricts them to their state's referrals |
| Admin Users | `admin` Cognito group — full access + user management |
| Disabled Users | Blocked from login |

**Authorization:**
- API Gateway v2 JWT authorizer validates tokens before Lambda invocation
- Lambda extracts `custom:state` and `cognito:groups` from JWT
- `_is_admin_caller()` enforces admin-only endpoints

**Password Policy:** Min 12 chars, uppercase, lowercase, number, symbol

**First-Login:** Cognito enforces `NEW_PASSWORD_REQUIRED` challenge — users must set a new password on first login

---

## State Management

No client-side state management library. Instead:

- **Session Storage:** Cognito tokens (`halt_id_token`, `halt_refresh_token`, `halt_access_token`)
- **DOM-based state:** Table rows expanded/collapsed via class toggle
- **API state:** Fetched on demand — no persistent client cache
- **Auth events:** Custom events (`halt:authenticated`, `halt:logout`) for page coordination

---

## API Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/program-intake` | None | Store form submission, send SES notification |
| GET | `/referrals` | Cognito JWT | List referrals (filtered by state, or all if admin) |
| PATCH | `/referrals/{id}` | Cognito JWT | Update referral status |
| GET | `/admin/users` | Admin only | List all dashboard users |
| POST | `/admin/users` | Admin only | Create new Cognito user |
| PATCH | `/admin/users` | Admin only | Update user (enable/disable, state, admin role) |
| DELETE | `/admin/users` | Admin only | Permanently delete user |
| POST | `/admin/users/resend` | Admin only | Resend invite email |
| POST | `/admin/users/reset-password` | Admin only | Force password reset |

---

## Configuration & Environment

**Lambda Environment Variables:**

```
TABLE_NAME      = "halt-landing-intake-submissions"
USER_POOL_ID    = "us-gov-west-1_xxxxx"
SENDER_EMAIL    = "no-reply@haltreferral.org"
ALLOWED_ORIGIN  = "https://www.haltreferral.org"
```

**Frontend Config** (`auth-config.js`, generated at deploy time):

```javascript
window.HALT_AUTH_CONFIG = Object.freeze({
  cognitoRegion: "us-gov-west-1",
  userPoolClient: "6kht95c982kkdrloqfdhsveaol",
});
```

**Cognito Setup:**
- User Pool: `halt-landing-dashboard-users`
- Username attribute: Email
- Custom attributes: `custom:state` (e.g., "Alaska", "California")
- Groups: `admin`

---

## DynamoDB Table: `halt-landing-intake-submissions`

| Key | Type | Notes |
|---|---|---|
| `submission_id` | String (PK) | UUID |
| `landing_page` | String | GSI partition key (`by-program`) |
| `status` | String | GSI partition key (`by-date`) |
| `state` | String | GSI partition key (`by-state`) |
| `submitted_at` | String | GSI sort key for all three GSIs |

**Global Secondary Indexes:**
- `by-program` — partition: `landing_page`, sort: `submitted_at`
- `by-date` — partition: `status`, sort: `submitted_at`
- `by-state` — partition: `state`, sort: `submitted_at`

---

## AWS Services Summary

| Service | Purpose |
|---|---|
| Cognito | User auth, groups, custom state attribute |
| API Gateway (HTTP v2) | REST endpoints with JWT authorizer |
| Lambda (Python 3.11) | All business logic |
| DynamoDB | Referral submission storage |
| SES | Email notifications on form submission |
| S3 | Static site hosting |
| CloudFront | HTTPS, CDN, URL rewriting via CloudFront Function |

---

## Current Branch: `add-login-feature`

This branch adds the complete authentication and authorization layer. Key changes vs. `main`:

- Added `auth.js` (full Cognito auth module)
- Added `auth-config.js` (generated Cognito config)
- Added `admin.html` (user management dashboard)
- Expanded `dashboard.html` with auth + state filtering
- Lambda `handler.py` updated with admin API routes
- CloudFormation updated with Cognito resources + new DynamoDB GSIs
- Added `generate_auth_config.py` deployment helper

**Recent commits:**
- `0d475c4` Updated disabled flow
- `9461254` Fixed reset password flow
- `8616a66` Adjusted attributes
- `90230a5` Fix password reset flow and sync CloudFormation stack to live state
- `cffeea3` Admin page: redirect non-admins to Referral Dashboard on login
