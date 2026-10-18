// A scripted stand-in for the LLM, used when CLERK_MODE=demo. It follows the same
// interview, builds machines from keywords, and handles simple amendments, so the
// whole experience can be exercised (and tested) without an API key. It is not
// meant to be clever; the real clerk is the Claude-backed one.
import { Connection, ConnectionKind, LIMITS, Machine, Part, PartType, Size, sanitizeMachine } from "../machine/schema";
import type { ClerkReply, Turn } from "./types";

const KEYWORDS: [RegExp, PartType, string][] = [
  [/boiler|steam|kettle|furnace/, "boiler", "Boiler"],
  [/tank|reservoir|cistern|vat/, "tank", "Reservoir"],
  [/\bgears?\b|\bcogs?\b|clockwork/, "gear", "Gear"],
  [/flywheel|wheel/, "flywheel", "Flywheel"],
  [/valve|tap|spigot/, "valve", "Valve"],
  [/gauge|dial|meter|indicator/, "gauge", "Gauge"],
  [/funnel|hopper|intake/, "funnel", "Funnel"],
  [/crank|handle/, "crank", "Crank"],
  [/spring|coil/, "spring", "Spring"],
  [/\bjars?\b|bottle|glass|vessel/, "glass_jar", "Jar"],
  [/piston|pump|press/, "piston", "Piston"],
  [/chimney|stack|smoke|flue/, "chimney", "Stack"],
  [/conveyor|belt/, "conveyor", "Conveyor"],
  [/bellows|breath|wind/, "bellows", "Bellows"],
  [/lever|switch/, "lever", "Lever"],
  [/\bhorns?\b|trumpet|whistle|siren/, "horn", "Horn"],
];

const FLUID: ReadonlySet<PartType> = new Set(["boiler", "tank", "valve", "gauge", "funnel", "glass_jar", "piston", "chimney", "bellows", "horn"]);
const BLOCKED = /delorean|tardis|batmobile|pokemon|pikachu|mickey|r2-?d2|wall-?e|transformer|iron man|minion|\bnazi|bomb|gun\b|poison/;

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && /^(of|the|for|and|by|a|an|in|to|on)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

function partsFrom(text: string): { type: PartType; noun: string }[] {
  const found: { type: PartType; noun: string; at: number }[] = [];
  const lower = text.toLowerCase();
  for (const [re, type, noun] of KEYWORDS) {
    const m = lower.match(re);
    if (m && !found.some((f) => f.type === type)) found.push({ type, noun, at: m.index ?? 0 });
  }
  // Lead with a substantial component, so everything else hangs off something sensible.
  const hub = (t: PartType) => (["boiler", "tank", "conveyor", "piston", "flywheel"].includes(t) ? 0 : 1);
  return found.sort((a, b) => hub(a.type) - hub(b.type) || a.at - b.at);
}

function connectionKind(a: PartType, b: PartType): ConnectionKind {
  if (FLUID.has(a) && FLUID.has(b)) return "pipe";
  if ((a === "gear" || a === "flywheel") && (b === "gear" || b === "flywheel")) return "belt";
  if (a === "conveyor" || b === "conveyor") return "chain";
  if (a === "lever" || b === "lever") return "wire";
  return "shaft";
}

