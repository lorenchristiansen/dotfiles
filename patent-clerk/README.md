# Patent Clerk

Invent an impossible machine by talking to a dry, formal patent clerk, then see it rendered as a vintage patent drawing on an 11×17 in sheet. The preview is exactly the SVG you download, and the SVG is plotter-ready: strokes only, one color, hatch shading, and all text in a single-stroke Hershey font drawn as paths.

## Setup

Requires Node 20+.

```bash
cd patent-clerk
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | Required for the real clerk. |
| `CLAUDE_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `CLERK_MODE=demo` | Optional. Uses a scripted offline clerk (keyword-based, no API calls). Handy for trying the UI without a key; it is much less clever than the real one. |

Other scripts:

- `npm run render:fixtures` renders the hand-written machines in `fixtures/machines.ts` to `out/*.svg` and `out/*.png` and prints a layout report.
- `npm run build && npm run verify:ui` starts the app with the demo clerk, runs three full conversations (including amendments and a declined request) plus a mobile pass in Chromium, saves screenshots to `out/`, and checks that the downloaded SVG matches the preview and contains no fills or `<text>`. To run it against the real clerk, start the server yourself and set `BASE_URL`.

## How it works

```
browser chat ──POST /api/clerk──▶ Claude (tool: file_drawing, strict JSON schema)
     ▲                                   │
     │◀──────── reply + Machine JSON ────┘
     │
renderSheet(machine) ─▶ SVG string ─▶ preview (inline) and Download SVG (same string)
```

- **The model never writes SVG.** The clerk interviews the applicant (what it does, what powers it, notable components, name) and, after 3 to 6 exchanges, calls the `file_drawing` tool with a `Machine` description. Amendments re-file the complete machine. The system prompt lives in `lib/clerk/prompt.ts`; the API call is in `lib/clerk/anthropic.ts`.
- **The conversation is stateless on the server.** The browser sends the visible turns; earlier drawings are replayed as the tool calls that filed them, so revisions start from the current machine.
- **Safety** is handled in the clerk's instructions: offensive or harmful requests, and recognizable copyrighted or trademarked machines and characters, are declined in character with an invitation to propose something original. Requests use server-side refusal fallbacks, and a refusal is answered in character too.
- **Rendering** (`lib/render`) is deterministic TypeScript that runs in the browser:
  - `parts.ts`: 16 parametric parts (boiler, tank, gear, flywheel, valve, gauge, funnel, crank, spring, glass jar, piston, chimney, conveyor, bellows, lever, horn), each with ports for connections and lead points for callouts.
  - `layout.ts`: places parts breadth-first from the most important one, keeping connections short and parts at least a channel's width apart; shrinks or enlarges the whole figure to fit.
  - `route.ts`: routes pipes, shafts, chains and wires orthogonally around parts on a sparse grid (Dijkstra with bend and crossing penalties, reserved port approaches). Belts between two wheels are drawn as tangent lines.
  - `callouts.ts`: places reference numerals (10, 12, 14, ...) with bowed lead lines. Each numeral is tested against every part, run, numeral and lead line, and lead lines may not cross each other or pass over other parts.
  - `sheet.ts`: border, header (number, dates, inventor, title), Fig. 1 label, abstract, reference numerals, claims, and the title block (witnesses, inventor signature, sheet number).

## Machine JSON schema

This is what the clerk files (`lib/machine/schema.ts`, sent to the API as a strict tool schema). `sanitizeMachine` enforces the caps and drops anything the renderer can't draw.

```ts
interface Machine {
  title: string;        // formal title, up to 100 chars
  inventor: string;     // as it appears on the sheet
  abstract: string;     // one paragraph, under ~90 words
  claims: string[];     // 2-4, formal patent language; claim 1 independent
  parts: Part[];        // 1-12; first is the most important (drawn first)
  connections: Connection[]; // up to 14
}

interface Part {
  id: string;           // unique, e.g. "p1"
  type: "boiler" | "tank" | "gear" | "flywheel" | "valve" | "gauge" | "funnel" | "crank"
      | "spring" | "glass_jar" | "piston" | "chimney" | "conveyor" | "bellows" | "lever" | "horn";
  size: "small" | "medium" | "large";
  label: string;        // name in the reference key, e.g. "Regret Boiler"
}

interface Connection {
  from: string;         // part id
  to: string;           // a different part id
  kind: "pipe" | "belt" | "shaft" | "wire" | "chain";
  label: string;        // "" unless the run gets its own reference numeral
}
```

Example:

```json
{
  "title": "Apparatus for the Distillation of Mild Regret",
  "inventor": "Eleanor P. Whitcombe",
  "abstract": "An apparatus whereby mild regret, introduced by way of a funnel, is heated in a boiler...",
  "claims": [
    "An apparatus for the distillation of mild regret, comprising: a boiler; a funnel communicating with said boiler; and a glass jar receiving the condensate therefrom.",
    "The apparatus of claim 1, wherein a gauge indicates the pressure of remorse within said boiler."
  ],
  "parts": [
    { "id": "b", "type": "boiler", "size": "large", "label": "Regret Boiler" },
    { "id": "f", "type": "funnel", "size": "medium", "label": "Intake Funnel" },
    { "id": "j", "type": "glass_jar", "size": "medium", "label": "Collecting Jar" }
  ],
  "connections": [
    { "from": "f", "to": "b", "kind": "pipe", "label": "" },
    { "from": "b", "to": "j", "kind": "pipe", "label": "Condenser Line" }
  ]
}
```

## Output format

`<svg width="11in" height="17in" viewBox="0 0 1100 1700">` (1 unit = 0.01 in), with a single `<g fill="none" stroke="#000">` holding five `<path>` layers: `frame`, `parts`, `runs`, `leads`, `text`. Only `M L Q A Z` path commands are used.

Hershey font data comes from the `hersheytext` package; see `NOTICE.md`. `scripts/build-fonts.mjs` regenerates `lib/render/fonts/*.json`.
