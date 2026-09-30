// Port of com.cburch.logisim.std.gates.PainterShaped (IEEE distinctive shapes).

import type { InstancePainter } from "@/engine/component";
import { loc, locX, locY, translateDir } from "@/engine/geom";
import { drawCenteredArc, type PathCommand } from "@/engine/graphics";
import type { AbstractGate, GateConfig } from "./abstract-gate";

const PATH_NARROW: PathCommand[] = [
	{ op: "M", x: 0, y: 0 },
	{ op: "Q", cx: -10, cy: -15, x: -30, y: -15 },
	{ op: "Q", cx: -22, cy: 0, x: -30, y: 15 },
	{ op: "Q", cx: -10, cy: 15, x: 0, y: 0 },
	{ op: "Z" },
];
const PATH_MEDIUM: PathCommand[] = [
	{ op: "M", x: 0, y: 0 },
	{ op: "Q", cx: -20, cy: -25, x: -50, y: -25 },
	{ op: "Q", cx: -37, cy: 0, x: -50, y: 25 },
	{ op: "Q", cx: -20, cy: 25, x: 0, y: 0 },
	{ op: "Z" },
];
const PATH_WIDE: PathCommand[] = [
	{ op: "M", x: 0, y: 0 },
	{ op: "Q", cx: -25, cy: -35, x: -70, y: -35 },
	{ op: "Q", cx: -50, cy: 0, x: -70, y: 35 },
	{ op: "Q", cx: -25, cy: 35, x: 0, y: 0 },
	{ op: "Z" },
];
const SHIELD_NARROW: PathCommand[] = [
	{ op: "M", x: -30, y: -15 },
	{ op: "Q", cx: -22, cy: 0, x: -30, y: 15 },
];
const SHIELD_MEDIUM: PathCommand[] = [
	{ op: "M", x: -50, y: -25 },
	{ op: "Q", cx: -37, cy: 0, x: -50, y: 25 },
];
const SHIELD_WIDE: PathCommand[] = [
	{ op: "M", x: -70, y: -35 },
	{ op: "Q", cx: -50, cy: 0, x: -70, y: 35 },
];

export function paintAnd(painter: InstancePainter, width: number, height: number): void {
	const g = painter.g;
	g.setLineWidth(2);
	const half = Math.trunc(width / 2);
	const xp = [-half, -width + 1, -width + 1, -half];
	const yp = [-half, -half, half, half];
	drawCenteredArc(g, -half, 0, half, -90, 180);
	g.drawPolyline(xp, yp);
	if (height > width) {
		g.drawLine(-width + 1, -Math.trunc(height / 2), -width + 1, Math.trunc(height / 2));
	}
}

export function paintOr(painter: InstancePainter, width: number, height: number): void {
	const g = painter.g;
	g.setLineWidth(2);
	let path: PathCommand[];
	if (width < 40) path = PATH_NARROW;
	else if (width < 60) path = PATH_MEDIUM;
	else path = PATH_WIDE;
	g.drawPath(path);
	if (height > width) paintShield(painter, 0, width, height);
}

export function paintNot(painter: InstancePainter, narrow: boolean): void {
	const g = painter.g;
	g.setLineWidth(2);
	if (narrow) {
		g.drawPolyline([-6, -19, -19, -6], [0, -6, 6, 0]);
		g.drawOval(-6, -3, 6, 6);
	} else {
		g.drawPolyline([-10, -29, -29, -10], [0, -7, 7, 0]);
		g.drawOval(-9, -4, 9, 9);
	}
}

export function paintXor(painter: InstancePainter, width: number, height: number): void {
	paintOr(painter, width - 10, width - 10);
	paintShield(painter, -10, width - 10, height);
}

function paintShield(painter: InstancePainter, xlate: number, width: number, height: number): void {
	const g = painter.g;
	g.setLineWidth(2);
	g.translate(xlate, 0);
	g.drawPath(computeShield(width, height));
	g.translate(-xlate, 0);
}

function computeShield(width: number, height: number): PathCommand[] {
	let base: PathCommand[];
	if (width < 40) base = SHIELD_NARROW;
	else if (width < 60) base = SHIELD_MEDIUM;
	else base = SHIELD_WIDE;
	if (height <= width) return base;
	const wingHeight = Math.trunc((height - width) / 2);
	const dx = Math.min(20, Math.trunc(wingHeight / 4));
	const h2 = Math.trunc(height / 2);
	const w2 = Math.trunc(width / 2);
	const q = Math.trunc((width + height) / 4);
	const start = base[0] as { x: number; y: number };
	return [
		{ op: "M", x: -width, y: -h2 },
		{ op: "Q", cx: -width + dx, cy: -q, x: -width, y: -w2 },
		// GeneralPath.append(base, true) connects with a line to base's start
		{ op: "L", x: start.x, y: start.y },
		base[1],
		{ op: "Q", cx: -width + dx, cy: q, x: -width, y: h2 },
	];
}

