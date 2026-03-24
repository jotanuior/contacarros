# Guia de Segurança — ContaCarros LPR

## Resumo da Implementação

Este documento descreve as camadas de segurança implementadas na aplicação ContaCarros.

## 1. Segurança em Camadas

### Nível 1: HTTP Headers (Helmet.js no Backend)

O backend implementa headers de segurança obrigatórios:

- **Content-Security-Policy (CSP)**: Restringe origem de scripts, estilos, imagens e recursos
- **Strict-Transport-Security (HSTS)**: Força HTTPS (1 ano, com preload)
- **X-Frame-Options**: `DENY` (bloqueia frames/clickjacking)
- **X-Content-Type-Options**: `nosniff` (protege contra content-type sniffing)
- **X-XSS-Protection**: Ativa proteção XSS
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Cross-Origin-Resource-Policy**: `cross-origin` (permite CORS)

**Arquivo**: `apps/backend/src/main.ts` (linhas com `helmet()`)

### Nível 2: CORS (Origin Whitelist)

O backend valida origem das requisições:

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true,
});
```

**Configuração**: `.env` → `CORS_ORIGIN`

### Nível 3: CSRF (Double-Submit Tokens)

Requisições mutáveis (POST/PUT/PATCH/DELETE) com sessão cookie requerem:

- Token `cc_csrf_token` (cookie não-HttpOnly)
- Header `X-CSRF-Token` com mesmo valor

**Validação**: `apps/backend/src/main.ts` (middleware CSRF)

### Nível 4: Session Management

- Tokens em cookies **HttpOnly** (inacessíveis via JavaScript)
- Cookies respeitam `SameSite=Lax`
- Path `/api` para access_token
- Path `/api/auth` para refresh_token
- Cookie `SECURE` automático em HTTPS (produção)

**Arquivo**: `apps/backend/src/modules/auth/cookies.ts`

### Nível 6: Rate Limiting

- Endpoints sensíveis (POST `/auth/login`) limitados a **5 requisições por 15 minutos**
- Limite enforçado por IP do cliente (X-Forwarded-For atrás de proxy)
- Retorna **HTTP 429** (Too Many Requests) com headers informativos
- X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset incluídos na resposta
- Protege contra brute force attacks em login

**Arquivo**: `apps/backend/src/app.module.ts` (ThrottlerModule)
**Decorator**: `apps/backend/src/modules/auth/auth.controller.ts` (@Throttle na ação login)

### Nível 7: IP Whitelist para Admin Endpoints

- Operações administrativas (criar/editar usuários, alterar configurações) requerem IP whitelisted
- Endpoints protegidos:
  - `POST /users` (criar usuário)
  - `PATCH /users/:id` (editar usuário)
  - `POST /settings` (alterar configurações)
- Whitelist configurável via `ADMIN_IP_WHITELIST` (opcional)
- Suporta IPs individuais (ex: 127.0.0.1, ::1) e ranges CIDR (ex: 192.168.1.0/24)
- Respeita header `X-Forwarded-For` atrás de proxies
- Se `ADMIN_IP_WHITELIST` não definido, todas as IPs são permitidas (whitelist desabilitado)
- Retorna **HTTP 403 Forbidden** se IP não está whitelisted

**Arquivo**: `apps/backend/src/common/ip-whitelist.guard.ts` (@UseGuards(IpWhitelistGuard) nos endpoints)

### Nível 8: Authentication & Passwords

- JWT com expiração (12h access, 7d refresh)
- Senha hasheada com bcrypt (rounds=10)
- Logout revoga refresh tokens
- `GET /auth/me` valida sessão

**Arquivo**: `apps/backend/src/modules/auth/`

---

## 2. Configuração por Ambiente

### Desenvolvimento Local

```bash
# .env
COOKIE_SECURE=false
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
PUBLIC_HOST=localhost
# IP whitelist desabilitado (comentado/não definido)
# ADMIN_IP_WHITELIST=127.0.0.1,::1
```

### Produção HTTPS

```bash
# .env
COOKIE_SECURE=true
NODE_ENV=production
CORS_ORIGIN=https://seu-dominio.com
PUBLIC_HOST=seu-dominio.com
# IP whitelist para operações admin (recomendado)
# Exemplo: apenas rede corporativa + bastion host
ADMIN_IP_WHITELIST=203.0.113.0/24,203.0.113.50,2001:db8::/32
```

**HSTS Preload**: Em produção HTTPS, registre o domínio em [hstspreload.org](https://hstspreload.org) para máxima segurança.

---

## 3. Configuração Nginx (Host)

Se usar Nginx como reverse proxy, adicione headers customizados:

```nginx
server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    # Headers de segurança (implementados no backend, mas bom reforçar)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # SSL/TLS (obrigatório para HSTS)
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location /contacarros/api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https; # Force HTTPS
    }
}
```

---

## 4. Testes de Segurança

### Validar Headers Locais

```bash
curl -i http://localhost:3000/health | grep -iE "strict-transport|x-frame|content-security|x-content-type"
```

Saída esperada:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; ...
```

