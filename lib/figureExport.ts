"use client";

import { toCanvas } from "html-to-image";
import { GBIF_CITATION } from "./citation";

/**
 * Render a chart's DOM node into a captioned, golden-ratio PNG:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Title                                        │
 *   │ Analyzing: <taxon · place · years>           │
 *   │ ┌──────────────── figure ────────────────┐   │
 *   │ └────────────────────────────────────────┘   │
 *   │ Caption (the card's subtitle)                │
 *   │ ─────────────────────────────────────────    │
 *   │ Data citation · lab credit        view link  │
 *   └──────────────────────────────────────────────┘
 *
 * Elements marked `data-export-exclude` (buttons, downloads) are left out.
 */

export const FIGURE_W = 1618; // golden ratio, 1618 × 1000 CSS px
export const FIGURE_H = 1000;
const SCALE = 2; // output 3236 × 2000 px
const PAD = 48;

const INK = "#080808";
const BLUE_DARK = "#0A3F95";
const BLUE = "#116dff";
const GRAY = "#5f6360";
const RULE = "#E5E7EB";

export interface FigureMeta {
  title: string;
  scope: string;
  caption: string;
  url: string;
  filename: string;
}

export async function exportFigure(node: HTMLElement, meta: FigureMeta): Promise<void> {
  // Let scroll containers (wide tables, heatmaps) render in full while we
  // capture; see `.figure-exporting` in globals.css.
  node.classList.add("figure-exporting");
  let shot: HTMLCanvasElement;
  try {
    shot = await toCanvas(node, {
      pixelRatio: SCALE,
      backgroundColor: "#FFFFFF",
      filter: (el) => !(el instanceof HTMLElement && el.dataset.exportExclude !== undefined),
    });
  } finally {
    node.classList.remove("figure-exporting");
  }

  const canvas = document.createElement("canvas");
  canvas.width = FIGURE_W * SCALE;
  canvas.height = FIGURE_H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, FIGURE_W, FIGURE_H);

  const family = getComputedStyle(document.body).fontFamily || "Helvetica, Arial, sans-serif";
  const font = (px: number, weight = 400) => `${weight} ${px}px ${family}`;
  const inner = FIGURE_W - 2 * PAD;

  // Header
  let y = PAD;
  ctx.textBaseline = "top";
  ctx.fillStyle = BLUE_DARK;
  ctx.font = font(34, 700);
  ctx.fillText(meta.title, PAD, y, inner);
  y += 46;
  ctx.fillStyle = GRAY;
  ctx.font = font(19);
  ctx.fillText(`Analyzing: ${meta.scope}`, PAD, y, inner);
  y += 38;

  // Footer (measured first so the figure gets the remaining space)
  ctx.font = font(18);
  const captionLines = wrap(ctx, meta.caption, inner).slice(0, 3);
  ctx.font = font(15);
  const credit = "Indiana Insect Biodiversity · Insect Diversity and Diagnostics Lab, Purdue University Department of Entomology";
  const citeLines = wrap(ctx, `Data: ${GBIF_CITATION}`, inner * 0.62);
  const footerH = captionLines.length * 26 + 18 + 1 + 14 + Math.max(citeLines.length + 1, 2) * 21;
  const figTop = y;
  const figBottom = FIGURE_H - PAD - footerH - 12;

  // Figure, scaled to fit (captured at 2×, so upscaling to 1.6× stays crisp)
  const availW = inner;
  const availH = figBottom - figTop;
  const srcW = shot.width / SCALE;
  const srcH = shot.height / SCALE;
  const k = Math.min(availW / srcW, availH / srcH, 1.6);
  const w = srcW * k;
  const h = srcH * k;
  ctx.drawImage(shot, PAD + (availW - w) / 2, figTop + (availH - h) / 2, w, h);

  // Caption
  y = figBottom + 12;
  ctx.fillStyle = INK;
  ctx.font = font(18);
  for (const line of captionLines) {
    ctx.fillText(line, PAD, y);
    y += 26;
  }
  y += 18;
  ctx.fillStyle = RULE;
  ctx.fillRect(PAD, y, inner, 1);
  y += 15;

  // Citation (left) and link back (right)
  ctx.fillStyle = GRAY;
  ctx.font = font(15);
  let cy = y;
  for (const line of citeLines) {
    ctx.fillText(line, PAD, cy);
    cy += 21;
  }
  ctx.fillText(credit, PAD, cy, inner * 0.62);
  ctx.textAlign = "right";
  ctx.fillStyle = BLUE;
  ctx.font = font(16, 700);
  ctx.fillText("Explore this view:", FIGURE_W - PAD, y);
  ctx.font = font(15);
  const urlLines = wrap(ctx, meta.url.replace(/^https?:\/\//, ""), inner * 0.36, /(?<=[/?&=])/);
  let uy = y + 22;
  for (const line of urlLines.slice(0, 3)) {
    ctx.fillText(line, FIGURE_W - PAD, uy);
    uy += 20;
  }
  ctx.textAlign = "left";

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = meta.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  splitter: RegExp = /(?<=\s)/,
): string[] {
  const tokens = text.replace(/\s+/g, " ").trim().split(splitter);
  const lines: string[] = [];
  let line = "";
  for (const tok of tokens) {
    const next = line + tok;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else {
      line = next;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}
