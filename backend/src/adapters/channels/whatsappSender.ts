import { env } from '../../lib/env.js';

type WhatsAppSendInput = {
  toPhoneNumber: string;
  text: string;
  accessToken: string;
  phoneNumberId: string;
};

export type ChannelSendSuccess = {
  externalMessageId: string;
  providerStatus: 'sent' | 'accepted';
  rawResponse: Record<string, unknown>;
};

export type ChannelSendFailure = {
  errorCode?: string;
  errorMessage: string;
  retryable: boolean;
  rawResponse?: Record<string, unknown>;
};

export async function sendWhatsAppText(
  input: WhatsAppSendInput,
): Promise<ChannelSendSuccess | ChannelSendFailure> {
  const url = `https://graph.facebook.com/v21.0/${input.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.toPhoneNumber,
    type: 'text',
    text: {
      body: input.text,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
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
          `WhatsApp send failed (${response.status})`,
        retryable: response.status >= 500 || response.status === 429,
        rawResponse: json,
      };
    }

    const messages = (json.messages as Array<{ id?: string }> | undefined) ?? [];
    const externalMessageId = messages[0]?.id;
    if (!externalMessageId) {
      return {
        errorMessage: 'WhatsApp accepted request but no message id was returned.',
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

export function resolveWhatsAppAccessToken(config: Record<string, unknown>): string {
  return (
    (config['whatsapp_access_token'] as string | undefined) ??
    (config['access_token'] as string | undefined) ??
    env.whatsappAccessToken
  );
}

export function resolveWhatsAppPhoneNumberId(
  config: Record<string, unknown>,
  externalPhoneNumberId: string | null | undefined,
): string {
  return (
    (config['whatsapp_phone_number_id'] as string | undefined) ??
    externalPhoneNumberId ??
    env.whatsappPhoneNumberId
  );
}
