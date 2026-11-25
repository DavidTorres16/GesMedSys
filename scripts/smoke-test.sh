#!/usr/bin/env bash
# Prueba de humo posterior al despliegue: verifica salud, login y un endpoint protegido.
# Uso: BASE_URL=http://localhost:8080 SEED_PASSWORD=... ./scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
: "${SEED_PASSWORD:?Defina SEED_PASSWORD}"

echo "==> Esperando a que ${BASE_URL}/health responda"
for i in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/health" > /dev/null 2>&1; then break; fi
  if [ "$i" -eq 30 ]; then echo "La aplicación no respondió"; exit 1; fi
  sleep 2
done
curl -fsS "${BASE_URL}/health"; echo

echo "==> Login como admin"
TOKEN=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${SEED_PASSWORD}\"}" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')

echo "==> Endpoint protegido sin token debe responder 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/pacientes")
[ "$CODE" = "401" ] || { echo "Esperado 401, obtenido $CODE"; exit 1; }

echo "==> Endpoint protegido con token debe responder 200"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${TOKEN}" "${BASE_URL}/api/pacientes")
[ "$CODE" = "200" ] || { echo "Esperado 200, obtenido $CODE"; exit 1; }

echo "Prueba de humo superada"
