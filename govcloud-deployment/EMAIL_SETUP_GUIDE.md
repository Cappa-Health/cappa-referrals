# HALT Email Setup Guide

**Domain:** haltreferral.org
**Sender:** no-reply@haltreferral.org (via SES in GovCloud)
**Recipient:** An @haltreferral.org mailbox (requires email hosting)
**DNS provider:** GoDaddy

---

## Part 1 – Set Up Email Hosting on haltreferral.org (Receiving)

Since haltreferral.org doesn't have email yet, you need an email hosting service so you can actually receive mail at @haltreferral.org addresses. Here are two practical options:

### Option A – GoDaddy Microsoft 365 Email (Recommended — simplest since domain is already there)

1. Sign in to **https://www.godaddy.com** → go to your account
2. In the top navigation, click **Email & Office**
3. Click **Get Started** or **Add Email**
4. Select **Microsoft 365** (or **Professional Email** for a cheaper option)
5. Choose a plan and set up your first mailbox (e.g. `referrals@haltreferral.org` or `intake@haltreferral.org`)
6. Complete the purchase
7. GoDaddy will **automatically configure the MX records** since the domain is already managed there — no manual DNS setup needed for receiving
8. Sign in to your new mailbox to confirm it works

### Option B – Google Workspace

1. Go to **https://workspace.google.com** and sign up using haltreferral.org
2. Follow the setup wizard
3. When prompted to verify your domain, add the TXT record in GoDaddy DNS
4. Add the Google MX records in GoDaddy DNS:

| Type | Name | Value | Priority |
|---|---|---|---|
| MX | @ | ASPMX.L.GOOGLE.COM | 1 |
| MX | @ | ALT1.ASPMX.L.GOOGLE.COM | 5 |
| MX | @ | ALT2.ASPMX.L.GOOGLE.COM | 5 |
| MX | @ | ALT3.ASPMX.L.GOOGLE.COM | 10 |
| MX | @ | ALT4.ASPMX.L.GOOGLE.COM | 10 |

5. Remove any existing GoDaddy parking MX records first
6. Create your mailbox (e.g. `referrals@haltreferral.org`)

> **Pick whichever option you prefer.** Option A is simplest since GoDaddy handles the DNS automatically. Once your mailbox is created and you can receive test emails at it, move to Part 2.

---

## Part 2 – Verify haltreferral.org in SES (Sending)

Verifying the entire domain (instead of individual email addresses) lets SES send from ANY @haltreferral.org address, including no-reply@haltreferral.org.

### Step 1 – Start domain verification in SES

1. Sign in to the **GovCloud console** at **https://console.amazonaws-us-gov.com**
2. Confirm the region is **US Gov West (us-gov-west-1)** in the top-right
3. Search for **SES** and click **Amazon Simple Email Service**
4. In the left sidebar click **Verified identities**
5. Click **Create identity**
6. Select **Domain** (not Email address)
7. Enter: `haltreferral.org`
8. Under **Advanced DKIM settings**:
   - Select **Easy DKIM**
   - DKIM signing key length: **RSA_2048_BIT**
   - Check **Enabled** for DKIM signatures
9. Click **Create identity**

### Step 2 – Copy the DNS records

After clicking Create identity, SES will show you DNS records that need to be added to GoDaddy. You'll see:

**3 CNAME records for DKIM** (these prove you own the domain and authorize SES to send on its behalf):

| Type | Name | Value |
|---|---|---|
| CNAME | `abc123._domainkey.haltreferral.org` | `abc123.dkim.amazonses.com` |
| CNAME | `def456._domainkey.haltreferral.org` | `def456.dkim.amazonses.com` |
| CNAME | `ghi789._domainkey.haltreferral.org` | `ghi789.dkim.amazonses.com` |

(The actual values will be different — copy the ones SES shows you.)

Keep this page open.

### Step 3 – Add DKIM records in GoDaddy

1. Open a new tab and go to **https://dcc.godaddy.com**
2. Click **haltreferral.org** → **DNS** (or **Manage DNS**)
3. For each of the 3 CNAME records:
   - Click **Add New Record**
   - **Type:** CNAME
   - **Name:** Copy the Name value from SES, but **remove the `.haltreferral.org` part** at the end. For example, if SES shows `abc123._domainkey.haltreferral.org`, enter only `abc123._domainkey`
   - **Value:** Paste the full Value from SES (e.g. `abc123.dkim.amazonses.com`)
   - **TTL:** 600 (or default)
   - Click **Save**
