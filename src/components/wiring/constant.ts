// Port of com.cburch.logisim.std.wiring.Constant.

import { type AnyAttribute, AttributeSet, hexAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
} from "@/engine/component";
import { Bounds, locX, locY } from "@/engine/geom";
import { drawCenteredText } from "@/engine/graphics";
import { Value } from "@/engine/value";
import { FACING, WIDTH } from "../std-attrs";

export const CONSTANT_VALUE = hexAttr("value", "constant.value");

const BACKGROUND_COLOR = "#e6e6e6";

class Constant extends ComponentFactory {
	readonly name = "Constant";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.constant";
	override readonly facingAttr = FACING;
	override readonly iconName = "constant.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIDTH, 1);
		a.set(CONSTANT_VALUE, 1);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIDTH, CONSTANT_VALUE];
	}

	/** ConstantAttributes stores a Value: width changes sign-extend it. */
	override setAttribute(attrs: AttributeSet, attr: AnyAttribute, value: unknown): void {
		if (attr === WIDTH) {
			const oldWidth = attrs.get(WIDTH);
			const old = Value.createKnown(oldWidth, attrs.get(CONSTANT_VALUE));
			const width = value as number;
			attrs.set(WIDTH, width);
			attrs.set(CONSTANT_VALUE, old.extendWidth(width, old.get(old.width - 1)).toIntValue());
		} else if (attr === CONSTANT_VALUE) {
			attrs.set(CONSTANT_VALUE, Value.createKnown(attrs.get(WIDTH), value as number).toIntValue());
		} else {
			attrs.set(attr, value);
		}
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const facing = attrs.get(FACING);
		const chars = Math.max(2, Math.trunc((attrs.get(WIDTH) + 3) / 4));
		const len = chars <= 2 ? 16 : 10 * chars - 4;
		switch (facing) {
			case "east":
				return Bounds.create(-len, -8, len, 16);
			case "west":
				return Bounds.create(0, -8, len, 16);
			case "south":
				return Bounds.create(-Math.trunc(len / 2), -16, len, 16);
			default:
				return Bounds.create(-Math.trunc(len / 2), 0, len, 16);
		}
	}

	override getPorts(): PortDef[] {
		return [port(0, 0, "output", WIDTH)];
	}

	propagate(state: InstanceState): void {
		state.setPort(0, Value.createKnown(state.getAttr(WIDTH), state.getAttr(CONSTANT_VALUE)), 1);
	}

	override paintGhost(painter: InstancePainter): void {
		const v = painter.getAttr(CONSTANT_VALUE);
		const bds = painter.getBounds();
		const l = painter.getLocation();
		const g = painter.g;
		g.setLineWidth(2);
		g.fillOval(locX(l) - 2, locY(l) - 2, 5, 5);
		drawCenteredText(
			g,
			(v >>> 0).toString(16),
			bds.x + Math.trunc(bds.width / 2),
			bds.y + Math.trunc(bds.height / 2),
		);
	}

	paintInstance(painter: InstancePainter): void {
		const bds = painter.getBounds();
		const v = Value.createKnown(painter.getAttr(WIDTH), painter.getAttr(CONSTANT_VALUE));
		const g = painter.g;
		if (painter.shouldDrawColor) {
			g.setColor(BACKGROUND_COLOR);
			g.fillRect(bds.x, bds.y, bds.width, bds.height);
		}
		const cx = bds.x + Math.trunc(bds.width / 2);
		const cy = bds.y + Math.trunc(bds.height / 2) - 2;
		if (v.width === 1) {
			if (painter.shouldDrawColor) g.setColor(v.getColor());
			drawCenteredText(g, v.toString(), cx, cy);
		} else {
			g.setColor("#000000");
			drawCenteredText(g, v.toHexString(), cx, cy);
		}
		painter.drawPorts();
	}
}

export const CONSTANT = new Constant();