### Validar HTTPS (Produção)

```bash
curl -i https://seu-dominio.com/contacarros/health
```

### Validar CORS

```bash
curl -i -H "Origin: https://seu-dominio.com" http://localhost:3001/auth/me
```

Deve retornar `Access-Control-Allow-Origin: https://seu-dominio.com` se origin está whitelisted.

### Validar CSRF

```bash
# Sem CSRF token (deve falhar)
curl -i -X POST http://localhost:3001/locations \
  -H "Cookie: cc_access_token=..." \
  -H "Content-Type: application/json"

# Esperado: 403 Forbidden (CSRF token inválido ou ausente)
```

---

## 5. Checklist de Produção

- [ ] Configurar `COOKIE_SECURE=true`
- [ ] Habilitar HTTPS com certificado válido
- [ ] Configurar `CORS_ORIGIN` com domínio real
- [ ] Registrar domínio em [hstspreload.org](https://hstspreload.org)
- [ ] Validar headers de segurança com curl
- [ ] Testar CSRF em endpoints /locations, /users, /cameras, etc.
- [ ] Configurar `ADMIN_IP_WHITELIST` para admin endpoints (recomendado)
- [ ] Monitorar audit-logs para atividades suspeitas
- [ ] Fazer backup do banco de dados
- [ ] Configurar logs e monitoring
- [ ] Testar procedimento de recuperação de senha
- [x] Validar rate limiting em endpoints de login (implementado com @nestjs/throttler)
- [x] IP whitelist para admin endpoints (implementado com @UseGuards(IpWhitelistGuard))

---

## 7. Possíveis Melhorias Futuras

- [x] Rate limiting em `/auth/login` (prevent brute force) — **Implementado com @nestjs/throttler (5 req/15min)**
- [x] IP whitelist para admin endpoints — **Implementado com @UseGuards(IpWhitelistGuard) - configurável via ADMIN_IP_WHITELIST**
- [ ] Two-Factor Authentication (2FA)
- [ ] Encryption de dados sensíveis no banco
- [ ] Request signing para integração LPR (webhook)
- [ ] WAF (Web Application Firewall) no Nginx
- [ ] Monitoring de segurança (Prometheus + Alerting)

---

## 8. Rate Limiting em Detalhes

O rate limiting está implementado com `@nestjs/throttler` e funciona por IP do cliente.

### Configuração Padrão

```typescript
// apps/backend/src/app.module.ts
ThrottlerModule.forRoot([
  {
    ttl: 900000, // 15 minutos em milliseconds
    limit: 5,    // máximo 5 requisições por ttl
  },
]);

// apps/backend/src/modules/auth/auth.controller.ts
@Throttle({ default: { limit: 5, ttl: 900000 } })
@Post('login')
login(...) { ... }
```

### Headers de Resposta

Quando rate limited, a resposta inclui:

```bash
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711200900000
```

### Teste Local

```bash
# Requisição bem-sucedida (1/5)
curl -i -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@contacarros.local","password":"Admin@123"}'

# Requisição 6+ no mesmo IP — 429
curl -i -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@contacarros.local","password":"wrong"}'

# Response: 429 Too Many Requests com headers X-RateLimit-*
```

### Configuração Em Produção

Se usar load balancer ou proxy reverso (Nginx):

```typescript
// apps/backend/src/main.ts
app.set('trust proxy', 1); // Confia em X-Forwarded-For do proxy
```

E configure o Nginx para passar o IP real:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
```

### Validação em E2E Tests

Veja `apps/backend/test/auth.e2e-spec.ts` Seção "7. Rate Limiting on Login":

- Test 1: Valida que 5 requisições são permitidas
- Test 2: Valida que a 6ª requisição retorna 429
- Test 3: Valida que headers X-RateLimit-* estão presentes

---

## 9. IP Whitelist para Admin Endpoints — Configuração Detalhada

A proteção de IP whitelist é opcional e desabilitada por padrão (allows all IPs quando não configurado).

### Configuração Padrão

```typescript
// apps/backend/src/common/ip-whitelist.guard.ts
// Guard que valida client IP contra whitelist
if (this.whitelist.length === 0) {
  return true;  // Whitelist desabilitado = todas as IPs permitidas
}
```

### Formato de Configuração

```bash
# Arquivo: .env (ou variável de ambiente)

# Nenhum IP é bloqueado (whitelist desabilitado)
# ADMIN_IP_WHITELIST=

# Apenas localhost
ADMIN_IP_WHITELIST=127.0.0.1,::1

# IP individual + range CIDR
ADMIN_IP_WHITELIST=203.0.113.50,192.168.0.0/16,2001:db8::/32

# Múltiplas redes corporativas + bastion host
ADMIN_IP_WHITELIST=203.0.113.0/24,203.0.114.0/24,203.0.112.50
```

### Formatos Suportados

- **IPv4 único**: `192.168.1.100`
- **IPv4 CIDR**: `192.168.1.0/24` (rede /24)
- **IPv6 único**: `::1`, `2001:db8::1`
- **IPv6 CIDR**: `2001:db8::/32` (rede /32)
- **Múltiplos**: separados por vírgula, espaços em branco ignorados

### Comportamento do Guard

1. **Whitelist desabilitado** (padrão):
   ```ruby
   ADMIN_IP_WHITELIST="" # ou não definido
   → Todas as IPs são permitidas (HTTP 200/201/400/403 conforme operação)
   ```

2. **Whitelist ativado**:
   ```ruby
   ADMIN_IP_WHITELIST=127.0.0.1,192.168.0.0/24
   → IPs fora da lista recebem HTTP 403 Forbidden
   → Header: access-control-allow-headers, X-Forwarded-For são respeitados
   ```

### Detecção de Client IP

O guard prioriza conforme ordem:

1. **Header X-Forwarded-For** (primário, para proxies)
   - Usado se requisição vem de load balancer/Nginx reverse proxy
   - Toma o primeiro IP da lista se múltiplos
   
2. **Request socket remoteAddress** (fallback)
   - IP direto da conexão TCP se não há proxy

Exemplo com Nginx proxy:

```nginx
# Nginx config — passa IP real para backend
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;

# Backend vê:
X-Forwarded-For: 203.0.113.100  ← IP do usuário final
```

### Endpoints Protegidos

```typescript
// Users endpoint
POST /users                  // @UseGuards(IpWhitelistGuard)
PATCH /users/:id            // @UseGuards(IpWhitelistGuard)

// Settings endpoint
POST /settings              // @UseGuards(IpWhitelistGuard)
```

### Teste Local

```bash
# 1. Habilitar whitelist apenas com localhost
echo "ADMIN_IP_WHITELIST=127.0.0.1,::1" >> apps/backend/.env

# 2. Fazer login para conseguir tokens
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@contacarros.local","password":"Admin@123"}' \
  -c cookies.txt

# 3. Tentar criar usuário do localhost (deve funcionar)
curl -X POST http://localhost:3001/users \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token_from_login_response>" \
  -d '{"email":"newuser@test.local","name":"New User","password":"Test@123"}'

# Resposta esperada: 201 (sucesso) ou erro de validação, NÃO 403

# 4. Simular requisição de IP diferente (com X-Forwarded-For)
# Se ADMIN_IP_WHITELIST não inclui essa IP, receberá 403 Forbidden
curl -X POST http://localhost:3001/users \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -H "X-Forwarded-For: 203.0.113.100" \
  -d '{"email":"test@test.local","name":"Test","password":"Test@123"}'

# Resposta esperada: 403 Forbidden (IP não está em ADMIN_IP_WHITELIST)
```

### Teste em E2E

```bash
npm run test:e2e apps/backend/test/auth.e2e-spec.ts -- --testNamePattern="IP Whitelist"
```

Veja `apps/backend/test/auth.e2e-spec.ts` seção "8. IP Whitelist for Admin Endpoints":

- Test 1: Valida que user creation funciona de localhost
- Test 2: Valida que settings update funciona de localhost
- Test 3: Valida que whitelist é desabilitado por padrão (permite todas as IPs)

### Produção — Configuração Recomendada

```bash
# .env produção — restringe admin ops apenas para rede corporativa + backup admin
ADMIN_IP_WHITELIST=203.0.113.0/24,203.0.113.50,2001:db8::/32

# Significado:
# - 203.0.113.0/24 = rede corporativa (256 IPs)
# - 203.0.113.50 = bastion host/backup admin (1 IP explícito)
# - 2001:db8::/32 = rede IPv6 corporativa
```

Isto garante que operações de admin (criar/editar usuários, alterar settings) **APENAS** são permitidas:
- De dentro da rede corporativa
- Do bastion host designado
- De IPs explicitamente adicionados

Mesmo com credenciais comprometidas, um atacante remoto não consegue executar operações de admin.

---

## 10. Contatos de Segurança

Se descobrir uma vulnerabilidade, não abra issue pública. Por favor contacte os responsáveis directamente.

---

**Última atualização**: 23 de março de 2026  
**Versão**: 1.0
