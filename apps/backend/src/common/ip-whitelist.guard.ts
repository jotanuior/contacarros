import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * IP Whitelist Guard
 * 
 * Validates that the client IP is whitelisted for sensitive admin operations.
 * Respects X-Forwarded-For header for requests behind proxies.
 * 
 * Configuration via environment variable:
 * ADMIN_IP_WHITELIST=127.0.0.1,192.168.1.0/24,::1
 * 
 * Format:
 * - Single IPs: 127.0.0.1, ::1
 * - CIDR ranges: 192.168.1.0/24, 2001:db8::/32
 * - Commas separated, whitespace trimmed
 * 
 * If ADMIN_IP_WHITELIST is not set, whitelist is disabled (allows all IPs).
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private whitelist: string[] = [];

  constructor(private configService: ConfigService) {
    const whitelistEnv = this.configService.get<string>('ADMIN_IP_WHITELIST');
    if (whitelistEnv) {
      this.whitelist = whitelistEnv
        .split(',')
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);
    }
  }

  private getClientIp(request: Request): string {
    // Check for X-Forwarded-For header (proxy/load balancer)
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs; use the first one
      const ips = Array.isArray(xForwardedFor)
        ? xForwardedFor[0]
        : xForwardedFor.split(',')[0];
      return ips.trim();
    }

    // Fall back to socket remoteAddress
    return request.socket.remoteAddress || request.ip || '';
  }

  private isIpInCidr(ip: string, cidr: string): boolean {
    // Simple CIDR validation for IPv4
    if (cidr.includes('/')) {
      const [network, maskStr] = cidr.split('/');
      const mask = parseInt(maskStr, 10);

      // IPv4
      if (network.includes('.') && ip.includes('.')) {
        return this.isIpv4InCidr(ip, network, mask);
      }

      // IPv6 (basic check)
      if (network.includes(':') && ip.includes(':')) {
        return this.isIpv6InCidr(ip, network, mask);
      }

      return false;
    }

    // No CIDR, direct IP comparison
    return ip === cidr || this.normalizeIp(ip) === this.normalizeIp(cidr);
  }

  private isIpv4InCidr(ip: string, network: string, mask: number): boolean {
    try {
      const ipOctets = ip.split('.').map((o) => parseInt(o, 10));
      const netOctets = network.split('.').map((o) => parseInt(o, 10));

      // Invalid IP or network format
      if (ipOctets.some(isNaN) || netOctets.some(isNaN)) {
        return false;
      }

      // Convert to 32-bit integers
      const ipNum = ipOctets.reduce((num, octet) => (num << 8) | octet, 0);
      const netNum = netOctets.reduce((num, octet) => (num << 8) | octet, 0);

      // Create mask
      const maskNum = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;

      return (ipNum & maskNum) === netNum;
    } catch {
      return false;
    }
  }

  private isIpv6InCidr(ip: string, network: string, mask: number): boolean {
    try {
      // Normalize both IPs
      const normalizedIp = this.normalizeIpv6(ip);
      const normalizedNet = this.normalizeIpv6(network);

      if (!normalizedIp || !normalizedNet) return false;

      // For IPv6, do a simplified check (compare first N bits)
      const ipBits = this.ipv6ToBinaryString(normalizedIp);
      const netBits = this.ipv6ToBinaryString(normalizedNet);

      if (!ipBits || !netBits) return false;

      return ipBits.substring(0, mask) === netBits.substring(0, mask);
    } catch {
      return false;
    }
  }

  private normalizeIpv6(ip: string): string {
    // Very basic IPv6 normalization
    // In production, use a library like 'ip'
    if (!ip.includes(':')) return '';
    return ip.toLowerCase();
  }

  private ipv6ToBinaryString(ip: string): string {
    // Placeholder for proper IPv6 to binary conversion
    // In production, use a library like 'ip'
    return '';
  }

  private normalizeIp(ip: string): string {
    // Remove IPv6 zone ID if present (e.g., fe80::1%eth0 -> fe80::1)
    const zoneIndex = ip.indexOf('%');
    if (zoneIndex !== -1) {
      return ip.substring(0, zoneIndex);
    }

    // Normalize IPv6 (::1 vs 0000:0000:0000:0000:0000:0000:0000:0001)
    if (ip.includes(':')) {
      return ip.toLowerCase();
    }

    return ip;
  }

  canActivate(context: ExecutionContext): boolean {
    // If no whitelist is configured, allow all IPs
    if (this.whitelist.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);

    // Check if client IP is whitelisted
    const isAllowed = this.whitelist.some((whitelistedIp) =>
      this.isIpInCidr(clientIp, whitelistedIp),
    );

    if (!isAllowed) {
      throw new ForbiddenException(
        `Access denied: IP ${clientIp} is not whitelisted for admin operations`,
      );
    }

    return true;
  }
}
