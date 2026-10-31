/** Browser-side wrapper around PayPal's v6 Web SDK. Sandbox only. */

export interface PayPalSession {
  start: (options: unknown, order: Promise<{ orderId: string }>) => Promise<void>;
}

export interface PayPalInstance {
  createPayPalOneTimePaymentSession: (callbacks: Record<string, unknown>) => PayPalSession;
  findEligibleMethods: (options: { currencyCode: string }) => Promise<{ isEligible: (name: string) => boolean }>;
}

declare global {
  interface Window {
    paypal?: {
      createInstance: (options: {
        clientId: string;
        components: string[];
        pageType: string;
      }) => Promise<PayPalInstance>;
    };
  }
}

const SDK_SRC = "https://www.sandbox.paypal.com/web-sdk/v6/core";

/** Adds the SDK script once per page and resolves when it is ready to use. */
export async function loadPayPal(clientId: string): Promise<PayPalInstance> {
  await new Promise<void>((resolve, reject) => {
    if (window.paypal !== undefined) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error("the PayPal script was blocked"));
    });
    if (existing === null) {
      script.src = SDK_SRC;
      script.async = true;
      document.head.append(script);
    }
  });

  const sdk = window.paypal;
  if (sdk === undefined) throw new Error("the PayPal SDK did not load");
  return sdk.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
}

/** Asks the server to open an order. The server decides the amount. */
export async function createOrder(budgetCents: number): Promise<{ orderId: string }> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budgetCents }),
  });
  if (!res.ok) throw new Error("could not create the order");
  return (await res.json()) as { orderId: string };
}

/** Asks the server to capture an approved order and report what PayPal said. */
export async function captureOrder(
  orderId: string,
): Promise<{ ok: boolean; status?: string; amount?: string | null }> {
  const res = await fetch(`/api/orders/${orderId}/capture`, { method: "POST" });
  const body = (await res.json()) as { status?: string; amount?: string | null };
  return { ok: res.ok, ...body };
}
