/** A public GitHub repository, as owner and name. */
export interface RepoRef {
  owner: string;
  name: string;
}

// GitHub allows letters, digits, hyphens, underscores and dots, up to 39 characters
// for an owner. Repository names follow the same alphabet.
const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_-])?$/;

/**
 * Accepts the forms people actually paste: `owner/name`, a browser URL with or
 * without `https://`, a `.git` suffix, and a deep link such as `/tree/main/src`.
 */
export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();
  if (trimmed === "") throw new RangeError("Enter a GitHub repository, like owner/name.");

  const withoutScheme = trimmed
    .replace(/^git\+/, "")
    .replace(/^(?:https?:\/\/|git@|ssh:\/\/git@)/, "")
    .replace(/^(?:www\.)?github\.com[/:]/, "");

  const [owner, rawName] = withoutScheme.split("/");
  if (owner === undefined || rawName === undefined) {
    throw new RangeError("Enter the repository as owner/name, or paste its GitHub address.");
  }

  const name = rawName.replace(/\.git$/, "");
  if (!SEGMENT.test(owner) || !SEGMENT.test(name)) throw new RangeError("That is not a GitHub repository name.");

  return { owner, name };
}

/** The canonical `owner/name` form, for URLs, cache keys and display. */
export function repoSlug(ref: RepoRef): string {
  return `${ref.owner}/${ref.name}`;
}

/**
 * A link to one line of a file on GitHub, so every piece of evidence can be
 * checked against the code it came from. `HEAD` is the default branch, which
 * is the branch the scan read.
 */
export function lineUrl(slug: string, path: string, line: number): string {
  const file = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${slug}/blob/HEAD/${file}#L${line}`;
}
