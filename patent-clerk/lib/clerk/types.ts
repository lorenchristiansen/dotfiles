import type { Machine } from "../machine/schema";

/** One turn of the visible conversation, as the browser keeps it. */
export interface Turn {
  role: "user" | "assistant";
  text: string;
  /** Present on clerk turns that filed a drawing. */
  machine?: Machine;
  toolUseId?: string;
}

export interface ClerkReply {
  reply: string;
  machine: Machine | null;
  toolUseId?: string;
}
