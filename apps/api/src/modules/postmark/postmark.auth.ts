import { timingSafeEqual } from 'node:crypto';

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
