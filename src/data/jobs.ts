/**
 * Who does what.
 *
 * The division of labour *is* the game's premise: captives do every scrap of
 * work on the island, and pirates do none of it — they crew ships, and ashore
 * they will only stoop to standing over someone else with a whip (Overseer) or
 * a musket (Guard).
 *
 * Some jobs need a *skilled* captive, and skilled captives cannot be trained;
 * they only arrive by being taken off a ship. That is the thread tying the
 * island's industry back to piracy: you cannot have a distillery until you have
 * stolen someone who knows how to distil.
 */

export type Workforce = "captive" | "pirate";

export type JobId =
  // Unskilled captive work — any captive can do these.
  | "builder"
  | "hauler"
  | "farmer"
  | "lumberjack"
  | "miner"
  | "blacksmith"
  | "cook"
  | "server"
  | "wench"
  | "priest"
  | "surgeon"
  | "trader"
  // Skilled captive work — only a captive of this profession can do it.
  | "shipwright"
  | "distiller"
  | "tobacconist"
  | "engineer"
  | "gunsmith"
  | "carpenter"
  | "hatter"
  | "birdHandler"
  | "courtesan"
  // Pirate work.
  | "overseer"
  | "guard";

export interface JobDef {
  readonly id: JobId;
  readonly name: string;
  readonly workforce: Workforce;
  /** Skilled jobs can only be filled by a captive taken with that profession. */
  readonly skilled: boolean;
  /** Some work is done only by men or only by women, as in the original. */
  readonly sex?: "male" | "female";
  /** Ransom a skilled captive of this profession is worth, in gold. */
  readonly ransom: number;
  readonly description: string;
}

const define = (
  id: JobId,
  name: string,
  workforce: Workforce,
  skilled: boolean,
  ransom: number,
  description: string,
  sex?: "male" | "female",
): JobDef => ({ id, name, workforce, skilled, ransom, description, ...(sex ? { sex } : {}) });

export const JOBS: Readonly<Record<JobId, JobDef>> = {
  builder: define(
    "builder",
    "Builder",
    "captive",
    false,
    0,
    "Raises the buildings you place. Nothing gets built without one.",
  ),
  hauler: define(
    "hauler",
    "Hauler",
    "captive",
    false,
    0,
    "Carries goods between buildings. A tavern without a hauler is a dry tavern.",
  ),
  farmer: define("farmer", "Farmer", "captive", false, 0, "Works the fields."),
  lumberjack: define(
    "lumberjack",
    "Lumberjack",
    "captive",
    false,
    0,
    "Fells trees and cuts them into lumber.",
  ),
  miner: define("miner", "Miner", "captive", false, 0, "Digs iron ore out of the hills."),
  blacksmith: define(
    "blacksmith",
    "Blacksmith",
    "captive",
    false,
    0,
    "Smelts and beats iron into blades.",
  ),
  cook: define("cook", "Cook", "captive", false, 0, "Feeds captives slop and pirates better."),
  server: define("server", "Server", "captive", false, 0, "Pours the drink and runs the tables."),
  wench: define(
    "wench",
    "Wench",
    "captive",
    false,
    0,
    "Keeps pirates company at the cheaper houses.",
    "female",
  ),
  priest: define(
    "priest",
    "Priest",
    "captive",
    false,
    0,
    "Tends to captive souls, which keeps captive bodies working.",
    "male",
  ),
  surgeon: define(
    "surgeon",
    "Surgeon",
    "captive",
    false,
    0,
    "Keeps the sick alive — captives at the apothecary, pirates at the surgery.",
  ),
  trader: define(
    "trader",
    "Trader",
    "captive",
    false,
    0,
    "Haggles at the black market and the smuggler's cove.",
  ),

  shipwright: define(
    "shipwright",
    "Shipwright",
    "captive",
    true,
    600,
    "Builds ships. Without one you have a haven and no way to leave it.",
  ),
  distiller: define("distiller", "Distiller", "captive", true, 450, "Turns sugarcane into rum."),
  tobacconist: define(
    "tobacconist",
    "Tobacconist",
    "captive",
    true,
    400,
    "Rolls tobacco into cigars.",
  ),
  engineer: define("engineer", "Engineer", "captive", true, 700, "Casts cannon."),
  gunsmith: define("gunsmith", "Gunsmith", "captive", true, 550, "Makes muskets."),
  carpenter: define(
    "carpenter",
    "Carpenter",
    "captive",
    true,
    350,
    "Fine woodwork, and peg legs for pirates who need one.",
  ),
  hatter: define("hatter", "Hatter", "captive", true, 300, "Makes hats worth following."),
  birdHandler: define("birdHandler", "Bird Handler", "captive", true, 300, "Raises parrots."),
  courtesan: define(
    "courtesan",
    "Courtesan",
    "captive",
    true,
    500,
    "The high end of companionship, and priced accordingly.",
    "female",
  ),

  overseer: define(
    "overseer",
    "Overseer",
    "pirate",
    false,
    0,
    "A pirate standing over captives. Poorly paid, but it makes them work faster.",
  ),
  guard: define(
    "guard",
    "Guard",
    "pirate",
    false,
    0,
    "A pirate under arms. Catches runaways, puts down trouble, and can be sent to kill.",
  ),
};

export const JOB_IDS = Object.keys(JOBS) as JobId[];

export const SKILLED_JOBS: readonly JobId[] = JOB_IDS.filter((id) => JOBS[id].skilled);

export const UNSKILLED_JOBS: readonly JobId[] = JOB_IDS.filter(
  (id) => JOBS[id].workforce === "captive" && !JOBS[id].skilled,
);

export const PIRATE_JOBS: readonly JobId[] = JOB_IDS.filter(
  (id) => JOBS[id].workforce === "pirate",
);

export function jobDef(id: JobId): JobDef {
  return JOBS[id];
}

/** The five skills a pirate improves at school or at sea. */
export type PirateSkill =
  "navigation" | "seamanship" | "gunnery" | "marksmanship" | "swordsmanship";

export const PIRATE_SKILLS: readonly PirateSkill[] = [
  "navigation",
  "seamanship",
  "gunnery",
  "marksmanship",
  "swordsmanship",
];

export const PIRATE_SKILL_NAMES: Readonly<Record<PirateSkill, string>> = {
  navigation: "Navigation",
  seamanship: "Seamanship",
  gunnery: "Gunnery",
  marksmanship: "Marksmanship",
  swordsmanship: "Swordsmanship",
};

export const PIRATE_SKILL_DESCRIPTIONS: Readonly<Record<PirateSkill, string>> = {
  navigation: "Keeps a ship on course and brings her home sooner.",
  seamanship: "Speed under sail — catching a runner, or escaping a stronger ship.",
  gunnery: "Effectiveness of cannon when pounding or harassing.",
  marksmanship: "Effectiveness of muskets when harassing or boarding.",
  swordsmanship: "Effectiveness of cutlasses in a boarding action.",
};
