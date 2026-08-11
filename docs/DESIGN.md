# Tropico 2: Pirate Cove — reimplementation design

A faithful, playable reimplementation of Frog City Software's _Tropico 2: Pirate Cove_
(2003) as a browser game: TypeScript, Canvas 2D, isometric, no binary assets.

## What "faithful" means here

Every system, number and name below was reconstructed from the game's own data
(building stats, aura strengths and radii, ship tables, captain stats, campaign
objectives). The catalogue in `src/data/` is the original's content, not an
interpretation of it. What is _not_ reproduced: the original art, audio, and the
exact per-tick balance curves, which were never published.

## The idea of the game

You are the **Pirate King**. You do not run an economy that produces wealth — you
run a haven that _takes_ it. Gold comes from cruises; labour comes from captives
taken on those same cruises. Two populations live on your island and want opposite
things, and the whole game is the tension between them:

|                  | Pirates                                               | Captives                              |
| ---------------- | ----------------------------------------------------- | ------------------------------------- |
| aggregate stat   | **Happiness**                                         | **Resignation**                       |
| work             | none ashore except Guard / Overseer                   | all production, construction, hauling |
| needs            | grub, grog, betting, companionship, resting, stashing | food, resting, religion               |
| needs from auras | **anarchy**, **defense**                              | **order**, **fear**, **awe**          |
| failure mode     | brawls, desertion, **revolt**                         | escape → invasion, **rebellion**      |

Anarchy and order are opposites. Pirates need anarchy; captives need order. So the
island cannot be one uniform place — it has to be **zoned**, and zoning is the
core spatial puzzle.

## Architecture

Strict downward dependencies; nothing imports from a layer above it.

```
core/    pure math: seeded RNG, grid coords, isometric projection, A* pathfinding
data/    static catalogue: goods, buildings, ships, captains, traits, edicts,
         scenarios, balance constants
sim/     the simulation — pure TypeScript, no DOM, deterministic, serializable
render/  canvas drawing; reads sim state, never mutates it
ui/      DOM panels; emit commands, never mutate sim state directly
app/     wiring: game loop, input, bootstrap
```

**The simulation is the product.** `sim/` is plain data plus free functions:
`tick(state)` advances one step, commands are applied through a single reducer.
That buys three things at once — trivial save/load (JSON round-trip), trivial
testing (no mocks, no canvas), and determinism (one seeded RNG in state, no
`Math.random`, no `Date.now` below `app/`).

## The aura field — the heart of the game

Buildings emit auras written `(strength:radius)` in the original data, e.g. a
Tavern is `Anarchy (34:3)`, a Stockade is `Order (59:2)` and `Fear (69:5)`.

Five fields are kept as `Float32Array`s over the tile grid: `anarchy`, `order`,
`fear`, `defense`, `awe`. A building contributes to a tile with linear falloff:

```
contribution = strength * max(0, 1 - distance / radius)
```

Fields are recomputed incrementally when a building is added or removed, never
per tick. `order` and `anarchy` are stored separately but read as one axis: a
captive standing on a tile reads `order - anarchy`, a pirate reads the negation.
Pirate King traits scale whole fields island-wide (Iron-handed is +33% order,
Fun-loving is +33% anarchy).

This is the system that makes placement matter, so it is the one with the most
tests.

## Simulation model

**Time.** One tick is one game-hour; the sim runs 20 ticks/second at 1× (speeds
0/1/2/4). A game-month is ~36 s at 1×, so a 12-year campaign episode is about
25 minutes at 4×. All tuning lives in `src/data/balance.ts`.

**People.** Every pirate and captive is an entity with position, a job, a need
vector, traits (courage, leadership, notoriety, five pirate skills), and a state
machine: `idle → goingTo(target) → using(building) → working`. Needs decay per
game-hour and are refilled by reaching a building that provides them; satisfaction
gained depends on the provider's quality, the server's skill, and whether the
right goods are stocked (rum beats beer, cigars raise gambling).

**Work.** Buildings declare typed staff slots (`2 Cooks, 1 Hauler, 1 Overseer`).
Captives fill worker slots, pirates fill Overseer and Guard slots. Some buildings
need a _skilled_ captive of a profession to be constructed at all — and skilled
captives only come from cruises, which is what ties the economy back to raiding.

