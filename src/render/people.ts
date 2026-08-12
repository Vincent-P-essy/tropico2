import { tileToScreen } from "../core/iso.ts";
import { RANKS } from "../data/buildings.ts";
import type { NationId } from "../data/nations.ts";
import type { GameState, Person } from "../sim/types.ts";
import { shade } from "./palette.ts";

/**
 * Drawing a person.
 *
 * The island was populated by rectangles: a body, a circle for a head, a bar on
 * top if the figure was a pirate. It read, in the sense that you could tell one
 * kind from the other, and it was not a crowd of people — you could not see who
 * anybody was or what they were doing without clicking on them.
 *
 * Everything drawn here comes from something the simulation already knows and
 * the player can act on. Nationality decides the cloth, because the original's
 * captives and captains are English, French or Spanish and it matters who you
 * are raiding. Sex decides the silhouette, because half the jobs on the island
 * are open to one sex only. Rank decides the hat, so a quartermaster is visibly
 * not a landsman. And what somebody is doing decides how they move: a hauler
 * shoulders his load, a brawler swings, a runner leans into it, and a man at
 * work swings whatever his trade swings.
 *
 * All of it is a dozen or so filled paths per figure, at sixteen pixels tall.
 */

/** Cloth colours, by the flag the person was born under. */
const NATION_CLOTH: Record<NationId, { coat: string; trim: string }> = {
  // Crimson and buff: the English soldier's coat of the period.
  england: { coat: "#9c3238", trim: "#d9c9a3" },
  // Royal blue and white.
  france: { coat: "#33508f", trim: "#dfe3ec" },
  // Ochre and blood red, after the Spanish colours.
  spain: { coat: "#b8862f", trim: "#8c2b22" },
};

/** A few skins, so a crowd is not all one person. */
const SKINS = ["#e8c6a0", "#d4a97c", "#b5835a", "#8d5f3c", "#6d452a"];

/** Head rags and kerchiefs, for those without a hat worth the name. */
const RAGS = ["#7d4a3a", "#3f5c4a", "#6a5a86", "#8a6b32", "#4a4a52"];

export function drawPerson(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  person: Person,
  time: number,
): void {
  const elevation = state.island.elevation.sample(person.x, person.y);
  const screen = tileToScreen(person.x, person.y, elevation);
  const look = appearanceOf(person);
  const pose = poseOf(person, time);

  ctx.save();
  ctx.translate(screen.x, screen.y);

  // The shadow stays on the ground however the figure moves above it.
  ctx.fillStyle = "rgba(20, 16, 10, 0.26)";
  ctx.beginPath();
  ctx.ellipse(0, 1, 5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -pose.lift);
  if (pose.lean !== 0) ctx.rotate(pose.lean);

  drawLegs(ctx, look, pose);
  drawArms(ctx, look, pose, true);
  drawTorso(ctx, look, pose);
  drawHead(ctx, look, pose);
  drawArms(ctx, look, pose, false);
  drawHeld(ctx, person, look, pose);

  ctx.restore();
}

interface Appearance {
  skin: string;
  coat: string;
  trim: string;
  legs: string;
  hair: string;
  /** Wide skirt rather than breeches. */
  skirt: boolean;
  hat: "none" | "rag" | "bandana" | "tricorn" | "plumed" | "fine";
  /** Colour of the rag or bandana, when there is one. */
  ragColour: string;
  skeleton: boolean;
  /** What is in the working hand, if anything. */
  tool: "none" | "cutlass" | "musket" | "axe" | "tray";
}

