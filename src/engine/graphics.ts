// A subset of java.awt.Graphics2D, so component painting code can be ported
// from Logisim almost line by line. The canvas implementation lives in
// src/render/canvas-graphics.ts.

import type { Font } from "./attributes";

export const H_LEFT = -1;
export const H_CENTER = 0;
export const H_RIGHT = 1;
export const V_TOP = -1;
export const V_CENTER = 0;
export const V_BASELINE = 1;
export const V_BOTTOM = 2;
export const V_CENTER_OVERALL = 3;

export interface TextMetrics {
	width: number;
	ascent: number;
	descent: number;
}

export type PathCommand =
	| { op: "M"; x: number; y: number }
	| { op: "L"; x: number; y: number }
	| { op: "Q"; cx: number; cy: number; x: number; y: number }
	| { op: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
	| { op: "Z" };

export interface Graphics {
	getColor(): string;
	setColor(color: string): void;
	/** GraphicsUtil.switchToWidth */
	setLineWidth(width: number): void;
	getFont(): Font;
	setFont(font: Font): void;
	setAlpha(alpha: number): void;

	/** Push/pop the full state (Graphics.create / dispose). */
	save(): void;
	restore(): void;
	translate(dx: number, dy: number): void;
	rotate(radians: number, cx?: number, cy?: number): void;

	drawLine(x0: number, y0: number, x1: number, y1: number): void;
	drawRect(x: number, y: number, w: number, h: number): void;
	fillRect(x: number, y: number, w: number, h: number): void;
	drawRoundRect(x: number, y: number, w: number, h: number, arcW: number, arcH: number): void;
	fillRoundRect(x: number, y: number, w: number, h: number, arcW: number, arcH: number): void;
	drawOval(x: number, y: number, w: number, h: number): void;
	fillOval(x: number, y: number, w: number, h: number): void;
	/** Java semantics: angles in degrees, counter-clockwise from 3 o'clock. */
	drawArc(x: number, y: number, w: number, h: number, start: number, extent: number): void;
	fillArc(x: number, y: number, w: number, h: number, start: number, extent: number): void;
	drawPolyline(xs: readonly number[], ys: readonly number[]): void;
	drawPolygon(xs: readonly number[], ys: readonly number[]): void;
	fillPolygon(xs: readonly number[], ys: readonly number[]): void;
	drawPath(path: readonly PathCommand[]): void;
	fillPath(path: readonly PathCommand[]): void;
	/** Draw text with its baseline at y. */
	drawString(text: string, x: number, y: number): void;
	measureText(text: string, font?: Font): TextMetrics;
}

export function textBounds(
	g: Pick<Graphics, "measureText">,
	text: string,
	x: number,
	y: number,
	halign: number,
	valign: number,
	font?: Font,
): { x: number; y: number; width: number; height: number; ascent: number } {
	const m = g.measureText(text, font);
	const height = m.ascent + m.descent;
	let rx = x;
	let ry = y;
	if (halign === H_CENTER) rx -= Math.trunc(m.width / 2);
	else if (halign === H_RIGHT) rx -= m.width;
	switch (valign) {
		case V_CENTER:
			ry -= Math.trunc(m.ascent / 2);
			break;
		case V_CENTER_OVERALL:
			ry -= Math.trunc(height / 2);
			break;
		case V_BASELINE:
			ry -= m.ascent;
			break;
		case V_BOTTOM:
			ry -= height;
			break;
		default:
			break;
	}
	return { x: rx, y: ry, width: m.width, height, ascent: m.ascent };
}

/** GraphicsUtil.drawText */
export function drawText(
	g: Graphics,
	text: string,
	x: number,
	y: number,
	halign: number,
	valign: number,
): void {
	if (text.length === 0) return;
	const bd = textBounds(g, text, x, y, halign, valign);
	g.drawString(text, bd.x, bd.y + bd.ascent);
}

/** GraphicsUtil.drawCenteredText */
export function drawCenteredText(g: Graphics, text: string, x: number, y: number): void {
	drawText(g, text, x, y, H_CENTER, V_CENTER);
}

/** GraphicsUtil.drawCenteredArc */
export function drawCenteredArc(
	g: Graphics,
	x: number,
	y: number,
	r: number,
	start: number,
	dist: number,
): void {
	g.drawArc(x - r, y - r, 2 * r, 2 * r, start, dist);
}

/**
 * A text measurer used when no Graphics is at hand (e.g. computing bounds of
 * tunnels and text components). The renderer installs a canvas-based one.
 */
let measurer: (text: string, font: Font) => TextMetrics = (text, font) => ({
	width: Math.round(font.size * 0.6 * text.length),
	ascent: Math.round(font.size * 0.93),
	descent: Math.round(font.size * 0.22),
});

export function setTextMeasurer(fn: (text: string, font: Font) => TextMetrics): void {
	measurer = fn;
}

export function measureText(text: string, font: Font): TextMetrics {
	return measurer(text, font);
}
