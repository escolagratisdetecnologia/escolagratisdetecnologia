#!/usr/bin/env bash
# Publishes the site to the given environment. Requires AWS credentials for the account and
# `infra/tf live <env>` already initialized (the workflow runs apply first).
# Usage: tools/deploy-site.sh <dev|prod>
set -euo pipefail

environment="${1:?Uso: tools/deploy-site.sh <dev|prod>}"
case "$environment" in
  dev) site_url="https://dev.escolagratisdetecnologia.com" ;;
  prod) site_url="https://escolagratisdetecnologia.com" ;;
  *) echo "Ambiente inválido: $environment (use dev ou prod)." >&2; exit 2 ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist="$root/apps/web/dist"

SITE_URL="$site_url" SITE_ENV="$environment" pnpm --filter @egt/web build

bucket="$(terraform -chdir="$root/infra/live" output -raw site_bucket_name)"
distribution="$(terraform -chdir="$root/infra/live" output -raw distribution_id)"

# Hashed assets (_astro/*) are never deleted: clients holding older HTML may still request
# them, so old files stay until a lifecycle rule expires them. The remaining files (HTML etc.)
# are synced with --delete, and the invalidation is awaited so the success message is true.
aws s3 sync "$dist" "s3://$bucket" --exclude '*' --include '_astro/*' \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync "$dist" "s3://$bucket" --delete --exclude '_astro/*' \
  --cache-control 'public,max-age=0,s-maxage=600,must-revalidate'
invalidation_id="$(aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' \
  --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$distribution" --id "$invalidation_id"

echo "Site publicado em $site_url"
