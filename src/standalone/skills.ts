import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Discovers the slash-command skills available on this machine and ranks them
 * by how often you've run them from the deck (so the ones you use float to the
 * first page), falling back to alphabetical. Covers plugin skills, user skills
 * (~/.claude/skills), and project-local skills (<cwd>/.claude/skills).
 */
export interface Skill {
  /** Slash-command name from SKILL.md frontmatter, e.g. "gsd:docs-update". */
  id: string;
  description: string;
}

const usagePath = join(homedir(), ".claude", "clawdeck", "skill-usage.json");

export function discoverSkills(cwd: string): Skill[] {
  const roots = [
    join(homedir(), ".claude", "plugins"),
    join(homedir(), ".claude", "skills"),
    cwd ? join(cwd, ".claude", "skills") : "",
  ].filter(Boolean);

  const found = new Map<string, Skill>();
  for (const root of roots) {
    for (const file of findSkillFiles(root, 6)) {
      const skill = parseSkill(file);
      if (skill && !found.has(skill.id)) found.set(skill.id, skill);
    }
  }
  return rankByUsage([...found.values()]);
}

/** Bounded recursive search for SKILL.md files. */
function findSkillFiles(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full, depth + 1);
      else if (name === "SKILL.md") out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

function parseSkill(file: string): Skill | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return undefined;
  const name = /^name:\s*(.+)$/m.exec(fm[1]!)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!name) return undefined;
  const description =
    /^description:\s*(.+)$/m.exec(fm[1]!)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return { id: name, description };
}

// --- usage tracking -------------------------------------------------------

type Usage = Record<string, { count: number; last: number }>;

function readUsage(): Usage {
  try {
    return JSON.parse(readFileSync(usagePath, "utf8")) as Usage;
  } catch {
    return {};
  }
}

export function recordSkillUse(id: string, now: number): void {
  const usage = readUsage();
  const cur = usage[id] ?? { count: 0, last: 0 };
  usage[id] = { count: cur.count + 1, last: now };
  try {
    mkdirSync(dirname(usagePath), { recursive: true });
    writeFileSync(usagePath, JSON.stringify(usage, null, 2));
  } catch {
    /* best effort */
  }
}

function rankByUsage(skills: Skill[]): Skill[] {
  const usage = readUsage();
  return skills.sort((a, b) => {
    const ua = usage[a.id];
    const ub = usage[b.id];
    if ((ua?.count ?? 0) !== (ub?.count ?? 0)) return (ub?.count ?? 0) - (ua?.count ?? 0);
    if ((ua?.last ?? 0) !== (ub?.last ?? 0)) return (ub?.last ?? 0) - (ua?.last ?? 0);
    return a.id.localeCompare(b.id);
  });
}
