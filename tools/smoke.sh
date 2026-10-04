#!/usr/bin/env bash
# Checks a published environment. Usage: tools/smoke.sh <base-url>
set -euo pipefail

url="${1:?Uso: tools/smoke.sh <url-base>}"
url="${url%/}"

body=""
for attempt in 1 2 3 4 5 6; do
  if body="$(curl -fsSL --max-time 10 "$url/")"; then
    break
  fi
  echo "Tentativa $attempt falhou; nova tentativa em 20 s." >&2
  sleep 20
done

if ! grep -q 'Escola Grátis de Tecnologia' <<<"$body"; then
  echo "A página inicial não contém o nome da escola." >&2
  exit 1
fi

status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url/nao-existe")"
if [[ "$status" != "404" ]]; then
  echo "Esperado 404 em rota inexistente, recebido $status." >&2
  exit 1
fi

if [[ "$url" == https://* ]]; then
  headers="$(curl -fsSI --max-time 10 "$url/")"
  grep -qi '^strict-transport-security:' <<<"$headers" || { echo "HSTS ausente." >&2; exit 1; }
  grep -qi '^content-security-policy:' <<<"$headers" || { echo "CSP ausente." >&2; exit 1; }
fi

echo "Smoke OK: $url"
