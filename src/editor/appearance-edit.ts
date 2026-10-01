// Geometry of the appearance editor (com.cburch.draw shapes' handles and
// moves), on immutable AppearanceShape values.

import type { AppearanceShape } from "@/engine/appearance";
import type { Font } from "@/engine/attributes";
import { loc, locX, locY } from "@/engine/geom";

export type DrawTool =
	| "select"
	| "text"
	| "line"
	| "curve"
	| "polyline"
	| "rect"
	| "roundrect"
	| "oval"
	| "polygon";

export type PaintType = "stroke" | "fill" | "both";

/** DrawingAttributeSet.DEFAULTS_ALL */
export interface ToolStyle {
	paint: PaintType;
	strokeWidth: number;
	stroke: string;
	fill: string;
	textFill: string;
	rx: number;
	font: Font;
	align: "start" | "middle" | "end";
}

export const DEFAULT_TOOL_STYLE: ToolStyle = {
	paint: "stroke",
	strokeWidth: 1,
	stroke: "#000000",
	fill: "#ffffff",
	textFill: "#000000",
	rx: 10,
	font: { family: "SansSerif", style: "plain", size: 12 },
	align: "middle",
};

export const snap = (v: number) => Math.round(v / 10) * 10;

type Point = [number, number];

/** Handles: points that can be dragged to reshape (none for text, ports and the anchor). */
export function handles(s: AppearanceShape): Point[] {
	switch (s.kind) {
		case "rect":
		case "oval":
			return [
				[s.x, s.y],
				[s.x + s.w, s.y],
				[s.x + s.w, s.y + s.h],
				[s.x, s.y + s.h],
			];
		case "line":
			return [
				[s.x0, s.y0],
				[s.x1, s.y1],
			];
		case "curve":
			return [
				[s.x0, s.y0],
				[s.cx, s.cy],
				[s.x1, s.y1],
			];
		case "poly":
			return s.xs.map((x, i) => [x, s.ys[i]]);
		default:
			return [];
	}
}

/** Move one handle to (x, y); rectangles keep the opposite corner. */
export function moveHandle(s: AppearanceShape, index: number, x: number, y: number): AppearanceShape {
	switch (s.kind) {
		case "rect":
		case "oval": {
			const [ox, oy] = handles(s)[(index + 2) % 4];
			return { ...s, x: Math.min(x, ox), y: Math.min(y, oy), w: Math.abs(x - ox), h: Math.abs(y - oy) };
		}
		case "line":
			return index === 0 ? { ...s, x0: x, y0: y } : { ...s, x1: x, y1: y };
		case "curve":
			if (index === 0) return { ...s, x0: x, y0: y };
			if (index === 1) return { ...s, cx: x, cy: y };
			return { ...s, x1: x, y1: y };
		case "poly": {
			const xs = [...s.xs];
			const ys = [...s.ys];
			xs[index] = x;
			ys[index] = y;
			return { ...s, xs, ys };
		}
		default:
			return s;
	}
}

export function translate(s: AppearanceShape, dx: number, dy: number): AppearanceShape {
	switch (s.kind) {
		case "rect":
		case "oval":
		case "text":
			return { ...s, x: s.x + dx, y: s.y + dy };
		case "line":
			return { ...s, x0: s.x0 + dx, y0: s.y0 + dy, x1: s.x1 + dx, y1: s.y1 + dy };
		case "curve":
			return {
				...s,
				x0: s.x0 + dx,
				y0: s.y0 + dy,
				cx: s.cx + dx,
				cy: s.cy + dy,
				x1: s.x1 + dx,
				y1: s.y1 + dy,
			};
		case "poly":
			return { ...s, xs: s.xs.map((x) => x + dx), ys: s.ys.map((y) => y + dy) };
		case "port":
		case "anchor":
			return { ...s, loc: loc(locX(s.loc) + dx, locY(s.loc) + dy) };
	}
}

/** A new shape drawn by dragging from (x0, y0) to (x1, y1). */
export function createDragged(
	tool: DrawTool,
	style: ToolStyle,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): AppearanceShape | null {
	const paint = {
		paint: style.paint,
		strokeWidth: style.strokeWidth,
		stroke: style.stroke,
		fill: style.fill,
	};
	const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
	switch (tool) {
		case "rect":
		case "roundrect":
			if (box.w === 0 || box.h === 0) return null;
			return { kind: "rect", ...box, rx: tool === "roundrect" ? style.rx : 0, ...paint };
		case "oval":
			if (box.w === 0 || box.h === 0) return null;
			return { kind: "oval", ...box, ...paint };
		case "line":
			if (x0 === x1 && y0 === y1) return null;
			return { kind: "line", x0, y0, x1, y1, ...paint, paint: "stroke" };
		case "curve": {
			if (x0 === x1 && y0 === y1) return null;
			// the control point starts off the middle, perpendicular to the chord
			const mx = (x0 + x1) / 2;
			const my = (y0 + y1) / 2;
			const len = Math.hypot(x1 - x0, y1 - y0);
			const cx = snap(mx - ((y1 - y0) / len) * 20);
			const cy = snap(my + ((x1 - x0) / len) * 20);
			return { kind: "curve", x0, y0, cx, cy, x1, y1, ...paint };
		}
		default:
			return null;
	}
}

export function createPoly(closed: boolean, style: ToolStyle, points: Point[]): AppearanceShape | null {
	if (points.length < (closed ? 3 : 2)) return null;
	return {
		kind: "poly",
		closed,
		xs: points.map((p) => p[0]),
		ys: points.map((p) => p[1]),
		paint: closed ? style.paint : "stroke",
		strokeWidth: style.strokeWidth,
		stroke: style.stroke,
		fill: style.fill,
	};
}

export function createText(style: ToolStyle, x: number, y: number, text: string): AppearanceShape | null {
	if (text.trim() === "") return null;
	return { kind: "text", x, y, text, font: style.font, fill: style.textFill, align: style.align };
}

/** Ports and the anchor tie the appearance to the circuit: they move but are never deleted. */
export function isRemovable(s: AppearanceShape): boolean {
	return s.kind !== "port" && s.kind !== "anchor";
}

/** Bounds of all shapes, for fitting the view. */
export function shapesBounds(shapes: readonly AppearanceShape[]): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	let x0 = Number.POSITIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let x1 = Number.NEGATIVE_INFINITY;
	let y1 = Number.NEGATIVE_INFINITY;
	const add = (x: number, y: number) => {
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	};
	for (const s of shapes) {
		if (s.kind === "port" || s.kind === "anchor") add(locX(s.loc), locY(s.loc));
		else if (s.kind === "text") {
			add(s.x - s.text.length * 4, s.y - s.font.size);
			add(s.x + s.text.length * 4, s.y + 4);
		} else for (const [x, y] of handles(s)) add(x, y);
	}
	if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 100, h: 100 };
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
