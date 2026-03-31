# HALT Landing Pages – AWS GovCloud Console Deployment Guide

**Console URL:** https://console.amazonaws-us-gov.com
**Region:** US Gov West (us-gov-west-1) — confirm this is selected in the top-right region selector on every page.

> **Note on CloudFront:** CloudFront CloudFormation resource types are not supported in us-gov-west-1.
> The CloudFormation template handles S3, API Gateway, and Lambda.
> CloudFront is created separately in Step 7 of this guide.

---

## Overview of Steps

1. Verify SES email identities
2. Create a staging S3 bucket
3. Zip the Lambda function on your computer
4. Upload the Lambda ZIP to the staging bucket
5. Deploy the CloudFormation stack (S3 + API Gateway + Lambda)
6. Edit the 3 HTML files with the API Gateway URL and upload to S3
7. Create the CloudFront distribution manually
8. Update CORS settings with the CloudFront domain
9. Test the form submission
10. Invalidate the CloudFront cache (after any future re-uploads)

---

## Step 1 – Verify SES Email Identities

1. Sign in to **https://console.amazonaws-us-gov.com**
2. In the top search bar type **SES** and click **Amazon Simple Email Service**
3. In the left sidebar click **Verified identities**
4. Click **Create identity**
5. Select **Email address**, enter your sender address (e.g. `no-reply@yourdomain.gov`), click **Create identity**
6. Check that inbox for a verification email from AWS and click the link
7. Click **Create identity** again and repeat for your recipient address (e.g. `team@yourdomain.gov`)
8. Both should show a green **Verified** status before continuing

> **GovCloud sandbox note:** By default you can only send to verified addresses. To send to any address, go to **SES → Account dashboard → Request production access** and submit the form. AWS typically approves within 24 hours.

---

## Step 2 – Create a Staging S3 Bucket

This bucket temporarily holds the Lambda ZIP so CloudFormation can access it.

1. Search for **S3** and click **S3**
2. Click **Create bucket**
3. **Bucket name:** `halt-lambda-staging-YOURACCOUNTID` (e.g. `halt-lambda-staging-597537773546`)
4. **AWS Region:** US Gov West (us-gov-west-1)
5. Leave all other settings as default and click **Create bucket**

---

## Step 3 – Zip the Lambda File on Your Computer

1. Open the `govcloud-deployment/lambda/` folder on your computer
2. Right-click **`handler.py`**
3. Select **Compress** (Mac) or **Send to → Compressed (zipped) folder** (Windows)
4. Rename the result to **`handler.zip`**

---

## Step 4 – Upload the Lambda ZIP to the Staging Bucket

1. In S3, click the staging bucket you just created
2. Click **Upload → Add files**, select `handler.zip`, click **Upload**
3. Wait for the green **Upload succeeded** banner

---

## Step 5 – Deploy the CloudFormation Stack

1. Search for **CloudFormation** and click **CloudFormation**
2. Click **Create stack → With new resources (standard)**
3. Select **Template is ready** and **Upload a template file**
4. Click **Choose file**, select `govcloud-deployment/cloudformation.yaml`, click **Next**

**Stack name:** `halt-landing-pages`

**Parameters:**

| Parameter | What to enter |
|---|---|
| ProjectName | `halt-landing` |
| SenderEmail | Your verified sender address |
| RecipientEmail | Your verified recipient address |
| LambdaZipS3Bucket | The staging bucket name from Step 2 |
| LambdaZipS3Key | `handler.zip` |

5. Click **Next**, leave all defaults on the options page, click **Next** again
6. On the review page, check **I acknowledge that AWS CloudFormation might create IAM resources with custom names**
7. Click **Submit**
8. Wait for **CREATE_COMPLETE** (3–5 minutes) — refresh the Events tab to monitor progress

**Once complete, click the Outputs tab and copy these four values:**

| Output key | What it is |
|---|---|
| `StaticSiteBucketName` | S3 bucket for your HTML files |
| `StaticSiteBucketArn` | Needed in Step 7 for CloudFront |
| `ApiGatewayEndpoint` | The URL to put in your HTML files |
| `ApiGatewayId` | Needed in Step 8 to update CORS |

---

## Step 6 – Edit the HTML Files and Upload to S3

**Edit the 3 HTML files on your computer:**

Open each of these files in a plain text editor (Notepad on Windows; on Mac use TextEdit — go to **Format → Make Plain Text** first):

- `program_landings/lose_weight.html`
- `program_landings/lower_blood_pressure.html`
- `program_landings/lower_blood_sugar.html`

In each file find this line near the bottom:
```
var API_URL = "YOUR_API_GATEWAY_URL/program-intake";
```

Replace `YOUR_API_GATEWAY_URL` with the `ApiGatewayEndpoint` value from the CloudFormation outputs. Example:
```
var API_URL = "https://abc123def4.execute-api.us-gov-west-1.amazonaws.com/program-intake";
```

Save all three files.

**Upload to S3:**

1. In S3, click the bucket named in `StaticSiteBucketName` (e.g. `halt-landing-static-site-597537773546`)
2. Click **Upload → Add folder**, select the entire `program_landings` folder, click **Upload**
3. Wait for the green success banner
4. Upload any other root-level files (e.g. `index.html`, `web.css`) using **Upload → Add files**

---

## Step 7 – Create the CloudFront Distribution Manually

1. Search for **CloudFront** and click **CloudFront**
2. Click **Create a CloudFront distribution**

