import { BadRequestException, Injectable } from '@nestjs/common';
import { LprReadingDto } from './dto';

@Injectable()
export class IntelbrasAdapterService {
  extractCameraRef(payload: unknown): string | undefined {
    const body = this.asObject(payload);

    const direct = [
      this.getString(this.getByPath(body, ['cameraCode'])),
      this.getString(this.getByPath(body, ['cameraId'])),
      this.getString(this.getByPath(body, ['deviceId'])),
      this.getString(this.getByPath(body, ['DeviceID'])),
      this.getString(this.getByPath(body, ['Picture', 'SnapInfo', 'DeviceID'])),
      this.getString(this.getByPath(body, ['Picture', 'SnapInfo', 'deviceId'])),
      this.getString(this.getByPath(body, ['serialNo'])),
      this.getString(this.getByPath(body, ['SerialNo'])),
      this.pickFlatValue(body, ['cameraCode', 'CameraCode', 'cameraId', 'CameraID', 'deviceId', 'DeviceID', 'serialNo', 'SerialNo']),
      this.findValueRecursive(body, (key, value) => {
        if (!/(^deviceid$|^device_id$|^deviceid$|^serialno$)/i.test(key)) {
          return undefined;
        }

        return this.getString(value);
      }),
    ].filter((value): value is string => Boolean(value));

    return direct[0];
  }

  toReadingDto(payload: unknown, cameraCode: string): LprReadingDto {
    const rawPayload = this.asObject(payload);
    const plate = this.extractPlate(rawPayload);

    if (!plate) {
      throw new BadRequestException('Payload Intelbras sem placa reconhecível');
    }

    const capturedAt = this.extractCapturedAt(rawPayload);
    const confidence = this.extractConfidence(rawPayload);
    const imageUrl = this.extractImageUrl(rawPayload);
    const eventKey = this.extractEventKey(rawPayload);

    return {
      plate,
      cameraCode,
      capturedAt,
      confidence,
      imageUrl,
      eventKey,
      rawPayload,
    };
  }

  private extractEventKey(payload: Record<string, unknown>): string | undefined {
    const deviceId = this.extractCameraRef(payload);
    const defenceCode = this.getString(this.getByPath(payload, ['Picture', 'SnapInfo', 'DefenceCode']));
    const uploadNum = this.getByPath(payload, ['Picture', 'Plate', 'UploadNum']);
    const snapTime = this.getString(this.getByPath(payload, ['Picture', 'SnapInfo', 'SnapTime']));
    const plate = this.extractPlate(payload);

    if (!deviceId) {
      return undefined;
    }

    if (defenceCode) {
      return `intelbras:${deviceId}:defence:${defenceCode}`;
    }

    if (uploadNum !== undefined && uploadNum !== null) {
      return `intelbras:${deviceId}:upload:${String(uploadNum)}`;
    }

    if (snapTime && plate) {
      return `intelbras:${deviceId}:snap:${snapTime}:plate:${plate.toUpperCase()}`;
    }

    return undefined;
  }

  private extractPlate(payload: Record<string, unknown>): string | undefined {
    const direct = [
      this.getString(this.getByPath(payload, ['TrafficCar', 'PlateNumber'])),
      this.getString(this.getByPath(payload, ['Picture', 'Plate', 'PlateNumber'])),
      this.getString(this.getByPath(payload, ['Events', 0, 'TrafficCar', 'PlateNumber'])),
      this.getString(this.getByPath(payload, ['Object', 'TrafficCar', 'PlateNumber'])),
      this.getString(this.getByPath(payload, ['PlateNumber'])),
      this.pickFlatValue(payload, [
        'TrafficCar.PlateNumber',
        'Picture.Plate.PlateNumber',
        'Events[0].TrafficCar.PlateNumber',
        'Events[0].TrafficCar.PlateNo',
        'PlateNumber',
        'plateNumber',
        'PlateNo',
      ]),
      this.findValueRecursive(payload, (key, value) => {
        if (!/(^plate$|plate(number|no)?$)/i.test(key)) {
          return undefined;
        }

        return this.getString(value);
      }),
    ].filter((value): value is string => Boolean(value));

    return direct[0];
  }

