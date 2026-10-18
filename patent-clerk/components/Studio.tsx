"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { GREETING } from "@/lib/clerk/prompt";
import type { ClerkReply, Turn } from "@/lib/clerk/types";
import { renderSheet } from "@/lib/render/sheet";

type Line = Turn & { error?: boolean };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "patent";
}

export default function Studio() {
  const [lines, setLines] = useState<Line[]>([{ role: "assistant", text: GREETING }]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const machine = useMemo(() => [...lines].reverse().find((l) => l.machine)?.machine ?? null, [lines]);
  // Filing date is fixed for the session so re-renders are byte-identical.
  const filed = useMemo(() => new Date(), []);
  const svg = useMemo(() => renderSheet(machine, filed).svg, [machine, filed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, pending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    const history = lines.filter((l) => !l.error);
    const next: Line[] = [...history, { role: "user", text }];
    setLines(next);
    setDraft("");
    setPending(true);
    try {
      // The greeting is local; the API conversation starts with the applicant.
      const turns: Turn[] = next.slice(1).map(({ role, text, machine, toolUseId }) => ({ role, text, machine, toolUseId }));
      const res = await fetch("/api/clerk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns }),
      });
      const data = (await res.json()) as ClerkReply & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`);
      setLines([...next, { role: "assistant", text: data.reply, machine: data.machine ?? undefined, toolUseId: data.toolUseId }]);
    } catch (err) {
      // Put the message back so it can be resent.
      setLines([...history, { role: "assistant", text: err instanceof Error ? err.message : String(err), error: true }]);
      setDraft(text);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function download() {
    if (!machine) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(machine.title)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="studio">
      <section className="chat" aria-label="Conversation with the patent clerk">
        <div className="log" ref={logRef} aria-live="polite">
          {lines.map((l, i) => (
            <p key={i} className={`msg ${l.role}${l.error ? " error" : ""}`}>
              {l.text}
            </p>
          ))}
          {pending && (
            <p className="msg assistant typing" aria-label="The clerk is writing">
              <span />
              <span />
              <span />
            </p>
          )}
        </div>
        <form className="compose" onSubmit={send}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={2000}
            aria-label="Your reply"
            autoFocus
          />
          <button type="submit" disabled={pending || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
      <section className="preview" aria-label="Patent drawing">
        <div className="sheet" dangerouslySetInnerHTML={{ __html: svg }} />
        {machine && (
          <button className="download" onClick={download}>
            Download SVG
          </button>
        )}
      </section>
    </main>
  );
}
