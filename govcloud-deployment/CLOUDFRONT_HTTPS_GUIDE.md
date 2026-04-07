# HALT Landing Pages – CloudFront HTTPS Setup Guide

**Custom domain:** www.haltreferral.org
**DNS provider:** GoDaddy
**CloudFront console:** Standard AWS account at https://console.aws.amazon.com (NOT the GovCloud console)
**S3 origin:** GovCloud account (us-gov-west-1)

---

## How This Works

Your static files live in S3 in GovCloud. CloudFront is a global service managed from your standard (commercial) AWS account. CloudFront sits in front of the GovCloud S3 bucket and serves the content over HTTPS. Visitors go to `https://www.haltreferral.org` → CloudFront → S3 (GovCloud).

---

## Overview of Steps

1. Request an SSL certificate in ACM (commercial account)
2. Validate the certificate via DNS in GoDaddy
3. Make the GovCloud S3 bucket publicly readable (required for cross-account CloudFront)
4. Create the CloudFront distribution (commercial account)
5. Point www.haltreferral.org to CloudFront in GoDaddy DNS
6. Update CORS settings in GovCloud (Lambda + API Gateway)
7. Test everything
8. (Optional) Redirect haltreferral.org (bare domain) to www.haltreferral.org

---

## Step 1 – Request an SSL Certificate in ACM

ACM (AWS Certificate Manager) provides free SSL certificates. The certificate MUST be created in **us-east-1** because CloudFront only uses certificates from that region.

1. Sign in to your **standard (commercial) AWS account** at **https://console.aws.amazon.com**
2. In the top-right **region selector**, switch to **US East (N. Virginia) us-east-1**
3. Search for **Certificate Manager** and click it
4. Click **Request a certificate**
5. Select **Request a public certificate** → click **Next**
6. Under **Domain names**, add BOTH of these:
   - `www.haltreferral.org`
   - `haltreferral.org`

   Adding both lets you cover the bare domain and www subdomain with one certificate.

7. Under **Validation method**, select **DNS validation**
8. Click **Request**
9. You'll land on the certificate details page. The status will show **Pending validation**
10. You'll see two CNAME records that need to be added to DNS — keep this page open for Step 2

---

## Step 2 – Validate the Certificate via DNS in GoDaddy

ACM needs to verify you own the domain by checking for specific DNS records.

1. On the ACM certificate page from Step 1, you'll see a table with CNAME records. For each domain, note the:
   - **CNAME name** (looks like `_abc123.www.haltreferral.org.`)
   - **CNAME value** (looks like `_xyz789.acm-validations.aws.`)

   If both domains show the same CNAME name/value, you only need to add one record.

2. Open a new browser tab and sign in to **https://dcc.godaddy.com** (GoDaddy Domain Control Center)
3. Click on **haltreferral.org** → click **DNS** (or **Manage DNS**)
4. Click **Add New Record**
5. Fill in:
   - **Type:** CNAME
   - **Name:** Paste the CNAME name from ACM, but **remove** the `.haltreferral.org.` part at the end. For example, if ACM shows `_abc123.www.haltreferral.org.`, enter only `_abc123.www`
   - **Value:** Paste the full CNAME value from ACM (e.g. `_xyz789.acm-validations.aws.`)
   - **TTL:** 600 (or leave default)
6. Click **Save**
7. If there's a second CNAME record (different from the first), add it the same way
8. Go back to the ACM console and wait — validation usually completes in **5–30 minutes**
9. Refresh the ACM page until the status changes from **Pending validation** to **Issued** (green)

> **Do NOT proceed to Step 3 until the certificate shows "Issued".**

---

## Step 3 – Ensure the GovCloud S3 Bucket Is Publicly Readable

Since CloudFront is in the commercial account and S3 is in GovCloud (a different account), you cannot use Origin Access Identity/Control across account partitions. The S3 bucket needs to allow public read access.

If you already enabled S3 static website hosting with a public bucket policy earlier, this is already done. Verify by checking:

1. Sign in to the **GovCloud console** at **https://console.amazonaws-us-gov.com**
2. Go to **S3** → click your static site bucket
3. Click the **Permissions** tab
4. Confirm **Block public access** has all four settings **unchecked** (off)
5. Confirm the **Bucket policy** contains:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws-us-gov:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

6. Click the **Properties** tab → scroll to **Static website hosting** and copy the **Bucket website endpoint** URL — you'll need it in Step 4

The endpoint looks like:
```
http://halt-landing-static-site-597537773546.s3-website-us-gov-west-1.amazonaws.com
```

---

## Step 4 – Create the CloudFront Distribution

1. Switch back to your **standard (commercial) AWS account** at **https://console.aws.amazon.com**
2. Search for **CloudFront** and click it
3. Click **Create distribution**

**Origin settings:**

| Field | Value |
|---|---|
| Origin domain | **Do NOT select from the dropdown.** Instead, paste your S3 website endpoint from Step 3, but **remove the `http://` prefix**. Enter only: `halt-landing-static-site-597537773546.s3-website-us-gov-west-1.amazonaws.com` |
| Protocol | **HTTP only** (S3 static website hosting only supports HTTP between CloudFront and S3) |

> **Important:** You must use the S3 *website endpoint* (with `s3-website` in the URL), not the S3 *REST endpoint*. The website endpoint handles redirects and index documents correctly.

**Default cache behavior:**

