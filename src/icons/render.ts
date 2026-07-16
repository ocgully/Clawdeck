import {
  type SessionInfo,
  type SessionStatus,
  STATUS_COLOR,
} from "../types";

/**
 * The icon engine. Every tile face is an SVG string rendered to a base64
 * data-URI and pushed with setImage. Keys are 144x144 on modern hardware;
 * we draw in that coordinate space and let the deck downscale.
 *
 * Nothing here touches the filesystem or a canvas — it's all strings, which
 * keeps `npm install` free of native builds and makes tiles instant to redraw.
 */

const SIZE = 144;
const BG = "#111318";

export function toDataUri(svgBody: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${svgBody}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function frame(fill = BG): string {
  return `<rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" rx="18" fill="${fill}"/>`;
}

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return "··";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** A rotating arc used as the "running" spinner. phase in [0, 1). */
function spinnerArc(cx: number, cy: number, r: number, color: string, phase: number): string {
  const start = phase * Math.PI * 2;
  const sweep = Math.PI * 1.4;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(start + sweep);
  const y2 = cy + r * Math.sin(start + sweep);
  const large = sweep > Math.PI ? 1 : 0;
  return `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

/** A live session tile: status ring, project initials, state caption. */
export function sessionTile(info: SessionInfo, spinnerPhase = 0): string {
  const color = STATUS_COLOR[info.status];
  const ring =
    info.status === "running"
      ? spinnerArc(72, 58, 40, color, spinnerPhase)
      : `<circle cx="72" cy="58" r="40" fill="none" stroke="${color}" stroke-width="6"/>`;

  const caption = statusCaption(info);
  const now = Date.now();
  // Sub-line: elapsed wait while yellow, the error reason while red, else project.
  let sub = clip(info.project, 14);
  let subColor = "#6B7280";
  if (info.status === "waiting") {
    sub = elapsed(now - info.updatedAt);
    subColor = "#9CA3AF";
  } else if (info.status === "error" && info.note) {
    sub = clip(info.note, 14);
    subColor = color;
  }

  return toDataUri(
    frame() +
      ring +
      `<text x="72" y="58" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#F9FAFB">${esc(initials(info.project))}</text>` +
      `<text x="72" y="108" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="600" fill="${color}">${esc(caption)}</text>` +
      `<text x="72" y="130" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="${subColor}">${esc(sub)}</text>`,
  );
}

function statusCaption(info: SessionInfo): string {
  switch (info.status) {
    case "running":
      return "Working";
    case "waiting":
      return "Needs you";
    case "error":
      return "Error";
    case "ended":
      return "Ended";
    default:
      return "Idle";
  }
}

/** An unassigned session slot. */
export function emptyTile(): string {
  return toDataUri(
    frame("#0B0D11") +
      `<circle cx="72" cy="62" r="34" fill="none" stroke="#232833" stroke-width="4" stroke-dasharray="6 8"/>` +
      `<text x="72" y="118" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#3B4252">empty</text>`,
  );
}

/** The prev/next pager tile. Shows the view label and an ambient status edge. */
export function pagerTile(
  direction: "next" | "prev",
  viewLabel: string,
  index: number,
  count: number,
  glow: SessionStatus,
): string {
  const glowColor = STATUS_COLOR[glow];
  // Vertical arrows: "next" points up (top-right key), "prev" points down.
  const arrow =
    direction === "next"
      ? `<path d="M48 84 L72 52 L96 84 Z" fill="#E5E7EB"/>`
      : `<path d="M48 60 L72 92 L96 60 Z" fill="#E5E7EB"/>`;
  const dots = Array.from({ length: Math.min(count, 6) }, (_, i) => {
    const x = 72 - (Math.min(count, 6) - 1) * 6 + i * 12;
    return `<circle cx="${x}" cy="128" r="3.5" fill="${i === index % 6 ? "#F9FAFB" : "#374151"}"/>`;
  }).join("");

  const edge =
    glow === "idle"
      ? ""
      : `<rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" rx="18" fill="none" stroke="${glowColor}" stroke-width="5" opacity="0.9"/>`;

  return toDataUri(
    frame() +
      edge +
      arrow +
      `<text x="72" y="26" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="600" fill="#9CA3AF">${esc(clip(viewLabel, 12))}</text>` +
      dots,
  );
}

/** The "jump to who needs me" tile. Dark when calm, pulsing when not. */
export function attentionTile(
  urgent: SessionInfo | undefined,
  pulsePhase = 0,
): string {
  if (!urgent) {
    return toDataUri(
      frame("#0B0D11") +
        `<circle cx="72" cy="60" r="26" fill="none" stroke="#22C55E" stroke-width="5"/>` +
        `<path d="M60 60 L69 69 L86 50" fill="none" stroke="#22C55E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<text x="72" y="118" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="600" fill="#4B5563">all clear</text>`,
    );
  }
  const color = STATUS_COLOR[urgent.status];
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(pulsePhase * Math.PI));
  return toDataUri(
    frame() +
      `<circle cx="72" cy="58" r="${34 + pulse * 6}" fill="${color}" opacity="${(pulse * 0.25).toFixed(2)}"/>` +
      `<circle cx="72" cy="58" r="30" fill="${color}"/>` +
      `<text x="72" y="58" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="800" fill="#0B0D11">!</text>` +
      `<text x="72" y="108" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="${color}">${esc(urgent.status === "waiting" ? "Needs you" : "Error")}</text>` +
      `<text x="72" y="130" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#9CA3AF">${esc(clip(urgent.project, 14))}</text>`,
  );
}

/** The Skills key: shows runnable skills for the selected/focused session. */
export function skillsTile(subtitle: string, count?: number): string {
  const spark =
    `<path d="M72 40 L78 60 L98 66 L78 72 L72 92 L66 72 L46 66 L66 60 Z" fill="#A78BFA"/>` +
    `<circle cx="100" cy="44" r="4" fill="#A78BFA"/>` +
    `<circle cx="44" cy="92" r="3" fill="#A78BFA"/>`;
  return toDataUri(
    frame() +
      `<text x="72" y="24" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#E5E7EB">Skills${count ? ` (${count})` : ""}</text>` +
      spark +
      `<text x="72" y="118" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="#9CA3AF">${esc(clip(subtitle, 15))}</text>`,
  );
}

export type MonitorLevel = "ok" | "warn" | "alert" | "info" | "running" | "unknown";

const MONITOR_COLOR: Record<MonitorLevel, string> = {
  ok: "#22C55E",
  warn: "#EAB308",
  alert: "#EF4444",
  info: "#38BDF8",
  running: "#8B5CF6",
  unknown: "#6B7280",
};

/** A scriptable monitor-loop tile. Color + caption come from the script. */
export function monitorTile(
  title: string,
  level: MonitorLevel,
  caption: string,
  spinnerPhase = 0,
): string {
  const color = MONITOR_COLOR[level];
  const glyph =
    level === "running"
      ? spinnerArc(72, 56, 26, color, spinnerPhase)
      : `<circle cx="72" cy="56" r="26" fill="${color}"/>`;
  return toDataUri(
    frame() +
      `<text x="72" y="24" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#E5E7EB">${esc(clip(title, 12))}</text>` +
      glyph +
      `<text x="72" y="112" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="600" fill="${color}">${esc(clip(caption, 14))}</text>`,
  );
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
