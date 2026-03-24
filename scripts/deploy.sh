#!/usr/bin/env bash
# deploy.sh — Orquestrador completo de implantação do ContaCarros
# Uso: bash scripts/deploy.sh [--skip-prepare] [--skip-migrate] [--skip-seed]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_PREPARE=false
SKIP_MIGRATE=false
SKIP_SEED=false

for arg in "$@"; do
  case "$arg" in
    --skip-prepare)  SKIP_PREPARE=true  ;;
    --skip-migrate)  SKIP_MIGRATE=true  ;;
    --skip-seed)     SKIP_SEED=true     ;;
  esac
done

# ── 1. Preparação de portas e nginx ──────────────────────────────────────────
if [[ "$SKIP_PREPARE" == false ]]; then
  printf '==> Etapa 1/4: Configuração de ambiente e nginx\n'
  bash "$ROOT_DIR/scripts/deploy-host-nginx.sh"
else
  printf '==> Etapa 1/4: Pulada (--skip-prepare)\n'
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  printf 'ERRO: arquivo .env não encontrado. Execute sem --skip-prepare.\n'
  exit 1
fi

# Carrega variáveis do .env
set -o allexport
# shellcheck source=/dev/null
source "$ROOT_DIR/.env"
set +o allexport

# ── 2. Subir containers ───────────────────────────────────────────────────────
printf '\n==> Etapa 2/4: Construindo e subindo containers\n'
docker compose up -d --build

# ── 3. Aguardar backend saudável ──────────────────────────────────────────────
BACKEND_HEALTH_URL="http://127.0.0.1:${BACKEND_PORT:-3001}/health"
printf '\n==> Etapa 3/4: Aguardando backend ficar saudável (%s)...\n' "$BACKEND_HEALTH_URL"
MAX_WAIT=120
ELAPSED=0
until curl -sf "$BACKEND_HEALTH_URL" >/dev/null 2>&1; do
  if [[ "$ELAPSED" -ge "$MAX_WAIT" ]]; then
    printf 'ERRO: backend não respondeu em %ds. Verifique: docker compose logs backend\n' "$MAX_WAIT"
    exit 1
  fi
  printf '  aguardando... (%ds)\n' "$ELAPSED"
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
printf '  Backend saudável!\n'

# ── 4. Migrations e seed ───────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATE" == false ]]; then
  printf '\n==> Etapa 4/4: Executando migrations\n'
  docker compose exec -T backend npx prisma migrate deploy
else
  printf '\n==> Etapa 4/4: Migrations puladas (--skip-migrate)\n'
fi

if [[ "$SKIP_SEED" == false ]]; then
  printf '\nExecutando seed inicial...\n'
  SEED_OUTPUT="$(docker compose exec -T backend npx prisma db seed 2>&1 || true)"
  printf '%s\n' "$SEED_OUTPUT"
  printf 'Seed concluído.\n'
fi

printf '\n========================================\n'
printf ' ContaCarros implantado com sucesso!\n'
printf ' Frontend: http://%s%s/\n' "${PUBLIC_HOST:-localhost}" "${APP_BASE_PATH:-/contacarros}"
printf ' API Docs:  http://127.0.0.1:%s/docs\n' "${BACKEND_PORT:-3001}"
printf ' Health:    %s\n' "$BACKEND_HEALTH_URL"
printf '========================================\n'
