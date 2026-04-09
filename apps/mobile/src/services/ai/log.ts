/**
 * Central AI logging — never log API keys or full bearer tokens.
 */

function serializeError(err: unknown): Record<string, unknown> | unknown {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(typeof __DEV__ !== "undefined" && __DEV__ && err.stack ? { stack: err.stack } : {}),
    };
  }
  return err;
}

export function logAiError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  const payload = {
    scope,
    error: serializeError(err),
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  };
  console.error("[LeadFlow AI]", JSON.stringify(payload));
}

export function logAiWarn(scope: string, message: string, extra?: Record<string, unknown>): void {
  const payload = { scope, message, ...(extra && Object.keys(extra).length > 0 ? { extra } : {}) };
  console.warn("[LeadFlow AI]", JSON.stringify(payload));
}

export function logAiInfo(scope: string, message: string, extra?: Record<string, unknown>): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const payload = { scope, message, ...(extra && Object.keys(extra).length > 0 ? { extra } : {}) };
    console.info("[LeadFlow AI]", JSON.stringify(payload));
  }
}
