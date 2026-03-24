# ContaCarros — Monitoramento LPR

Sistema web para monitoramento de veículos por leitura de placas via câmeras LPR, com backend NestJS + Prisma/PostgreSQL e frontend React + Vite.

## Arquitetura de deploy adotada

- Aplicação e banco rodam em Docker.
- Nginx roda fora do Docker, no host.
- O deploy usa detecção automática de portas livres.
- O deploy pergunta no momento da execução:
  - domínio ou IP
  - raiz `/` ou subcaminho, por exemplo `/contacarros`
- A configuração Nginx é gerada sem sobrescrever arquivos existentes.
- Se já existir configuração para o mesmo `server_name` ou `location`, o script avisa antes.

## Estrutura

```bash
contacarros/
  apps/
    backend/
    frontend/
  deploy/
    nginx/
      generated/
  scripts/
    deploy-host-nginx.sh
  docker-compose.yml
  .env.example
```

## Serviços em Docker

- `postgres`: banco PostgreSQL em container
- `backend`: API NestJS em container
- `frontend`: build React servido por servidor estático Node em container

Observação:
- Não existe Nginx dentro de container.
- O frontend foi ajustado para funcionar tanto na raiz quanto em subcaminho.

## Fluxo de deploy

### 1. Preparar deploy

```bash
npm run deploy:prepare
```

Esse script:

- detecta portas livres a partir de `3000`, `4173` e `5432`
- gera o arquivo `.env` da raiz com portas seguras
- pergunta o host público
- pergunta se o sistema fica na raiz ou em subcaminho
- gera a configuração Nginx em `deploy/nginx/generated/`
- verifica diretórios padrão do Nginx no host:
  - `/etc/nginx`
  - `/usr/local/etc/nginx`
  - `/opt/homebrew/etc/nginx`
- avisa se já encontrar `server_name` ou `location` conflitantes

### 2. Subir containers

```bash
docker compose up -d --build
```

### 3. Rodar migração e seed

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

### 4. Revisar e aplicar o arquivo do Nginx host

O script gera um arquivo novo em `deploy/nginx/generated/` com nome único. Ele não sobrescreve configuração existente.

Exemplo de aplicação manual no host:

```bash
sudo cp deploy/nginx/generated/contacarros_*.conf /opt/homebrew/etc/nginx/servers/
sudo nginx -t
sudo nginx -s reload
```

A pasta real pode variar conforme a instalação do Nginx no host.

## Portas e segurança

Por padrão, os containers são publicados somente em `127.0.0.1`:

- frontend: `127.0.0.1:FRONTEND_PORT`
- backend: `127.0.0.1:BACKEND_PORT`
- postgres: `127.0.0.1:POSTGRES_PORT`

Isso permite que apenas o Nginx do host exponha o sistema publicamente.

## Suporte a subcaminho

O frontend agora aceita base path configurável:

- `APP_BASE_PATH=/` para raiz
- `APP_BASE_PATH=/contacarros` para subcaminho

O Nginx gerado encaminha:

- `${APP_BASE_PATH}/api/` para o backend
- `${APP_BASE_PATH}/` para o frontend

## Sessão e autenticação

- O `accessToken` e o `refresh token` ficam em cookies `HttpOnly`, fora do `localStorage`.
- O frontend restaura a sessão consultando `GET /auth/me` ao carregar a aplicação.
- O frontend usa `withCredentials` e tenta renovar a sessão automaticamente ao receber `401`.
- Requisições mutáveis autenticadas por cookie enviam `X-CSRF-Token`, validado contra o cookie `cc_csrf_token`.
- O cookie CSRF respeita o `APP_BASE_PATH` para funcionar em raiz ou subcaminho.
- Em ambiente local, use `COOKIE_SECURE=false`. Em produção com HTTPS, use `COOKIE_SECURE=true`.

## Segurança HTTP

O backend implementa múltiplas camadas de proteção via headers HTTP com Helmet.js:

### Headers de Segurança Implementados

- **Content-Security-Policy (CSP)**: Restringe origem de scripts, estilos, imagens e recursos externos
- **Strict-Transport-Security (HSTS)**: Força HTTPS por 1 ano com includeSubdomains e preload
- **X-Frame-Options**: `DENY` (bloqueia frames para evitar clickjacking)
- **X-Content-Type-Options**: `nosniff` (impede detecção de tipo MIME)
- **X-XSS-Protection**: Ativa proteção contra XSS
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Cross-Origin-Resource-Policy**: `cross-origin` (permite CORS para assets)
- **X-Permitted-Cross-Domain-Policies**: `none`

### Configuração por Ambiente

