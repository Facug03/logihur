// Draws a circuit the way Logisim's Canvas does: grid, wires coloured by
// value (CircuitWires.draw), junction dots, then components.

import { DEFAULT_LABEL_FONT } from "@/engine/attributes";
import type { Circuit } from "@/engine/circuit";
import type { GateShape, Instance } from "@/engine/component";
import { type Bounds, locX, locY } from "@/engine/geom";
import type { CircuitState } from "@/engine/simulation";
import { Value } from "@/engine/value";
import { WIRE_WIDTH, type Wire } from "@/engine/wire";
import type { CanvasGraphics } from "./canvas-graphics";
import { CanvasInstancePainter } from "./painter";

export interface Viewport {
	/** Canvas pixels per circuit unit. */
	zoom: number;
	/** Circuit coordinate at the canvas' top-left corner. */
	originX: number;
	originY: number;
}

export interface RenderOptions {
	showGrid: boolean;
	gateShape: GateShape;
	selected: ReadonlySet<Instance>;
	selectedWires?: ReadonlySet<Wire>;
	hovered?: Instance | null;
	/** The visible area: what lies outside is not drawn. */
	clip?: Bounds;
}

/** Labels and pokers may draw a little outside a component's bounds. */
const CLIP_MARGIN = 60;

const GRID_COLOR = "#c0c0c0";
const SELECT_COLOR = "#2563eb";

export function drawGrid(ctx: CanvasRenderingContext2D, view: Viewport, width: number, height: number): void {
	const size = 10;
	let step = size;
	while (step * view.zoom < 6) step *= 5;
	const x0 = Math.floor(view.originX / step) * step;
	const y0 = Math.floor(view.originY / step) * step;
	const x1 = view.originX + width / view.zoom;
	const y1 = view.originY + height / view.zoom;
	const dot = Math.max(1, Math.round(view.zoom));
	ctx.fillStyle = GRID_COLOR;
	for (let x = x0; x <= x1; x += step) {
		const px = Math.round((x - view.originX) * view.zoom);
		for (let y = y0; y <= y1; y += step) {
			const py = Math.round((y - view.originY) * view.zoom);
			const big = x % 50 === 0 && y % 50 === 0 && view.zoom >= 1;
			const d = big ? dot + (view.zoom >= 2 ? 1 : 0) : dot;
			ctx.fillRect(px, py, d, d);
		}
	}
}

export function drawCircuit(
	g: CanvasGraphics,
	circuit: Circuit,
	state: CircuitState | null,
	opts: RenderOptions,
): void {
	const netlist = circuit.getNetlist();
	const showState = state !== null;

	const clip = opts.clip?.expand(CLIP_MARGIN) ?? null;

	// wires
	for (const w of circuit.wires.values()) {
		if (clip && !clip.intersects(w.bounds)) continue;
		const bundle = netlist.getBundleAt(w.e0);
		let color: string;
		if (bundle && !bundle.isValid()) color = Value.WIDTH_ERROR_COLOR;
		else if (showState)
			color = netlist.isValid ? (state as CircuitState).getValue(w.e0).getColor() : Value.NIL_COLOR;
		else color = "#000000";
		const selected = opts.selectedWires?.has(w) ?? false;
		if (selected) {
			g.setColor(SELECT_COLOR);
			g.setLineWidth(WIRE_WIDTH + 4);
			g.drawLine(locX(w.e0), locY(w.e0), locX(w.e1), locY(w.e1));
		}
		g.setColor(color);
		g.setLineWidth(WIRE_WIDTH);
		g.drawLine(locX(w.e0), locY(w.e0), locX(w.e1), locY(w.e1));
	}

	// junction dots where more than two things meet
	for (const [p, data] of netlist.points.map) {
		if (data.components.length <= 2) continue;
		if (clip && !clip.contains(locX(p), locY(p))) continue;
		const bundle = netlist.getBundleAt(p);
		if (!bundle) continue;
		let color: string;
		if (!bundle.isValid()) color = Value.WIDTH_ERROR_COLOR;
		else if (showState)
			color = netlist.isValid ? (state as CircuitState).getValue(p).getColor() : Value.NIL_COLOR;
		else color = "#000000";
		g.setColor(color);
		g.fillOval(locX(p) - 4, locY(p) - 4, 8, 8);
	}

	// components
	const painter = new CanvasInstancePainter({
		g,
		circuit,
		state,
		showState,
		printView: false,
		gateShape: opts.gateShape,
	});
	for (const comp of circuit.components) {
		if (clip && !clip.intersects(comp.bounds)) continue;
		g.save();
		g.setColor("#000000");
		g.setLineWidth(1);
		g.setFont(DEFAULT_LABEL_FONT);
		painter.setInstance(comp);
		try {
			comp.factory.paintInstance(painter);
		} catch (e) {
			console.error(`painting ${comp.factory.name} failed`, e);
		}
		g.restore();
	}

	// selection outlines
	for (const comp of opts.selected) {
		const b = comp.bounds.expand(3);
		g.save();
		g.setColor(SELECT_COLOR);
		g.setLineWidth(1.5);
		g.drawRect(b.x, b.y, b.width, b.height);
		for (const [hx, hy] of [
			[b.x, b.y],
			[b.x + b.width, b.y],
			[b.x, b.y + b.height],
			[b.x + b.width, b.y + b.height],
		]) {
			g.setColor("#ffffff");
			g.fillRect(hx - 2.5, hy - 2.5, 5, 5);
			g.setColor(SELECT_COLOR);
			g.drawRect(hx - 2.5, hy - 2.5, 5, 5);
		}
		g.restore();
	}

	if (opts.hovered && !opts.selected.has(opts.hovered)) {
		const b = opts.hovered.bounds.expand(3);
		g.save();
		g.setColor("rgba(37, 99, 235, 0.35)");
		g.setLineWidth(1);
		g.drawRect(b.x, b.y, b.width, b.height);
		g.restore();
	}
}
