import { FundButton } from "@/components/FundButton";

export default function Home(): React.JSX.Element {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  return (
    <main className="page">
      <p className="badge">PayPal sandbox · no real money</p>
      <h1 className="title">Roll Credits</h1>
      <p className="tagline">
        Every film ends with credits. Your software doesn&rsquo;t. Roll Credits reads your code, finds the people it
        really depends on, and pays them through PayPal.
      </p>
      {clientId === "" ? (
        <p className="warn">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable the funding button.</p>
      ) : (
        <FundButton clientId={clientId} />
      )}
    </main>
  );
}
