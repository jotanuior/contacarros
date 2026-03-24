#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
DEPLOY_DIR="${ROOT_DIR}/.deploy"
BACKUP_DIR="${ROOT_DIR}/deploy/backups"
LAST_DEPLOY_HEAD_FILE="${DEPLOY_DIR}/last_deploy_head_port3000"
LAST_FRONTEND_ENV_FINGERPRINT_FILE="${DEPLOY_DIR}/last_frontend_env_fingerprint_port3000"

DRY_RUN="${DEPLOY_DRY_RUN:-false}"
AUTO_BACKUP="${AUTO_BACKUP_BEFORE_DEPLOY:-false}"
FORCE_BUILD="${FORCE_BUILD:-false}"
SKIP_MIGRATE="false"
SKIP_SEED="true"
BACKUP_NAME="pre-deploy-port3000"

print_usage() {
  cat <<EOF
Uso:
  ./deploy_vps_port3000.sh [opções]

Opções:
  --dry-run          Mostra as ações sem alterar o ambiente
  --with-backup      Gera backup PostgreSQL antes do deploy
  --no-backup        Não gera backup pré-deploy (default)
  --backup-name N    Sufixo do nome do backup (default: ${BACKUP_NAME})
  --skip-migrate     Não executa migrations
  --with-seed        Executa seed após migrations
  --force-build      Força rebuild de frontend e backend
  -h, --help         Exibe esta ajuda

Variáveis de ambiente:
  DEPLOY_DRY_RUN=true
  AUTO_BACKUP_BEFORE_DEPLOY=true
  ALLOW_DIRTY_GIT=true
  FORCE_BUILD=true
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN="true"
        ;;
      --with-backup)
        AUTO_BACKUP="true"
        ;;
      --no-backup)
        AUTO_BACKUP="false"
        ;;
      --backup-name)
        shift
        [[ $# -gt 0 ]] || {
          echo "❌ Valor ausente para --backup-name"
          exit 1
        }
        BACKUP_NAME="$1"
        ;;
      --skip-migrate)
        SKIP_MIGRATE="true"
        ;;
      --with-seed)
        SKIP_SEED="false"
        ;;
      --force-build)
        FORCE_BUILD="true"
        ;;
      -h|--help)
        print_usage
        exit 0
        ;;
      *)
        echo "❌ Opção inválida: $1"
        print_usage
        exit 1
        ;;
    esac
    shift
  done
}

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "🧪 [DRY-RUN] $*"
    return 0
  fi
  "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ Comando obrigatório não encontrado: $cmd"
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "$value"
}

build_frontend_env_fingerprint() {
  local app_base_path public_host cors_origin
  app_base_path="$(get_env_value APP_BASE_PATH)"
  public_host="$(get_env_value PUBLIC_HOST)"
  cors_origin="$(get_env_value CORS_ORIGIN)"

  local payload
  payload="${app_base_path}|${public_host}|${cors_origin}"

  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s\n' "$payload" | sha256sum | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    printf '%s\n' "$payload" | shasum -a 256 | awk '{print $1}'
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    printf '%s' "$payload" | openssl dgst -sha256 | awk '{print $NF}'
    return
  fi

  echo "$payload"
}

wait_for_postgres_health() {
  local timeout_seconds=120
  local elapsed=0

  echo "🗄️ Aguardando PostgreSQL ficar saudável..."
  while true; do
    local status
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' contacarros-postgres 2>/dev/null || true)"

    if [[ "$status" == "healthy" ]]; then
      echo "✅ PostgreSQL saudável"
      return 0
    fi

    if [[ "$elapsed" -ge "$timeout_seconds" ]]; then
      echo "❌ Timeout aguardando PostgreSQL saudável (${timeout_seconds}s)"
      return 1
    fi

    sleep 5
    elapsed=$((elapsed + 5))
    echo "  aguardando... (${elapsed}s)"
  done
}

