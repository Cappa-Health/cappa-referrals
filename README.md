# cappa-referrals

# Deployment via the Console (27.04.2026)

## 1. Load the state's env vars

```bash
source env/env.arkansas   # or env/env.alaska, env/env.dev
```

## 2. Package and upload Lambda ZIP

```bash
cd govcloud-deployment/lambda
zip -r handler.zip handler.py
aws s3 cp handler.zip s3://$LAMBDA_ZIP_S3_BUCKET/handler.zip \
  --region $AWS_REGION --profile <your-govcloud-profile>
cd ../..
```

## 3. Deploy the stack

```bash
aws cloudformation deploy \
  --stack-name $CLOUDFORMATION_STACK_NAME \
  --template-file govcloud-deployment/cloudformation.yaml \
  --parameter-overrides \
      ProjectName=$PROJECT_NAME \
      AllowedOrigin=$BRAND_URL \
      SenderEmail=$BRAND_EMAIL_SENDER \
      LambdaZipS3Bucket=$LAMBDA_ZIP_S3_BUCKET \
      NotificationEmails=$NOTIFICATION_EMAILS \
      StaticSiteBucketName=$S3_BUCKET_NAME \
      SesConfigurationSet=$SES_CONFIGURATION_SET \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION --profile <your-govcloud-profile>
```

For Alaska (existing stack) — also run this after deploy to push the new handler.py:

```bash
aws lambda update-function-code \
  --function-name $LAMBDA_FUNCTION_NAME \
  --s3-bucket $LAMBDA_ZIP_S3_BUCKET \
  --s3-key handler.zip \
  --region $AWS_REGION --profile <your-govcloud-profile>
```

For Arkansas/Dev (new stacks) — after the deploy completes, go to the GovCloud Console → CloudFormation → your stack → Outputs tab and copy the values into `env/env.arkansas` (the post-deploy vars: `COGNITO_CLIENT_ID`, `API_GATEWAY_URL`, etc.), then run `python3 build.py --state arkansas`.
