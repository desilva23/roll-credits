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
  if (value === undefined) throw new Error("empty name list");
  return value;
}

/**
 * FNV-1a with an avalanche step. FNV alone is tiny and stable, but its low bits
 * stay correlated for inputs that share a suffix, and taking a name with
 * `% 64` reads only those bits: without the final mixing, 400 similar logins
 * collided 20 times instead of the expected once.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The same login always yields the same name, so a person keeps one identity
 * across runs and across the credits roll. The mapping is one-way in practice:
 * the name carries no information that leads back to the account.
 */
export function stageName(login: string): string {
  const key = login.trim().toLowerCase();
  if (key === "") throw new RangeError("a login is needed");

  // Three independent hashes, so first name, surname and initial vary freely.
  const first = pick(FIRST, hash(`first:${key}`));
  const last = pick(LAST, hash(`last:${key}`));
  const initial = pick(INITIAL, hash(`middle:${key}`));
  return `${first} ${initial}. ${last}`;
}
