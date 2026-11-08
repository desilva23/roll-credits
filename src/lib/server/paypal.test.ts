import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PayPalModule from "./paypal";

const fetchMock = vi.fn();
const token = (expiresIn = 3600) =>
  new Response(JSON.stringify({ access_token: `tok-${expiresIn}`, expires_in: expiresIn }), { status: 200 });

// The access token is remembered at module level, so each test starts fresh.
async function load(): Promise<typeof PayPalModule> {
  vi.resetModules();
  return import("./paypal");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PAYPAL_CLIENT_ID", "client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "client-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("accessToken", () => {
  it("signs in to the sandbox with the app's credentials", async () => {
    fetchMock.mockResolvedValueOnce(token());
    const { accessToken } = await load();
    expect(await accessToken()).toBe("tok-3600");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    });
  });

  it("reuses a token until shortly before it expires", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(token(3600)).mockResolvedValueOnce(token(7200));
    const { accessToken } = await load();
    await accessToken();
    await accessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3600 * 1000);
    expect(await accessToken()).toBe("tok-7200");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when PayPal will not sign the app in", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const { accessToken } = await load();
    await expect(accessToken()).rejects.toThrow("PayPal sign-in failed: 401");
  });
});

describe("paypal", () => {
  it("calls the sandbox with a bearer token, sending a JSON body", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response('{"id":"O1"}', { status: 201 }));
    const { paypal } = await load();
    const result = await paypal("/v2/checkout/orders", { method: "POST", body: { intent: "CAPTURE" } });

    expect(result).toEqual({ ok: true, status: 201, body: { id: "O1" } });
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect((init as RequestInit).body).toBe('{"intent":"CAPTURE"}');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-3600" });
  });

  it("sends no body for a read, and survives a reply that is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const { paypal } = await load();
    expect(await paypal("/v1/payments/payouts/B1", { method: "GET" })).toEqual({ ok: false, status: 500, body: {} });
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBeUndefined();
  });
});
