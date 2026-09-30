// Port of com.cburch.logisim.std.wiring.{Tunnel, TunnelAttributes}.

import { type AnyAttribute, AttributeSet, DEFAULT_LABEL_FONT } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type PortDef,
	port,
	type TextFieldSpec,
} from "@/engine/component";
import { Bounds, type Direction, locX, locY } from "@/engine/geom";
import {
	drawText,
	H_CENTER,
	H_LEFT,
	H_RIGHT,
	measureText,
	V_BOTTOM,
	V_CENTER_OVERALL,
	V_TOP,
} from "@/engine/graphics";
import { FACING, LABEL, LABEL_FONT, WIDTH } from "../std-attrs";

const MARGIN = 3;
const ARROW_MARGIN = 5;
const ARROW_DEPTH = 4;
const ARROW_MIN_WIDTH = 16;
const ARROW_MAX_WIDTH = 20;

interface LabelPlacement {
	x: number;
	y: number;
	halign: number;
	valign: number;
}

function labelPlacement(facing: Direction): LabelPlacement {
	switch (facing) {
		case "north":
			return { x: 0, y: ARROW_MARGIN, halign: H_CENTER, valign: V_TOP };
		case "south":
			return { x: 0, y: -ARROW_MARGIN, halign: H_CENTER, valign: V_BOTTOM };
		case "east":
			return { x: -ARROW_MARGIN, y: 0, halign: H_RIGHT, valign: V_CENTER_OVERALL };
		default:
			return { x: ARROW_MARGIN, y: 0, halign: H_LEFT, valign: V_CENTER_OVERALL };
	}
}

function computeBounds(p: LabelPlacement, textWidth: number, textHeight: number) {
	const minDim = ARROW_MIN_WIDTH - 2 * MARGIN;
	const bw = Math.max(minDim, textWidth);
	const bh = Math.max(minDim, textHeight);
	let bx: number;
	let by: number;
	if (p.halign === H_LEFT) bx = p.x;
	else if (p.halign === H_RIGHT) bx = p.x - bw;
	else bx = p.x - Math.trunc(bw / 2);
	if (p.valign === V_TOP) by = p.y;
	else if (p.valign === V_BOTTOM) by = p.y - bh;
	else by = p.y - Math.trunc(bh / 2);
	return { bx, by, bw, bh, bounds: Bounds.create(bx, by, bw, bh).expand(MARGIN).addPoint(0, 0) };
}

class Tunnel extends ComponentFactory {
	readonly name = "Tunnel";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.tunnel";
	override readonly role = "tunnel" as const;
	override readonly facingAttr = FACING;
	override readonly iconName = "tunnel.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "west");
		a.set(WIDTH, 1);
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIDTH, LABEL, LABEL_FONT];
	}

	private metrics(attrs: AttributeSet) {
		const font = attrs.get(LABEL_FONT);
		const label = attrs.get(LABEL);
		const m = measureText(label, font);
		return computeBounds(labelPlacement(attrs.get(FACING)), m.width, m.ascent + m.descent);
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return this.metrics(attrs).bounds;
	}

	override getPorts(): PortDef[] {
		return [port(0, 0, "inout", WIDTH)];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		const p = labelPlacement(instance.attrs.get(FACING));
		return {
			labelAttr: LABEL,
			fontAttr: LABEL_FONT,
			x: instance.x + p.x,
			y: instance.y + p.y,
			halign: p.halign,
			valign: p.valign,
		};
	}

	propagate(): void {
		// handled by the netlist
	}

	override paintGhost(painter: InstancePainter): void {
		this.paintShape(painter, false);
	}

	paintInstance(painter: InstancePainter): void {
		painter.g.setColor("#000000");
		this.paintShape(painter, true);
		painter.drawPorts();
	}

	private paintShape(painter: InstancePainter, withText: boolean): void {
		const attrs = painter.attrs;
		const facing = attrs.get(FACING);
		const label = attrs.get(LABEL);
		const g = painter.g;
		const l = painter.getLocation();
		g.save();
		g.translate(locX(l), locY(l));
		g.setFont(attrs.get(LABEL_FONT));
		const m = g.measureText(label);
		const {
			bx,
			by,
			bw,
			bh,
			bounds: bds,
		} = computeBounds(labelPlacement(facing), m.width, m.ascent + m.descent);
		if (withText) {
			drawText(g, label, bx + Math.trunc(bw / 2), by + Math.trunc(bh / 2), H_CENTER, V_CENTER_OVERALL);
		}
		const x0 = bds.x;
		const y0 = bds.y;
		const x1 = x0 + bds.width;
		const y1 = y0 + bds.height;
		const mw = ARROW_MAX_WIDTH / 2;
		let xp: number[];
		let yp: number[];
		if (facing === "north") {
			const yb = y0 + ARROW_DEPTH;
			if (x1 - x0 <= ARROW_MAX_WIDTH) {
				xp = [x0, 0, x1, x1, x0];
				yp = [yb, y0, yb, y1, y1];
			} else {
				xp = [x0, -mw, 0, mw, x1, x1, x0];
				yp = [yb, yb, y0, yb, yb, y1, y1];
			}
		} else if (facing === "south") {
			const yb = y1 - ARROW_DEPTH;
			if (x1 - x0 <= ARROW_MAX_WIDTH) {
				xp = [x0, x1, x1, 0, x0];
				yp = [y0, y0, yb, y1, yb];
			} else {
				xp = [x0, x1, x1, mw, 0, -mw, x0];
				yp = [y0, y0, yb, yb, y1, yb, yb];
			}
		} else if (facing === "east") {
			const xb = x1 - ARROW_DEPTH;
			if (y1 - y0 <= ARROW_MAX_WIDTH) {
				xp = [x0, xb, x1, xb, x0];
				yp = [y0, y0, 0, y1, y1];
			} else {
				xp = [x0, xb, xb, x1, xb, xb, x0];
				yp = [y0, y0, -mw, 0, mw, y1, y1];
			}
		} else {
			const xb = x0 + ARROW_DEPTH;
			if (y1 - y0 <= ARROW_MAX_WIDTH) {
				xp = [xb, x1, x1, xb, x0];
				yp = [y0, y0, y1, y1, 0];
			} else {
				xp = [xb, x1, x1, xb, xb, x0, xb];
				yp = [y0, y0, y1, y1, mw, 0, -mw];
			}
		}
		g.setLineWidth(2);
		g.drawPolygon(xp, yp);
		g.restore();
	}
}

export const TUNNEL = new Tunnel();
