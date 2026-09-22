#!/bin/sh
set -eu
# Explicit environment keys take precedence over generated development keys.
if [ -f /run/nexacred/runtime.env ]; then
  while IFS= read -r line; do
    key=${line%%=*}
    value=${line#*=}
    case "$key" in
      JWT_SECRET) [ -n "${JWT_SECRET:-}" ] || export JWT_SECRET="$value" ;;
      PII_ENCRYPTION_KEY) [ -n "${PII_ENCRYPTION_KEY:-}" ] || export PII_ENCRYPTION_KEY="$value" ;;
      PII_HMAC_SECRET) [ -n "${PII_HMAC_SECRET:-}" ] || export PII_HMAC_SECRET="$value" ;;
      MOCK_WEBHOOK_SECRET) [ -n "${MOCK_WEBHOOK_SECRET:-}" ] || export MOCK_WEBHOOK_SECRET="$value" ;;
    esac
  done < /run/nexacred/runtime.env
fi
exec "$@"
