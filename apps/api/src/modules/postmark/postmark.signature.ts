import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyPostmarkSignature(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string | undefined;
}): boolean {
  if (!input.signatureHeader || !input.secret || !input.rawBody) {
    return false;
  }

  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest('base64');
  const actual = input.signatureHeader;

  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (expectedBytes.length !== actualBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, actualBytes);
}
