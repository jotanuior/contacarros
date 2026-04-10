import { IntelbrasAdapterService } from './intelbras-adapter.service';

describe('IntelbrasAdapterService', () => {
  let service: IntelbrasAdapterService;

  beforeEach(() => {
    service = new IntelbrasAdapterService();
  });

  it('maps a TrafficCar payload into the ContaCarros reading DTO', () => {
    const dto = service.toReadingDto(
      {
        TrafficCar: {
          PlateNumber: 'abc1d23',
          Confidence: 98,
        },
        UTC: '2026-04-10 15:22:31',
        Picture: {
          URL: 'http://camera/snap.jpg',
        },
      },
      'VIP5460_PORTAO_01',
    );

    expect(dto).toMatchObject({
      plate: 'abc1d23',
      cameraCode: 'VIP5460_PORTAO_01',
      confidence: 0.98,
      imageUrl: 'http://camera/snap.jpg',
    });
    expect(dto.capturedAt).toBe('2026-04-10T15:22:31.000Z');
  });

  it('extracts plate and camera reference from flat Intelbras keys', () => {
    const payload = {
      'Events[0].TrafficCar.PlateNumber': 'QWE1234',
      DeviceID: 'c0fab63c-b361-79d4-3b99-ct',
      CreateTime: '2026-04-10T18:00:00Z',
    };

    expect(service.extractCameraRef(payload)).toBe('c0fab63c-b361-79d4-3b99-ct');

    const dto = service.toReadingDto(payload, 'CAM_EXT_01');
    expect(dto.plate).toBe('QWE1234');
    expect(dto.capturedAt).toBe('2026-04-10T18:00:00.000Z');
  });
});
