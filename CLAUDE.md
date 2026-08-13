# The Brethren Coast — working notes

An isometric city builder set on a buccaneer island in 1650: pirates want
anarchy, captives need order, both live on the same island. TypeScript, Canvas
2D, no binary assets at all.

Independent reimplementation of the **systems** of _Tropico 2: Pirate Cove_
(Frog City, 2003), from published descriptions. The repo directory is still
`tropico2` and the URL still says tropico2 — that was a deliberate choice, to
keep existing links working. **"Tropico" is a live trademark**, so it appears
nowhere as a title or an identifier: not in `<title>`, not on the start screen,
not as the README heading. It appears in the README only as prose attribution,
alongside an explicit statement of non-affiliation. Keep it that way.

Live at `vincent-p-essy.github.io/tropico2/` · repo `Vincent-P-essy/tropico2`.

## Read this first, then only what you need

70 source files, ~24k lines. Do not read the tree to orient yourself — this file
is the map. Go straight to the file that owns the thing you are changing.

```
src/core/    seeded RNG, tile grid, typed-array fields, isometric maths, A*
src/data/    the catalogue: buildings, goods, jobs, ships, captains, traits,
             edicts, nations, needs, scenarios, and balance.ts (every constant)
src/sim/     the simulation. setup.ts lays the opening island; game.ts is the
             tick; people/behaviour/employment/economy/services/unrest/fleet/
             edicts/objectives; state.ts owns GameState; save.ts serialises it
src/render/  renderer.ts (scene) · ground.ts (cached terrain) · people.ts
             (figures) · chatter.ts (speech) · sprites.ts (procedural art)
src/ui/      hud, fleet panel, edicts panel, almanac, start screen, style.css
src/app/     main.ts: boot, input, game loop, window.tropico test harness
```

## Rules that are not negotiable

- **No AI attribution anywhere.** No `Co-Authored-By`, no AI-named branches, no
  mention of Claude or Anthropic in code, comments, commit messages or GitHub
  metadata. Author is `Vincent-P-essy <vincent.plessy12@gmail.com>`. This has
  been checked repeatedly; keep it true.
- **No binary assets.** Every sprite is drawn procedurally into an offscreen
  canvas at boot; every sound is synthesised. This is the project's whole
  technical argument — do not add a PNG or an MP3.
- **Determinism.** One seed decides the world. No `Math.random` and no
  `Date.now` below `app/`. The music has its own generator on purpose: if it
  drew from the simulation's, turning the sound on would change the island.
- **Strict TypeScript**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `erasableSyntaxOnly` (so no enums, no parameter properties). Typed arrays are
  wrapped in `core/field.ts` because of the index checking.
- **Prose comments.** Comments say _why_, in full sentences, and name the bug
  they prevent. Match the surrounding voice; do not add `// increment counter`.

## The gates, in the order they are cheap

```
npx tsc -b                 fast
npx eslint .               fast
npx prettier --check .     fast
npm test                   ~4 min, 406 tests — run in background, poll the log
npm run screenshot         boots the real game headless, doubles as the e2e test
npm run browsers           Chrome AND Firefox; catches what one engine hides
npm run figures            draws the whole cast at 6× — the only way to judge art
npm run audio              renders the music offline and measures the samples
npm run resume             plays, saves, reloads the page, comes back to it
npm run profile            times real frames on this machine
```

`npm test` exceeds a 2-minute foreground timeout. Run it with `run_in_background`
writing to a log, then poll the log — do not chain sleeps.

## What this machine is

Vincent's laptop: **i3-1115G4, 2 cores / 4 threads, Intel Xe integrated, 7.5 GB
RAM (about 2 GB free), 1080p**. It is the target, and it is why the game measures
itself. Two cores means **never run two harnesses at once** — the numbers lie.
Current budget: ~18.7 ms a frame, 53 fps, 432 buildings, 48 people.

## Where the bodies are buried

Everything below was a real bug that cost hours. Do not reintroduce them.

- **The island is labour-constrained.** Adding a building makes every other
  building worse, because the captives are already spread thin. Every attempt to
  fix happiness by adding taverns reopened the famine. Measure before and after,
  across at least eight seeds, or do not touch it.
- **Placement can silently fail.** A dock, a sawmill, a farm or a kitchen that
  finds no site ends the run with nothing in the log. `guaranteeFood`,
  `guaranteeDock` and the sawmill retry exist for this. Any new essential
  building needs the same treatment.
- **A site search must not always return the nearest candidate.** Eight retries
  picked the same blocked site eight times. Pass over the ones that failed.
- **Dead code is dead features.** The invasion was fully written and never
  called; twelve episodes shipped ships that could not sail for want of a
  captain; the game could save and not load. Grep for exported functions nothing
  references — that is where the missing game is.
- **A hauler on an errand is at work.** Counting him absent halved every
  kitchen permanently. His walk is already the constraint; do not charge it twice.
- **Measure in a browser, not by reading.** The Karplus-Strong string diverged to
  NaN and silently took every other instrument with it. A `let` read before its
  declaration blanked the page in Firefox while Chrome, on a cached bundle, said
  nothing.
- **Throwaway scripts go in the scratchpad, never the repo root.** One got
  committed by `git add -A` because the `rm` that would have deleted it was on
  the tail of a command that timed out, and CI failed on a file that was never
  meant to exist.
- **Judge art at 6×.** At sixteen pixels everything is a silhouette. The contact
  sheet found that every figure wore the captain's hat and every head scarf was
  the same brown.

## Known open problem

**Pirate happiness sits at 12–17 % on an unattended island; the original holds
above 50 %.** The mechanism is understood: a need settles well below the quality
of whatever last filled it, the opening settlement has only bottom-tier
entertainment, and housing quality — which caps resting and stashing — rises only
with rank, which rises only with plunder. Adding better buildings destabilises
the food chain. This is the first thing to fix, and it needs the settlement
right-sized rather than added to.

## Fidelity

`src/data/fidelity.test.ts` pins every number taken from published descriptions
of the original. The Fandom wiki is the source; `WebFetch` gets a 402 from it, so
use `curl` against `tropico.fandom.com/api.php`. Facts established so far:
16 episodes with their real resources and medal times, 33 edicts, the captains'
nationalities and stats, sex-restricted jobs, a starting ship you are expected to
send out about ten times, and captives who mostly escape rather than die.
