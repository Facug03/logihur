// Port of com.cburch.logisim.std.gates.PainterDin (DIN 40700 shapes).

import type { InstancePainter } from "@/engine/component";
import { locX, locY } from "@/engine/geom";
import type { AbstractGate, GateConfig } from "./abstract-gate";

export type DinType = "and" | "or" | "xor" | "xnor";

/** For OR shapes: the factory whose input offsets the inner lines follow. */
export interface DinOrLines {
	factory: AbstractGate;
	cfg: GateConfig;
}

export function paintDin(
	painter: InstancePainter,
	width: number,
	height: number,
	drawBubble: boolean,
	type: DinType,
	orLines?: DinOrLines,
): void {
	const g = painter.g;
	const xMid = -width;
	const y0 = -Math.trunc(height / 2);
	let w = width;
	if (drawBubble) w -= 8;
	const diam = Math.min(height, 2 * w);
	if (type === "or") {
		if (orLines) paintOrLines(painter, w, height, orLines);
	} else if (type === "xor" || type === "xnor") {
		const elen = Math.min(Math.trunc(diam / 2) - 10, 20);
		const ex0 = xMid + Math.trunc((Math.trunc(diam / 2) - elen) / 2);
		const ex1 = ex0 + elen;
		g.setLineWidth(1);
		g.drawLine(ex0, -5, ex1, -5);
		g.drawLine(ex0, 0, ex1, 0);
		g.drawLine(ex0, 5, ex1, 5);
		if (type === "xor") {
			const exMid = ex0 + Math.trunc(elen / 2);
			g.drawLine(exMid, -8, exMid, 8);
		}
	}

	g.setLineWidth(2);
	const x0 = xMid - Math.trunc(diam / 2);
	const oldColor = g.getColor();
	if (painter.showState) g.setColor(painter.getPort(0).getColor());
	g.drawLine(x0 + diam, 0, 0, 0);
	g.setColor(oldColor);
	if (height <= diam) {
		g.drawArc(x0, y0, diam, diam, -90, 180);
	} else {
		const x1 = x0 + diam;
		const yy0 = -Math.trunc((height - diam) / 2);
		const yy1 = Math.trunc((height - diam) / 2);
		g.drawArc(x0, y0, diam, diam, 0, 90);
		g.drawLine(x1, yy0, x1, yy1);
		g.drawArc(x0, y0 + height - diam, diam, diam, -90, 90);
	}
	g.drawLine(xMid, y0, xMid, y0 + height);
	if (drawBubble) g.fillOval(x0 + diam - 4, -4, 8, 8);
}

/** The input lines drawn inside the OR shape, up to its curved back. */
function paintOrLines(
	painter: InstancePainter,
	width: number,
	height: number,
	{ factory, cfg }: DinOrLines,
): void {
	const g = painter.g;
	// lines are drawn already rotated, so offsets are those of an east-facing gate without negations
	const east: GateConfig = { ...cfg, facing: "east", negated: 0 };
	const r = Math.min(Math.trunc(height / 2), width);
	const yCurveStart = Math.trunc(height / 2) - r;
	const printView = painter.printView && painter.instance !== null;
	g.setLineWidth(2);
	for (let i = 0; i < cfg.inputs; i++) {
		const offs = factory.getInputOffset(east, i);
		const x = locX(offs),
			y = locY(offs),
			ay = Math.abs(y);
		const len = ay <= yCurveStart ? r : Math.trunc(Math.sqrt(r * r - (ay - yCurveStart) ** 2) + 0.5) || 0;
		// Logisim asks about port i here (port 0 being the output)
		if (!printView || painter.isPortConnected(i)) g.drawLine(x, y, x + len, y);
	}
}
