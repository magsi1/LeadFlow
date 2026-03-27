import crypto from 'node:crypto';

/**
 * Validates `X-Hub-Signature-256` from Meta webhooks (HMAC-SHA256 of raw body).
 * In production, `META_APP_SECRET` must be set or requests are rejected.
 */
export function verifyMetaSignature(
  appSecret: string,
  signatureHeader: string | undefined,
  rawBody: Buffer | undefined,
): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  if (!appSecret?.trim()) {
    if (isProd) return false;
    // Local/dev only: allow unsigned payloads when secret is unset (use tunnel + test payloads).
    return true;
  }
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