/** Flatten a path into a polygon (implicitly closed), like Java2D's contains. */
function flatten(path: PathCommand[]): [number, number][] {
	const pts: [number, number][] = [];
	let cx = 0;
	let cy = 0;
	for (const c of path) {
		if (c.op === "M" || c.op === "L") {
			pts.push([c.x, c.y]);
			cx = c.x;
			cy = c.y;
		} else if (c.op === "Q") {
			const steps = 32;
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				const x = (1 - t) * (1 - t) * cx + 2 * t * (1 - t) * c.cx + t * t * c.x;
				const y = (1 - t) * (1 - t) * cy + 2 * t * (1 - t) * c.cy + t * t * c.y;
				pts.push([x, y]);
			}
			cx = c.x;
			cy = c.y;
		}
	}
	return pts;
}

/** Non-zero winding point-in-polygon test. */
function polygonContains(poly: [number, number][], px: number, py: number): boolean {
	let winding = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x0, y0] = poly[i];
		const [x1, y1] = poly[(i + 1) % poly.length];
		if (y0 <= py) {
			if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) winding++;
		} else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) {
			winding--;
		}
	}
	return winding !== 0;
}

const INPUT_LENGTHS = new Map<number, number[]>();

function getInputLineLengths(cfg: GateConfig, orGate: AbstractGate): number[] {
	const inputs = cfg.inputs;
	const mainHeight = cfg.size;
	const key = inputs * 31 + mainHeight;
	const cached = INPUT_LENGTHS.get(key);
	if (cached) return cached;

	const eastCfg: GateConfig = { ...cfg, facing: "east", negated: 0 };
	const lengths: number[] = new Array(inputs).fill(0);
	INPUT_LENGTHS.set(key, lengths);
	const width = mainHeight;
	const loc0 = orGate.getInputOffset(eastCfg, 0);
	const locn = orGate.getInputOffset(eastCfg, inputs - 1);
	let totalHeight = 10 + Math.abs(locX(loc0) - locX(locn)) + Math.abs(locY(loc0) - locY(locn));
	if (totalHeight < width) totalHeight = width;

	const poly = flatten(computeShield(width, totalHeight));
	for (let i = 0; i < inputs; i++) {
		const loci = orGate.getInputOffset(eastCfg, i);
		let px = locX(loci) + 1;
		const py = locY(loci);
		let iters = 0;
		while (polygonContains(poly, px, py) && iters < 15) {
			iters++;
			px += 1;
		}
		if (iters >= 15) iters = 0;
		lengths[i] = iters;
	}
	return lengths;
}

export function paintInputLines(
	painter: InstancePainter,
	factory: AbstractGate,
	orGate: AbstractGate,
	cfg: GateConfig,
): void {
	const l = painter.getLocation();
	const { facing, inputs, negated } = cfg;
	const lengths = getInputLineLengths(cfg, orGate);
	const g = painter.g;
	if (painter.instance === null) {
		for (let i = 0; i < inputs; i++) {
			if (((negated >> i) & 1) === 1) {
				const offs = factory.getInputOffset(cfg, i);
				const loci = loc(locX(l) + locX(offs), locY(l) + locY(offs));
				const cent = translateDir(loci, facing, lengths[i] + 5);
				painter.drawDongle(locX(cent), locY(cent));
			}
		}
		return;
	}
	const baseColor = g.getColor();
	g.setLineWidth(3);
	for (let i = 0; i < inputs; i++) {
		const offs = factory.getInputOffset(cfg, i);
		const src = loc(locX(l) + locX(offs), locY(l) + locY(offs));
		const len = lengths[i];
		if (len !== 0 && (!painter.printView || painter.isPortConnected(i + 1))) {
			if (painter.showState) g.setColor(painter.getPort(i + 1).getColor());
			else g.setColor(baseColor);
			const dst = translateDir(src, facing, len);
			g.drawLine(locX(src), locY(src), locX(dst), locY(dst));
		}
		if (((negated >> i) & 1) === 1) {
			const cent = translateDir(src, facing, lengths[i] + 5);
			g.setColor(baseColor);
			painter.drawDongle(locX(cent), locY(cent));
			g.setLineWidth(3);
		}
	}
	g.setColor(baseColor);
}