/** Who this person looks like — settled entirely by what they are. */
function appearanceOf(person: Person): Appearance {
  const cloth = NATION_CLOTH[person.nationality];
  const pick = <T>(list: readonly T[], salt: number): T =>
    list[(person.id * 7 + salt) % list.length] ?? (list[0] as T);

  if (person.skeleton) {
    return {
      skin: "#e6e2d4",
      coat: "#cfcabb",
      trim: "#9a9384",
      legs: "#cfcabb",
      hair: "#cfcabb",
      skirt: false,
      hat: "none",
      ragColour: "#cfcabb",
      skeleton: true,
      tool: "none",
    };
  }

  const female = person.sex === "female";
  const skin = pick(SKINS, 3);
  const hair = pick(["#2b2118", "#4a3423", "#6b4a2a", "#8a6a3a", "#1d1a17"], 5);

  if (person.kind === "captive") {
    // Captives wear what they were taken in, which has since become rags — the
    // wealthy excepted, who are still dressed for the dinner they were seized
    // from and are the only captives worth being polite to.
    const fine = person.wealthy;
    return {
      skin,
      coat: fine ? shade(cloth.coat, 0.25) : shade(pick(["#8a7a5e", "#6f6a56", "#7d6647"], 2), 0),
      trim: fine ? cloth.trim : "#5c5344",
      legs: fine ? "#3a3630" : "#5a5145",
      hair,
      skirt: female,
      hat: fine ? "fine" : person.id % 3 === 0 ? "rag" : "none",
      ragColour: pick(RAGS, 4),
      skeleton: false,
      tool: toolFor(person),
    };
  }

  // Pirates dress up as they rise. A landsman has a kerchief; a captain has a
  // plumed hat and a coat somebody else paid for.
  const rank = Math.max(0, Math.min(RANKS.length - 1, person.rank));
  const hat =
    person.captainId !== null ? "plumed" : rank >= 5 ? "tricorn" : rank >= 2 ? "bandana" : "rag";
  return {
    skin,
    coat: shade(cloth.coat, rank >= 4 ? 0.14 : 0),
    trim: cloth.trim,
    legs: pick(["#3b3229", "#4a3d2c", "#2f2a24"], 1),
    hair,
    skirt: female && rank < 3,
    hat,
    ragColour: pick(RAGS, 4),
    skeleton: false,
    tool: toolFor(person),
  };
}

function toolFor(person: Person): Appearance["tool"] {
  if (person.carrying) return "none";
  const job = person.job?.job;
  if (job === "lumberjack") return "axe";
  if (job === "guard" || job === "overseer") return "musket";
  if (job === "server" || job === "cook") return "tray";
  if (person.kind === "pirate") return "cutlass";
  return "none";
}

interface Pose {
  /** Stride phase, -1 to 1. */
  swing: number;
  /** Vertical bounce of the whole figure. */
  lift: number;
  /** Body tilt in radians. */
  lean: number;
  /** 1 facing screen-right, -1 facing screen-left. */
  facing: number;
  /** True when the figure is seen from behind. */
  away: boolean;
  /** Extra swing for the working arm. */
  work: number;
  sitting: boolean;
}

/**
 * How this person is standing, walking or carrying on.
 *
 * The stride is a sine of the clock offset by the person's id, so a crowd does
 * not march in step. Everything else is read off the activity.
 */
function poseOf(person: Person, time: number): Pose {
  const next = person.path[0];
  const moving = next !== undefined;
  const dx = moving ? next.x + 0.5 - person.x : 0;
  const dy = moving ? next.y + 0.5 - person.y : 0;

  // Screen-space heading: +x runs down-right, +y down-left.
  const screenX = dx - dy;
  const screenY = dx + dy;

  const fleeing = person.activity === "fleeing";
  const rioting = person.activity === "rioting";
  const working = person.activity === "working";
  const resting = person.activity === "sleepingRough" || person.activity === "using";

  const rate = fleeing ? 13 : rioting ? 16 : 8;
  const beat = time * rate + person.id * 1.7;
  const swing = moving || rioting ? Math.sin(beat) : 0;

  return {
    swing,
    lift: moving ? Math.abs(Math.sin(beat)) * 1.4 : 0,
    lean: fleeing ? 0.16 * (screenX >= 0 ? 1 : -1) : rioting ? Math.sin(beat * 0.7) * 0.09 : 0,
    facing: screenX >= 0 ? 1 : -1,
    away: moving ? screenY < 0 : false,
    work: working ? Math.abs(Math.sin(time * 5 + person.id)) : rioting ? 1 : 0,
    sitting: resting && !moving,
  };
}

function drawLegs(ctx: CanvasRenderingContext2D, look: Appearance, pose: Pose): void {
  const top = pose.sitting ? -4 : -6;
  ctx.fillStyle = look.legs;

  if (look.skirt) {
    // A skirt is one shape that sways rather than two that alternate.
    const sway = pose.swing * 0.9;
    ctx.beginPath();
    ctx.moveTo(-2.2, top);
    ctx.lineTo(2.2, top);
    ctx.lineTo(3.4 + sway, 0);
    ctx.lineTo(-3.4 + sway, 0);
    ctx.closePath();
    ctx.fill();
    return;
  }

  for (const side of [-1, 1]) {
    const step = pose.swing * side * 1.8;
    ctx.fillRect(side < 0 ? -2.2 : 0.4, top, 1.8, pose.sitting ? 4 : 6 - Math.abs(step) * 0.4);
    if (!pose.sitting && Math.abs(step) > 0.3) {
      // The trailing foot lifts, which is what makes it a stride and not a slide.
      ctx.fillRect((side < 0 ? -2.2 : 0.4) + step * 0.5, -1.2, 1.8, 1.2);
    }
  }
}

