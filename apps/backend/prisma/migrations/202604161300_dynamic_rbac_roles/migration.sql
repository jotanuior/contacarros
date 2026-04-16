-- Dynamic RBAC: roles are now editable and permission-based per screen/action.

-- 1) Role name no longer depends on enum values.
ALTER TABLE "Role" ALTER COLUMN "name" TYPE TEXT USING "name"::text;

-- 2) New role metadata.
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- 3) Create permission screen enum.
DO $$
BEGIN
  CREATE TYPE "PermissionScreen" AS ENUM (
    'DASHBOARD',
    'LEITURAS',
    'TRAJETOS',
    'ALERTAS',
    'PESADOS',
    'LOCAIS',
    'CAMERAS',
    'REGRAS_ROTA',
    'USUARIOS',
    'PERFIS',
    'AUDITORIA',
    'RELATORIOS',
    'VEICULOS',
    'CONFIGURACOES',
    'SIMULADOR_WEBHOOK'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4) Create role permissions table.
CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "screen" "PermissionScreen" NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT true,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "canDeactivate" BOOLEAN NOT NULL DEFAULT false,
  "canExport" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_screen_key" ON "RolePermission"("roleId", "screen");

-- 5) Backfill admin as system role. Other defaults are handled by seed.
UPDATE "Role" SET "isSystem" = true WHERE UPPER("name") IN ('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR');
