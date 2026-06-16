import { timingSafeEqual } from 'node:crypto';

export type PostmarkWebhookSourceIpSource =
  | 'request-ip'
  | 'x-forwarded-for'
  | 'x-real-ip'
  | 'socket-remote-address'
  | 'none';

export type PostmarkWebhookSourceIpResolution = {
  sourceIp: string | null;
  sourceIpSource: PostmarkWebhookSourceIpSource;
  proxyContext: boolean;
  proxyHeadersTrusted: boolean;
  xForwardedForFirstPublicHop: string | null;
};

export function verifyBasicAuthHeader(input: {
  authorizationHeader: string | undefined;
  expectedCredential: string | undefined;
  previousCredential?: string | undefined;
}): 'current' | 'previous' | null {
  if (!input.authorizationHeader || !input.expectedCredential) {
    return null;
  }

  const [scheme, encoded] = input.authorizationHeader.split(' ');
  if (!scheme || !encoded || scheme.toLowerCase() !== 'basic') {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return null;
  }

  const actual = Buffer.from(decoded);
  const candidates: Array<{ kind: 'current' | 'previous'; value: string | undefined }> = [
    { kind: 'current', value: input.expectedCredential },
    { kind: 'previous', value: input.previousCredential }
  ];

  for (const candidate of candidates) {
    if (!candidate.value) {
      continue;
    }
    const expected = Buffer.from(candidate.value);
    if (expected.length !== actual.length) {
      continue;
    }

    if (timingSafeEqual(expected, actual)) {
      return candidate.kind;
    }
  }

  return null;
}

export function resolvePostmarkWebhookSourceIp(input: {
  requestIp: string | null;
  socketRemoteAddress?: string | null;
  xForwardedFor?: string | null;
  xRealIp?: string | null;
  trustProxyHeaders?: boolean;
}): PostmarkWebhookSourceIpResolution {
  const requestIp = normalizeIp(input.requestIp);
  const socketRemoteAddress = normalizeIp(input.socketRemoteAddress);
  const xForwardedForFirstPublicHop = firstPublicForwardedIp(input.xForwardedFor);
  const xRealIp = normalizeIp(input.xRealIp);
  const proxyContext = isProxyContextIp(requestIp) || isProxyContextIp(socketRemoteAddress);
  const proxyHeadersTrusted = input.trustProxyHeaders === true && proxyContext;

  if (proxyHeadersTrusted) {
    if (xForwardedForFirstPublicHop) {
      return {
        sourceIp: xForwardedForFirstPublicHop,
        sourceIpSource: 'x-forwarded-for',
        proxyContext,
        proxyHeadersTrusted,
        xForwardedForFirstPublicHop
      };
    }

    if (xRealIp && isPublicIp(xRealIp)) {
      return {
        sourceIp: xRealIp,
        sourceIpSource: 'x-real-ip',
        proxyContext,
        proxyHeadersTrusted,
        xForwardedForFirstPublicHop
      };
    }
  }

  if (requestIp) {
    return {
      sourceIp: requestIp,
      sourceIpSource: 'request-ip',
      proxyContext,
      proxyHeadersTrusted,
      xForwardedForFirstPublicHop
    };
  }

  if (socketRemoteAddress) {
    return {
      sourceIp: socketRemoteAddress,
      sourceIpSource: 'socket-remote-address',
      proxyContext,
      proxyHeadersTrusted,
      xForwardedForFirstPublicHop
    };
  }

  return {
    sourceIp: null,
    sourceIpSource: 'none',
    proxyContext,
    proxyHeadersTrusted,
    xForwardedForFirstPublicHop
  };
}

export function isIpAllowed(input: { sourceIp: string | null; allowlistCsv: string | undefined }): boolean {
  const allowlist = (input.allowlistCsv ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (allowlist.length === 0) {
    return true;
  }

  if (!input.sourceIp) {
    return false;
  }

  return allowlist.includes(input.sourceIp);
}

function firstPublicForwardedIp(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }

  for (const candidate of header.split(',')) {
    const normalized = normalizeIp(candidate);
    if (normalized && isPublicIp(normalized)) {
      return normalized;
    }
  }

  return null;
}

function normalizeIp(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value) {
    return null;
  }

  const withoutZone = value.includes('%') ? value.split('%')[0] : value;
  const ipv4Mapped = withoutZone.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (ipv4Mapped?.[1]) {
    return ipv4Mapped[1];
  }

  return withoutZone;
}

function isProxyContextIp(input: string | null): boolean {
  if (!input) {
    return false;
  }

  if (isPrivateOrReservedIpv4(input)) {
    return true;
  }

  const lower = input.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
}

function isPublicIp(input: string): boolean {
  return !isProxyContextIp(input);
}

function isPrivateOrReservedIpv4(input: string): boolean {
  const parts = input.split('.');
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0 || a === 255) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  if (a === 198 && b >= 18 && b <= 19) {
    return true;
  }

  return false;
}
