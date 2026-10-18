import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { askClerk } from "@/lib/clerk/anthropic";
import { demoClerk } from "@/lib/clerk/demo";
import type { Turn } from "@/lib/clerk/types";
import { sanitizeMachine } from "@/lib/machine/schema";

export const runtime = "nodejs";

const MAX_TURNS = 60;
const MAX_CHARS = 2000;

function parseTurns(body: unknown): Turn[] | null {
  const raw = (body as { turns?: unknown })?.turns;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TURNS) return null;
  const turns: Turn[] = [];
  for (const t of raw) {
    const role = t?.role;
    if (role !== "user" && role !== "assistant") return null;
    const text = String(t.text ?? "").slice(0, MAX_CHARS);
    const machine = t.machine ? sanitizeMachine(t.machine) ?? undefined : undefined;
    const toolUseId = typeof t.toolUseId === "string" && /^[\w-]{1,80}$/.test(t.toolUseId) ? t.toolUseId : undefined;
    turns.push({ role, text, ...(role === "assistant" && machine && toolUseId ? { machine, toolUseId } : {}) });
  }
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

export async function POST(req: Request) {
  const turns = parseTurns(await req.json().catch(() => null));
  if (!turns) return NextResponse.json({ error: "Malformed conversation." }, { status: 400 });

  if (process.env.CLERK_MODE === "demo") return NextResponse.json(demoClerk(turns));

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server. See .env.example." }, { status: 500 });
  }
  try {
    return NextResponse.json(await askClerk(turns));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "The Office is overwhelmed with applications. Please try again shortly." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return NextResponse.json({ error: `The clerk could not be reached (${err.status ?? "network"}).` }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "The clerk could not be reached." }, { status: 500 });
  }
}
