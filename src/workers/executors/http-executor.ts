import { interpolateTemplate, interpolateValue } from "./template-engine";

export interface HttpNodeOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
  validateStatus?: (status: number) => boolean;
  fetchFn?: typeof fetch;
}

export interface HttpNodeResult {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  durationMs: number;
  idempotencyKey?: string;
  url: string;
  method: string;
}

export class HttpNodeError extends Error {
  status: number;
  statusText: string;
  data: unknown;
  url: string;
  method: string;
  durationMs: number;

  constructor(
    message: string,
    params: {
      status: number;
      statusText: string;
      data: unknown;
      url: string;
      method: string;
      durationMs: number;
    }
  ) {
    super(message);
    this.name = "HttpNodeError";
    this.status = params.status;
    this.statusText = params.statusText;
    this.data = params.data;
    this.url = params.url;
    this.method = params.method;
    this.durationMs = params.durationMs;
  }
}

/**
 * Executes an outbound HTTP request with:
 * - Template variable replacement in URL, headers, and body (e.g. {{node_1.data.userId}})
 * - Timeout handling with AbortController
 * - Automatic X-Idempotency-Key header injection
 * - Custom header merging and JSON serialization
 * - Comprehensive status validation and failure classification for BullMQ retry / DLQ routing
 */
export async function executeHttpNode(
  options: HttpNodeOptions
): Promise<HttpNodeResult> {
  const startTime = Date.now();
  const context = options.context || {};
  const timeoutMs = options.timeoutMs ?? 10000;
  const fetchImplementation = options.fetchFn ?? globalThis.fetch;

  if (!options.url) {
    throw new Error("HTTP node execution failed: 'url' parameter is required.");
  }

  // 1. Template variable replacement and URL protocol normalization
  let effectiveUrl = interpolateTemplate(options.url, context).trim();

  // If relative URL (e.g. /api/v1/mock/tickers), resolve with host base
  if (effectiveUrl.startsWith("/")) {
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    effectiveUrl = `${baseUrl.replace(/\/$/, "")}${effectiveUrl}`;
  } else if (
    effectiveUrl.startsWith("localhost") ||
    effectiveUrl.startsWith("127.0.0.1") ||
    effectiveUrl.startsWith("host.docker.internal")
  ) {
    effectiveUrl = `http://${effectiveUrl}`;
  } else if (
    !effectiveUrl.startsWith("http://") &&
    !effectiveUrl.startsWith("https://") &&
    !effectiveUrl.startsWith("//")
  ) {
    // Default to https:// for bare domain/path like api.stripe.com/v1/...
    effectiveUrl = `https://${effectiveUrl}`;
  }

  // 2. Resolve HTTP method
  let effectiveMethod = (options.method || "").toUpperCase();
  if (!effectiveMethod) {
    effectiveMethod = options.body !== undefined && options.body !== null ? "POST" : "GET";
  }

  // 3. Template variable replacement and normalization in Headers
  const effectiveHeaders: Record<string, string> = {};
  if (options.headers && typeof options.headers === "object") {
    for (const [key, val] of Object.entries(options.headers)) {
      const interpolatedKey = interpolateTemplate(key, context);
      const interpolatedVal = interpolateTemplate(String(val), context);
      effectiveHeaders[interpolatedKey] = interpolatedVal;
    }
  }

  // 4. Inject X-Idempotency-Key if provided and not explicitly set
  if (options.idempotencyKey) {
    const hasIdemHeader = Object.keys(effectiveHeaders).some(
      (h) => h.toLowerCase() === "x-idempotency-key"
    );
    if (!hasIdemHeader) {
      effectiveHeaders["X-Idempotency-Key"] = options.idempotencyKey;
    }
  }

  // 5. Template variable replacement and serialization for Request Body
  let serializedBody: string | undefined = undefined;
  if (options.body !== undefined && options.body !== null && effectiveMethod !== "GET" && effectiveMethod !== "HEAD") {
    const interpolatedBody = interpolateValue(options.body, context);

    if (typeof interpolatedBody === "string") {
      serializedBody = interpolatedBody;
    } else {
      serializedBody = JSON.stringify(interpolatedBody);
      // Auto-set Content-Type if not set
      const hasContentType = Object.keys(effectiveHeaders).some(
        (h) => h.toLowerCase() === "content-type"
      );
      if (!hasContentType) {
        effectiveHeaders["Content-Type"] = "application/json";
      }
    }
  }

  // 6. Execute fetch with AbortController timeout
  const controller = new AbortController();
  let isTimedOut = false;
  const timer = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImplementation(effectiveUrl, {
      method: effectiveMethod,
      headers: effectiveHeaders,
      body: serializedBody,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durationMs = Date.now() - startTime;

    // 7. Parse response body safely
    let responseData: unknown = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json") || contentType.includes("+json")) {
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }
    }

    // Convert response headers to plain dictionary
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    // 8. Validate HTTP Status
    const validateStatus = options.validateStatus ?? ((s) => s >= 200 && s < 400);
    const isValid = validateStatus(response.status);

    if (!isValid) {
      const rawDetail =
        typeof responseData === "object"
          ? JSON.stringify(responseData)
          : String(responseData || response.statusText);
      const errDetail =
        rawDetail.length > 1000
          ? `${rawDetail.slice(0, 1000)}... (truncated)`
          : rawDetail;

      throw new HttpNodeError(
        `HTTP ${response.status} (${response.statusText}): Request to [${effectiveMethod}] ${effectiveUrl} failed with response: ${errDetail}`,
        {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          url: effectiveUrl,
          method: effectiveMethod,
          durationMs,
        }
      );
    }

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data: responseData,
      durationMs,
      idempotencyKey: options.idempotencyKey,
      url: effectiveUrl,
      method: effectiveMethod,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const durationMs = Date.now() - startTime;

    if (isTimedOut || (err instanceof Error && err.name === "AbortError")) {
      throw new HttpNodeError(
        `HTTP request timed out after ${timeoutMs}ms: [${effectiveMethod}] ${effectiveUrl}`,
        {
          status: 408,
          statusText: "Request Timeout",
          data: { error: `Timeout after ${timeoutMs}ms` },
          url: effectiveUrl,
          method: effectiveMethod,
          durationMs,
        }
      );
    }

    if (err instanceof HttpNodeError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new HttpNodeError(
      `HTTP request dispatch error to [${effectiveMethod}] ${effectiveUrl}: ${message}`,
      {
        status: 500,
        statusText: "Internal Error",
        data: { error: message },
        url: effectiveUrl,
        method: effectiveMethod,
        durationMs,
      }
    );
  }
}
