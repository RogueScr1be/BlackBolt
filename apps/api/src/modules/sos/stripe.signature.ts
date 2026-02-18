import { createHmac, timingSafeEqual } from 'node:crypto';

function parseStripeSignatureHeader(signatureHeader: string): { timestamp: string; signatures: string[] } | null {
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter((value) => value.length > 0);

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

export function verifyStripeSignature(input: {
  rawBody: Buffer;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
}): boolean {
  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  if (!parsed) {
    return false;
  }

  const toleranceSeconds = input.toleranceSeconds ?? 300;
  const timestampNumber = Number.parseInt(parsed.timestamp, 10);
  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${input.rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', input.secret).update(signedPayload).digest('hex');

  return parsed.signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}
