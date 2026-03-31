# HALT Landing Pages – AWS GovCloud Deployment Guide

## Architecture Overview

```
Browser
  │
  ▼
CloudFront (CDN + HTTPS termination)
  ├── GET  /program_landings/*  ──► S3 Bucket (static HTML / assets)
  └── POST /program-intake      ──► API Gateway (HTTP API)
                                          │
                                          ▼
                                    Lambda Function
                                          │
                                          ▼
                                    Amazon SES
                                          │
                                          ▼
                                  Recipient inbox
```

All resources live in a single AWS GovCloud region (`us-gov-west-1` or `us-gov-east-1`).

---

## Prerequisites

| Requirement | Notes |
|---|---|
| AWS GovCloud account | IAM user / role with CloudFormation, S3, CloudFront, API Gateway, Lambda, SES, and IAM permissions |
| AWS CLI configured | `aws configure --profile govcloud` pointing at the GovCloud region |
| Python 3.12 | For packaging the Lambda function |
| Verified SES identities | Both the sender and recipient addresses must be verified in SES (see Step 1) |

---

## Step 1 – Verify SES Email Identities

Before deploying the stack, verify your sender and recipient email addresses (or domains) in SES. In GovCloud SES is in sandbox mode by default — you must request production access to send to unverified addresses.

```bash
# Verify sender address
aws ses verify-email-identity \
  --email-address no-reply@yourdomain.gov \
  --region us-gov-west-1 \
  --profile govcloud

# Verify recipient address
aws ses verify-email-identity \
  --email-address team@yourdomain.gov \
  --region us-gov-west-1 \
  --profile govcloud
```

Each address will receive a confirmation email with a verification link. Click it before proceeding.

To send to _any_ address (production), submit a request to move out of sandbox:

```bash
aws ses put-account-sending-enabled \
  --enabled \
  --region us-gov-west-1 \
  --profile govcloud
```

Or open a support case in the AWS GovCloud console under **SES → Account dashboard → Request production access**.

---

## Step 2 – Package the Lambda Function

```bash
cd govcloud-deployment/lambda

# Install dependencies into a package directory (none required for this function)
# Zip just the handler
zip handler.zip handler.py
```

---

## Step 3 – Upload the Lambda ZIP to an S3 Staging Bucket

You need an existing S3 bucket in your GovCloud account to store the Lambda ZIP before the CloudFormation stack creates the final site bucket.

```bash
# Create a staging bucket (one-time, skip if you already have one)
aws s3 mb s3://your-govcloud-staging-bucket \
  --region us-gov-west-1 \
  --profile govcloud

# Upload the ZIP
aws s3 cp govcloud-deployment/lambda/handler.zip \
  s3://your-govcloud-staging-bucket/lambda/handler.zip \
  --region us-gov-west-1 \
  --profile govcloud
```

---

## Step 4 – Deploy the CloudFormation Stack

```bash
aws cloudformation deploy \
  --stack-name halt-landing-pages \
  --template-file govcloud-deployment/cloudformation.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-gov-west-1 \
  --profile govcloud \
  --parameter-overrides \
    ProjectName=halt-landing \
    SenderEmail=no-reply@yourdomain.gov \
    RecipientEmail=team@yourdomain.gov \
    LambdaZipS3Bucket=your-govcloud-staging-bucket \
    LambdaZipS3Key=lambda/handler.zip
```

When the deployment finishes, retrieve the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name halt-landing-pages \
  --region us-gov-west-1 \
  --profile govcloud \
  --query "Stacks[0].Outputs"
```

Note the values for:
- **`StaticSiteBucketName`** – where you upload the HTML files
- **`CloudFrontDomain`** – the public URL of your site
- **`ApiGatewayEndpoint`** – the base URL for the form submission endpoint

---

## Step 5 – Update the HTML Files with the API Gateway URL

In each of the three landing pages, replace the placeholder URL with the real API Gateway endpoint from Step 4:

```
program_landings/lose_weight.html
program_landings/lower_blood_pressure.html
program_landings/lower_blood_sugar.html
```

Search for this line in the `<script>` block of each file:

```js
var API_URL = "YOUR_API_GATEWAY_URL/program-intake";
```

Replace `YOUR_API_GATEWAY_URL` with the value from the CloudFormation output, e.g.:

```js
var API_URL = "https://abc123def4.execute-api.us-gov-west-1.amazonaws.com/program-intake";
```

---

## Step 6 – Upload Static Files to S3

```bash
# Upload the entire program_landings directory
aws s3 sync program_landings/ \
  s3://STATIC_SITE_BUCKET_NAME/program_landings/ \
  --region us-gov-west-1 \
  --profile govcloud