4. Repeat for all 3 CNAME records

### Step 4 – Add an SPF record in GoDaddy

SPF tells receiving mail servers that SES is authorized to send email for your domain.

1. In GoDaddy DNS, look for an existing **TXT** record with `v=spf1` in the value
2. If one exists, **edit it** and add `include:amazonses.com` before the `~all` or `-all` at the end. For example:
   ```
   v=spf1 include:amazonses.com ~all
   ```
   If you're also using GoDaddy/Microsoft 365 email, keep their SPF entry too:
   ```
   v=spf1 include:secureserver.net include:amazonses.com ~all
   ```
3. If no SPF record exists, **add a new TXT record**:
   - **Type:** TXT
   - **Name:** `@`
   - **Value:** `v=spf1 include:amazonses.com ~all`
   - **TTL:** 3600
   - Click **Save**

### Step 5 – Add a DMARC record in GoDaddy (recommended)

DMARC improves deliverability and prevents spoofing.

1. Click **Add New Record** in GoDaddy DNS
2. Fill in:
   - **Type:** TXT
   - **Name:** `_dmarc`
   - **Value:** `v=DMARC1; p=quarantine; rua=mailto:referrals@haltreferral.org`

     (Replace `referrals@haltreferral.org` with whatever mailbox you created in Part 1)
   - **TTL:** 3600
3. Click **Save**

### Step 6 – Wait for verification

1. Go back to the SES console in GovCloud
2. Click on **haltreferral.org** in the Verified identities list
3. The DKIM status will show **Pending** — it takes **5–60 minutes** to verify
4. Refresh periodically until both:
   - **Identity status** shows **Verified**
   - **DKIM configuration** shows **Successful**

> **Do not proceed until both show green/verified.**

---

## Part 3 – Update the Lambda Function

Now update the Lambda environment variables with the real email addresses.

1. In the GovCloud console, search for **Lambda** → click **Lambda**
2. Click on `halt-landing-intake-handler`
3. Click **Configuration** tab → **Environment variables** → **Edit**
4. Update these values:

| Variable | New value |
|---|---|
| SENDER_EMAIL | `no-reply@haltreferral.org` |
| RECIPIENT_EMAIL | `referrals@haltreferral.org` (or whatever mailbox you created in Part 1) |
| ALLOWED_ORIGIN | `https://www.haltreferral.org` |

5. Click **Save**

---

## Part 4 – Request SES Production Access

By default SES is in **sandbox mode** and can only send to verified email addresses. Since the recipient is your own verified domain, it should work in sandbox. But if you need to send to addresses outside haltreferral.org in the future, request production access:

1. In the SES console, click **Account dashboard** in the left sidebar
2. Click **Request production access**
3. Fill out the form:
   - **Mail type:** Transactional
   - **Website URL:** `https://www.haltreferral.org`
   - Describe your use case: "Sending program intake notification emails to our internal team when users submit a form on our website."
4. Submit and wait for approval (typically 24 hours)

---

## Part 5 – Test End-to-End

1. Go to **https://www.haltreferral.org/program_landings/lose_weight.html**
2. Click **Get Started**, fill out the form with test data, and click **Submit**
3. You should see the "Thank you!" success message
4. Check the mailbox configured in the Lambda's `NOTIFICATION_EMAIL` setting (e.g. `referrals@haltreferral.org`) for the notification email
5. The email should come from `no-reply@haltreferral.org` and contain a PII-free notification rather than the submitted form details

If the email doesn't arrive:
- Check **CloudWatch Logs** in GovCloud: CloudWatch → Log groups → `/aws/lambda/halt-landing-intake-handler`
- Look for SES errors — common issue is "Email address is not verified" which means the domain verification hasn't completed yet

---

## Summary of DNS Records in GoDaddy

After completing all steps, your GoDaddy DNS for haltreferral.org should have these records:

| Type | Name | Purpose |
|---|---|---|
| CNAME | `www` | Points to CloudFront distribution |
| CNAME | `_acm-validation...` | ACM certificate validation |
| CNAME | `abc._domainkey` | SES DKIM record 1 of 3 |
| CNAME | `def._domainkey` | SES DKIM record 2 of 3 |
| CNAME | `ghi._domainkey` | SES DKIM record 3 of 3 |
| TXT | `@` | SPF record for SES |
| TXT | `_dmarc` | DMARC policy |
| MX | `@` | Email hosting (GoDaddy or Google) |
