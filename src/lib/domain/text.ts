/**
 * A count said the way a person says it: "1 person", "3 people", "0 packages".
 * The plural defaults to adding an "s", which covers most words this app uses.
 */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
