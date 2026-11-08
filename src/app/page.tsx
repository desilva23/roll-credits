import { Studio } from "@/components/Studio";

export default function Home(): React.JSX.Element {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  return (
    <main className="shell">
      <div className="slate">
        <span>Roll Credits</span>
        <span>PayPal sandbox</span>
      </div>

      <h1 className="title">
        Every film
        <br />
        ends with
        <br />
        credits.
      </h1>

      <p className="lede">
        Your software doesn&rsquo;t. Roll Credits reads your code, works out which people it really depends on, and
        pays them through PayPal. <strong>Not by dependency list — by what your code actually calls.</strong>
      </p>

      {clientId === "" ? (
        <p className="notice">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable payments.</p>
      ) : (
        <Studio clientId={clientId} />
      )}

      <p className="footer">
        Every payment is a real PayPal sandbox transaction. No real money moves. Maintainers appear under generated
        names until they claim their profile, so nobody is labelled in public without asking them first.
      </p>
    </main>
  );
}
