// Port of com.cburch.logisim.circuit.appear.{CircuitAppearance,
// DefaultAppearance, AppearancePort, AppearanceAnchor} and the SVG shapes of
// com.cburch.draw used by custom subcircuit appearances.

import { childElements, el, getAttr, hasAttr, textContent, type XmlElement } from "../format/xml";
import { type Font, parseFont } from "./attributes";
import type { Circuit } from "./circuit";
import type { Instance } from "./component";
import {
	Bounds,
	compareLoc,
	type Direction,
	dirRadians,
	type Loc,
	loc,
	locX,
	locY,
	parseDirection,
	rotateLoc,
	translateDir,
} from "./geom";
import { drawText, type Graphics, H_CENTER, H_LEFT, H_RIGHT, V_BASELINE } from "./graphics";

type PaintType = "stroke" | "fill" | "both";

interface ShapeStyle {
	paint: PaintType;
	strokeWidth: number;
	stroke: string;
	fill: string;
}

export type AppearanceShape =
	| ({ kind: "rect"; x: number; y: number; w: number; h: number; rx: number } & ShapeStyle)
	| ({ kind: "oval"; x: number; y: number; w: number; h: number } & ShapeStyle)
	| ({ kind: "line"; x0: number; y0: number; x1: number; y1: number } & ShapeStyle)
	| ({ kind: "poly"; closed: boolean; xs: number[]; ys: number[] } & ShapeStyle)
	| ({
			kind: "curve";
			x0: number;
			y0: number;
			cx: number;
			cy: number;
			x1: number;
			y1: number;
	  } & ShapeStyle)
	| {
			kind: "text";
			x: number;
			y: number;
			text: string;
			font: Font;
			fill: string;
			align: "start" | "middle" | "end";
	  }
	| { kind: "port"; loc: Loc; pin: Instance }
	| { kind: "anchor"; loc: Loc; facing: Direction };

const PORT_INPUT_RADIUS = 4;
const PORT_OUTPUT_RADIUS = 5;
const ANCHOR_RADIUS = 3;

function isInputPin(pin: Instance): boolean {
	return pin.attrs.getByName("output") !== true;
}

function pinFacing(pin: Instance): Direction {
	return (pin.attrs.getByName("facing") as Direction) ?? "east";
}

function defaultStyle(): ShapeStyle {
	return { paint: "stroke", strokeWidth: 1, stroke: "#000000", fill: "#ffffff" };
}