| Field | Value |
|---|---|
| Viewer protocol policy | **Redirect HTTP to HTTPS** |
| Allowed HTTP methods | **GET, HEAD** |
| Cache policy | **CachingOptimized** (select from dropdown) |

**Web Application Firewall (WAF):**
- Select **Do not enable security protections** (you can add WAF later)

**Settings (near the bottom):**

| Field | Value |
|---|---|
| Alternate domain name (CNAME) | Click **Add item** and enter: `www.haltreferral.org` |
| Custom SSL certificate | Click the dropdown and select the certificate you created in Step 1 (`www.haltreferral.org`) — it will only appear if it was created in us-east-1 and has "Issued" status |
| Default root object | `index.html` |
| Description | `HALT landing pages` |

4. Click **Create distribution**
5. The distribution will show **Deploying** status — this takes **5–15 minutes**
6. Copy the **Distribution domain name** (e.g. `d1abc123xyz.cloudfront.net`) — you need it for Step 5

---

## Step 5 – Point www.haltreferral.org to CloudFront in GoDaddy

1. Go back to **GoDaddy DNS** for haltreferral.org
2. Look for any existing record for **www** and delete it (it may be an A record or CNAME pointing to GoDaddy's parking page)
3. Click **Add New Record**:
   - **Type:** CNAME
   - **Name:** `www`
   - **Value:** Your CloudFront distribution domain name (e.g. `d1abc123xyz.cloudfront.net`)
   - **TTL:** 600
4. Click **Save**
5. DNS propagation takes **5–30 minutes** (sometimes up to a few hours)

After propagation, `https://www.haltreferral.org` will serve your landing pages from CloudFront over HTTPS.

---

## Step 6 – Update CORS Settings in GovCloud

Now that your site URL is `https://www.haltreferral.org`, update CORS so the form submission works.

1. Sign in to the **GovCloud console** at **https://console.amazonaws-us-gov.com**

**Update Lambda:**
2. Search for **Lambda** → click `halt-landing-intake-handler`
3. Click **Configuration** → **Environment variables** → **Edit**
4. Change `ALLOWED_ORIGIN` from `*` to:
   ```
   https://www.haltreferral.org
   ```
5. Click **Save**

**Update API Gateway:**
6. Search for **API Gateway** → click `halt-landing-api`
7. In the left sidebar click **CORS**
8. Click **Edit** (or **Configure**)
9. Under **Access-Control-Allow-Origin**, replace `*` with:
   ```
   https://www.haltreferral.org
   ```
10. Click **Save**

---

## Step 7 – Test Everything

1. Open your browser and go to **https://www.haltreferral.org/program_landings/lose_weight.html**
2. Confirm the page loads over HTTPS (look for the lock icon in the address bar)
3. Click **Get Started**, fill out the form, and click **Submit**
4. Confirm the "Thank you!" success message appears
5. Check the recipient inbox for the notification email

**Test the redirect URLs too:**
- `https://www.haltreferral.org/lose-weight`
- `https://www.haltreferral.org/lower-blood-pressure`
- `https://www.haltreferral.org/lower-blood-sugar`

> **Note:** The S3 redirection rules you set up earlier will continue to work through CloudFront — the redirects happen at the S3 origin and CloudFront passes them through.

---

## Step 8 (Optional) – Redirect Bare Domain to www

If someone types `haltreferral.org` (without www), you probably want them redirected to `https://www.haltreferral.org`. There are two ways to handle this:

**Option A – GoDaddy forwarding (simplest):**
1. In GoDaddy, go to your domain → **Forwarding**
2. Click **Add Forwarding**
3. Forward `haltreferral.org` to `https://www.haltreferral.org`
4. Select **301 – Permanent** redirect
5. Click **Save**

**Option B – Second CloudFront distribution:**
This is needed if GoDaddy forwarding doesn't support HTTPS on the bare domain. You would:
1. Create an empty S3 bucket in the commercial account configured to redirect all requests to `https://www.haltreferral.org`
2. Create a second CloudFront distribution pointing to that bucket
3. Add `haltreferral.org` as a CNAME on that distribution with the same ACM certificate
4. Add an A record (ALIAS) in your DNS pointing `haltreferral.org` to the second CloudFront distribution

Option A is much simpler and works for most cases.

---

## Troubleshooting

**Certificate stays "Pending validation" for more than 30 minutes:**
- Double-check the CNAME records in GoDaddy — the Name field should NOT include `.haltreferral.org` at the end (GoDaddy adds it automatically)
- Make sure there are no typos in the CNAME value

**CloudFront returns 403 Access Denied:**
- Verify you used the S3 *website endpoint* (`s3-website` in the URL) as the origin, not the S3 REST endpoint
- Confirm the S3 bucket policy allows public read and Block Public Access is off

**https://www.haltreferral.org doesn't resolve:**
- Wait for DNS propagation (can take up to a few hours)
- Verify the CNAME record for `www` in GoDaddy points to your CloudFront distribution domain
- Try flushing your local DNS cache: `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (Mac)

**Form submission shows "Something went wrong":**
- Press F12 → Console tab to see the error
- Confirm CORS: the `ALLOWED_ORIGIN` in Lambda and API Gateway must exactly match `https://www.haltreferral.org` (no trailing slash)
- Confirm the `API_URL` in the HTML files is correct and ends with `/program-intake`

**CloudFront shows old content after re-uploading files to S3:**
- Create an invalidation: CloudFront → your distribution → Invalidations → Create → enter `/*`
