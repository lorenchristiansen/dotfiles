// The machine description the clerk files, and the only thing the renderer reads.
// The LLM never writes geometry: it picks parts from a fixed vocabulary, sizes them,
// and says what connects to what. Everything visual is decided by lib/render.

export const PART_TYPES = [
  "boiler",
  "tank",
  "gear",
  "flywheel",
  "valve",
  "gauge",
  "funnel",
  "crank",
  "spring",
  "glass_jar",
  "piston",
  "chimney",
  "conveyor",
  "bellows",
  "lever",
  "horn",
] as const;
export type PartType = (typeof PART_TYPES)[number];

export const SIZES = ["small", "medium", "large"] as const;
export type Size = (typeof SIZES)[number];

export const CONNECTION_KINDS = ["pipe", "belt", "shaft", "wire", "chain"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export interface Part {
  id: string;
  type: PartType;
  size: Size;
  /** What the part is called in the reference key, e.g. "Melancholy Reservoir". */
  label: string;
}

export interface Connection {
  from: string;
  to: string;
  kind: ConnectionKind;
  /** Optional name for the run itself; empty string when it needs no numeral. */
  label: string;
}

export interface Machine {
  title: string;
  inventor: string;
  abstract: string;
  claims: string[];
  parts: Part[];
  connections: Connection[];
}

export const LIMITS = {
  parts: 12,
  connections: 14,
  claims: 4,
  title: 100,
  inventor: 48,
  label: 34,
  abstract: 560,
  claim: 420,
} as const;

/** JSON Schema for the clerk's `file_drawing` tool (strict mode compatible). */
export const MACHINE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "inventor", "abstract", "claims", "parts", "connections"],
  properties: {
    title: {
      type: "string",
      description: `Formal title of the invention, e.g. "Apparatus for the Distillation of Mild Regret". At most ${LIMITS.title} characters.`,
    },
    inventor: {
      type: "string",
      description: "The inventor's name as it should appear on the sheet.",
    },
    abstract: {
      type: "string",
      description: "One paragraph, 2-3 sentences, formal patent prose, under 90 words.",
    },
    claims: {
      type: "array",
      description:
        "2 to 4 claims. Claim 1 is independent ('1. An apparatus for ..., comprising: ...'). Later claims depend on it ('2. The apparatus of claim 1, wherein ...'). Each under 70 words. Refer to parts by their labels.",
      items: { type: "string" },
    },
    parts: {
      type: "array",
      description: `Between 3 and ${LIMITS.parts} parts. Order them from most to least important; the first part is drawn at the center of the figure.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "size", "label"],
        properties: {
          id: { type: "string", description: "Short unique id, e.g. 'p1'." },
          type: { type: "string", enum: [...PART_TYPES] },
          size: { type: "string", enum: [...SIZES] },
          label: {
            type: "string",
            description: `Name used in the reference key, e.g. 'Primary Sorrow Boiler'. At most ${LIMITS.label} characters.`,
          },
        },
      },
    },
    connections: {
      type: "array",
      description: `At most ${LIMITS.connections}. Every part should be connected to at least one other part.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "kind", "label"],
        properties: {
          from: { type: "string", description: "id of a part" },
          to: { type: "string", description: "id of a different part" },
          kind: { type: "string", enum: [...CONNECTION_KINDS] },
          label: {
            type: "string",
            description: "Name for the run if it deserves a reference numeral (e.g. 'Steam Conduit'), otherwise empty string.",
          },
        },
      },
    },
  },
} as const;

function clean(s: unknown, max: number): string {
  const text = String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, "") + "...";
}

/**
 * Coerces anything the model returned into a Machine the renderer can always draw:
 * drops unknown part types and dangling connections, dedupes ids, and enforces caps.
 * Returns null when there is nothing drawable.
 */
export function sanitizeMachine(raw: unknown): Machine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const parts: Part[] = [];
  const ids = new Set<string>();
  for (const p of Array.isArray(r.parts) ? r.parts : []) {
    if (!p || typeof p !== "object") continue;
    const q = p as Record<string, unknown>;
    const type = String(q.type) as PartType;
    if (!PART_TYPES.includes(type)) continue;
    let id = clean(q.id, 24) || `p${parts.length + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    const size = (SIZES as readonly string[]).includes(String(q.size)) ? (q.size as Size) : "medium";
    const label = clean(q.label, LIMITS.label) || type.replace("_", " ");
    parts.push({ id, type, size, label });
    if (parts.length >= LIMITS.parts) break;
  }
  if (parts.length === 0) return null;

  const connections: Connection[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.connections) ? r.connections : []) {
    if (!c || typeof c !== "object") continue;
    const q = c as Record<string, unknown>;
    const from = String(q.from);
    const to = String(q.to);
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    const key = [from, to].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = (CONNECTION_KINDS as readonly string[]).includes(String(q.kind))
      ? (q.kind as ConnectionKind)
      : "pipe";
    connections.push({ from, to, kind, label: clean(q.label, LIMITS.label) });
    if (connections.length >= LIMITS.connections) break;
  }

  const claims = (Array.isArray(r.claims) ? r.claims : [])
    .map((c) => clean(c, LIMITS.claim))
    .filter(Boolean)
    .slice(0, LIMITS.claims);

  return {
    title: clean(r.title, LIMITS.title) || "Improved Apparatus",
    inventor: clean(r.inventor, LIMITS.inventor) || "Unnamed Inventor",
    abstract: clean(r.abstract, LIMITS.abstract),
    claims,
    parts,
    connections,
  };
}
