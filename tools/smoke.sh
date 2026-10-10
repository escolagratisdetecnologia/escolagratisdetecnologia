#!/usr/bin/env bash
# Checks a published environment. Usage: tools/smoke.sh <base-url> [expected-api-version]
set -euo pipefail

url="${1:?Uso: tools/smoke.sh <url-base> [versão-esperada-da-api]}"
url="${url%/}"
expected_version="${2:-}"

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

# The API shares the distribution: its errors must reach the client as JSON (ADR 0022).
if ! health="$(curl -fsS --retry 3 --retry-all-errors --max-time 10 "$url/api/health")"; then
  echo "A API não respondeu em $url/api/health." >&2
  exit 1
fi
if ! grep -q '"status":"ok"' <<<"$health"; then
  echo "A API não está saudável: $health" >&2
  exit 1
fi
if [[ -n "$expected_version" ]] && ! grep -q "\"version\":\"$expected_version\"" <<<"$health"; then
  echo "A API publicada não é a versão $expected_version: $health" >&2
  exit 1
fi
if ! api_404="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --retry 3 --retry-all-errors --max-time 10 "$url/api/nao-existe")"; then
  echo "Falha de rede ao verificar o 404 da API." >&2
  exit 1
fi
if [[ "$api_404" != "404 application/json"* ]]; then
  echo "Esperado 404 em JSON da API, recebido '$api_404'." >&2
  exit 1
fi

# Accounts (ADR 0024): personal routes ask for a session in JSON, and the Google sign-in starts.
if ! me="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --retry 3 --retry-all-errors --max-time 10 "$url/api/me")"; then
  echo "Falha de rede ao verificar /api/me." >&2
  exit 1
fi
if [[ "$me" != "401 application/json"* ]]; then
  echo "Esperado 401 em JSON em /api/me sem sessão, recebido '$me'." >&2
  exit 1
fi
if ! google="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --retry 3 --retry-all-errors --max-time 10 "$url/api/auth/google")"; then
  echo "Falha de rede ao verificar o início do login com Google." >&2
  exit 1
fi
if [[ ! "$google" =~ ^302\ .+/authorize\? ]]; then
  echo "O login com Google deveria redirecionar para o /authorize, recebido '$google'." >&2
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