  private extractCapturedAt(payload: Record<string, unknown>): string {
    const candidate = [
      this.getByPath(payload, ['UTC']),
      this.getByPath(payload, ['CreateTime']),
      this.getByPath(payload, ['TimeStamp']),
      this.getByPath(payload, ['Timestamp']),
      this.getByPath(payload, ['Picture', 'SnapInfo', 'AccurateTime']),
      this.getByPath(payload, ['Picture', 'SnapInfo', 'SnapTime']),
      this.getByPath(payload, ['Events', 0, 'UTC']),
      this.getByPath(payload, ['TrafficCar', 'Time']),
      this.pickFlatValue(payload, ['UTC', 'CreateTime', 'TimeStamp', 'Timestamp', 'Picture.SnapInfo.AccurateTime', 'Picture.SnapInfo.SnapTime']),
    ].find((value) => value !== undefined && value !== null);

    return this.toIsoString(candidate);
  }

  private extractConfidence(payload: Record<string, unknown>): number | undefined {
    const raw = [
      this.getByPath(payload, ['TrafficCar', 'Confidence']),
      this.getByPath(payload, ['Picture', 'Plate', 'Confidence']),
      this.getByPath(payload, ['Events', 0, 'TrafficCar', 'Confidence']),
      this.getByPath(payload, ['confidence']),
      this.getByPath(payload, ['Confidence']),
      this.pickFlatValue(payload, ['TrafficCar.Confidence', 'Picture.Plate.Confidence', 'Events[0].TrafficCar.Confidence', 'confidence', 'Confidence']),
    ].find((value) => value !== undefined && value !== null);

    if (raw === undefined || raw === null) {
      return undefined;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    if (parsed >= 0 && parsed <= 1) {
      return parsed;
    }

    if (parsed > 1 && parsed <= 100) {
      return Number((parsed / 100).toFixed(4));
    }

    return undefined;
  }

  private extractImageUrl(payload: Record<string, unknown>): string | undefined {
    return [
      this.getString(this.getByPath(payload, ['imageUrl'])),
      this.getString(this.getByPath(payload, ['ImageUrl'])),
      this.getString(this.getByPath(payload, ['Picture', 'URL'])),
      this.getString(this.getByPath(payload, ['Picture', 'Url'])),
      this.pickFlatValue(payload, ['imageUrl', 'ImageUrl', 'Picture.URL', 'Picture.Url']),
    ].find((value): value is string => Boolean(value));
  }

  private asObject(payload: unknown): Record<string, unknown> {
    if (!payload) {
      return {};
    }

    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed) {
        return {};
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return { raw: trimmed };
      }

      return { raw: trimmed };
    }

    if (Array.isArray(payload)) {
      return { items: payload };
    }

    if (typeof payload === 'object') {
      return payload as Record<string, unknown>;
    }

    return { value: payload };
  }

  private getByPath(source: unknown, path: Array<string | number>): unknown {
    let current: unknown = source;

    for (const segment of path) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof segment === 'number') {
        if (!Array.isArray(current)) {
          return undefined;
        }

        current = current[segment];
        continue;
      }

      if (typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private pickFlatValue(source: Record<string, unknown>, keys: string[]): string | undefined {
    const entries = Object.entries(source);

    for (const key of keys) {
      const exact = source[key];
      const direct = this.getString(exact);
      if (direct) {
        return direct;
      }

      const match = entries.find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
      if (match) {
        const value = this.getString(match[1]);
        if (value) {
          return value;
        }
      }
    }

    return undefined;
  }

  private findValueRecursive(
    source: unknown,
    matcher: (key: string, value: unknown) => string | undefined,
  ): string | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }

    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const matched = matcher(key, value);
      if (matched) {
        return matched;
      }

      if (value && typeof value === 'object') {
        const nested = this.findValueRecursive(value, matcher);
        if (nested) {
          return nested;
        }
      }
    }

    return undefined;
  }

  private getString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private toIsoString(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const epoch = value > 9999999999 ? value : value * 1000;
      return new Date(epoch).toISOString();
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        const utcLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
        const candidate = utcLike.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed;
        const parsed = new Date(candidate);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }

    return new Date().toISOString();
  }
}
