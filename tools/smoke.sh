#!/usr/bin/env bash
# Checks a published environment. Usage: tools/smoke.sh <base-url>
set -euo pipefail

url="${1:?Uso: tools/smoke.sh <url-base>}"
url="${url%/}"

body=""
ok=0
for attempt in 1 2 3 4 5 6; do
  if body="$(curl -fsSL --max-time 10 "$url/")"; then
    ok=1
    break
  fi
  if [[ "$attempt" -lt 6 ]]; then
    echo "Tentativa $attempt falhou; nova tentativa em 20 s." >&2
    sleep 20
  fi
done
if [[ "$ok" -ne 1 ]]; then
  echo "Não foi possível acessar $url/ após 6 tentativas." >&2
  exit 1
fi

if ! grep -q 'Escola Grátis de Tecnologia' <<<"$body"; then
  echo "A página inicial não contém o nome da escola." >&2
  exit 1
fi

if ! status="$(curl -s -o /dev/null -w '%{http_code}' --retry 3 --retry-all-errors --max-time 10 "$url/nao-existe")"; then
  echo "Falha de rede ao verificar o 404 em $url/nao-existe." >&2
  exit 1
fi
if [[ "$status" != "404" ]]; then
  echo "Esperado 404 em rota inexistente, recebido $status." >&2
  exit 1
fi

if [[ "$url" == https://* ]]; then
  if ! headers="$(curl -fsSI --retry 3 --retry-all-errors --max-time 10 "$url/")"; then
    echo "Falha de rede ao ler os cabeçalhos de $url/." >&2
    exit 1
  fi
  grep -qi '^strict-transport-security:' <<<"$headers" || { echo "HSTS ausente." >&2; exit 1; }
  grep -qi '^content-security-policy:' <<<"$headers" || { echo "CSP ausente." >&2; exit 1; }
fi

echo "Smoke OK: $url"
