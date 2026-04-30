#!/usr/bin/env bash
set -euo pipefail

# Usage: ./govcloud-deployment/deploy-lambda.sh <env-file> [aws-profile]
#   env-file    path to env file (e.g. env/env.arkansas)
#   aws-profile AWS CLI profile to use (default: halt-program-intake)
#
# Packages handler.py and deploys it to the Lambda function named in the env file.

ENV_FILE="${1:-}"
AWS_PROFILE="${2:-halt-program-intake}"

if [[ -z "$ENV_FILE" ]]; then
  echo "Usage: $0 <env-file> [aws-profile]"
  echo "  Example: $0 env/env.arkansas"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

LAMBDA_DIR="$(dirname "$0")/lambda"
ZIP_PATH="$LAMBDA_DIR/handler.zip"

if [[ -f "$ZIP_PATH" ]]; then
  echo "==> Removing existing handler.zip..."
  rm "$ZIP_PATH"
fi

echo "==> Packaging handler.py..."
(cd "$LAMBDA_DIR" && zip -q -j handler.zip handler.py)

echo "==> Uploading to s3://$LAMBDA_ZIP_S3_BUCKET/lambda/handler.zip..."
aws s3 cp "$ZIP_PATH" \
  "s3://$LAMBDA_ZIP_S3_BUCKET/lambda/handler.zip" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

echo "==> Deploying to Lambda: $LAMBDA_FUNCTION_NAME..."
aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --s3-bucket "$LAMBDA_ZIP_S3_BUCKET" \
  --s3-key "lambda/handler.zip" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query '{FunctionName:FunctionName,CodeSize:CodeSize,LastModified:LastModified}' \
  --output table

echo "==> Waiting for code update to complete..."
aws lambda wait function-updated \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE"

echo "==> Updating environment variables..."
ENV_JSON=$(python3 -c "
import json, sys
print(json.dumps({'Variables': {
    'TABLE_NAME':             sys.argv[1],
    'USER_POOL_ID':           sys.argv[2],
    'SENDER_EMAIL':           sys.argv[3],
    'ALLOWED_ORIGIN':         sys.argv[4],
    'NOTIFICATION_EMAILS':    sys.argv[5],
    'SES_CONFIGURATION_SET':  sys.argv[6],
}}))" \
  "$DYNAMODB_TABLE_NAME" \
  "$COGNITO_USER_POOL_ID" \
  "$BRAND_EMAIL_SENDER" \
  "$BRAND_URL" \
  "$NOTIFICATION_EMAILS" \
  "$SES_CONFIGURATION_SET"
)

aws lambda update-function-configuration \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --environment "$ENV_JSON" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --query '{FunctionName:FunctionName,LastModified:LastModified}' \
  --output table

echo "==> Done. $LAMBDA_FUNCTION_NAME is updated."