/** Exact bounds of a quadratic Bezier (CurveUtil.getBounds). */
function curveBounds(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): Bounds {
	const extent = (a: number, b: number, c: number): [number, number] => {
		let lo = Math.min(a, c);
		let hi = Math.max(a, c);
		const den = a - 2 * b + c;
		if (den !== 0) {
			const t = (a - b) / den;
			if (t > 0 && t < 1) {
				const v = (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * c;
				lo = Math.min(lo, v);
				hi = Math.max(hi, v);
			}
		}
		return [Math.floor(lo), Math.ceil(hi)];
	};
	const [xl, xh] = extent(x0, cx, x1);
	const [yl, yh] = extent(y0, cy, y1);
	return Bounds.create(xl, yl, xh - xl + 1, yh - yl + 1);
}

function shapeBounds(s: AppearanceShape): Bounds {
	switch (s.kind) {
		case "rect":
		case "oval": {
			const b = Bounds.create(s.x, s.y, s.w, s.h);
			if (s.strokeWidth < 2 || s.paint === "fill") return b;
			return b.expand(Math.trunc(s.strokeWidth / 2));
		}
		case "line": {
			const x = Math.min(s.x0, s.x1);
			const y = Math.min(s.y0, s.y1);
			return Bounds.create(x, y, Math.abs(s.x1 - s.x0) + 1, Math.abs(s.y1 - s.y0) + 1).expand(
				Math.max(1, Math.trunc(s.strokeWidth / 2)),
			);
		}
		case "poly": {
			let b = Bounds.EMPTY;
			for (let i = 0; i < s.xs.length; i++) b = b.addPoint(s.xs[i], s.ys[i]);
			return s.strokeWidth < 2 ? b : b.expand(Math.trunc(s.strokeWidth / 2));
		}
		case "curve":
			return curveBounds(s.x0, s.y0, s.cx, s.cy, s.x1, s.y1);
		case "text": {
			const w = Math.round(s.font.size * 0.6 * s.text.length);
			const x = s.align === "start" ? s.x : s.align === "end" ? s.x - w : s.x - w / 2;
			return Bounds.create(Math.floor(x), s.y - s.font.size, w, Math.round(s.font.size * 1.2));
		}
		case "port": {
			const r = isInputPin(s.pin) ? PORT_INPUT_RADIUS : PORT_OUTPUT_RADIUS;
			return Bounds.create(locX(s.loc) - r, locY(s.loc) - r, 2 * r, 2 * r);
		}
		case "anchor": {
			const b = Bounds.create(
				locX(s.loc) - ANCHOR_RADIUS,
				locY(s.loc) - ANCHOR_RADIUS,
				2 * ANCHOR_RADIUS,
				2 * ANCHOR_RADIUS,
			);
			return b.addLoc(translateDir(s.loc, s.facing, ANCHOR_RADIUS + 8));
		}
	}
}

export function paintShape(g: Graphics, s: AppearanceShape): void {
	g.save();
	switch (s.kind) {
		case "text": {
			g.setColor(s.fill);
			g.setFont(s.font);
			const ha = s.align === "start" ? H_LEFT : s.align === "end" ? H_RIGHT : H_CENTER;
			drawText(g, s.text, s.x, s.y, ha, V_BASELINE);
			break;
		}
		case "port": {
			const x = locX(s.loc);
			const y = locY(s.loc);
			g.setColor("#0000ff");
			g.setLineWidth(1);
			if (isInputPin(s.pin)) {
				const r = PORT_INPUT_RADIUS;
				g.drawRect(x - r, y - r, 2 * r, 2 * r);
			} else {
				const r = PORT_OUTPUT_RADIUS;
				g.drawOval(x - r, y - r, 2 * r, 2 * r);
			}
			g.fillOval(x - 2, y - 2, 4, 4);
			break;
		}
		case "anchor": {
			const x = locX(s.loc);
			const y = locY(s.loc);
			g.setColor("#008000");
			g.setLineWidth(1);
			g.drawOval(x - ANCHOR_RADIUS, y - ANCHOR_RADIUS, 2 * ANCHOR_RADIUS, 2 * ANCHOR_RADIUS);
			const e0 = translateDir(s.loc, s.facing, ANCHOR_RADIUS);
			const e1 = translateDir(s.loc, s.facing, ANCHOR_RADIUS + 8);
			g.drawLine(locX(e0), locY(e0), locX(e1), locY(e1));
			break;
		}
		default: {
			const fill = s.paint !== "stroke";
			const stroke = s.paint !== "fill";
			const doFill = (fn: () => void) => {
				if (fill) {
					g.setColor(s.fill);
					fn();
				}
			};
			const doStroke = (fn: () => void) => {
				if (stroke) {
					g.setColor(s.stroke);
					g.setLineWidth(s.strokeWidth);
					fn();
				}
			};
			if (s.kind === "rect") {
				if (s.rx > 0) {
					doFill(() => g.fillRoundRect(s.x, s.y, s.w, s.h, 2 * s.rx, 2 * s.rx));
					doStroke(() => g.drawRoundRect(s.x, s.y, s.w, s.h, 2 * s.rx, 2 * s.rx));
				} else {
					doFill(() => g.fillRect(s.x, s.y, s.w, s.h));
					doStroke(() => g.drawRect(s.x, s.y, s.w, s.h));
				}
			} else if (s.kind === "oval") {
				doFill(() => g.fillOval(s.x, s.y, s.w, s.h));
				doStroke(() => g.drawOval(s.x, s.y, s.w, s.h));
			} else if (s.kind === "line") {
				g.setColor(s.stroke);
				g.setLineWidth(s.strokeWidth);
				g.drawLine(s.x0, s.y0, s.x1, s.y1);
			} else if (s.kind === "poly") {
				if (s.closed) {
					doFill(() => g.fillPolygon(s.xs, s.ys));
					doStroke(() => g.drawPolygon(s.xs, s.ys));
				} else {
					g.setColor(s.stroke);
					g.setLineWidth(s.strokeWidth);
					g.drawPolyline(s.xs, s.ys);
				}
			} else if (s.kind === "curve") {
				const path = [
					{ op: "M" as const, x: s.x0, y: s.y0 },
					{ op: "Q" as const, cx: s.cx, cy: s.cy, x: s.x1, y: s.y1 },
				];
				doFill(() => g.fillPath(path));
				doStroke(() => g.drawPath(path));
			}
		}
	}
	g.restore();
}

/** DefaultAppearance.build */
/** DefaultAppearance.sortPinList: along the edge the pins sit on. */
function sortPinList(pins: Instance[], facing: Direction): void {
	const byX = facing === "north" || facing === "south";
	pins.sort((a, b) => {
		if (byX) {
			if (a.x !== b.x) return a.x < b.x ? -1 : 1;
		} else if (a.y !== b.y) {
			return a.y < b.y ? -1 : 1;
		}
		return compareLoc(a.loc, b.loc);
	});
}

export function buildDefaultAppearance(pins: Instance[]): AppearanceShape[] {
	const edge: Record<Direction, Instance[]> = { north: [], south: [], east: [], west: [] };
	for (const pin of pins) {
		const pinEdge = ((): Direction => {
			switch (pinFacing(pin)) {
				case "east":
					return "west";
				case "west":
					return "east";
				case "north":
					return "south";
				case "south":
					return "north";
			}
		})();
		edge[pinEdge].push(pin);
	}
	for (const dir of ["north", "south", "east", "west"] as Direction[]) sortPinList(edge[dir], dir);
	const numNorth = edge.north.length;
	const numSouth = edge.south.length;
	const numEast = edge.east.length;
	const numWest = edge.west.length;
	const maxVert = Math.max(numNorth, numSouth);
	const maxHorz = Math.max(numEast, numWest);
	const offsNorth = computeOffset(numNorth, numSouth, maxHorz);
	const offsSouth = computeOffset(numSouth, numNorth, maxHorz);
	const offsEast = computeOffset(numEast, numWest, maxVert);
	const offsWest = computeOffset(numWest, numEast, maxVert);

	const width = computeDimension(maxVert, maxHorz);
	const height = computeDimension(maxHorz, maxVert);

	let ax: number;
	let ay: number;
	if (numEast > 0) {
		ax = width;
		ay = offsEast;
	} else if (numNorth > 0) {
		ax = offsNorth;
		ay = 0;
	} else if (numWest > 0) {
		ax = 0;
		ay = offsWest;
	} else if (numSouth > 0) {
		ax = offsSouth;
		ay = height;
	} else {
		ax = 0;
		ay = 0;
	}

	const OFFS = 50;
	const rx = OFFS + (9 - ((ax + 9) % 10));
	const ry = OFFS + (9 - ((ay + 9) % 10));

	const ret: AppearanceShape[] = [];
	ret.push({
		kind: "curve",
		x0: rx + Math.trunc((width - 8) / 2),
		y0: ry + 1,
		cx: rx + Math.trunc(width / 2),
		cy: ry + 11,
		x1: rx + Math.trunc((width + 8) / 2),
		y1: ry + 1,
		...defaultStyle(),
		strokeWidth: 2,
		stroke: "#808080",
	});
	ret.push({ kind: "rect", x: rx, y: ry, w: width, h: height, rx: 0, ...defaultStyle(), strokeWidth: 2 });
	const place = (list: Instance[], x0: number, y0: number, dx: number, dy: number) => {
		let x = x0;
		let y = y0;
		for (const pin of list) {
			ret.push({ kind: "port", loc: loc(x, y), pin });
			x += dx;
			y += dy;
		}
	};
	place(edge.west, rx, ry + offsWest, 0, 10);
	place(edge.east, rx + width, ry + offsEast, 0, 10);
	place(edge.north, rx + offsNorth, ry, 10, 0);
	place(edge.south, rx + offsSouth, ry + height, 10, 0);
	ret.push({ kind: "anchor", loc: loc(rx + ax, ry + ay), facing: "east" });
	return ret;
}

function computeDimension(maxThis: number, maxOthers: number): number {
	if (maxThis < 3) return 30;
	if (maxOthers === 0) return 10 * maxThis;
	return 10 * maxThis + 10;
}

function computeOffset(numFacing: number, numOpposite: number, maxOthers: number): number {
	const maxThis = Math.max(numFacing, numOpposite);
	let maxOffs: number;
	switch (maxThis) {
		case 0:
		case 1:
			maxOffs = maxOthers === 0 ? 15 : 10;
			break;
		case 2:
			maxOffs = 10;
			break;
		default:
			maxOffs = maxOthers === 0 ? 5 : 10;
	}
	return maxOffs + 10 * Math.trunc((maxThis - numFacing) / 2);
}

function parseColor(hue: string, opacity: string): string {
	const base = hue === "" ? "#000000" : hue.toLowerCase();
	if (opacity === "") return base;
	const a = Math.round(Number.parseFloat(opacity) * 255);
	return a >= 255 ? base : `${base}${a.toString(16).padStart(2, "0")}`;
}

function elementCenter(e: XmlElement): Loc {
	const x = Number.parseFloat(getAttr(e, "x"));
	const y = Number.parseFloat(getAttr(e, "y"));
	const w = Number.parseFloat(getAttr(e, "width"));
	const h = Number.parseFloat(getAttr(e, "height"));
	return loc(Math.round(x + w / 2), Math.round(y + h / 2));
}

/** AppearanceSvgReader.createShape / SvgReader.createShape */
export function readAppearanceShape(e: XmlElement, pins: Map<Loc, Instance>): AppearanceShape | null {
	const int = (n: string) => Number.parseInt(getAttr(e, n), 10);
	if (e.tag === "circ-anchor" || e.tag === "circ-origin") {
		const facing = hasAttr(e, "facing") ? parseDirection(getAttr(e, "facing")) : "east";
		return { kind: "anchor", loc: elementCenter(e), facing };
	}
	if (e.tag === "circ-port") {
		const [px, py] = getAttr(e, "pin")
			.split(",")
			.map((s) => Number.parseInt(s.trim(), 10));
		const pin = pins.get(loc(px, py));
		if (!pin) return null;
		return { kind: "port", loc: elementCenter(e), pin };
	}
	let shape: AppearanceShape;
	switch (e.tag) {
		case "rect":
			shape = {
				kind: "rect",
				x: int("x"),
				y: int("y"),
				w: int("width"),
				h: int("height"),
				rx: hasAttr(e, "rx") ? int("rx") : 0,
				...defaultStyle(),
			};
			break;
		case "ellipse": {
			const cx = Number.parseFloat(getAttr(e, "cx"));
			const cy = Number.parseFloat(getAttr(e, "cy"));
			const rx = Number.parseFloat(getAttr(e, "rx"));
			const ry = Number.parseFloat(getAttr(e, "ry"));
			shape = {
				kind: "oval",
				x: Math.round(cx - rx),
				y: Math.round(cy - ry),
				w: Math.round(rx * 2),
				h: Math.round(ry * 2),
				...defaultStyle(),
			};
			break;
		}
		case "line":
			shape = { kind: "line", x0: int("x1"), y0: int("y1"), x1: int("x2"), y1: int("y2"), ...defaultStyle() };
			break;
		case "polygon":
		case "polyline": {
			const toks = getAttr(e, "points")
				.trim()
				.split(/[ ,\n\r\t]+/)
				.map((t) => Number.parseInt(t, 10));
			const xs: number[] = [];
			const ys: number[] = [];
			for (let i = 0; i + 1 < toks.length; i += 2) {
				xs.push(toks[i]);
				ys.push(toks[i + 1]);
			}
			shape = { kind: "poly", closed: e.tag === "polygon", xs, ys, ...defaultStyle() };
			break;
		}
		case "path": {
			const toks = getAttr(e, "d").match(/[a-zA-Z]|[-0-9.]+/g) ?? [];
			if (toks.length !== 8 || toks[0] !== "M" || toks[3].toUpperCase() !== "Q") return null;
			const n = toks.map((t) => Number.parseInt(t, 10));
			let [cx, cy, x1, y1] = [n[4], n[5], n[6], n[7]];
			if (toks[3] === "q") {
				cx += n[1];
				cy += n[2];
				x1 += n[1];
				y1 += n[2];
			}
			shape = { kind: "curve", x0: n[1], y0: n[2], cx, cy, x1, y1, ...defaultStyle() };
			break;
		}
		case "text": {
			const style = getAttr(e, "font-style") === "italic";
			const bold = getAttr(e, "font-weight") === "bold";
			const anchor = getAttr(e, "text-anchor");
			const fill = getAttr(e, "fill");
			return {
				kind: "text",
				x: int("x"),
				y: int("y"),
				text: textContent(e),
				font: {
					...parseFont(getAttr(e, "font-family") || "SansSerif"),
					size: Number.parseInt(getAttr(e, "font-size") || "12", 10),
					style: bold ? (style ? "bolditalic" : "bold") : style ? "italic" : "plain",
				},
				fill: fill === "" || fill === "none" ? "#000000" : parseColor(fill, getAttr(e, "fill-opacity")),
				align: anchor === "start" ? "start" : anchor === "end" ? "end" : "middle",
			};
		}
		default:
			return null;
	}
	const stroke = getAttr(e, "stroke");
	const fill = getAttr(e, "fill");
	if (shape.kind !== "line" && !(shape.kind === "poly" && !shape.closed)) {
		if (stroke === "" || stroke === "none") shape.paint = "fill";
		else if (fill === "none") shape.paint = "stroke";
		else shape.paint = "both";
	}
	if (hasAttr(e, "stroke-width")) shape.strokeWidth = Number.parseInt(getAttr(e, "stroke-width"), 10);
	if (stroke !== "none") shape.stroke = parseColor(stroke, getAttr(e, "stroke-opacity"));
	if (fill !== "none") shape.fill = parseColor(fill === "" ? "#000000" : fill, getAttr(e, "fill-opacity"));
	return shape;
}

// --- SvgCreator / AppearancePort.toSvgElement ---------------------------------

function colorParts(c: string): { hex: string; alpha: number } {
	const v = c.toLowerCase();
	if (/^#[0-9a-f]{8}$/.test(v)) return { hex: v.slice(0, 7), alpha: Number.parseInt(v.slice(7), 16) };
	return { hex: v, alpha: 255 };
}

/** Java's String.format("%5.3f", alpha / 255.0) */
const opacity = (alpha: number) => (alpha / 255).toFixed(3).padStart(5, " ");

/** "" + double in Java: always a decimal point. */
function javaDouble(v: number): string {
	return Number.isInteger(v) ? `${v}.0` : `${v}`;
}

function strokeAttrs(a: Record<string, string>, s: ShapeStyle): void {
	if (s.strokeWidth !== 1) a["stroke-width"] = `${s.strokeWidth}`;
	const { hex, alpha } = colorParts(s.stroke);
	a.stroke = hex;
	if (alpha !== 255) a["stroke-opacity"] = opacity(alpha);
	a.fill = "none";
}

function fillAttrs(a: Record<string, string>, s: ShapeStyle): void {
	if (s.paint === "fill") a.stroke = "none";
	else strokeAttrs(a, s);
	if (s.paint === "stroke") {
		a.fill = "none";
	} else {
		const { hex, alpha } = colorParts(s.fill);
		if (hex === "#000000") delete a.fill;
		else a.fill = hex;
		if (alpha !== 255) a["fill-opacity"] = opacity(alpha);
	}
}

const PORT_RADIUS = (pin: Instance) => (isInputPin(pin) ? PORT_INPUT_RADIUS : PORT_OUTPUT_RADIUS);

export function writeAppearanceShape(s: AppearanceShape): XmlElement {
	const a: Record<string, string> = {};
	switch (s.kind) {
		case "rect":
			Object.assign(a, { x: `${s.x}`, y: `${s.y}`, width: `${s.w}`, height: `${s.h}` });
			fillAttrs(a, s);
			if (s.rx > 0) Object.assign(a, { rx: `${s.rx}`, ry: `${s.rx}` });
			return el("rect", a);
		case "oval":
			Object.assign(a, {
				cx: javaDouble(s.x + s.w / 2),
				cy: javaDouble(s.y + s.h / 2),
				rx: javaDouble(s.w / 2),
				ry: javaDouble(s.h / 2),
			});
			fillAttrs(a, s);
			return el("ellipse", a);
		case "line":
			Object.assign(a, { x1: `${s.x0}`, y1: `${s.y0}`, x2: `${s.x1}`, y2: `${s.y1}` });
			strokeAttrs(a, s);
			return el("line", a);
		case "curve":
			a.d = `M${s.x0},${s.y0} Q${s.cx},${s.cy} ${s.x1},${s.y1}`;
			fillAttrs(a, s);
			return el("path", a);
		case "poly":
			a.points = s.xs.map((x, i) => `${x},${s.ys[i]}`).join(" ");
			fillAttrs(a, s);
			return el(s.closed ? "polygon" : "polyline", a);
		case "text": {
			Object.assign(a, { x: `${s.x}`, y: `${s.y}` });
			const { hex, alpha } = colorParts(s.fill);
			if (hex !== "#000000") a.fill = hex;
			if (alpha !== 255) a["fill-opacity"] = opacity(alpha);
			a["font-family"] = s.font.family;
			a["font-size"] = `${s.font.size}`;
			if (s.font.style === "italic" || s.font.style === "bolditalic") a["font-style"] = "italic";
			if (s.font.style === "bold" || s.font.style === "bolditalic") a["font-weight"] = "bold";
			a["text-anchor"] = s.align;
			return el("text", a, [s.text]);
		}
		case "port": {
			const r = PORT_RADIUS(s.pin);
			return el("circ-port", {
				x: `${locX(s.loc) - r}`,
				y: `${locY(s.loc) - r}`,
				width: `${2 * r}`,
				height: `${2 * r}`,
				pin: `${s.pin.x},${s.pin.y}`,
			});
		}
		case "anchor":
			return el("circ-anchor", {
				x: `${locX(s.loc) - ANCHOR_RADIUS}`,
				y: `${locY(s.loc) - ANCHOR_RADIUS}`,
				width: `${2 * ANCHOR_RADIUS}`,
				height: `${2 * ANCHOR_RADIUS}`,
				facing: s.facing,
			});
	}
}

/** PortManager.computeDefaultLocation */
function defaultPortLocation(shapes: AppearanceShape[], pin: Instance, others: Map<Instance, Loc>): Loc {
	const used = new Set(others.values());
	const facing = pinFacing(pin);
	const sameWay = Array.from(others.keys()).filter((p) => pinFacing(p) === facing);
	if (sameWay.length > 0) {
		sameWay.push(pin);
		sortPinList(sameWay, facing);
		const index = sameWay.indexOf(pin);
		// the previous pin in order, or the next one if this is the first
		const neighbor = index > 0 ? sameWay[index - 1] : sameWay[1];
		const [dx, dy] = facing === "east" || facing === "west" ? [0, 10] : [10, 0];
		let l = others.get(neighbor) as Loc;
		do l = loc(locX(l) + dx, locY(l) + dy);
		while (used.has(l));
		if (locX(l) >= 0 && locY(l) >= 0) return l;
		do l = loc(locX(l) - dx, locY(l) - dy);
		while (used.has(l));
		return l;
	}
	// otherwise on the boundary of the bounding rectangle
	let bds: Bounds | null = null;
	for (const s of shapes) {
		const b = s.kind === "anchor" || s.kind === "port" ? Bounds.ofLoc(s.loc) : shapeBounds(s);
		bds = bds === null ? b : bds.add(b);
	}
	const b = bds ?? Bounds.create(0, 0, 0, 0);
	let x: number;
	let y: number;
	let dx = 0;
	let dy = 0;
	if (facing === "east") {
		x = b.x - 7;
		y = b.y + 5;
		dy = 10;
	} else if (facing === "west") {
		x = b.x + b.width - 3;
		y = b.y + 5;
		dy = 10;
	} else if (facing === "south") {
		x = b.x + 5;
		y = b.y - 7;
		dx = 10;
	} else {
		x = b.x + 5;
		y = b.y + b.height - 3;
		dx = 10;
	}
	x = Math.trunc((x + 9) / 10) * 10; // round up to the grid
	y = Math.trunc((y + 9) / 10) * 10;
	let l = loc(x, y);
	while (used.has(l)) l = loc(locX(l) + dx, locY(l) + dy);
	return l;
}

/** CircuitAppearance: how a circuit looks when used as a subcircuit. */
export class CircuitAppearance {
	/** Raw <appear> children, kept verbatim for round-tripping. */
	customXml: XmlElement[] | null = null;
	private custom: AppearanceShape[] | null = null;
	private cachedDefault: AppearanceShape[] | null = null;
	/** Incremented whenever ports or bounds may have changed. */
	revision = 0;

	constructor(private readonly circuit: Circuit) {}

	isDefault(): boolean {
		return this.custom === null;
	}

	/** Shapes changed in the editor or by the port manager: write them, not the read XML. */
	private edited = false;

	/** The <appear> children to save, or null for the default appearance. */
	toXml(): XmlElement[] | null {
		if (this.custom === null) return null;
		this.getShapes();
		if (!this.edited && this.customXml !== null) return this.customXml;
		return this.custom.map(writeAppearanceShape);
	}

	/** Pins changed since the ports were last updated (handled together, like one transaction). */
	private portsDirty = false;

	pinsChanged(): void {
		this.cachedDefault = null;
		if (this.custom !== null) this.portsDirty = true;
		this.revision++;
	}

	/** PortManager.performUpdate: ports follow pins added to or removed from the circuit. */
	private updatePorts(): void {
		const shapes = this.custom as AppearanceShape[];
		const pins = new Set(this.circuit.pins);
		const ports = new Map<Instance, Loc>();
		for (const s of shapes) if (s.kind === "port") ports.set(s.pin, s.loc);
		const removed = shapes.filter((s) => s.kind === "port" && !pins.has(s.pin));
		const added = Array.from(pins).filter((p) => !ports.has(p));
		const hasAnchor = shapes.some((s) => s.kind === "anchor");
		if (removed.length === 0 && added.length === 0 && hasAnchor) return;
		let next = shapes.filter((s) => !removed.includes(s));
		for (const r of removed) if (r.kind === "port") ports.delete(r.pin);
		if (!hasAnchor) {
			const anchor = buildDefaultAppearance(Array.from(pins)).find((s) => s.kind === "anchor");
			next.push(anchor ?? { kind: "anchor", loc: loc(100, 100), facing: "east" });
		}
		// sorted so they are placed predictably (they need not all face east)
		sortPinList(added, "east");
		const newPorts: AppearanceShape[] = [];
		for (const pin of added) {
			const where = defaultPortLocation(next, pin, ports);
			newPorts.push({ kind: "port", loc: where, pin });
			ports.set(pin, where);
		}
		// replaceAutomatically: added just below the topmost object (the anchor)
		const at = Math.max(0, next.length - 1);
		next = [...next.slice(0, at), ...newPorts, ...next.slice(at)];
		this.custom = next;
		this.edited = true;
	}

	/** The editor's model: a copy of the current shapes (default ones when not custom). */
	getEditableShapes(): AppearanceShape[] {
		return this.getShapes().map((s) => ({ ...s }));
	}

	/** Replace the custom appearance (null reverts to the default one). */
	setShapes(shapes: AppearanceShape[] | null): void {
		this.custom = shapes;
		this.portsDirty = false;
		this.customXml = null;
		this.edited = shapes !== null;
		this.revision++;
	}

	setCustom(xml: XmlElement[] | null): void {
		this.customXml = xml;
		this.custom = null;
		this.edited = false;
		this.portsDirty = false;
		if (xml !== null) {
			const pins = new Map<Loc, Instance>();
			for (const p of this.circuit.pins) pins.set(p.loc, p);
			const shapes: AppearanceShape[] = [];
			for (const e of xml) {
				const s = readAppearanceShape(e, pins);
				if (s) shapes.push(s);
			}
			// anchor last, like CircuitAppearance.setObjectsForce
			shapes.sort((a, b) => (a.kind === "anchor" ? 1 : 0) - (b.kind === "anchor" ? 1 : 0));
			this.custom = shapes;
		}
		this.revision++;
	}

	getShapes(): AppearanceShape[] {
		if (this.custom !== null) {
			if (this.portsDirty) {
				this.portsDirty = false;
				this.updatePorts();
			}
			return this.custom as AppearanceShape[];
		}
		if (this.cachedDefault === null) {
			this.cachedDefault = buildDefaultAppearance(this.circuit.pins);
		}
		return this.cachedDefault;
	}

	private findAnchor(): { loc: Loc; facing: Direction } | null {
		for (const s of this.getShapes()) {
			if (s.kind === "anchor") return s;
		}
		return null;
	}

	getFacing(): Direction {
		return this.findAnchor()?.facing ?? "east";
	}

	getOffsetBounds(): Bounds {
		let ret: Bounds | null = null;
		let offset: Loc | null = null;
		for (const s of this.getShapes()) {
			let b: Bounds;
			if (s.kind === "anchor" || s.kind === "port") {
				if (s.kind === "anchor") offset = s.loc;
				b = Bounds.ofLoc(s.loc);
			} else {
				b = shapeBounds(s);
			}
			ret = ret === null ? b : ret.add(b);
		}
		if (ret === null) return Bounds.EMPTY;
		if (offset !== null) return ret.translate(-locX(offset), -locY(offset));
		return ret;
	}

	/** Port offsets relative to the anchor, sorted like Java's TreeMap. */
	getPortOffsets(facing: Direction): { loc: Loc; pin: Instance }[] {
		let anchor: Loc | null = null;
		let defaultFacing: Direction = "east";
		const ports: { loc: Loc; pin: Instance }[] = [];
		for (const s of this.getShapes()) {
			if (s.kind === "port") ports.push({ loc: s.loc, pin: s.pin });
			else if (s.kind === "anchor") {
				anchor = s.loc;
				defaultFacing = s.facing;
			}
		}
		const ret = new Map<Loc, Instance>();
		for (const p of ports) {
			let l = p.loc;
			if (anchor !== null) l = loc(locX(l) - locX(anchor), locY(l) - locY(anchor));
			if (facing !== defaultFacing) l = rotateLoc(l, defaultFacing, facing, 0, 0);
			ret.set(l, p.pin);
		}
		return Array.from(ret.entries())
			.sort((a, b) => compareLoc(a[0], b[0]))
			.map(([l, pin]) => ({ loc: l, pin }));
	}

	/** CircuitAppearance.paintSubcircuit, drawn relative to the anchor. */
	paintSubcircuit(g: Graphics, facing: Direction): void {
		const defaultFacing = this.getFacing();
		g.save();
		if (facing !== defaultFacing) g.rotate(dirRadians(defaultFacing) - dirRadians(facing));
		const anchor = this.findAnchor()?.loc ?? loc(100, 100);
		g.translate(-locX(anchor), -locY(anchor));
		for (const s of this.getShapes()) {
			if (s.kind !== "port" && s.kind !== "anchor") paintShape(g, s);
		}
		g.restore();
	}
}

export function childShapes(appear: XmlElement): XmlElement[] {
	return childElements(appear);
}
