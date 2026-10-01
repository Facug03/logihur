// Port of com.cburch.logisim.gui.main.ExportImage's rendering: the circuit's
// bounds (labels included) plus a 5-pixel border, scaled, on white.

import type { Circuit } from "@/engine/circuit";
import type { GateShape } from "@/engine/component";
import { Bounds } from "@/engine/geom";
import type { CircuitState } from "@/engine/simulation";
import { CanvasGraphics } from "./canvas-graphics";
import { drawCircuit } from "./circuit-renderer";
import { boundsWithLabel } from "./painter";

const BORDER_SIZE = 5;

export type ImageFormat = "png" | "jpeg";

export interface ExportOptions {
	scale: number;
	printView: boolean;
	gateShape: GateShape;
	format: ImageFormat;
}

/** Circuit.getBounds(Graphics): wires and components with their labels. */
function circuitBounds(circuit: Circuit, g: CanvasGraphics): Bounds {
	let b = Bounds.EMPTY;
	for (const w of circuit.wires.values()) b = b.add(w.bounds);
	for (const c of circuit.components) b = b.add(boundsWithLabel(c, g));
	return b;
}

/** Null when the circuit is empty (Logisim refuses to export those). */
export function renderCircuitImage(
	circuit: Circuit,
	state: CircuitState | null,
	opts: ExportOptions,
): Promise<Blob | null> {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return Promise.resolve(null);
	const measure = new CanvasGraphics(ctx);
	const content = circuitBounds(circuit, measure);
	if (content.isEmpty()) return Promise.resolve(null);
	const bds = content.expand(BORDER_SIZE);
	canvas.width = Math.max(1, Math.round(bds.width * opts.scale));
	canvas.height = Math.max(1, Math.round(bds.height * opts.scale));
	const g = new CanvasGraphics(ctx);
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.scale(opts.scale, opts.scale);
	ctx.translate(-bds.x, -bds.y);
	drawCircuit(g, circuit, state, {
		showGrid: false,
		gateShape: opts.gateShape,
		selected: new Set(),
		printView: opts.printView,
	});
	return new Promise((resolve) => canvas.toBlob(resolve, `image/${opts.format}`, 0.92));
}