function build(purpose: string, power: string, components: string, name: string, inventor: string): Machine {
  const found = partsFrom(`${components} ${power} ${purpose}`);
  for (const fallback of ["boiler", "gauge", "valve", "glass_jar", "chimney"] as PartType[]) {
    if (found.length >= 5) break;
    if (!found.some((f) => f.type === fallback)) found.push({ type: fallback, noun: KEYWORDS.find((k) => k[1] === fallback)![2] });
  }
  const theme = titleCase(purpose.replace(/[^\w\s'-]/g, "").split(/\s+/).slice(-1).join(" ")) || "Wonder";
  const adjectives = ["Primary", "Auxiliary", "Regulating", "Secondary", "Reciprocating", "Collecting", "Grand", "Lesser"];
  const parts: Part[] = found.slice(0, 9).map((f, i) => ({
    id: `p${i + 1}`,
    type: f.type,
    size: (i === 0 ? "large" : i % 3 === 2 ? "small" : "medium") as Size,
    label: i === 0 ? `${theme} ${f.noun}`.slice(0, LIMITS.label) : `${adjectives[i % adjectives.length]} ${f.noun}`,
  }));
  const connections: Connection[] = parts.slice(1).map((p, i) => {
    const to = i % 3 === 2 ? parts[i] : parts[0];
    return { from: p.id, to: to.id, kind: connectionKind(p.type, to.type), label: i === 0 ? "Main Conduit" : "" };
  });
  const title = /^(apparatus|device|engine|machine|contrivance|improved)/i.test(name) ? titleCase(name) : `Apparatus Known as the ${titleCase(name)}`;
  const nouns = parts.map((p) => p.label.toLowerCase());
  return sanitizeMachine({
    title,
    inventor,
    abstract: `An apparatus which ${purpose.replace(/\.$/, "")}, being powered by ${power.replace(/\.$/, "").toLowerCase()}. The ${nouns[0]} operates in concert with the ${nouns.slice(1, 3).join(" and the ")} to produce the desired effect in a reliable and orderly manner.`,
    claims: [
      `An apparatus that ${purpose.replace(/\.$/, "").toLowerCase()}, comprising: a ${nouns[0]}; a ${nouns[1]}; and a ${nouns[2] ?? nouns[1]} operatively connected thereto.`,
      `The apparatus of claim 1, wherein said ${nouns[0]} is powered by ${power.replace(/\.$/, "").toLowerCase()}.`,
      `The apparatus of claim 1, further comprising a ${nouns[nouns.length - 1]}.`,
    ],
    parts,
    connections,
  })!;
}

function amend(m: Machine, text: string): { machine: Machine; note: string } | null {
  const lower = text.toLowerCase();
  const target = partsFrom(lower)[0];
  const next: Machine = JSON.parse(JSON.stringify(m));
  const sizes: Size[] = ["small", "medium", "large"];
  if (target && /bigger|larger|enlarge|increase/.test(lower)) {
    const p = next.parts.find((q) => q.type === target.type);
    if (!p) return null;
    p.size = sizes[Math.min(2, sizes.indexOf(p.size) + 1)];
    return { machine: next, note: `The ${p.label.toLowerCase()} has been enlarged.` };
  }
  if (target && /smaller|shrink|reduce/.test(lower)) {
    const p = next.parts.find((q) => q.type === target.type);
    if (!p) return null;
    p.size = sizes[Math.max(0, sizes.indexOf(p.size) - 1)];
    return { machine: next, note: `The ${p.label.toLowerCase()} has been reduced.` };
  }
  if (target && /remove|delete|without|take away/.test(lower)) {
    const p = next.parts.find((q) => q.type === target.type);
    if (!p || next.parts.length <= 2) return null;
    next.parts = next.parts.filter((q) => q !== p);
    next.connections = next.connections.filter((c) => c.from !== p.id && c.to !== p.id);
    return { machine: next, note: `The ${p.label.toLowerCase()} has been struck from the drawing.` };
  }
  if (target && /add|another|second|extra|include/.test(lower)) {
    if (next.parts.length >= LIMITS.parts) return { machine: m, note: `The sheet admits no more than ${LIMITS.parts} components.` };
    const id = `p${Date.now() % 100000}`;
    const existing = next.parts.filter((q) => q.type === target.type).length;
    const label = existing ? `Second ${target.noun}` : `Supplementary ${target.noun}`;
    next.parts.push({ id, type: target.type, size: "medium", label });
    const host = next.parts[0];
    next.connections.push({ from: id, to: host.id, kind: connectionKind(target.type, host.type), label: "" });
    return { machine: next, note: `A ${label.toLowerCase()} has been added.` };
  }
  return null;
}

export function demoClerk(turns: Turn[]): ClerkReply {
  // Declined requests don't count toward the interview.
  const users = turns.filter((t) => t.role === "user").map((t) => t.text.trim()).filter((t, i, all) => i === all.length - 1 || !BLOCKED.test(t.toLowerCase()));
  const last = users[users.length - 1] ?? "";
  if (BLOCKED.test(last.toLowerCase())) {
    return { reply: "The Office cannot accept machines that belong to someone else's story, nor anything meant to do harm. Perhaps an original contrivance of your own?", machine: null };
  }
  const current = [...turns].reverse().find((t) => t.machine)?.machine ?? null;
  if (current) {
    const result = amend(current, last);
    if (!result) return { reply: "The Office requires the amendment in plainer terms. Which component is to be changed, and how?", machine: null };
    return { reply: `${result.note} The revised drawing has been entered into the record.`, machine: result.machine, toolUseId: `demo_${turns.length}` };
  }
  const n = users.length;
  if (n === 1) return { reply: "Noted. And what, precisely, powers the apparatus?", machine: null };
  if (n === 2) return { reply: "Very good. Enumerate its notable components, if you would.", machine: null };
  if (n === 3) return { reply: "And by what name shall the invention be known? State also the name of the inventor.", machine: null };
  const [purpose, power, components, naming] = users;
  const inv = naming.match(/(?:by|inventor(?: is)?|my name is|i am)\s+([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/);
  const inventor = inv ? inv[1] : "The Applicant";
  const name = naming
    .replace(/(?:,|\.)?\s*(?:by|inventor(?: is)?|my name is|i am)\s+.*$/i, "")
    .replace(/^(it is |it's |call it |the name is |name it |called )/i, "")
    .replace(/^the\s+/i, "")
    .replace(/["'.]/g, "")
    .trim() || "Nameless Device";
  return {
    reply: "The application is in order. The drawing has been entered into the record; you may request amendments.",
    machine: build(purpose, power, components, name, inventor),
    toolUseId: `demo_${turns.length}`,
  };
}
