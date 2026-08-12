/**
 * Every tuning number in the game, in one file.
 *
 * The original never published its per-tick curves, so these are chosen to
 * reproduce its *behaviour*: a captive who cannot reach food starves in a few
 * weeks, a pirate with no tavern within reach starts fights within a month, and
 * a well-run frigate pays for itself in two cruises.
 *
 * Change a number here and the whole game moves. Nothing else should hold a
 * magic constant.
 */

// ── Time ────────────────────────────────────────────────────────────────────

/** One simulation tick is one game-hour. */
export const HOURS_PER_DAY = 24;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_DAY = HOURS_PER_DAY;
export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;

/**
 * Ticks executed per real second at 1× speed.
 *
 * At two ticks a second a game-day passes in twelve seconds and a month in six
 * minutes, so a twelve-year campaign episode runs about fifteen minutes at 4×.
 * Fast enough to finish, slow enough to watch somebody walk.
 */
export const TICKS_PER_SECOND = 2;

/** Available game speeds, as tick multipliers. Index 0 is paused. */
export const SPEEDS: readonly number[] = [0, 1, 2, 4, 8];

// ── Island ──────────────────────────────────────────────────────────────────

export const ISLAND_SIZE = 64;

// ── Movement ────────────────────────────────────────────────────────────────

/**
 * Tiles walked per game-hour off-road.
 *
 * This number decides whether the island works. Everything on it is moved by
 * somebody's legs: a hauler fetching corn, a captive walking to eat. At a
 * realistic-looking crawl the round trip from a chuck tent to a corn farm took
 * over a week of game time and the whole population starved while the food sat
 * in the field. Six tiles an hour crosses a settlement in two or three hours,
 * which is the scale the need decay rates are balanced against.
 */
export const WALK_SPEED = 6;
/** Multiplier on walking speed while on a road tile. */
export const ROAD_SPEED_BONUS = 1.9;
/** Pathfinding cost of a road tile; lower means people detour to use roads. */
export const ROAD_PATH_COST = 0.5;
/** Pathfinding cost of open ground. */
export const GROUND_PATH_COST = 1;
/** Pathfinding cost of dense jungle. */
export const JUNGLE_PATH_COST = 2.2;
/** How far a person will walk to satisfy a need before giving up, in tiles. */
export const MAX_SERVICE_WALK = 34;

// ── Needs ───────────────────────────────────────────────────────────────────

/** A need at or below this is urgent enough to interrupt work. */
export const NEED_URGENT = 34;
/** A need at or above this is comfortable; nobody goes out of their way. */
export const NEED_SATISFIED = 78;
/** Game-hours spent inside a building while a need is being filled. */
export const SERVICE_HOURS = 4;
/** Fraction of the gap to full that one visit closes, before quality is applied. */
export const SERVICE_FILL = 1;

/** Below this feasting level a captive begins to starve. */
export const STARVATION_THRESHOLD = 4;
/** Game-days at zero food before a captive dies. */
export const STARVATION_DAYS = 26;

// ── Mood ────────────────────────────────────────────────────────────────────

/** Aura reading that counts as full satisfaction of that aura need. */
export const AURA_FULL = 60;
/**
 * Below this happiness a pirate starts brawling; below the second, one with the
 * nerve for it deserts or moves against you.
 *
 * Set against what a starting island can actually offer. A dive tops drinking
 * out at about thirty, an animal pit gambling at forty, and a rank-one pirate's
 * bare plot gives twenty for both sleep and somewhere to stash his share — so
 * even a perfectly run opening settlement caps near thirty per cent. Thresholds
 * above that put every new island in permanent crisis through no fault of the
 * player's. Ranks, taverns, inns and casinos are how the number climbs, and
 * they are all paid for by going to sea.
 */
export const PIRATE_UNREST = 21;
export const PIRATE_REVOLT = 11;
/** Below this resignation a captive with the nerve for it will try to escape. */
export const CAPTIVE_ESCAPE = 26;
/** Below this resignation captives will follow a leader into open rebellion. */
export const CAPTIVE_REBELLION = 14;
/** Courage a captive needs before attempting an escape at all. */
export const ESCAPE_COURAGE = 5;
/** Courage and leadership a captive needs to lead a rebellion. */
export const REBELLION_COURAGE = 6;
export const REBELLION_LEADERSHIP = 6;
/** Per-day chance an eligible unhappy captive breaks for the coast. */
export const ESCAPE_CHANCE_PER_DAY = 0.06;
/**
 * Per-day chance an eligible unhappy pirate deserts, at rock bottom.
 *
 * Scaled by how far below the revolt line he actually is, so a pirate who is
 * merely miserable grumbles for months while one with nothing at all leaves
 * within weeks. At the first value tried the whole band walked off inside a
 * year of an unattended island, which reads as the game being broken rather
 * than as a warning the player ignored.
 */
export const DESERTION_CHANCE_PER_DAY = 0.012;
/** How much mood changes per game-hour toward its target. */
export const MOOD_SMOOTHING = 0.02;

// ── Work ────────────────────────────────────────────────────────────────────

