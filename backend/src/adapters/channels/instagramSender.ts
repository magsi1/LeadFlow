import { env } from '../../lib/env.js';
import type { ChannelSendFailure, ChannelSendSuccess } from './whatsappSender.js';

type InstagramSendInput = {
  recipientId: string;
  text: string;
  pageId: string;
  accessToken: string;
};

export async function sendInstagramText(
  input: InstagramSendInput,
): Promise<ChannelSendSuccess | ChannelSendFailure> {
  // Instagram messaging for business integrations commonly uses the same
  // Meta Graph messages edge on a connected Page with Instagram messaging scopes.
  const url = `https://graph.facebook.com/v21.0/${input.pageId}/messages?access_token=${encodeURIComponent(
    input.accessToken,
  )}`;
  const payload = {
    recipient: {
      id: input.recipientId,
    },
    message: {
      text: input.text,
    },
    messaging_type: 'RESPONSE',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        errorCode: (json.error as { code?: string })?.code?.toString(),
        errorMessage:
          (json.error as { message?: string })?.message ??
          `Instagram send failed (${response.status})`,
        retryable: response.status >= 500 || response.status === 429,
        rawResponse: json,
      };
    }
    const externalMessageId = (json.message_id as string | undefined) ?? '';
    if (!externalMessageId) {
      return {
        errorMessage: 'Instagram send accepted but no message_id returned.',
        retryable: true,
        rawResponse: json,
      };
    }
    return {
      externalMessageId,
      providerStatus: 'accepted',
      rawResponse: json,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}

export function resolveInstagramAccessToken(config: Record<string, unknown>): string {
  return (
    (config['instagram_access_token'] as string | undefined) ??
    (config['access_token'] as string | undefined) ??
    env.instagramAccessToken
  );
}