run_pre_deploy_backup() {
  if [[ "$AUTO_BACKUP" != "true" ]]; then
    return
  fi

  local pg_db pg_user pg_password timestamp backup_file
  pg_db="$(get_env_value POSTGRES_DB)"
  pg_user="$(get_env_value POSTGRES_USER)"
  pg_password="$(get_env_value POSTGRES_PASSWORD)"

  pg_db="${pg_db:-contacarros}"
  pg_user="${pg_user:-postgres}"
  pg_password="${pg_password:-postgres}"

  mkdir -p "$BACKUP_DIR"
  timestamp="$(date +%Y%m%d_%H%M%S)"
  backup_file="${BACKUP_DIR}/${BACKUP_NAME}_${timestamp}.sql"

  echo "💾 Gerando backup pré-deploy: ${backup_file}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "🧪 [DRY-RUN] docker compose exec -T postgres pg_dump -U ${pg_user} -d ${pg_db} > ${backup_file}"
    return
  fi

  PGPASSWORD="$pg_password" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$pg_user" -d "$pg_db" > "$backup_file"

  echo "✅ Backup concluído"
}

build_compose_services_if_needed() {
  local changed_files="$1"

  local build_frontend=false
  local build_backend=false

  local previous_frontend_fingerprint=""
  local current_frontend_fingerprint=""

  if [[ -f "$LAST_FRONTEND_ENV_FINGERPRINT_FILE" ]]; then
    previous_frontend_fingerprint="$(tr -d '[:space:]' < "$LAST_FRONTEND_ENV_FINGERPRINT_FILE")"
  fi
  current_frontend_fingerprint="$(build_frontend_env_fingerprint)"

  if [[ "$FORCE_BUILD" == "true" ]]; then
    build_frontend=true
    build_backend=true
  else
    if echo "$changed_files" | grep -Eq '^(apps/frontend/|docker-compose\.yml$|apps/frontend/Dockerfile$)'; then
      build_frontend=true
    fi

    if echo "$changed_files" | grep -Eq '^(apps/backend/|docker-compose\.yml$|apps/backend/Dockerfile$)'; then
      build_backend=true
    fi

    if [[ "$current_frontend_fingerprint" != "$previous_frontend_fingerprint" ]]; then
      build_frontend=true
      echo "ℹ️ Variáveis de build do frontend mudaram — rebuild obrigatório"
    fi
  fi

  if [[ "$build_frontend" == "true" || "$build_backend" == "true" ]]; then
    local services=()
    [[ "$build_backend" == "true" ]] && services+=(backend)
    [[ "$build_frontend" == "true" ]] && services+=(frontend)

    echo "🏗️ Rebuild seletivo: ${services[*]}"
    run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build "${services[@]}"
  else
    echo "⚡ Sem mudanças em frontend/backend — deploy sem rebuild"
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    mkdir -p "$DEPLOY_DIR"
    echo "$current_frontend_fingerprint" > "$LAST_FRONTEND_ENV_FINGERPRINT_FILE"
  fi
}

main() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚀 ContaCarros Deploy VPS (modo operacional | porta 3000)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  parse_args "$@"

  require_cmd docker
  require_cmd git
  require_cmd curl

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ Arquivo .env não encontrado em ${ENV_FILE}"
    echo "💡 Rode primeiro: bash scripts/deploy-host-nginx.sh"
    exit 1
  fi

  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "❌ Arquivo docker-compose.yml não encontrado em ${COMPOSE_FILE}"
    exit 1
  fi

  cd "$ROOT_DIR"

  echo "ℹ️ Modo dry-run: ${DRY_RUN} | backup pré-deploy: ${AUTO_BACKUP} | force-build: ${FORCE_BUILD}"

  local root_usage_pct
  root_usage_pct="$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  if [[ -n "$root_usage_pct" && "$root_usage_pct" -ge 95 ]]; then
    echo "❌ Uso de disco em / em ${root_usage_pct}%. Libere espaço antes do deploy."
    exit 1
  fi

  if [[ -n "$root_usage_pct" && "$root_usage_pct" -ge 90 ]]; then
    echo "⚠️ Aviso: / está com ${root_usage_pct}% de uso. O deploy pode falhar por falta de espaço."
  fi

  local git_dirty_status
  git_dirty_status="$(git status --porcelain || true)"
  if [[ "${ALLOW_DIRTY_GIT:-false}" != "true" ]] && [[ -n "${git_dirty_status//[[:space:]]/}" ]]; then
    echo "❌ Repositório com alterações locais. Commit/stash antes do deploy."
    echo "   Para ignorar esse bloqueio, use: ALLOW_DIRTY_GIT=true"
    exit 1
  fi

  local prev_head target_head last_deploy_head
  prev_head="$(git rev-parse --verify HEAD 2>/dev/null || true)"
  target_head="$prev_head"
  last_deploy_head=""

  if [[ -f "$LAST_DEPLOY_HEAD_FILE" ]]; then
    last_deploy_head="$(tr -d '[:space:]' < "$LAST_DEPLOY_HEAD_FILE")"
  fi

  if git remote get-url origin >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "🧪 [DRY-RUN] git fetch --all --prune && git pull --ff-only"
    else
      echo "📥 Atualizando código (git fetch/pull)..."
      git fetch --all --prune
      git pull --ff-only
      target_head="$(git rev-parse --verify HEAD 2>/dev/null || true)"
    fi
  else
    echo "ℹ️ Repositório sem remote origin — seguindo sem git pull"
  fi

  local changed_files=""
  if [[ -n "$prev_head" && -n "$target_head" ]]; then
    changed_files="$(git diff --name-only "$prev_head" "$target_head" || true)"
  fi

  if [[ -n "$last_deploy_head" && -n "$target_head" ]]; then
    echo "ℹ️ Último deploy registrado: ${last_deploy_head:0:7}"
    echo "ℹ️ HEAD atual: ${target_head:0:7}"
  fi

  echo "🧩 Validando docker compose"
  run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null

  echo "🐘 Subindo PostgreSQL"
  run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres

  if [[ "$DRY_RUN" != "true" ]]; then
    wait_for_postgres_health
  else
    echo "🧪 [DRY-RUN] Verificação de health do PostgreSQL ignorada"
  fi

  run_pre_deploy_backup

  build_compose_services_if_needed "$changed_files"

  if [[ "$SKIP_MIGRATE" != "true" ]]; then
    echo "🧱 Aplicando migrations"
    run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps backend npx prisma migrate deploy
  else
    echo "⏭️ Migrations puladas (--skip-migrate)"
  fi

  if [[ "$SKIP_SEED" != "true" ]]; then
    echo "🌱 Executando seed"
    run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps backend npx prisma db seed
  else
    echo "⏭️ Seed pulado (use --with-seed para executar)"
  fi

  echo "🐳 Atualizando backend/frontend"
  run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps backend frontend

  local backend_port frontend_port backend_health_url frontend_health_url
  backend_port="$(get_env_value BACKEND_PORT)"
  frontend_port="$(get_env_value FRONTEND_PORT)"
  backend_port="${backend_port:-3001}"
  frontend_port="${frontend_port:-4173}"

  backend_health_url="http://127.0.0.1:${backend_port}/health"
  frontend_health_url="http://127.0.0.1:${frontend_port}/"

  if [[ "$DRY_RUN" != "true" ]]; then
    echo "🔎 Validando backend: ${backend_health_url}"
    curl -fsS "$backend_health_url" >/dev/null

    echo "🔎 Validando frontend: ${frontend_health_url}"
    curl -fsS "$frontend_health_url" >/dev/null
  else
    echo "🧪 [DRY-RUN] Verificações HTTP de backend/frontend serão ignoradas"
  fi

  echo "📊 Status final dos containers"
  run_cmd docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

  if [[ "$DRY_RUN" != "true" && -n "$target_head" ]]; then
    mkdir -p "$DEPLOY_DIR"
    echo "$target_head" > "$LAST_DEPLOY_HEAD_FILE"
    echo "ℹ️ HEAD do deploy registrado em ${LAST_DEPLOY_HEAD_FILE} (${target_head:0:7})"
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "🧪 Dry-run concluído (nenhuma alteração aplicada)"
  else
    echo "✅ Deploy concluído (modo operacional porta 3000)"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"
