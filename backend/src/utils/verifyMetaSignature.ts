import crypto from 'node:crypto';

export function verifyMetaSignature(
  appSecret: string,
  signatureHeader: string | undefined,
  rawBody: Buffer | undefined,
): boolean {
  if (!appSecret) return true; // Allow local development when secret is unset.
  if (!signatureHeader || !rawBody) return false;

  const [algo, providedHash] = signatureHeader.split('=');
  if (algo !== 'sha256' || !providedHash) return false;

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const provided = Buffer.from(providedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}