- **Local**: Headers funcionam normalmente (sem HTTPS obrigatório)
- **Produção HTTPS**: HSTS preload permite registro no navegador para máxima segurança
- **CSP**: Flexível para Swagger UI (permite inline scripts/styles); em produção, pode ser restringido conforme necessário

### Validação de Segurança

Para testar headers localmente:

```bash
curl -i http://localhost:3000/health | grep -i "strict-transport\|x-frame\|content-security"
```

Stack de proteção em ordem:
1. Helmet.js (headers HTTP)
2. CORS (origin whitelist)
3. CSRF (double-submit token validation)
4. JWT + HttpOnly cookies (session)
5. Password hashing com bcrypt

## Stack

- Backend: Node.js, TypeScript, NestJS, Prisma, PostgreSQL, JWT, Bcrypt, class-validator, Swagger, Pino, cron jobs
- Frontend: React, TypeScript, Vite, TailwindCSS, React Router, TanStack Query, Axios, Recharts, React Hook Form + Zod
- Infra: Docker Compose, seed inicial, `.env.example`, geração de config Nginx host

## Backend implementado

- `auth`: login/logout/me/troca de senha com JWT
- `users`: gestão de usuários com perfis `ADMIN`, `OPERADOR`, `AUDITOR`, `VISUALIZADOR`
- `locations` e `cameras`: cadastro de locais e câmeras
- `readings`: ingestão de leituras LPR, validação de placa, deduplicação
- `integrations/placa-fipe`: serviço isolado de integração externa + cache por placa
- `vehicles`: catálogo de veículos enriquecidos
- `trips`: motor de interpretação de rota, fechamento por regra e rotina automática `SEM_SAIDA`
- `route-rules`: regras configuráveis origem/destino
- `alerts`: alertas operacionais e resolução
- `heavy-checks`: fila e checagem de caminhões/ônibus
- `dashboard`: cards e gráficos do dia
- `audit-logs`: trilha de auditoria
- `reports`: dados e exportação CSV por seção
- `settings`: parâmetros operacionais do sistema

## Banco de dados

Schema Prisma completo com:

- `Role`, `User`
- `Location`, `Camera`
- `Vehicle`, `Reading`
- `Trip`, `TripEvent`, `RouteRule`
- `HeavyVehicleCheck`
- `Alert`
- `AuditLog`
- `SystemSetting`

Migrations versionadas:

- pasta `apps/backend/prisma/migrations/`
- migration inicial já gerada para o schema atual
- deploy padrão usando `prisma migrate deploy`

## Seed inicial

Cria:

- perfis padrão
- usuário admin: `admin@contacarros.local` / `Admin@123`
- locais A, B, C, D
- câmeras `CAM_A1`, `CAM_B1`, `CAM_C1`, `CAM_D1`
- regras exemplo de rota
- configurações padrão do sistema

## Endpoints principais

- Auth: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout`
- LPR: `POST /lpr/readings`, `POST /lpr/readings/batch`, `GET /lpr/readings`
- Operação: `GET /dashboard/daily`, `GET /trips`, `GET /alerts`, `PATCH /alerts/:id/resolve`
- Pesados: `GET /heavy-checks/pending`, `POST /heavy-checks`
- Administração: `users`, `locations`, `cameras`, `route-rules`, `settings`, `audit-logs`, `reports`

## Frontend implementado

Páginas:

1. Login
2. Dashboard
3. Leituras
4. Trajetos
5. Alertas
6. Veículos pesados
7. Locais
8. Câmeras
9. Regras de rota
10. Usuários
11. Auditoria
12. Relatórios
13. Configurações

## Regras de negócio cobertas

- deduplicação de leitura por mesma placa/câmera em janela configurável
- enriquecimento de veículo via API externa com fallback para pendência
- classificação de veículo por segmento/subsegmento
- abertura automática de trajeto ao primeiro evento
- fechamento por regra configurável de rota
- fechamento como `INCONSISTENTE` quando não houver regra
- rotina cron para `SEM_SAIDA` por expiração de janela
- geração de alertas de rota, cancelamento, falha API, baixa confiança e sem saída
- fila operacional para caminhão/ônibus com checagem manual
- auditoria de ações críticas

## Observações operacionais

- No host atual, as portas `3000` e `5432` já estavam ocupadas durante a análise. O script resolve isso automaticamente escolhendo a próxima livre.
- Se o Nginx ainda não estiver instalado no host, o script continua útil porque já gera `.env` e o arquivo de site para aplicação posterior.
- O deploy foi preparado para não destruir configuração existente do Nginx: a estratégia é gerar um arquivo novo, isolado, e só então você revisar/aplicar.
