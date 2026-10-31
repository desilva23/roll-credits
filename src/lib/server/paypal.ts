import "server-only";
import { PAYPAL_API, env } from "./env";

interface TokenCache {
  token: string;
  expiresAt: number;
}
let cache: TokenCache | undefined;

/** Access tokens last hours, so one is reused until a minute before it expires. */
export async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.token;

  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = env();
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal sign-in failed: ${res.status}`);

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: body.access_token, expiresAt: now + (body.expires_in - 60) * 1000 };
  return cache.token;
}

/** Calls a PayPal REST endpoint and returns the parsed body plus the status. */
export async function paypal(
  path: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}