# Upload any root-level assets (index.html, web.css, etc.) if needed
aws s3 cp index.html \
  s3://STATIC_SITE_BUCKET_NAME/ \
  --region us-gov-west-1 \
  --profile govcloud
```

Replace `STATIC_SITE_BUCKET_NAME` with the value from the `StaticSiteBucketName` CloudFormation output.

---

## Step 7 – Verify the Deployment

1. Open the **CloudFrontDomain** URL in a browser.
2. Navigate to one of the landing pages (e.g. `/program_landings/lose_weight.html`).
3. Click **Get Started**, fill out the form, and click **Submit**.
4. Confirm the success message appears in the modal.
5. Check the recipient inbox for the intake email.

To test the Lambda function directly:

```bash
aws lambda invoke \
  --function-name halt-landing-intake-handler \
  --region us-gov-west-1 \
  --profile govcloud \
  --payload '{"requestContext":{"http":{"method":"POST"}},"body":"{\"name\":\"Test User\",\"email\":\"test@example.gov\",\"phone\":\"555-0100\",\"zipcode\":\"99501\",\"motivation\":\"Test\",\"landing_page\":\"Lose Weight\"}"}' \
  --cli-binary-format raw-in-base64-out \
  response.json && cat response.json
```

---

## Step 8 – Invalidate the CloudFront Cache (after any HTML update)

```bash
aws cloudfront create-invalidation \
  --distribution-id CLOUDFRONT_DISTRIBUTION_ID \
  --paths "/*" \
  --region us-gov-west-1 \
  --profile govcloud
```

Replace `CLOUDFRONT_DISTRIBUTION_ID` with the value from the `CloudFrontDistributionId` output.

---

## File Reference

```
govcloud-deployment/
├── cloudformation.yaml      # Full infrastructure stack (S3, CloudFront, API GW, Lambda)
├── DEPLOY.md                # This guide
└── lambda/
    ├── handler.py           # Lambda function source
    └── handler.zip          # Deployment package (created in Step 2)

program_landings/
├── lose_weight.html         # ✅ Updated – uses fetch for form submission
├── lower_blood_pressure.html# ✅ Updated – uses fetch for form submission
└── lower_blood_sugar.html   # ✅ Updated – uses fetch for form submission
```

---

## Environment Variables (Lambda)

| Variable | Description | Example |
|---|---|---|
| `SENDER_EMAIL` | SES-verified From address | `no-reply@yourdomain.gov` |
| `RECIPIENT_EMAIL` | Comma-separated To address(es) | `team@yourdomain.gov` |
| `ALLOWED_ORIGIN` | CloudFront domain for CORS | `https://d1abc.cloudfront.net` |

These are set automatically by the CloudFormation template. To update them without redeploying the full stack:

```bash
aws lambda update-function-configuration \
  --function-name halt-landing-intake-handler \
  --environment "Variables={SENDER_EMAIL=new@yourdomain.gov,RECIPIENT_EMAIL=new-team@yourdomain.gov,ALLOWED_ORIGIN=https://d1abc.cloudfront.net}" \
  --region us-gov-west-1 \
  --profile govcloud
```

---

## GovCloud-Specific Notes

- **SES sandbox** – GovCloud accounts start in SES sandbox mode. Request production access before go-live so emails reach unverified addresses.
- **CloudFront edge nodes** – CloudFront edge PoPs are not located within GovCloud regions; your S3 origin is GovCloud-resident but cached content is served from global edge locations. If your data classification requires all data transmission to stay within FedRAMP-High boundaries, evaluate whether CloudFront is appropriate or consider serving directly from S3 with an ALB/HTTPS endpoint instead.
- **ARN format** – GovCloud ARNs use the `aws-us-gov` partition (e.g. `arn:aws-us-gov:iam::...`). The CloudFormation template handles this automatically.
- **API Gateway** – HTTP API (v2) is available in GovCloud and is the lowest-latency/cost option for this use case.
