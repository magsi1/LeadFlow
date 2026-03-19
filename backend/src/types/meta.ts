export type MetaWebhookPayload = {
  object?: string;
  entry?: MetaEntry[];
};

export type MetaEntry = {
  id?: string;
  time?: number;
  changes?: MetaChange[];
  messaging?: MetaMessagingEvent[];
};

export type MetaChange = {
  field?: string;
  value?: Record<string, unknown>;
};

export type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<Record<string, unknown>>;
  };
  delivery?: {
    mids?: string[];
    watermark?: number;
  };
  read?: {
    mid?: string;
    watermark?: number;
  };
};