/** Output multiplier from a fully staffed building with no overseer. */
export const BASE_WORK_RATE = 1;
/** Extra output fraction contributed by a present overseer. */
export const OVERSEER_BONUS = 0.35;
/** Output multiplier per point of worker skill above the baseline of 3. */
export const SKILL_OUTPUT_STEP = 0.12;
/** Units a hauler carries in one trip. */
export const HAULER_LOAD = 4;
/** Game-hours a builder contributes per tick of work. */
export const BUILD_RATE_PER_BUILDER = 1;
/** Base build effort, in builder-hours, per lumber of cost. */
export const BUILD_HOURS_PER_LUMBER = 2.5;
/** Minimum build effort for anything, in builder-hours. */
export const MIN_BUILD_HOURS = 6;
/** Monthly wage paid per employed pirate (overseers and guards). */
export const PIRATE_WAGE = 6;

// ── Storage ─────────────────────────────────────────────────────────────────

/** How much of one good a production building holds before it stops working. */
export const BUILDING_STOCK_CAP = 24;
/** How much of one good an entertainment building holds. */
export const SERVICE_STOCK_CAP = 12;

// ── Cruises ─────────────────────────────────────────────────────────────────

/** Game-days a ship spends on station before turning for home, per ration aboard. */
export const DAYS_PER_RATION = 1.4;
/** Base chance per day on station of sighting a sail. */
export const ENCOUNTER_CHANCE_PER_DAY = 0.34;
/** Gold carried by a typical merchant, scaled by region richness. */
export const MERCHANT_BASE_GOLD = 280;
/** Gold carried by a warship, which is poorer but worth the reputation. */
export const WARSHIP_BASE_GOLD = 120;
/** Relations lost with a nation for each of her ships taken. */
export const RELATIONS_PER_PRIZE = 5;
/** Relations lost for each settlement of hers raided. */
export const RELATIONS_PER_RAID = 8;
/** Relations regained per month of leaving a nation's shipping alone. */
export const RELATIONS_HEALING_PER_MONTH = 1.2;
/** Relations gained per captive released back to their nation. */
export const RELATIONS_PER_RELEASE = 2;
/** Chance per encounter of recruiting a pirate from a beaten crew. */
export const RECRUIT_CHANCE = 0.28;
/** Chance a beaten merchant yields a skilled captive. */
export const SKILLED_CAPTIVE_CHANCE = 0.18;
/** Chance a beaten merchant yields a wealthy captive worth ransoming. */
export const WEALTHY_CAPTIVE_CHANCE = 0.12;
/** Unskilled captives taken from one settlement raid. */
export const SETTLEMENT_CAPTIVES: readonly [number, number] = [4, 9];
/** How much a region's shipping thins per cruise, and how fast it recovers monthly. */
export const REGION_DEPLETION = 0.16;
export const REGION_RECOVERY_PER_MONTH = 0.09;

// ── Hoard and treasury ──────────────────────────────────────────────────────

/** Largest share of incoming gold the Pirate Cave will divert to the hoard. */
export const MAX_STASH_RATE = 0.25;

// ── Ransom and captives ─────────────────────────────────────────────────────

/** Gold a wealthy captive's ransom rises by per entertainment visit. */
export const WEALTHY_RANSOM_PER_VISIT = 35;
export const WEALTHY_RANSOM_BASE = 400;

// ── Invasion ────────────────────────────────────────────────────────────────

/** Chance per month that a nation which knows your location and hates you sails. */
export const INVASION_CHANCE_PER_MONTH = 0.08;
/** Relations at or below which a nation will consider invading. */
export const INVASION_RELATIONS = -55;
/** Defence contributed by one fort, cannon or armed guard against an invasion. */
export const FORT_DEFENSE = 40;
export const CANNON_DEFENSE = 8;
export const GUARD_DEFENSE = 4;

// ── Random events ───────────────────────────────────────────────────────────

/**
 * Events are deliberately bounded: they change the situation, they never end a
 * scenario. Nothing here can sink a fleet, empty a treasury or kill a
 * population — which is the single biggest change from the original, where one
 * unlucky roll could make a mission unwinnable.
 */
export const EVENT_CHANCE_PER_MONTH = 0.22;
/** Hardest hit any single random event may land, as a fraction of the relevant pool. */
export const EVENT_MAX_SEVERITY = 0.15;

// ── Prices ──────────────────────────────────────────────────────────────────

/** Multiplier added to a Black Market good's price with each purchase. */
export const BLACK_MARKET_MARKUP = 0.08;
/** How fast Black Market prices settle back, per month. */
export const BLACK_MARKET_DECAY = 0.12;
/** Base cost of recruiting a captain. */
export const CAPTAIN_COST = 1500;

/**
 * Mouths one chuck tent is built for in the opening settlement.
 *
 * A tent makes nine slop a day and a captive eats about one, so on paper one
 * tent per nine would be right. In practice a kitchen costs two captives to
 * crew and the corn to fill it costs more, and an island given more kitchens
 * than its farms can supply starves faster than one given fewer: the labour
 * goes into cooking nothing. Twelve leaves the hands where the constraint is.
 */
export const CAPTIVES_PER_KITCHEN = 18;

/** Captives one bunkhouse can bed down. */
export const CAPTIVES_PER_BUNKHOUSE = 18;
