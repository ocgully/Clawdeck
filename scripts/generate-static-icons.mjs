#!/usr/bin/env node
/**
 * Generates the static SVG icons the manifest references (action list icons,
 * marketplace/category art). The live tile faces are drawn at runtime by
 * src/icons/render.ts — these are just the at-rest catalog images.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(root, "com.claudedeck.aikeyboard.sdPlugin", "imgs");

const BG = "#111318";
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const frame = (s) =>
  `<rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="${s * 0.13}" fill="${BG}"/>`;

function ring(cx, cy, r, color, sw = 5) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
}

// Each icon rendered at 1x (20) and 2x (40) as the SDK expects for list icons,
// plus a larger 288 marketplace tile.
const icons = {
  "actions/session": (s) =>
    frame(s) +
    ring(s / 2, s * 0.42, s * 0.24, "#22C55E", s * 0.05) +
    `<text x="${s / 2}" y="${s * 0.42}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="${s * 0.22}" font-weight="700" fill="#F9FAFB">AI</text>` +
    dot(s * 0.32, s * 0.8, "#6B7280", s) +
    dot(s * 0.5, s * 0.8, "#EAB308", s) +
    dot(s * 0.68, s * 0.8, "#EF4444", s),
  "actions/pager": (s) =>
    frame(s) +
    `<path d="M${s * 0.4} ${s * 0.3} L${s * 0.66} ${s * 0.5} L${s * 0.4} ${s * 0.7} Z" fill="#E5E7EB"/>` +
    ring(s / 2, s / 2, s * 0.42, "#22C55E", s * 0.04),
  "actions/attention": (s) =>
    frame(s) +
    `<circle cx="${s / 2}" cy="${s * 0.44}" r="${s * 0.22}" fill="#EAB308"/>` +
    `<text x="${s / 2}" y="${s * 0.44}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="${s * 0.26}" font-weight="800" fill="#0B0D11">!</text>`,
  "actions/monitor": (s) =>
    frame(s) +
    `<rect x="${s * 0.22}" y="${s * 0.24}" width="${s * 0.56}" height="${s * 0.4}" rx="${s * 0.04}" fill="none" stroke="#38BDF8" stroke-width="${s * 0.04}"/>` +
    `<path d="M${s * 0.3} ${s * 0.5} L${s * 0.42} ${s * 0.38} L${s * 0.52} ${s * 0.52} L${s * 0.7} ${s * 0.32}" fill="none" stroke="#22C55E" stroke-width="${s * 0.045}" stroke-linecap="round" stroke-linejoin="round"/>`,
  "plugin/marketplace": (s) =>
    `<rect width="${s}" height="${s}" rx="${s * 0.18}" fill="${BG}"/>` +
    ring(s / 2, s * 0.42, s * 0.22, "#22C55E", s * 0.03) +
    `<text x="${s / 2}" y="${s * 0.42}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="${s * 0.18}" font-weight="800" fill="#F9FAFB">CD</text>` +
    `<text x="${s / 2}" y="${s * 0.74}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${s * 0.1}" font-weight="700" fill="#9CA3AF">ClaudeDeck</text>`,
  "plugin/category": (s) =>
    frame(s) +
    ring(s / 2, s / 2, s * 0.3, "#22C55E", s * 0.06),
};

function dot(x, y, color, s) {
  return `<circle cx="${x}" cy="${y}" r="${s * 0.05}" fill="${color}"/>`;
}

for (const [name, draw] of Object.entries(icons)) {
  const dir = path.join(base, path.dirname(name));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(base, name);
  if (name.startsWith("plugin/")) {
    fs.writeFileSync(`${file}.svg`, svg(288, 288, draw(288)));
  } else {
    fs.writeFileSync(`${file}.svg`, svg(20, 20, draw(20)));
    fs.writeFileSync(`${file}@2x.svg`, svg(40, 40, draw(40)));
  }
}

console.log(`✓ Wrote static icons to ${base}`);
