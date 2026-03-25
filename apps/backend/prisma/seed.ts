import { PrismaClient, RoleName, SeverityLevel, TripStatus, VehicleCategoryType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const roles: RoleName[] = [RoleName.ADMIN, RoleName.OPERADOR, RoleName.AUDITOR, RoleName.VISUALIZADOR];

  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });

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

  const rules: Array<{
    originLocalId: string;
    destinationLocalId: string;
    resultType: TripStatus;
    severity: SeverityLevel;
    description: string;
  }> = [
    { originLocalId: localA.id, destinationLocalId: localB.id, resultType: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA, description: 'A para B OK' },
    { originLocalId: localA.id, destinationLocalId: localC.id, resultType: TripStatus.CONCLUIDO_ATENCAO, severity: SeverityLevel.MEDIA, description: 'A para C Atenção' },
    { originLocalId: localA.id, destinationLocalId: localD.id, resultType: TripStatus.CONCLUIDO_ATENCAO, severity: SeverityLevel.MEDIA, description: 'A para D Atenção' },
    { originLocalId: localA.id, destinationLocalId: localA.id, resultType: TripStatus.CANCELADO, severity: SeverityLevel.BAIXA, description: 'A para A Cancelado' },
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
    { key: 'DEDUP_MINUTES', value: '2', description: 'Janela de deduplicação de leitura' },
    { key: 'MIN_CONFIDENCE', value: '0.8', description: 'Confiança mínima para alerta' },
    { key: 'HEAVY_TRIPS_REQUIRE_VALIDATION', value: 'true', description: 'Caminhão/ônibus só contam como viagem após validação' },
    { key: 'PLACA_FIPE_CACHE_MINUTES', value: '1440', description: 'Tempo de cache da integração externa' },
    { key: 'PLACA_FIPE_ENABLED', value: 'true', description: 'Habilita integração externa' },
    { key: 'PLACA_FIPE_FETCH_ONLY_UNKNOWN', value: 'true', description: 'Consulta API externa apenas para placas sem dados locais' },
    { key: 'TRUCK_SUBTYPES', value: 'Caminhão pequeno,Caminhão 3/4,Caminhão toco,Caminhão truck,Carreta,Bitrem,Rodotrem,Caminhão grande', description: 'Subtipos de caminhão' },
    { key: 'BUS_SUBTYPES', value: 'Micro-ônibus,Ônibus urbano,Ônibus rodoviário,Ônibus fretado', description: 'Subtipos de ônibus' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting,
    });
  }

  const seededVehicles: Array<{
    plate: string;
    brand: string;
    model: string;
    year: string;
    categoryType: VehicleCategoryType;
    segment: string;
    subSegment: string;
    fuel: string;
  }> = [
    { plate: 'AQS0C25', brand: 'FIAT', model: 'TORO VOLCANO AT D4', year: '2022', categoryType: VehicleCategoryType.CARRO, segment: 'PICKUP', subSegment: 'PICKUP MEDIA', fuel: 'DIESEL' },
    { plate: 'HLF7090', brand: 'MERCEDES-BENZ', model: 'L 1318', year: '2011', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'TOCO', fuel: 'DIESEL' },
    { plate: 'RIO4B96', brand: 'MERCEDES-BENZ', model: 'INDUSCAR APACHE U', year: '2020', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'URBANO', fuel: 'DIESEL' },
    { plate: 'BRA2E19', brand: 'VOLKSWAGEN', model: 'VOYAGE 1.6', year: '2021', categoryType: VehicleCategoryType.CARRO, segment: 'SEDAN', subSegment: 'COMPACTO', fuel: 'FLEX' },
    { plate: 'JLK8A44', brand: 'CHEVROLET', model: 'ONIX LT', year: '2023', categoryType: VehicleCategoryType.CARRO, segment: 'HATCH', subSegment: 'COMPACTO', fuel: 'FLEX' },
    { plate: 'MNP3D11', brand: 'HYUNDAI', model: 'HB20 COMFORT', year: '2022', categoryType: VehicleCategoryType.CARRO, segment: 'HATCH', subSegment: 'COMPACTO', fuel: 'FLEX' },
    { plate: 'QWE5F67', brand: 'TOYOTA', model: 'COROLLA XEI', year: '2021', categoryType: VehicleCategoryType.CARRO, segment: 'SEDAN', subSegment: 'MEDIO', fuel: 'FLEX' },
    { plate: 'RTY9G20', brand: 'HONDA', model: 'CIVIC EXL', year: '2020', categoryType: VehicleCategoryType.CARRO, segment: 'SEDAN', subSegment: 'MEDIO', fuel: 'FLEX' },
    { plate: 'UIO1H32', brand: 'RENAULT', model: 'DUSTER OROCH', year: '2022', categoryType: VehicleCategoryType.CARRO, segment: 'PICKUP', subSegment: 'LEVE', fuel: 'FLEX' },
    { plate: 'PAS7J45', brand: 'NISSAN', model: 'KICKS S', year: '2023', categoryType: VehicleCategoryType.CARRO, segment: 'SUV', subSegment: 'COMPACTO', fuel: 'FLEX' },
    { plate: 'LKJ4K88', brand: 'FORD', model: 'RANGER XLS', year: '2021', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: '3/4', fuel: 'DIESEL' },
    { plate: 'HGF6L23', brand: 'VOLVO', model: 'VM 270', year: '2019', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'TRUCK', fuel: 'DIESEL' },
    { plate: 'DSA2M14', brand: 'SCANIA', model: 'R 450', year: '2020', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'CARRETA', fuel: 'DIESEL' },
    { plate: 'FGH3N56', brand: 'IVECO', model: 'TECTOR 240E30', year: '2022', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'TRUCK', fuel: 'DIESEL' },
    { plate: 'ZXC8P77', brand: 'MERCEDES-BENZ', model: 'ATEGO 2430', year: '2021', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'TRUCK', fuel: 'DIESEL' },
    { plate: 'BNM5Q10', brand: 'VOLKSWAGEN', model: 'METEOR 29.520', year: '2023', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'CARRETA', fuel: 'DIESEL' },
    { plate: 'QAZ6R21', brand: 'MARCOPolo', model: 'TORINO', year: '2018', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'URBANO', fuel: 'DIESEL' },
    { plate: 'WSX7S65', brand: 'CAIO', model: 'MILLENNIUM', year: '2019', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'URBANO', fuel: 'DIESEL' },
    { plate: 'EDC4T39', brand: 'COMIL', model: 'CAMPIONE', year: '2020', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'RODOVIARIO', fuel: 'DIESEL' },
    { plate: 'RFV9U42', brand: 'VOLARE', model: 'ATTACK 9', year: '2022', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'MICRO', fuel: 'DIESEL' },
  ];

  for (const vehicle of seededVehicles) {
    await prisma.vehicle.upsert({
      where: { plate: vehicle.plate },
      update: {
        ...vehicle,
        lastApiSyncAt: new Date(),
        apiRawData: {
          informacoes_veiculo: {
            marca: vehicle.brand,
            modelo: vehicle.model,
            ano_modelo: Number(vehicle.year),
            segmento: vehicle.segment,
            sub_segmento: vehicle.subSegment,
            combustivel: vehicle.fuel,
          },
        },
      },
      create: {
        ...vehicle,
        lastApiSyncAt: new Date(),
        apiRawData: {
          informacoes_veiculo: {
            marca: vehicle.brand,
            modelo: vehicle.model,
            ano_modelo: Number(vehicle.year),
            segmento: vehicle.segment,
            sub_segmento: vehicle.subSegment,
            combustivel: vehicle.fuel,
          },
        },
      },
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
