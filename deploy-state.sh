#!/usr/bin/env bash
set -euo pipefail

# Usage: ./deploy-state.sh <state> [aws-profile]
#   state       lowercase state directory name (e.g. arkansas, alaska)
#   aws-profile AWS CLI profile to use (default: halt-program-intake)
#
# Builds dist/<state>/ from shared program_landings/ and states/<state>/,
# regenerates auth-config.js from CloudFormation, then syncs to S3.

STATE="${1:-}"
AWS_PROFILE="${2:-halt-program-intake}"

if [[ -z "$STATE" ]]; then
  echo "Usage: $0 <state> [aws-profile]"
  echo "  Example: $0 arkansas"
  exit 1
fi

ENV_FILE="env/env.${STATE}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

DIST_DIR="dist/${STATE}/program_landings"
STATE_DIR="states/${STATE}"

# ── Build ──────────────────────────────────────────────────────────────────────

echo "==> Building ${DIST_DIR}..."

# Shared files
rsync -a --delete program_landings/ "${DIST_DIR}/"

# State-specific HTML pages
cp "${STATE_DIR}"/*.html "${DIST_DIR}/"

# State-specific assets and public folders
rsync -a "${STATE_DIR}/assets/" "${DIST_DIR}/assets/"
rsync -a "${STATE_DIR}/public/"  "${DIST_DIR}/public/"

# Inject API Gateway URL into CSP connect-src placeholders
echo "==> Injecting API Gateway URL into CSP..."
find "${DIST_DIR}/" -name "*.html" | while read -r f; do
  python3 -c "
import sys
content = open(sys.argv[1]).read()
content = content.replace('%%API_GATEWAY_URL%%', sys.argv[2])
open(sys.argv[1], 'w').write(content)
" "$f" "${API_GATEWAY_URL}"
done

# Regenerate auth-config.js from the deployed CloudFormation stack
echo "==> Regenerating auth-config.js from stack: ${CLOUDFORMATION_STACK_NAME}..."
python3 govcloud-deployment/generate_auth_config.py \
  --stack-name       "${CLOUDFORMATION_STACK_NAME}" \
  --region           "${AWS_REGION}" \
  --profile          "${AWS_PROFILE}" \
  --output           "${DIST_DIR}/auth-config.js" \
  --agency-name      "${AGENCY_NAME:-}" \
  --program-full-name "${PROGRAM_FULL_NAME:-}"

# ── Sync to S3 ─────────────────────────────────────────────────────────────────

echo "==> Syncing to s3://${S3_BUCKET_NAME}/program_landings/..."
aws s3 sync "${DIST_DIR}/" \
  "s3://${S3_BUCKET_NAME}/program_landings/" \
  --delete \
  --region "${AWS_REGION}" \
  --profile "${AWS_PROFILE}"


echo "==> Done. ${STATE_NAME} site is live."
