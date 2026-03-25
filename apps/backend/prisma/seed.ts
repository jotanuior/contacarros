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
    { key: 'PLACA_FIPE_FORCE_REFRESH_AFTER_DAYS', value: '0', description: 'Força nova consulta na API após X dias desde a última sincronização externa (0 desativa)' },
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
    { plate: 'TRV1A11', brand: 'TOYOTA', model: 'HILUX SRX', year: '2023', categoryType: VehicleCategoryType.CARRO, segment: 'PICKUP', subSegment: 'MEDIA', fuel: 'DIESEL' },
    { plate: 'TRV1B22', brand: 'VOLKSWAGEN', model: 'AMAROK V6', year: '2022', categoryType: VehicleCategoryType.CARRO, segment: 'PICKUP', subSegment: 'MEDIA', fuel: 'DIESEL' },
    { plate: 'TRV1C33', brand: 'FIAT', model: 'STRADA FREEDOM', year: '2024', categoryType: VehicleCategoryType.CARRO, segment: 'PICKUP', subSegment: 'LEVE', fuel: 'FLEX' },
    { plate: 'TRV1D44', brand: 'CHEVROLET', model: 'S10 LTZ', year: '2021', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: '3/4', fuel: 'DIESEL' },
    { plate: 'TRV1E55', brand: 'MERCEDES-BENZ', model: 'ATEGO 1719', year: '2020', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'TOCO', fuel: 'DIESEL' },
    { plate: 'TRV1F66', brand: 'VOLVO', model: 'FH 540', year: '2023', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'CARRETA', fuel: 'DIESEL' },
    { plate: 'TRV1G77', brand: 'SCANIA', model: 'R 500', year: '2022', categoryType: VehicleCategoryType.CAMINHAO, segment: 'CAMINHAO', subSegment: 'CARRETA', fuel: 'DIESEL' },
    { plate: 'TRV1H88', brand: 'MARCOPolo', model: 'VIAGGIO 1050', year: '2019', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'RODOVIARIO', fuel: 'DIESEL' },
    { plate: 'TRV1I99', brand: 'CAIO', model: 'APACHE VIP', year: '2021', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'URBANO', fuel: 'DIESEL' },
    { plate: 'TRV1J10', brand: 'VOLARE', model: 'W9 FLY', year: '2024', categoryType: VehicleCategoryType.ONIBUS, segment: 'ONIBUS', subSegment: 'MICRO', fuel: 'DIESEL' },
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

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const seedTag = 'SEED_DASHBOARD_DEMO';
  const demoAlreadySeeded = await prisma.trip.findFirst({
    where: {
      notes: seedTag,
      startedAt: { gte: dayStart, lte: dayEnd },
    },
    select: { id: true },
  });

  if (!demoAlreadySeeded) {
    const cameraA = await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_A1' } });
    const cameraB = await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_B1' } });
    const cameraC = await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_C1' } });
    const cameraD = await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_D1' } });

    const vehicleCar = await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'AQS0C25' } });
    const vehicleTruck = await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'HLF7090' } });
    const vehicleBus = await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'RIO4B96' } });
    const vehicleCarCanceled = await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'BRA2E19' } });

    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

    const carStartReading = await prisma.reading.create({
      data: {
        plate: vehicleCar.plate,
        normalizedPlate: vehicleCar.plate,
        vehicleId: vehicleCar.id,
        cameraId: cameraA.id,
        localId: localA.id,
        capturedAt: minutesAgo(140),
        confidence: 0.98,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const carEndReading = await prisma.reading.create({
      data: {
        plate: vehicleCar.plate,
        normalizedPlate: vehicleCar.plate,
        vehicleId: vehicleCar.id,
        cameraId: cameraB.id,
        localId: localB.id,
        capturedAt: minutesAgo(95),
        confidence: 0.99,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const truckStartReading = await prisma.reading.create({
      data: {
        plate: vehicleTruck.plate,
        normalizedPlate: vehicleTruck.plate,
        vehicleId: vehicleTruck.id,
        cameraId: cameraA.id,
        localId: localA.id,
        capturedAt: minutesAgo(110),
        confidence: 0.97,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const truckEndReading = await prisma.reading.create({
      data: {
        plate: vehicleTruck.plate,
        normalizedPlate: vehicleTruck.plate,
        vehicleId: vehicleTruck.id,
        cameraId: cameraC.id,
        localId: localC.id,
        capturedAt: minutesAgo(72),
        confidence: 0.95,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const busStartReading = await prisma.reading.create({
      data: {
        plate: vehicleBus.plate,
        normalizedPlate: vehicleBus.plate,
        vehicleId: vehicleBus.id,
        cameraId: cameraA.id,
        localId: localA.id,
        capturedAt: minutesAgo(80),
        confidence: 0.96,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const busEndReading = await prisma.reading.create({
      data: {
        plate: vehicleBus.plate,
        normalizedPlate: vehicleBus.plate,
        vehicleId: vehicleBus.id,
        cameraId: cameraD.id,
        localId: localD.id,
        capturedAt: minutesAgo(43),
        confidence: 0.94,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const canceledStartReading = await prisma.reading.create({
      data: {
        plate: vehicleCarCanceled.plate,
        normalizedPlate: vehicleCarCanceled.plate,
        vehicleId: vehicleCarCanceled.id,
        cameraId: cameraA.id,
        localId: localA.id,
        capturedAt: minutesAgo(55),
        confidence: 0.93,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const canceledEndReading = await prisma.reading.create({
      data: {
        plate: vehicleCarCanceled.plate,
        normalizedPlate: vehicleCarCanceled.plate,
        vehicleId: vehicleCarCanceled.id,
        cameraId: cameraA.id,
        localId: localA.id,
        capturedAt: minutesAgo(30),
        confidence: 0.92,
        processingStatus: 'PROCESSADO',
        rawPayload: { source: seedTag },
      },
    });

    const tripOk = await prisma.trip.create({
      data: {
        plate: vehicleCar.plate,
        vehicleId: vehicleCar.id,
        startReadingId: carStartReading.id,
        endReadingId: carEndReading.id,
        startLocalId: localA.id,
        endLocalId: localB.id,
        startedAt: carStartReading.capturedAt,
        endedAt: carEndReading.capturedAt,
        currentStatus: 'CONCLUIDO_OK',
        severity: 'BAIXA',
        closedAt: carEndReading.capturedAt,
        notes: seedTag,
      },
    });

    const tripAttention = await prisma.trip.create({
      data: {
        plate: vehicleTruck.plate,
        vehicleId: vehicleTruck.id,
        startReadingId: truckStartReading.id,
        endReadingId: truckEndReading.id,
        startLocalId: localA.id,
        endLocalId: localC.id,
        startedAt: truckStartReading.capturedAt,
        endedAt: truckEndReading.capturedAt,
        currentStatus: 'CONCLUIDO_ATENCAO',
        severity: 'MEDIA',
        closedAt: truckEndReading.capturedAt,
        notes: seedTag,
      },
    });

    const tripNoExit = await prisma.trip.create({
      data: {
        plate: vehicleBus.plate,
        vehicleId: vehicleBus.id,
        startReadingId: busStartReading.id,
        endReadingId: busEndReading.id,
        startLocalId: localA.id,
        endLocalId: localD.id,
        startedAt: busStartReading.capturedAt,
        endedAt: busEndReading.capturedAt,
        currentStatus: 'SEM_SAIDA',
        severity: 'ALTA',
        notes: seedTag,
      },
    });

    const tripCanceled = await prisma.trip.create({
      data: {
        plate: vehicleCarCanceled.plate,
        vehicleId: vehicleCarCanceled.id,
        startReadingId: canceledStartReading.id,
        endReadingId: canceledEndReading.id,
        startLocalId: localA.id,
        endLocalId: localA.id,
        startedAt: canceledStartReading.capturedAt,
        endedAt: canceledEndReading.capturedAt,
        currentStatus: 'CANCELADO',
        severity: 'BAIXA',
        closedAt: canceledEndReading.capturedAt,
        notes: seedTag,
      },
    });

    await prisma.tripEvent.createMany({
      data: [
        { tripId: tripOk.id, readingId: carStartReading.id, localId: localA.id, cameraId: cameraA.id, eventAt: carStartReading.capturedAt, sequence: 1 },
        { tripId: tripOk.id, readingId: carEndReading.id, localId: localB.id, cameraId: cameraB.id, eventAt: carEndReading.capturedAt, sequence: 2 },
        { tripId: tripAttention.id, readingId: truckStartReading.id, localId: localA.id, cameraId: cameraA.id, eventAt: truckStartReading.capturedAt, sequence: 1 },
        { tripId: tripAttention.id, readingId: truckEndReading.id, localId: localC.id, cameraId: cameraC.id, eventAt: truckEndReading.capturedAt, sequence: 2 },
        { tripId: tripNoExit.id, readingId: busStartReading.id, localId: localA.id, cameraId: cameraA.id, eventAt: busStartReading.capturedAt, sequence: 1 },
        { tripId: tripNoExit.id, readingId: busEndReading.id, localId: localD.id, cameraId: cameraD.id, eventAt: busEndReading.capturedAt, sequence: 2 },
        { tripId: tripCanceled.id, readingId: canceledStartReading.id, localId: localA.id, cameraId: cameraA.id, eventAt: canceledStartReading.capturedAt, sequence: 1 },
        { tripId: tripCanceled.id, readingId: canceledEndReading.id, localId: localA.id, cameraId: cameraA.id, eventAt: canceledEndReading.capturedAt, sequence: 2 },
      ],
    });

    await prisma.alert.create({
      data: {
        type: 'ATENCAO_ROTA',
        plate: vehicleTruck.plate,
        tripId: tripAttention.id,
        readingId: truckEndReading.id,
        severity: 'MEDIA',
        message: 'Trajeto com atenção (dados de demonstração)',
      },
    });
  }

  const traversalSeedTag = 'SEED_TRAVESSIAS_10';
  const traversalsAlreadySeeded = await prisma.trip.count({
    where: {
      notes: traversalSeedTag,
      startedAt: { gte: dayStart, lte: dayEnd },
    },
  });

  if (traversalsAlreadySeeded === 0) {
    const cameraByLocalCode: Record<'A' | 'B' | 'C' | 'D', string> = {
      A: (await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_A1' } })).id,
      B: (await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_B1' } })).id,
      C: (await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_C1' } })).id,
      D: (await prisma.camera.findUniqueOrThrow({ where: { code: 'CAM_D1' } })).id,
    };

    const localByCode: Record<'A' | 'B' | 'C' | 'D', string> = {
      A: localA.id,
      B: localB.id,
      C: localC.id,
      D: localD.id,
    };

    const traversalPlates = ['TRV1A11', 'TRV1B22', 'TRV1C33', 'TRV1D44', 'TRV1E55', 'TRV1F66', 'TRV1G77', 'TRV1H88', 'TRV1I99', 'TRV1J10'];

    const vehicles: Array<{ id: string; plate: string }> = await prisma.vehicle.findMany({
      where: { plate: { in: traversalPlates } },
      select: { id: true, plate: true },
    });
    const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.plate, vehicle]));

    const traversalPlan: Array<{ plate: string; origin: 'A'; destination: 'B' | 'C' | 'D'; startOffsetMin: number; durationMin: number; status: TripStatus; severity: SeverityLevel }> = [
      { plate: 'TRV1A11', origin: 'A', destination: 'B', startOffsetMin: 300, durationMin: 14, status: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA },
      { plate: 'TRV1B22', origin: 'A', destination: 'B', startOffsetMin: 280, durationMin: 12, status: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA },
      { plate: 'TRV1C33', origin: 'A', destination: 'B', startOffsetMin: 260, durationMin: 10, status: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA },
      { plate: 'TRV1D44', origin: 'A', destination: 'B', startOffsetMin: 240, durationMin: 18, status: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA },
      { plate: 'TRV1E55', origin: 'A', destination: 'B', startOffsetMin: 220, durationMin: 16, status: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA },
      { plate: 'TRV1F66', origin: 'A', destination: 'B', startOffsetMin: 200, durationMin: 15, status: TripStatus.CONCLUIDO_OK, severity: SeverityLevel.BAIXA },
      { plate: 'TRV1G77', origin: 'A', destination: 'C', startOffsetMin: 180, durationMin: 22, status: TripStatus.CONCLUIDO_ATENCAO, severity: SeverityLevel.MEDIA },
      { plate: 'TRV1H88', origin: 'A', destination: 'C', startOffsetMin: 160, durationMin: 20, status: TripStatus.CONCLUIDO_ATENCAO, severity: SeverityLevel.MEDIA },
      { plate: 'TRV1I99', origin: 'A', destination: 'D', startOffsetMin: 140, durationMin: 24, status: TripStatus.CONCLUIDO_ATENCAO, severity: SeverityLevel.MEDIA },
      { plate: 'TRV1J10', origin: 'A', destination: 'D', startOffsetMin: 120, durationMin: 26, status: TripStatus.CONCLUIDO_ATENCAO, severity: SeverityLevel.MEDIA },
    ];

    for (let index = 0; index < traversalPlan.length; index += 1) {
      const traversal = traversalPlan[index];
      const vehicle = vehicleMap.get(traversal.plate);
      if (!vehicle) {
        continue;
      }

      const startedAt = new Date(now.getTime() - traversal.startOffsetMin * 60 * 1000);
      const endedAt = new Date(startedAt.getTime() + traversal.durationMin * 60 * 1000);

      const startReading = await prisma.reading.create({
        data: {
          plate: traversal.plate,
          normalizedPlate: traversal.plate,
          vehicleId: vehicle.id,
          cameraId: cameraByLocalCode[traversal.origin],
          localId: localByCode[traversal.origin],
          capturedAt: startedAt,
          confidence: 0.9,
          processingStatus: 'PROCESSADO',
          rawPayload: { source: traversalSeedTag, step: 'start', order: index + 1 },
        },
      });

      const endReading = await prisma.reading.create({
        data: {
          plate: traversal.plate,
          normalizedPlate: traversal.plate,
          vehicleId: vehicle.id,
          cameraId: cameraByLocalCode[traversal.destination],
          localId: localByCode[traversal.destination],
          capturedAt: endedAt,
          confidence: 0.92,
          processingStatus: 'PROCESSADO',
          rawPayload: { source: traversalSeedTag, step: 'end', order: index + 1 },
        },
      });

      const trip = await prisma.trip.create({
        data: {
          plate: traversal.plate,
          vehicleId: vehicle.id,
          startReadingId: startReading.id,
          endReadingId: endReading.id,
          startLocalId: localByCode[traversal.origin],
          endLocalId: localByCode[traversal.destination],
          startedAt,
          endedAt,
          currentStatus: traversal.status,
          severity: traversal.severity,
          closedAt: endedAt,
          notes: traversalSeedTag,
        },
      });

      await prisma.tripEvent.createMany({
        data: [
          {
            tripId: trip.id,
            readingId: startReading.id,
            localId: localByCode[traversal.origin],
            cameraId: cameraByLocalCode[traversal.origin],
            eventAt: startedAt,
            sequence: 1,
          },
          {
            tripId: trip.id,
            readingId: endReading.id,
            localId: localByCode[traversal.destination],
            cameraId: cameraByLocalCode[traversal.destination],
            eventAt: endedAt,
            sequence: 2,
          },
        ],
      });
    }
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
