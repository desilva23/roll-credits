import { createHmac } from "node:crypto";

/**
 * Maintainers appear under a generated name until they claim their profile.
 *
 * The hackathon rules make the entrant warrant that nothing published breaches
 * anyone's privacy or publicity rights. Labelling real, identifiable people as
 * "volunteer" or "company-paid" from an AI's reading of their commits is
 * exactly the kind of claim that warranty covers, so no real identity is ever
 * shown without consent. The film-credit styling is a happy side effect: a
 * screen of plausible names reads as credits rather than as a leak.
 */

// Two lists of 64, plus a middle initial, give about 106,000 combinations,
// so a repository's worth of maintainers almost never collide.
const FIRST = [
  "Marguerite",
  "Theodore",
  "Rosalind",
  "Ambrose",
  "Clementine",
  "Desmond",
  "Harriet",
  "Lionel",
  "Beatrix",
  "Cornelius",
  "Vivienne",
  "Barnaby",
  "Florence",
  "Augustin",
  "Saoirse",
  "Rupert",
  "Imogen",
  "Caspian",
  "Wilhelmina",
  "Ignatius",
  "Ottoline",
  "Mortimer",
  "Seraphina",
  "Alastair",
  "Henrietta",
  "Percival",
  "Georgiana",
  "Thaddeus",
  "Arabella",
  "Montgomery",
  "Evangeline",
  "Fitzwilliam",
  "Cordelia",
  "Leopold",
  "Millicent",
  "Ferdinand",
  "Josephine",
  "Bartholomew",
  "Anneliese",
  "Sylvester",
  "Rosamund",
  "Octavian",
  "Philippa",
  "Reginald",
  "Theodora",
  "Lysander",
  "Marianne",
  "Peregrine",
  "Celestine",
  "Horatio",
  "Guinevere",
  "Benedict",
  "Isadora",
  "Lazarus",
  "Melisande",
  "Emmerich",
  "Perpetua",
  "Ulysses",
  "Araminta",
  "Casimir",
  "Delphine",
  "Osric",
  "Lavinia",
  "Quillon",
];

const LAST = [
  "Castellanos",
  "Ashgrove",
  "Vandermeer",
  "Thornbury",
  "Oyelaran",
  "Blackwood",
  "Nakagawa",
  "Ferreira",
  "Lindqvist",
  "Abernathy",
  "Moreau",
  "Dziedzic",
  "Pemberton",
  "Okonkwo",
  "Rasmussen",
  "Valdivia",
  "Hartcourt",
  "Nwachukwu",
  "Steinberg",
  "Marchetti",
  "Fairweather",
  "Dragomir",
  "Sandoval",
  "Whitlock",
  "Petrossian",
  "Bellweather",
  "Kowalczyk",
  "Ravensworth",
  "Delacroix",
  "Ingermann",
  "Soderholm",
  "Varga",
  "Mazzanti",
  "Quintero",
  "Haverford",
  "Olubunmi",
  "Stavrianos",
  "Lindgren",
  "Teixeira",
  "Brightwater",
  "Marchbanks",
  "Antonescu",
  "Villanueva",
  "Rosencrantz",
  "Birkhoff",
  "Calloway",
  "Nordstrom",
  "Perreault",
  "Ashworth",
  "Zimmerman",
  "Montalvo",
  "Haraldsen",
  "Kirchner",
  "Beaumont",
  "Salvatierra",
  "Winterbourne",
  "Eriksdottir",
  "Mkhize",
  "Lavoisier",
  "Granholm",
  "Battista",
  "Olszewski",
  "Cavendish",
  "Rookwood",
];

const INITIAL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as readonly string[];

/** Indexing is always in range after a modulo, but the type system cannot see that. */
function pick(list: readonly string[], at: number): string {
  const value = list[at % list.length];
  // The lists are compile-time constants and the modulo keeps the index in
  // range; this guards the type, not a case that can happen.
  /* v8 ignore next */
  if (value === undefined) throw new Error("empty name list");
  return value;
}

/**
 * A keyed hash of a login, for one purpose.
 *
 * Keyed, because an unkeyed hash can be run in reverse in practice: take a
 * project's public contributor list, hash every login, and see which one gives
 * the name on screen. With HMAC-SHA256 and a secret that never leaves the
 * server, nobody can compute what a login maps to, so a name cannot be matched
 * back to an account. The purpose label keeps names and ids independent.
 *
 * What it cannot hide is what is already public: the one person who wrote
 * nearly all of a famous package can be looked up. Roll Credits does not name
 * them; it does not pretend that makes them unknowable.
 */
export function keyed(secret: string, purpose: string, login: string): Buffer {
  if (secret === "") throw new RangeError("a secret is needed");
  return createHmac("sha256", secret).update(`${purpose}:${login.trim().toLowerCase()}`).digest();
}

/**
 * The same login always yields the same name under the same secret, so a
 * person keeps one identity across runs and across the credits roll.
 */
export function stageName(login: string, secret: string): string {
  if (login.trim() === "") throw new RangeError("a login is needed");
  const digest = keyed(secret, "stage-name", login);

  // Separate slices of one digest, so first name, initial and surname vary freely.
  const first = pick(FIRST, digest.readUInt32BE(0));
  const initial = pick(INITIAL, digest.readUInt32BE(4));
  const last = pick(LAST, digest.readUInt32BE(8));
  return `${first} ${initial}. ${last}`;
}
