import type { SessionStore } from "../state/session-store";

/**
 * Seed the store with a spread of fake sessions so the deck is fully
 * interactive without any real Claude sessions running — enough to overflow
 * onto a second page (so the pager visibly does something) and including a
 * waiting session (so the Attention key lights up). Enabled with CLAUDEDECK_DEMO=1.
 */
export function seedDemo(store: SessionStore): void {
  const now = Date.now();
  const mk = (id: string, project: string, event: string, exit?: number) =>
    store.apply({
      type: "event",
      event,
      session_id: id,
      cwd: `/Users/you/git/${project}`,
      exit_code: exit,
      ts: now,
      term: { termProgram: "Apple_Terminal" },
    });

  const running = ["rocket-api", "payments", "webapp", "mobile-app", "docs-site", "cli-tool", "analytics"];
  running.forEach((p, i) => mk(`r${i}`, p, "UserPromptSubmit"));

  const idle = ["infra", "auth-svc", "search"];
  idle.forEach((p, i) => mk(`i${i}`, p, "Stop"));

  mk("w0", "design-system", "Notification"); // waiting -> Attention lights up
  mk("e0", "billing", "PostToolUse", 1); // errored -> red
  mk("e1", "notifications", "PostToolUse", 1);
}
