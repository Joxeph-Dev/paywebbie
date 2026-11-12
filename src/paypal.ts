// Minimal client for the PayPal REST endpoints PayWebbie needs. Sandbox only for now.
import { createHash, randomUUID } from "node:crypto";

const API_URL = "https://api-m.sandbox.paypal.com";
// PayPal holds authorized funds for 29 days but only guarantees them for the first 3 (the "honor period").
/** PayPal's sandbox rejects rand, so holds are made in dollars at a fixed demo rate. */
export const ZAR_PER_USD = Number(process.env.ZAR_PER_USD || 18);

export function toUsd(zar: string): string {
  return Math.max(0.01, Number(zar) / ZAR_PER_USD).toFixed(2);
}

export const HONOR_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export type Money = { currency_code: string; value: string };

export type Authorization = {
  id: string;
  status: string; // CREATED, CAPTURED, VOIDED, DENIED, EXPIRED, PENDING, ...
  amount?: Money;
  create_time?: string;
  expiration_time?: string;
};

export type Capture = {
  id: string;
  status: string; // COMPLETED, PENDING, DECLINED, ...
  status_details?: { reason?: string };
};

type Link = { href: string; rel: string };

type ErrorBody = {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string }[];
  // The OAuth endpoint uses a different error shape.
  error?: string;
  error_description?: string;
};

export class PayPalError extends Error {
  status: number;
  issue?: string;
  debugId?: string;

  constructor(status: number, message: string, issue?: string, debugId?: string) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.issue = issue;
    this.debugId = debugId;
  }
}

// Trimmed because keys pasted into a hosting dashboard easily pick up a stray space or line break,
// which PayPal rejects as invalid_client.
const clientId = () => (process.env.PAYPAL_CLIENT_ID ?? "").trim();
const clientSecret = () => (process.env.PAYPAL_CLIENT_SECRET ?? "").trim();

// A safe way to tell whether two copies of the keys match: each key's length plus the first
// 8 characters of its SHA-256 hash, which can't be turned back into the key.
export function credentialFingerprint(): string {
  const fp = (value: string) => `${value.length} chars, ${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
  return `client id ${fp(clientId())}; secret ${fp(clientSecret())}`;
}

export function hasCredentials(): boolean {
  return Boolean(clientId() && clientSecret());
}

type TokenResponse = { access_token: string; expires_in: number; app_id?: string };

export async function requestToken(): Promise<TokenResponse> {
  if (!hasCredentials()) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set.");
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const res = await fetch(`${API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as TokenResponse;
}

let cached: { token: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (!cached || Date.now() >= cached.expiresAt) {
    const fresh = await requestToken();
    // Refresh a minute early so a token never expires mid-request.
    cached = { token: fresh.access_token, expiresAt: Date.now() + (fresh.expires_in - 60) * 1000 };
  }
  return cached.token;
}

async function toError(res: Response): Promise<PayPalError> {
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  const detail = body.details?.[0];
  return new PayPalError(
    res.status,
    detail?.description ?? body.message ?? body.error_description ?? `PayPal returned HTTP ${res.status}`,
    detail?.issue ?? body.name ?? body.error,
    body.debug_id,
  );
}

async function call<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; requestId?: string } = {},
): Promise<T> {
  const method = options.method ?? "POST";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    Prefer: "return=representation",
  };
  if (method === "POST") headers["Content-Type"] = "application/json";
  // PayPal-Request-Id makes retries safe: PayPal replays the first result instead of acting twice.
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!res.ok) throw await toError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Creates an order that, once the client approves it, only places a hold (intent AUTHORIZE). */
export async function createHeldPaymentOrder(input: {
  referenceId: string;
  description: string;
  amount: string;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; approveUrl: string }> {
  const order = await call<{ id: string; status: string; links?: Link[] }>("/v2/checkout/orders", {
    requestId: randomUUID(),
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description,
          amount: { currency_code: input.currency, value: input.amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "PayWebbie",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const approve = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve");
  if (!approve) throw new Error(`PayPal created order ${order.id} (${order.status}) but sent no approval link.`);
  return { id: order.id, approveUrl: approve.href };
}

/** Turns an approved order into a hold on the client's funds. */
export async function authorizeOrder(orderId: string): Promise<Authorization> {
  type AuthorizedOrder = { purchase_units?: { payments?: { authorizations?: Authorization[] } }[] };
  const order = await call<AuthorizedOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    requestId: `authorize-${orderId}`,
  });
  const authorization = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!authorization) throw new Error(`PayPal authorized order ${orderId} but returned no authorization.`);
  return authorization;
}

/** Takes the held money: the client has approved the work. */
export function captureAuthorization(authorizationId: string): Promise<Capture> {
  return call<Capture>(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
    body: { final_capture: true },
    requestId: `capture-${authorizationId}`,
  });
}

/** Releases the hold without charging the client. */
export function voidAuthorization(authorizationId: string): Promise<Authorization | undefined> {
  return call<Authorization | undefined>(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    requestId: `void-${authorizationId}`,
  });
}

/** Renews a hold after its 3-day honor period; PayPal returns a new authorization ID. */
export function reauthorize(authorizationId: string): Promise<Authorization> {
  return call<Authorization>(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`, {
    requestId: randomUUID(),
  });
}

export function getAuthorization(authorizationId: string): Promise<Authorization> {
  return call<Authorization>(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`, { method: "GET" });
}
