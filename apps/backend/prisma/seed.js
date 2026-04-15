"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    const roles = [client_1.RoleName.ADMIN, client_1.RoleName.OPERADOR, client_1.RoleName.AUDITOR, client_1.RoleName.VISUALIZADOR];
    for (const roleName of roles) {
        await prisma.role.upsert({
            where: { name: roleName },
            update: {},
            create: { name: roleName },
        });
    }
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: client_1.RoleName.ADMIN } });
    const passwordHash = await bcrypt.hash('Admin@123', 10);
    await prisma.user.upsert({
        where: { email: 'admin@contacarros.local' },
        update: { passwordHash, roleId: adminRole.id, isActive: true, name: 'Administrador' },
        create: {
            name: 'Administrador',
            email: 'admin@contacarros.local',
            passwordHash,
            roleId: adminRole.id,
            isActive: true,
        },
    });
    const locations = [
        { code: 'A', name: 'Local A' },
        { code: 'B', name: 'Local B' },
        { code: 'C', name: 'Local C' },
        { code: 'D', name: 'Local D' },
    ];
    for (const location of locations) {
        await prisma.location.upsert({
            where: { code: location.code },
            update: { name: location.name, active: true },
            create: { ...location, active: true },
        });
    }
    const localA = await prisma.location.findUniqueOrThrow({ where: { code: 'A' } });
    const localB = await prisma.location.findUniqueOrThrow({ where: { code: 'B' } });
    const localC = await prisma.location.findUniqueOrThrow({ where: { code: 'C' } });
    const localD = await prisma.location.findUniqueOrThrow({ where: { code: 'D' } });
    const cameras = [
        { code: 'CAM_A1', name: 'Câmera A1', locationId: localA.id },
        { code: 'CAM_B1', name: 'Câmera B1', locationId: localB.id },
        { code: 'CAM_C1', name: 'Câmera C1', locationId: localC.id },
        { code: 'CAM_D1', name: 'Câmera D1', locationId: localD.id },
    ];
    for (const camera of cameras) {
        await prisma.camera.upsert({
            where: { code: camera.code },
            update: camera,
            create: camera,
        });
    }
    const rules = [
        { originLocalId: localA.id, destinationLocalId: localB.id, resultType: client_1.TripStatus.CONCLUIDO_OK, severity: client_1.SeverityLevel.BAIXA, description: 'A para B OK' },
        { originLocalId: localA.id, destinationLocalId: localC.id, resultType: client_1.TripStatus.CONCLUIDO_ATENCAO, severity: client_1.SeverityLevel.MEDIA, description: 'A para C Atenção' },
        { originLocalId: localA.id, destinationLocalId: localD.id, resultType: client_1.TripStatus.CONCLUIDO_ATENCAO, severity: client_1.SeverityLevel.MEDIA, description: 'A para D Atenção' },
        { originLocalId: localA.id, destinationLocalId: localA.id, resultType: client_1.TripStatus.CANCELADO, severity: client_1.SeverityLevel.BAIXA, description: 'A para A Cancelado' },
    ];
    for (const rule of rules) {
        await prisma.routeRule.upsert({
            where: {
                originLocalId_destinationLocalId: {
                    originLocalId: rule.originLocalId,
                    destinationLocalId: rule.destinationLocalId,
                },
            },
            update: rule,
            create: rule,
        });
    }
    const settings = [
        { key: 'TRIP_WINDOW_MINUTES', value: '30', description: 'Janela máxima para conclusão de trajeto' },
        { key: 'RETURN_SAME_LOCAL_CANCEL_MINUTES', value: '30', description: 'Minutos para considerar cancelado quando retorna ao mesmo ponto de origem' },
        { key: 'TRIPS_ENFORCE_ROUTE_RULES', value: 'true', description: 'Quando true, o fechamento do trajeto depende das regras de rota' },
        { key: 'DEDUP_MINUTES', value: '2', description: 'Janela de deduplicação de leitura' },
        { key: 'MIN_CONFIDENCE', value: '0.8', description: 'Confiança mínima para alerta' },
        { key: 'PLACA_FIPE_CACHE_MINUTES', value: '1440', description: 'Tempo de cache da integração externa' },
        { key: 'PLACA_FIPE_ENABLED', value: 'true', description: 'Habilita integração externa' },
        { key: 'TRUCK_SUBTYPES', value: 'Caminhão pequeno,Caminhão 3/4,Caminhão toco,Caminhão truck,Carreta,Bitrem,Rodotrem,Caminhão grande', description: 'Subtipos de caminhão' },
        { key: 'BUS_SUBTYPES', value: 'Micro-ônibus,Ônibus urbano,Ônibus rodoviário,Ônibus fretado', description: 'Subtipos de ônibus' },
        { key: 'GRATUIDADE_TYPES', value: 'PCD,Carro Oficial,NGISUL', description: 'Tipos de gratuidade (separados por vírgula)' },
    ];
    for (const setting of settings) {
        await prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: setting,
            create: setting,
        });
    }
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=seed.js.map