**Goods.** Production chains are the original's:

```
trees → Timber Camp → wood → Sawmill → LUMBER (the build currency)
corn  → Chuck Tent → slop (captives eat) │ Brewery → beer │ Sea Ration Factory → rations
sugarcane → Rum Distillery → rum          tobacco → Cigar Factory → cigars
bananas + papayas → Bakery → pastries
iron ore → Blast Furnace → pig iron → Blacksmithy → cutlasses
                                    → Cannon Foundry (+wood) → cannon
                                    → Gunsmithy → muskets
```

Haulers (unskilled captives) physically carry goods between buildings. A tavern
with no hauler gets no rum — which in the original was invisible and infuriating,
and here is surfaced (see _Fixes_ below).

**Cruises.** Ships are built at a Boatyard or Shipyard, need a Dock each, a
recruited Captain, officers and crew, and cargo: sea rations to stay out, plus
cutlasses (boarding), cannon (pounding) and muskets (harassing). A cruise picks a
sea region, encounters shipping over time, and resolves engagements from crew
skills, captain leadership/courage/notoriety and equipment — returning plunder,
goods, recruits, and captives (unskilled from settlements, skilled and wealthy
from stronger vessels).

**Nations.** England, France and Spain, each with a relations track. Raiding their
shipping costs relations; peace policies, freeing captives, and patronage buy it
back. Escaped captives reveal your location, and a discovered island gets invaded —
which is what Forts and Protective Cannons are for.

**Two treasuries.** The island **treasury** pays for buildings and edicts; the
Pirate King's personal **hoard**, collected at the Pirate Cave, is what most
campaign missions actually score you on. They are separate pools, as in the original.

## Fixes to the original's known flaws

The 2003 game was reviewed as a good idea with sharp edges. Four are corrected,
each in a way that keeps the original mechanic intact:

1. **Captives can be assigned.** The original gave no control over who worked
   where. Here a building panel lists its slots and lets you assign or release a
   named captive, alongside the original's low/medium/high staffing priority.
2. **Broken supply chains are legible.** Every building answers "why is this idle?"
   with the actual cause — no hauler, no input good, no skilled worker, no road
   connection — instead of silently producing nothing.
3. **Randomness is bounded.** Random events adjust the situation; none can put a
   scenario into an unwinnable state, and no single die roll destroys a run.
4. **No arbitrary campaign locks.** Episodes constrain by resources and time, not
   by hiding buildings you need for happiness.

Everything else — the opposed populations, lumber-as-currency, the aura zoning
puzzle, ransom, press-ganging, skeletons, the 16 episodes — is kept as it was.

## Content

- **55 buildings** across Infrastructure, Resource, Production, Entertainment,
  Nautical, Captive Control, Education, Defense and Accoutrement.
- **6 ship classes**: Snow, Schooner, Sloop, Brigantine, Frigate, Galleon.
- **16 captains** with the original's stat lines, usable as Pirate King or recruited.
- **10 backgrounds, 17 qualities, 11 flaws** for Pirate King creation.
- **~35 edicts** in five categories.
- **16 campaign episodes**, 1650–1747, with the original dates, starting resources,
  objectives and bronze/silver/gold time thresholds — plus a sandbox.

## Rendering

Isometric 2:1 diamond tiles. Every sprite — terrain, all 55 buildings, people,
ships, sea — is drawn procedurally into offscreen canvases at boot from a palette
and a set of drawing primitives. No image files, no fetches, no external anything.
Depth sorting is by tile `(x+y)` with building footprints resolved by their anchor.

## Verification

- Vitest unit tests colocated as `*.test.ts`, covering the sim exhaustively:
  aura falloff, need decay, job assignment, production chains, hauling, cruise
  resolution, escapes, objectives, save/load round-trip, and determinism
  (same seed + same commands ⇒ identical state hash).
- `tsc --strict` and ESLint clean.
- A headless Puppeteer harness boots the real game, runs simulated game-months,
  asserts the world advanced, and captures the screenshot used in the README.