function drawTorso(ctx: CanvasRenderingContext2D, look: Appearance, pose: Pose): void {
  const top = pose.sitting ? -10 : -13;
  const bottom = pose.sitting ? -4 : -6;

  ctx.fillStyle = look.coat;
  ctx.beginPath();
  ctx.moveTo(-2.6, top);
  ctx.lineTo(2.6, top);
  ctx.lineTo(3.0, bottom);
  ctx.lineTo(-3.0, bottom);
  ctx.closePath();
  ctx.fill();

  if (look.skeleton) {
    ctx.fillStyle = "#8e8878";
    for (let rib = 0; rib < 3; rib++) ctx.fillRect(-2.2, top + 1.4 + rib * 1.6, 4.4, 0.7);
    return;
  }

  // A sash or a shirt front, which is what tells the nations apart at a glance.
  ctx.fillStyle = look.trim;
  if (pose.away) {
    ctx.fillRect(-2.4, top + 2.4, 4.8, 0.9);
  } else {
    // A collar and an open shirt, not a bib. Two narrow lapels reading down to
    // a point about a third of the way, so the coat stays the thing you see.
    ctx.beginPath();
    ctx.moveTo(-2.2, top + 0.6);
    ctx.lineTo(0, top + 3.6);
    ctx.lineTo(2.2, top + 0.6);
    ctx.lineTo(1.3, top + 0.2);
    ctx.lineTo(0, top + 2);
    ctx.lineTo(-1.3, top + 0.2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawArms(
  ctx: CanvasRenderingContext2D,
  look: Appearance,
  pose: Pose,
  behind: boolean,
): void {
  const shoulder = pose.sitting ? -9.5 : -12.5;
  // Arms counter-swing the legs, which is what stops a walk looking like a
  // shuffle. The far arm is drawn first so the body overlaps it.
  const side = behind ? -pose.facing : pose.facing;
  const raise = pose.work > 0 ? -pose.work * 3.4 : pose.swing * side * 1.6;

  ctx.fillStyle = look.skeleton ? look.coat : shade(look.coat, -0.18);
  ctx.save();
  ctx.translate(side * 2.9, shoulder + 0.5);
  ctx.rotate((raise / 4) * side);
  ctx.fillRect(-0.9, 0, 1.8, pose.work > 0 && !behind ? 4.6 : 5.6);
  ctx.restore();

  if (behind) return;

  // The hand, and whatever is in it.
  const handY = shoulder + (pose.work > 0 ? 3.6 : 5.6) + raise * 0.4;
  const handX = side * 3.4 + raise * 0.5;
  ctx.fillStyle = look.skin;
  ctx.fillRect(handX - 0.9, handY, 1.8, 1.4);

  drawTool(ctx, look, handX, handY, side, pose);
}

function drawTool(
  ctx: CanvasRenderingContext2D,
  look: Appearance,
  x: number,
  y: number,
  side: number,
  pose: Pose,
): void {
  switch (look.tool) {
    case "cutlass": {
      // Worn at the hip unless it is being swung. Curved, with a guard and a
      // brass pommel: a straight pale line at this size reads as a stick of
      // chalk, which is what this was.
      const swung = pose.work > 0.5;
      const hiltX = swung ? x : -side * 2.4;
      const hiltY = swung ? y : -6.8;
      const tipX = swung ? x + side * 4.8 : -side * 3.9;
      const tipY = swung ? y - 3.2 : -1.8;

      ctx.strokeStyle = "#cfd4dc";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(hiltX, hiltY);
      // The curve is the whole difference between a cutlass and a poker.
      ctx.quadraticCurveTo((hiltX + tipX) / 2 + side * 0.9, (hiltY + tipY) / 2, tipX, tipY);
      ctx.stroke();

      ctx.fillStyle = "#8d6a2c";
      ctx.fillRect(hiltX - 0.9, hiltY - 0.5, 1.8, 1);
      return;
    }
    case "axe":
      ctx.strokeStyle = "#6b4a2c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + side * 2.4, y - 5);
      ctx.stroke();
      ctx.fillStyle = "#b9bec6";
      ctx.fillRect(x + side * 1.6, y - 6.4, 2.4 * side, 2.2);
      return;
    case "musket":
      ctx.strokeStyle = "#4a3a28";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x - side * 0.6, y + 1.6);
      ctx.lineTo(x + side * 1.2, y - 7.5);
      ctx.stroke();
      return;
    case "tray":
      ctx.fillStyle = "#8a6a3f";
      ctx.fillRect(x - 2.2, y - 0.6, 4.4, 1);
      ctx.fillStyle = "#d8c48a";
      ctx.fillRect(x - 0.8, y - 2, 1.6, 1.4);
      return;
    case "none":
      return;
  }
}

function drawHead(ctx: CanvasRenderingContext2D, look: Appearance, pose: Pose): void {
  const y = pose.sitting ? -12 : -15;

  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(0, y, 2.7, 0, Math.PI * 2);
  ctx.fill();

  if (look.skeleton) {
    // Two sockets and a jaw, which is enough at this size.
    ctx.fillStyle = "#3a3630";
    ctx.fillRect(-1.5, y - 0.6, 1.1, 1.1);
    ctx.fillRect(0.4, y - 0.6, 1.1, 1.1);
    ctx.fillRect(-1.2, y + 1.5, 2.4, 0.7);
    return;
  }

  // Hair, and a face only when the figure is turned toward the camera.
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(0, y - 0.5, 2.7, Math.PI, Math.PI * 2);
  ctx.fill();
  if (look.skirt) {
    // Longer hair falls behind the shoulders.
    ctx.fillRect(-2.9, y - 0.5, 1.1, 4.2);
    ctx.fillRect(1.8, y - 0.5, 1.1, 4.2);
  }

  if (!pose.away) {
    ctx.fillStyle = "rgba(28, 22, 16, 0.75)";
    ctx.fillRect(pose.facing * 0.3 - 1.4, y - 0.3, 0.8, 0.8);
    ctx.fillRect(pose.facing * 0.3 + 0.6, y - 0.3, 0.8, 0.8);
  }

  drawHat(ctx, look, y);
}

function drawHat(ctx: CanvasRenderingContext2D, look: Appearance, y: number): void {
  switch (look.hat) {
    case "none":
      return;
    case "rag":
    case "bandana": {
      // Its own colour, not the hair's: indexing this off the head's position
      // gave every figure on the island the same brown scarf, which read as a
      // haircut rather than as a hat.
      ctx.fillStyle = look.ragColour;
      ctx.beginPath();
      ctx.arc(0, y - 0.6, 2.85, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-2.85, y - 0.8, 5.7, 1.3);

      if (look.hat === "bandana") {
        // The knot and the two tails behind the ear, which is the whole look.
        ctx.fillRect(-3.9, y - 0.6, 1.4, 1.4);
        ctx.beginPath();
        ctx.moveTo(-3.6, y + 0.4);
        ctx.lineTo(-5.2, y + 3.2);
        ctx.lineTo(-3.2, y + 2.4);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    case "tricorn":
    case "plumed": {
      ctx.fillStyle = "#241d17";
      ctx.beginPath();
      ctx.ellipse(0, y - 1.6, 4.6, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2.6, y - 1.8);
      ctx.lineTo(0, y - 4.4);
      ctx.lineTo(2.6, y - 1.8);
      ctx.closePath();
      ctx.fill();
      if (look.hat === "plumed") {
        ctx.strokeStyle = "#e4dcc6";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(1.8, y - 2.4);
        ctx.quadraticCurveTo(4.6, y - 4.4, 3.4, y - 6.4);
        ctx.stroke();
      }
      return;
    }
    case "fine": {
      // A gentleman's hat: what a wealthy captive was seized in.
      ctx.fillStyle = "#2c2a35";
      ctx.beginPath();
      ctx.ellipse(0, y - 1.8, 4, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-2, y - 4.6, 4, 3);
      ctx.fillStyle = "#c8b26a";
      ctx.fillRect(-2, y - 2.6, 4, 0.8);
      return;
    }
  }
}

/** The load on a hauler's shoulder. */
function drawHeld(
  ctx: CanvasRenderingContext2D,
  person: Person,
  look: Appearance,
  pose: Pose,
): void {
  if (!person.carrying) return;
  const y = pose.sitting ? -15 : -18;
  ctx.fillStyle = "#a07c47";
  ctx.fillRect(-4, y, 8, 4.2);
  ctx.fillStyle = shade("#a07c47", -0.22);
  ctx.fillRect(-4, y + 1.6, 8, 0.8);
  ctx.fillStyle = look.skin;
  // The hand that holds it steady.
  ctx.fillRect(pose.facing * 2.6, y + 3.4, 1.6, 1.4);
}
