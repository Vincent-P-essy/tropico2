import type { Rng } from "../core/rng.ts";
import type { NationId } from "../data/nations.ts";

/**
 * Names, generated rather than stored.
 *
 * People matter individually in this game — you assassinate one, ransom
 * another, and watch a third become a captain — so they need names you can
 * point at. Pirates get an epithet often enough to feel like pirates and not
 * often enough to become tiresome.
 */

const PIRATE_MALE = [
  "Jack",
  "Tom",
  "Ned",
  "Silas",
  "Barnaby",
  "Ezra",
  "Rufus",
  "Amos",
  "Cutler",
  "Gideon",
  "Israel",
  "Josiah",
  "Abel",
  "Caleb",
  "Hugh",
  "Jem",
  "Kit",
  "Lucian",
  "Mordecai",
  "Obadiah",
  "Piers",
  "Quill",
  "Ransom",
  "Seth",
  "Titus",
  "Wulf",
  "Zeke",
  "Bartholomew",
  "Cornelius",
  "Duncan",
];

const PIRATE_FEMALE = [
  "Anne",
  "Grace",
  "Mary",
  "Bess",
  "Kit",
  "Nell",
  "Rose",
  "Clara",
  "Delia",
  "Esther",
  "Flora",
  "Hester",
  "Isolde",
  "Jane",
  "Lark",
  "Maud",
  "Perdita",
  "Ruth",
  "Sable",
  "Tamsin",
  "Ursula",
  "Verity",
  "Winifred",
  "Zora",
  "Bridget",
  "Constance",
];

const EPITHETS = [
  "the Red",
  "One-Eye",
  "Blacktooth",
  "the Cur",
  "Longshanks",
  "the Ragged",
  "Ironhand",
  "the Grim",
  "Saltbeard",
  "the Quick",
  "Halfpenny",
  "the Younger",
  "Crookback",
  "the Bold",
  "Deadeye",
  "the Lame",
  "Bloodyknuckle",
  "the Silent",
  "Gutrot",
  "the Pious",
  "Threefingers",
  "the Drowned",
  "Coldiron",
  "the Sly",
  "Hangman",
  "the Lucky",
  "Barrelchest",
  "the Nameless",
];

const SURNAMES: Readonly<Record<NationId, readonly string[]>> = {
  england: [
    "Hawkins",
    "Wallace",
    "Pike",
    "Ashby",
    "Trelawney",
    "Bramble",
    "Fenwick",
    "Crowe",
    "Marlowe",
    "Stobbart",
    "Ludlow",
    "Vane",
    "Kettle",
    "Ormsby",
    "Thackery",
    "Quill",
  ],
  france: [
    "Rousseau",
    "Delacroix",
    "Beaumont",
    "Fontaine",
    "Marchand",
    "Thibault",
    "Lacaze",
    "Vasseur",
    "Perrin",
    "Gauthier",
    "Moreau",
    "Duclos",
    "Bonnet",
    "Levasseur",
  ],
  spain: [
    "Aguilar",
    "Castellano",
    "Ibarra",
    "Salazar",
    "Montoya",
    "Peralta",
    "Vargas",
    "Cabrera",
    "Escobar",
    "Quintana",
    "Zamora",
    "Ferrer",
    "Arriaga",
    "Nieto",
  ],
};

const GIVEN: Readonly<Record<NationId, readonly string[]>> = {
  england: [
    "William",
    "Thomas",
    "Edward",
    "Margaret",
    "Alice",
    "Joan",
    "Robert",
    "Henry",
    "Elizabeth",
    "Agnes",
    "Richard",
    "Katherine",
  ],
  france: [
    "Jean",
    "Pierre",
    "Michel",
    "Marie",
    "Louise",
    "Anne",
    "Jacques",
    "Guillaume",
    "Cécile",
    "Étienne",
    "Madeleine",
    "Hugues",
  ],
  spain: [
    "Diego",
    "Juan",
    "Alonso",
    "Isabel",
    "Beatriz",
    "Carlos",
    "Rodrigo",
    "Inés",
    "Mateo",
    "Lucía",
    "Francisco",
    "Elena",
  ],
};

const SHIP_NAMES = [
  "Revenge",
  "Fortune",
  "Black Pearl",
  "Sea Wolf",
  "Iron Gale",
  "Marauder",
  "Ranger",
  "Bold Venture",
  "Queen Anne",
  "Storm Crow",
  "Cutlass",
  "Tempest",
  "Widowmaker",
  "Nightjar",
  "Sea Serpent",
  "Providence",
  "Gallows Wind",
  "Red Hand",
  "Kestrel",
  "Salt Mary",
  "Dead Reckoning",
  "Vulture",
  "Wanderer",
  "Scourge",
  "Leviathan",
  "Firebrand",
  "Nemesis",
  "Osprey",
  "Corsair",
  "Rapscallion",
];

export function pirateName(rng: Rng, sex: "male" | "female"): string {
  const pool = sex === "male" ? PIRATE_MALE : PIRATE_FEMALE;
  const given = rng.pick(pool) ?? "Jack";
  // Roughly a third earn an epithet; the rest get a surname.
  if (rng.chance(0.34)) return `${given} ${rng.pick(EPITHETS) ?? "the Red"}`;
  const nation = rng.pick(Object.keys(SURNAMES) as NationId[]) ?? "england";
  return `${given} ${rng.pick(SURNAMES[nation]) ?? "Hawkins"}`;
}

export function captiveName(rng: Rng, nationality: NationId, sex: "male" | "female"): string {
  const given = rng.pick(GIVEN[nationality]) ?? "Juan";
  const surname = rng.pick(SURNAMES[nationality]) ?? "Vargas";
  // The name pools are not split by sex; the sex parameter keeps the signature
  // honest for callers and lets a future pass split them without a churn.
  void sex;
  return `${given} ${surname}`;
}

export function shipName(rng: Rng, taken: ReadonlySet<string>): string {
  const available = SHIP_NAMES.filter((name) => !taken.has(name));
  if (available.length > 0) return rng.pick(available) ?? "Revenge";
  // Every name used: start numbering, as a real fleet would.
  const base = rng.pick(SHIP_NAMES) ?? "Revenge";
  for (let n = 2; ; n++) {
    const candidate = `${base} ${romanNumeral(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function romanNumeral(value: number): string {
  const table: readonly [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [amount, symbol] of table) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}
