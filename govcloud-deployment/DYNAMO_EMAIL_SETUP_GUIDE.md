# HALT Referral System – DynamoDB + Email Notification Setup Guide

## How It Works

```
User clicks "Get Started" → fills form → clicks "Submit"
                              │
                              ▼
                    API Gateway (HTTPS)
                              │
                              ▼
                     Lambda Function
                       │         │
                       ▼         ▼
               DynamoDB          SES
          (stores full PII)  (sends notification)
          (stays in GovCloud)    │
                                 ▼
                        support@halt360.org
                        receives email with:
                        ✓ Subject: "New Referral Received"
                        ✓ No PII in the email
                        ✓ Link to view details in GovCloud console
```

All personal information stays in DynamoDB inside GovCloud.
The notification email contains ZERO PII — just a heads-up and a secure link.

---

## What You Already Have (from earlier setup)

- S3 bucket with static HTML files
- CloudFront distribution (commercial account) serving https://www.haltreferral.org
- API Gateway and Lambda function in GovCloud

## What This Update Adds

- DynamoDB table for storing referral submissions
- SES notification email to support@halt360.org
- Updated Lambda function that does both

---

## Step 1 – Verify SES Email Identities in GovCloud

You need to verify two things in SES: the sender address and the recipient address.

### Verify the sender (haltreferral.org domain)

This lets SES send from `no-reply@haltreferral.org`.

1. Sign in to the **GovCloud console** at **https://console.amazonaws-us-gov.com**
2. Confirm region is **US Gov West (us-gov-west-1)**
3. Search for **SES** → click **Amazon Simple Email Service**
4. Left sidebar → **Verified identities** → **Create identity**
5. Select **Domain**, enter: `haltreferral.org`
6. Under **Advanced DKIM settings**:
   - Select **Easy DKIM**
   - Key length: **RSA_2048_BIT**
   - Check **Enabled**
7. Click **Create identity**
8. SES shows 3 CNAME records — add all 3 to GoDaddy DNS:

For each CNAME record:
- Go to **GoDaddy DNS** → **Add New Record**
- **Type:** CNAME
- **Name:** Copy from SES but **remove `.haltreferral.org`** from the end
  (e.g. if SES shows `abc123._domainkey.haltreferral.org`, enter `abc123._domainkey`)
- **Value:** Paste the full value from SES (e.g. `abc123.dkim.amazonses.com`)
- **TTL:** 600
- Click **Save**

9. Also add an **SPF record** in GoDaddy:
   - **Type:** TXT
   - **Name:** `@`
   - **Value:** `v=spf1 include:amazonses.com ~all`
     (If an SPF record already exists, edit it and add `include:amazonses.com` before `~all`)
   - Click **Save**

10. Back in SES, wait for status to change to **Verified** (5–60 minutes)

### Verify the recipient (support@halt360.org)

While SES is in sandbox mode, you must also verify the recipient address.

1. In SES → **Verified identities** → **Create identity**
2. Select **Email address**
3. Enter: `support@halt360.org`
4. Click **Create identity**
5. Check the support@halt360.org inbox for the AWS verification email and click the link

> **Note:** Once you request SES production access (Step 5), you won't need to verify recipients anymore.

---

## Step 2 – Delete the Old CloudFormation Stack

Since the stack is changing significantly (adding DynamoDB, changing Lambda permissions), it's cleanest to delete and recreate.

1. Go to **CloudFormation** in the GovCloud console
2. Select the `halt-landing-pages` stack
3. Click **Delete**
4. Wait for deletion to complete

> **Important:** This will delete the old S3 bucket. You'll re-upload your files in Step 4.

---

## Step 3 – Zip and Upload the New Lambda Function

**On your computer:**
1. Open the `govcloud-deployment/lambda/` folder
2. Right-click `handler.py` → **Compress** (Mac) or **Send to → Compressed folder** (Windows)
3. Rename to `handler.zip`

**In the GovCloud console:**
1. Go to **S3** → click your staging bucket (e.g. `halt-lambda-staging-...`)
2. If the old `handler.zip` is there, it will be overwritten
3. Click **Upload → Add files** → select the new `handler.zip` → **Upload**

---

## Step 4 – Deploy the Updated CloudFormation Stack

1. Go to **CloudFormation** → **Create stack → With new resources (standard)**
2. **Upload a template file** → select the updated `cloudformation.yaml`
3. Click **Next**

**Stack name:** `halt-landing-pages`

**Parameters:**

| Parameter | Value |
|---|---|
| ProjectName | `halt-landing` |
| LambdaZipS3Bucket | Your staging bucket name |
| LambdaZipS3Key | `handler.zip` |
| AllowedOrigin | `https://www.haltreferral.org` |
| SenderEmail | `no-reply@haltreferral.org` |
| NotificationEmail | `support@halt360.org` |

4. Click **Next** → leave defaults → **Next**
5. Check **I acknowledge that AWS CloudFormation might create IAM resources with custom names**
6. Click **Submit**
7. Wait for **CREATE_COMPLETE**

**Copy the outputs:**

| Output | What it is |
|---|---|
| `StaticSiteBucketName` | S3 bucket for HTML files |
| `IntakeSubmissionsTableName` | DynamoDB table name |
| `ApiGatewayEndpoint` | API URL for the HTML files |

---

## Step 5 – Re-enable S3 Static Website Hosting and Public Access

The new S3 bucket needs the same public access setup as before.

