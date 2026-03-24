#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
GENERATED_DIR="$ROOT_DIR/deploy/nginx/generated"
mkdir -p "$GENERATED_DIR"

find_free_port() {
  local start="$1"
  local port="$start"
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port="$((port + 1))"
  done
  printf '%s' "$port"
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local value
  read -r -p "$label [$default_value]: " value
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  printf '%s' "$value"
}

normalize_path() {
  local value="$1"
  if [[ -z "$value" || "$value" == "/" ]]; then
    printf '/'
    return
  fi
  value="/${value#/}"
  value="${value%/}"
  printf '%s' "$value"
}

ROOT_MODE="$(prompt_default "Publicar na raiz? (y/n)" "n")"
PUBLIC_HOST="$(prompt_default "Domínio ou IP público" "localhost")"
BASE_PATH_RAW="/"
if [[ ! "$ROOT_MODE" =~ ^[Yy]$ ]]; then
  BASE_PATH_RAW="$(prompt_default "Subcaminho" "/contacarros")"
fi
BASE_PATH="$(normalize_path "$BASE_PATH_RAW")"

BACKEND_PORT="$(find_free_port 3000)"
FRONTEND_PORT="$(find_free_port 4173)"
POSTGRES_PORT="$(find_free_port 5432)"

CORS_ORIGIN="http://${PUBLIC_HOST}"
if [[ "$BASE_PATH" != "/" ]]; then
  CORS_ORIGIN="${CORS_ORIGIN}${BASE_PATH}"
fi

cat > "$ENV_FILE" <<EOF
POSTGRES_DB=contacarros
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_PORT=${POSTGRES_PORT}
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
JWT_SECRET=change-me
PLACA_FIPE_BASE_URL=
PLACA_FIPE_TOKEN=
PUBLIC_HOST=${PUBLIC_HOST}
APP_BASE_PATH=${BASE_PATH}
CORS_ORIGIN=${CORS_ORIGIN}
EOF

SITE_SLUG="$(printf '%s' "$PUBLIC_HOST$BASE_PATH" | tr '/:.' '_')"
NGINX_FILE="$GENERATED_DIR/contacarros_${SITE_SLUG}.conf"
API_LOCATION="/api/"
FRONTEND_LOCATION="/"
ROOT_REDIRECT=""
if [[ "$BASE_PATH" != "/" ]]; then
  API_LOCATION="${BASE_PATH}/api/"
  FRONTEND_LOCATION="${BASE_PATH}/"
  ROOT_REDIRECT="location = ${BASE_PATH} { return 301 ${BASE_PATH}/; }"
fi

cat > "$NGINX_FILE" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_HOST};

    ${ROOT_REDIRECT}

    location ${API_LOCATION} {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location ${FRONTEND_LOCATION} {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

printf '\nArquivo de ambiente gerado: %s\n' "$ENV_FILE"
printf 'Config Nginx gerada: %s\n' "$NGINX_FILE"
printf 'Portas escolhidas: frontend=%s backend=%s postgres=%s\n' "$FRONTEND_PORT" "$BACKEND_PORT" "$POSTGRES_PORT"

NGINX_APPLY=false
NGINX_SITES_DIR=""
for dir in /etc/nginx/sites-available /etc/nginx/conf.d /usr/local/etc/nginx/servers /opt/homebrew/etc/nginx/servers; do
  if [[ -d "$dir" ]]; then
    NGINX_SITES_DIR="$dir"
    break
  fi
done

if command -v nginx >/dev/null 2>&1 && [[ -n "$NGINX_SITES_DIR" ]]; then
  printf '\nNginx detectado: %s (sites dir: %s)\n' "$(command -v nginx)" "$NGINX_SITES_DIR"
  APPLY_ANSWER="$(prompt_default "Aplicar configuração no nginx agora? (y/n)" "y")"
  if [[ "$APPLY_ANSWER" =~ ^[Yy]$ ]]; then
    NGINX_APPLY=true
  fi
else
  for dir in /etc/nginx /usr/local/etc/nginx /opt/homebrew/etc/nginx; do
    if [[ -d "$dir" ]]; then
      printf 'Diretório nginx encontrado: %s\n' "$dir"
      if grep -R "server_name[[:space:]]\+${PUBLIC_HOST}" "$dir" >/dev/null 2>&1; then
        printf 'Aviso: já existe configuração com server_name %s em %s\n' "$PUBLIC_HOST" "$dir"
      fi
      if [[ "$BASE_PATH" != "/" ]] && grep -R "location[[:space:]]\+${BASE_PATH}/" "$dir" >/dev/null 2>&1; then
        printf 'Aviso: já existe configuração com location %s/ em %s\n' "$BASE_PATH" "$dir"
      fi
    fi
  done
fi

if [[ "$NGINX_APPLY" == true ]]; then
  DEST_FILE="$NGINX_SITES_DIR/contacarros_${SITE_SLUG}.conf"
  if [[ -f "$DEST_FILE" ]]; then
    printf 'Aviso: já existe %s — sobrescrevendo...\n' "$DEST_FILE"
  fi
  cp "$NGINX_FILE" "$DEST_FILE"
  printf 'Configuração copiada para: %s\n' "$DEST_FILE"

  # Enable site on Debian/Ubuntu style (sites-available / sites-enabled)
  if [[ "$NGINX_SITES_DIR" == "/etc/nginx/sites-available" ]]; then
    ENABLED_DIR="/etc/nginx/sites-enabled"
    mkdir -p "$ENABLED_DIR"
    LINK="$ENABLED_DIR/contacarros_${SITE_SLUG}.conf"
    ln -sf "$DEST_FILE" "$LINK"
    printf 'Link simbólico criado em: %s\n' "$LINK"
  fi

  printf 'Testando configuração do nginx...\n'
  if nginx -t; then
    printf 'Configuração OK. Recarregando nginx...\n'
    nginx -s reload
    printf 'Nginx recarregado com sucesso.\n'
  else
    printf 'Erro na configuração nginx. Reverter manualmente: rm %s\n' "$DEST_FILE"
    exit 1
  fi
fi

printf '\nPróximos passos:\n'
printf '1. docker compose up -d --build\n'
printf '2. docker compose exec backend npm run prisma:migrate -- --name init\n'
printf '3. docker compose exec backend npm run prisma:seed\n'
if [[ "$NGINX_APPLY" == false ]]; then
  printf '4. Copiar %s para o diretório de sites do nginx e recarregar\n' "$NGINX_FILE"
fi
