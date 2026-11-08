/**
 * What the server is doing, as it does it.
 *
 * Reading a repository takes about twenty seconds, nearly all of it waiting on
 * GitHub, npm and the model. Without this the page sits silent long enough to
 * look broken.
 */
export function ReadingSteps({ steps }: { steps: readonly string[] }): React.JSX.Element | null {
  if (steps.length === 0) return null;

  return (
    <ol className="steps" aria-live="polite">
      {steps.map((message, index) => (
        <li key={message} className={index === steps.length - 1 ? "steps__now" : ""}>
          {message}
        </li>
      ))}
    </ol>
  );
}