**Origin settings:**

| Field | Value |
|---|---|
| Origin domain | Click the field and select your S3 bucket from the dropdown (it ends in `.s3.us-gov-west-1.amazonaws.com`) |
| Origin access | Select **Origin access control settings (recommended)** |
| Origin access control | Click **Create new OAC** → leave defaults → click **Create** |

3. A blue banner will appear saying "You must update the S3 bucket policy." **Leave this page open** — you will come back to it.

**Default cache behavior settings:**

| Field | Value |
|---|---|
| Viewer protocol policy | **Redirect HTTP to HTTPS** |
| Allowed HTTP methods | **GET, HEAD** |
| Cache policy | **CachingOptimized** |

**Web Application Firewall (WAF):**
- Select **Do not enable security protections** (you can add WAF later)

**Settings (bottom of page):**

| Field | Value |
|---|---|
| Default root object | `index.html` |
| Description | `halt-landing pages` |

4. Click **Create distribution**
5. You will be shown a banner: **"The S3 bucket policy needs to be updated"** — click **Copy policy**
6. Open a new tab, go to **S3**, click your static site bucket
7. Click the **Permissions** tab → scroll to **Bucket policy** → click **Edit**
8. Paste the copied policy into the policy editor and click **Save changes**
9. Go back to the CloudFront tab
10. Wait for the distribution **Status** to change from **Deploying** to **Enabled** (2–5 minutes)
11. Copy the **Distribution domain name** — it looks like `d1abc123xyz.cloudfront.net`

Your site URL is: `https://d1abc123xyz.cloudfront.net`

---

## Step 8 – Update CORS Settings with the CloudFront Domain

Now that you have the CloudFront domain, tighten the CORS settings so only your site can submit the form.

**Update the Lambda environment variable:**

1. Search for **Lambda** and click **Lambda**
2. Click on the function named `halt-landing-intake-handler`
3. Click the **Configuration** tab → click **Environment variables** → click **Edit**
4. Find `ALLOWED_ORIGIN`, click its **Value** field and replace `*` with your full CloudFront domain including `https://`:
   ```
   https://d1abc123xyz.cloudfront.net
   ```
5. Click **Save**

**Update the API Gateway CORS setting:**

1. Search for **API Gateway** and click **API Gateway**
2. Click on `halt-landing-api`
3. In the left sidebar click **CORS**
4. Click **Edit** (or **Configure**)
5. Under **Access-Control-Allow-Origin**, replace `*` with your CloudFront domain:
   ```
   https://d1abc123xyz.cloudfront.net
   ```
6. Click **Save**

---

## Step 9 – Test the Deployment

1. Open your browser and go to `https://d1abc123xyz.cloudfront.net/program_landings/lose_weight.html`
2. Click **Get Started**, fill out the form, and click **Submit**
3. The form should be replaced with a **"Thank you!"** success message
4. Check the recipient inbox — the intake notification email should arrive within 1–2 minutes

**If the form shows an error:**
- Press **F12** to open browser Dev Tools → click the **Console** tab — look for red errors
- The most common issue is the API URL not being updated correctly in the HTML (still contains `YOUR_API_GATEWAY_URL`)

**If no email arrives:**
- Go to **CloudWatch → Log groups → `/aws/lambda/halt-landing-intake-handler`** and open the latest log stream to see error details
- Confirm both SES addresses show **Verified** status

---

## Step 10 – Invalidate the CloudFront Cache (After Future Re-uploads)

Any time you re-upload updated HTML files to S3, clear the CloudFront cache so visitors see the new version immediately.

1. Go to **CloudFront**, click your distribution
2. Click the **Invalidations** tab → **Create invalidation**
3. Enter `/*` in the Object paths field
4. Click **Create invalidation**
5. Wait for Status to change from **In progress** to **Completed** (1–3 minutes)

---

## Quick Reference

| What you need | AWS Service | Where to find it |
|---|---|---|
| Verified sender/recipient emails | Simple Email Service | Left sidebar → Verified identities |
| Static HTML files | S3 | `halt-landing-static-site-...` bucket |
| API endpoint URL | CloudFormation | Your stack → Outputs tab |
| Lambda CORS origin | Lambda | `halt-landing-intake-handler` → Configuration → Environment variables |
| API Gateway CORS | API Gateway | `halt-landing-api` → CORS |
| CloudFront domain | CloudFront | Your distribution → General tab |
| Lambda logs | CloudWatch | Log groups → `/aws/lambda/halt-landing-intake-handler` |
| Cache invalidation | CloudFront | Your distribution → Invalidations tab |

---

## Troubleshooting

**CloudFormation fails with "Template format error: Unrecognized resource types"**
- CloudFront CloudFormation types are not supported in us-gov-west-1. The updated template removes them — create CloudFront manually using Step 7.

**Form shows an error message**
- Open Dev Tools (F12) → Console tab for the exact error
- Confirm `API_URL` in the HTML includes `/program-intake` at the end

**No email arrives after form submission**
- Check CloudWatch logs for the Lambda function — look for SES error messages
- Confirm both email addresses show Verified status in SES
- If still in sandbox mode, the recipient address must also be verified

**Site shows old content after re-uploading files**
- Run a CloudFront invalidation (Step 10)

**CloudFront returns 403 on page load**
- The S3 bucket policy may not have been updated with the OAI policy — repeat Step 7 items 5–8
