import { readFileSync } from "node:fs";

/**
 * The actionable items shown in a session's context view. Each carries the text
 * that gets typed into the session's terminal when you press it.
 */
export interface ActionItem {
  label: string; // short tile caption
  text: string; // what to send to the session (skill invocation or prompt)
  kind: "action" | "suggestion" | "skill";
}

/** Always-available quick actions — reliable regardless of transcript content. */
export const QUICK_ACTIONS: ActionItem[] = [
  { label: "Continue", text: "continue", kind: "action" },
  { label: "Run tests", text: "run the tests", kind: "action" },
  { label: "Commit", text: "commit the changes", kind: "action" },
  { label: "Explain", text: "explain what you just did", kind: "action" },
  { label: "Fix errors", text: "fix the errors", kind: "action" },
];

/**
 * Best-effort: pull candidate follow-ups from the session's last assistant
 * message. We look for offered options and direct questions — the phrasing
 * Claude uses when proposing next steps. Fuzzy by nature; capped and cleaned.
 */
export function parseSuggestions(transcriptPath: string | undefined, max = 4): ActionItem[] {
  if (!transcriptPath) return [];
  const text = lastAssistantText(transcriptPath);
  if (!text) return [];

  const items: ActionItem[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const s = clean(raw);
    if (s.length < 6 || s.length > 120) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ label: shortLabel(s), text: s, kind: "suggestion" });
  };

  for (const line of text.split("\n")) {
    const l = line.trim();
    // Numbered / bulleted options: "1. do X", "- do Y", "* do Z"
    const bullet = /^(?:\d+[.)]|[-*•])\s+(.*)$/.exec(l);
    if (bullet && bullet[1]) push(bullet[1]);
  }
  // Direct questions Claude asked (offer them as choosable prompts/answers).
  for (const m of text.matchAll(/([A-Z][^?\n]{8,120}\?)/g)) {
    if (items.length >= max * 2) break;
    push(m[1]!);
  }
  return items.slice(0, max);
}

function lastAssistantText(path: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type !== "assistant") continue;
    const text = extractText(o.message);
    if (text) return text;
  }
  return undefined;
}

function extractText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && typeof b === "object" && (b as { type?: string }).type === "text")
      .map((b) => (b as { text?: string }).text ?? "")
      .join("\n");
  }
  return undefined;
}

function clean(s: string): string {
  return s
    .replace(/[*_`#]/g, "") // strip markdown emphasis
    .replace(/\s+/g, " ")
    .trim();
}

function shortLabel(s: string): string {
  const words = s.split(" ").slice(0, 3).join(" ");
  return words.length > 16 ? words.slice(0, 15) + "…" : words;
}