1. Go to **S3** → click the new static site bucket
2. **Properties** tab → **Static website hosting** → **Edit**
   - **Enable**, Index document: `index.html`, click **Save changes**
3. **Permissions** tab → **Block public access** → **Edit**
   - Uncheck all four boxes → **Save** → type `confirm` → **Confirm**
4. **Bucket policy** → **Edit** → paste (replace `BUCKET-NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws-us-gov:s3:::BUCKET-NAME/*"
    }
  ]
}
```

5. Click **Save changes**
6. Add the S3 redirection rules if you want the short URLs:
   - **Properties** → **Static website hosting** → **Edit** → paste in the **Redirection rules** box:

```json
[
  {
    "Condition": { "KeyPrefixEquals": "lose-weight" },
    "Redirect": { "ReplaceKeyWith": "program_landings/lose_weight.html" }
  },
  {
    "Condition": { "KeyPrefixEquals": "lower-blood-pressure" },
    "Redirect": { "ReplaceKeyWith": "program_landings/lower_blood_pressure.html" }
  },
  {
    "Condition": { "KeyPrefixEquals": "lower-blood-sugar" },
    "Redirect": { "ReplaceKeyWith": "program_landings/lower_blood_sugar.html" }
  }
]
```

---

## Step 6 – Update the HTML Files and Upload

**Check the API Gateway URL:**
If the `ApiGatewayEndpoint` output changed from the previous deployment, update all 3 HTML files. Find this line in each:

```js
var API_URL = "https://OLD_VALUE.execute-api.us-gov-west-1.amazonaws.com/program-intake";
```

Replace with the new endpoint value if different.

**Upload to S3:**
1. Go to **S3** → click the static site bucket
2. **Upload → Add folder** → select `program_landings` → **Upload**
3. Upload any other root files (`index.html`, `web.css`) if needed

---

## Step 7 – Update CloudFront Origin (if bucket name changed)

If the S3 bucket name changed, update CloudFront to point to the new bucket.

1. Sign in to the **commercial AWS account** at **https://console.aws.amazon.com**
2. Go to **CloudFront** → click your distribution
3. Click the **Origins** tab → select the origin → **Edit**
4. Update the **Origin domain** to the new S3 website endpoint:
   ```
   halt-landing-static-site-NEWACCOUNTID.s3-website-us-gov-west-1.amazonaws.com
   ```
5. Click **Save changes**
6. Create an invalidation: **Invalidations** tab → **Create invalidation** → `/*`

---

## Step 8 – Request SES Production Access (Optional but Recommended)

In sandbox mode, SES can only send to verified addresses. Since you've verified support@halt360.org, it works now. But for future flexibility:

1. In SES → **Account dashboard** → **Request production access**
2. Fill out:
   - **Mail type:** Transactional
   - **Website URL:** `https://www.haltreferral.org`
   - **Use case:** "Sending automated referral notifications to our internal support team when users submit a form on our health program website. Emails contain no personal information — only a link to our secure dashboard."
3. Submit — typically approved within 24 hours

---

## Step 9 – Test End-to-End

1. Go to **https://www.haltreferral.org/program_landings/lose_weight.html**
2. Click **Get Started** → fill in the form with test data → click **Submit**
3. Confirm the "Thank you!" success message appears

**Check DynamoDB:**
4. In the GovCloud console → **DynamoDB** → **Tables** → click `halt-landing-intake-submissions`
5. Click **Explore table items**
6. You should see your test submission with all the form fields

**Check email:**
7. Check the `support@halt360.org` inbox for the notification email
8. The email subject should be "New Referral Received"
9. The email body should say "A new referral has been submitted..." with a "View This Referral" button
10. Clicking the button should open the referral dashboard at `/program_landings/dashboard.html` (you will be prompted for your API key)

---

## Viewing Referral Submissions

### In the GovCloud Console (DynamoDB)

1. Go to **DynamoDB** → **Tables** → `halt-landing-intake-submissions`
2. Click **Explore table items**
3. You'll see all submissions with: name, email, phone, zipcode, motivation, landing page, date

**To filter by program:**
- Click **Query** (instead of Scan)
- Select index: **by-program**
- Partition key: enter the program name (e.g. `Lose Weight`)
- Click **Run**

**To see newest submissions first:**
- Click **Query**
- Select index: **by-date**
- Partition key: `new`
- Check **Sort descending**
- Click **Run**

**To mark a submission as handled:**
- Click on a submission → change the `status` field from `new` to `contacted` (or whatever status you prefer)

---

## Troubleshooting

**Form shows "Something went wrong":**
- Press F12 → Console tab for the error
- Check that `ALLOWED_ORIGIN` matches your site URL exactly (including `https://`)
- Check that the `API_URL` in the HTML ends with `/program-intake`

**Submission saved in DynamoDB but no email received:**
- Check **CloudWatch** → Log groups → `/aws/lambda/halt-landing-intake-handler`
- Look for "Failed to send notification email" errors
- Common cause: haltreferral.org domain not yet verified in SES
- Common cause: support@halt360.org not verified (required in sandbox mode)

**Email received but DynamoDB is empty:**
- This shouldn't happen — the Lambda stores data first, then sends the email
- Check CloudWatch logs for DynamoDB errors

**"Sender email not verified" error in logs:**
- Confirm haltreferral.org shows "Verified" in SES → Verified identities
- Confirm all 3 DKIM CNAME records are in GoDaddy DNS
