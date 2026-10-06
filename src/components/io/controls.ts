// Ports of std.io.{Button, Joystick}.
import { type AnyAttribute, AttributeSet, bitWidthAttr, DEFAULT_LABEL_FONT } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type Poker,
	port,
} from "@/engine/component";
import { Bounds, locX, locY } from "@/engine/geom";
import { bitWidthConfigurator, type KeyConfigurator } from "@/engine/key-config";
import { Value } from "@/engine/value";
import { FACING, LABEL, LABEL_FONT } from "../std-attrs";
import { darker, IO_COLOR, IO_LABEL_COLOR, IO_LABEL_LOC, ioTextField } from "./common";

class Button extends ComponentFactory {
	readonly name = "Button";
	readonly library = "#I/O";
	readonly displayKey = "io.button";
	override readonly iconName = "button.gif";
	override readonly facingAttr = FACING;
	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(IO_COLOR, "#ffffff");
		a.set(LABEL, "");
		a.set(IO_LABEL_LOC, "center");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		a.set(IO_LABEL_COLOR, "#000000");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [FACING, IO_COLOR, LABEL, IO_LABEL_LOC, LABEL_FONT, IO_LABEL_COLOR];
	}
	getOffsetBounds(a: AttributeSet) {
		return Bounds.create(-20, -10, 20, 20).rotate("east", a.get(FACING), 0, 0);
	}
	override getPorts() {
		return [port(0, 0, "output", 1)];
	}
	override getTextField(i: Instance) {
		return ioTextField(i, 3);
	}
	propagate(s: InstanceState): void {
		s.setPort(0, s.getData<Value>() ?? Value.FALSE, 1);
	}
	override createPoker(): Poker {
		const set = (s: InstanceState, v: Value) => {
			s.setData(v);
			s.fireInvalidated();
		};
		return {
			mousePressed: (s) => set(s, Value.TRUE),
			mouseReleased: (s) => set(s, Value.FALSE),
			stopEditing: (s) => set(s, Value.FALSE),
		};
	}
	paintInstance(p: InstancePainter): void {
		const b = p.getBounds(),
			g = p.g,
			w = b.width,
			h = b.height,
			color = p.getAttr(IO_COLOR);
		let x = b.x,
			y = b.y,
			depress = 0;
		if (p.showState && p.getData<Value>() === Value.TRUE) {
			x += 3;
			y += 3;
			const labelLoc = p.getAttr(IO_LABEL_LOC);
			if (["center", "north", "west"].includes(labelLoc)) depress = 3;
			const facing = p.getAttr(FACING),
				l = p.getLocation();
			if (facing === "north" || facing === "west") {
				g.setLineWidth(3);
				g.setColor(Value.TRUE_COLOR);
				g.drawLine(
					locX(l),
					locY(l),
					locX(l) + (facing === "west" ? 10 : 0),
					locY(l) + (facing === "north" ? 10 : 0),
				);
				g.setLineWidth(1);
			}
			g.setColor(color);
			g.fillRect(x, y, w - 3, h - 3);
			g.setColor("#000000");
			g.drawRect(x, y, w - 3, h - 3);
		} else {
			const xs = [x, x + w - 3, x + w, x + w, x + 3, x],
				ys = [y, y, y + 3, y + h, y + h, y + h - 3];
			g.setColor(darker(color));
			g.fillPolygon(xs, ys);
			g.setColor(color);
			g.fillRect(x, y, w - 3, h - 3);
			g.setColor("#000000");
			g.drawRect(x, y, w - 3, h - 3);
			g.drawLine(x + w - 3, y + h - 3, x + w, y + h);
			g.drawPolygon(xs, ys);
		}
		g.translate(depress, depress);
		p.drawLabel();
		g.translate(-depress, -depress);
		p.drawPorts();
	}
}

export const JOYSTICK_BITS = bitWidthAttr("bits", "io.bits", 2, 5);
export interface JoystickData {
	x: number;
	y: number;
}
class Joystick extends ComponentFactory {
	override createKeyConfigurator(): KeyConfigurator {
		return bitWidthConfigurator(JOYSTICK_BITS, 2, 5);
	}

	readonly name = "Joystick";
	readonly library = "#I/O";
	readonly displayKey = "io.joystick";
	override readonly iconName = "joystick.gif";
	createAttributeSet() {
		const a = new AttributeSet();
		a.set(JOYSTICK_BITS, 4);
		a.set(IO_COLOR, "#ff0000");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [JOYSTICK_BITS, IO_COLOR];
	}
	getOffsetBounds() {
		return Bounds.create(-30, -10, 30, 30);
	}
	override getPorts() {
		return [port(0, 0, "output", JOYSTICK_BITS), port(0, 10, "output", JOYSTICK_BITS)];
	}
	propagate(s: InstanceState): void {
		const data = s.getData<JoystickData>() ?? { x: 0, y: 0 },
			bits = s.getAttr(JOYSTICK_BITS),
			steps = (1 << bits) - 1;
		for (const [i, offset] of [data.x, data.y].entries()) {
			let v = Math.trunc(((offset + 14) * steps) / 29) + 1;
			if (bits > 4 && v >= Math.trunc(steps / 2)) v++;
			s.setPort(i, Value.createKnown(bits, v), 1);
		}
	}
	override createPoker(): Poker {
		const update = (s: InstanceState, x: number, y: number) => {
			s.setData({ x: Math.max(-14, Math.min(14, x)), y: Math.max(-14, Math.min(14, y)) });
			s.fireInvalidated();
		};
		const drag = (s: InstanceState, x: number, y: number) =>
			update(s, x - s.instance.x + 15, y - s.instance.y - 5);
		return {
			mousePressed: drag,
			mouseDragged: drag,
			mouseReleased: (s) => update(s, 0, 0),
			stopEditing: (s) => update(s, 0, 0),
		};
	}
	override paintGhost(p: InstancePainter): void {
		const b = p.getBounds();
		p.g.setLineWidth(2);
		p.g.drawRoundRect(b.x, b.y, b.width, b.height, 8, 8);
	}
	paintInstance(p: InstancePainter): void {
		const l = p.getLocation(),
			x = locX(l),
			y = locY(l),
			g = p.g;
		g.drawRoundRect(x - 30, y - 10, 30, 30, 8, 8);
		g.drawRoundRect(x - 28, y - 8, 26, 26, 4, 4);
		const d = p.showState ? p.getData<JoystickData>() : undefined;
		if (d && (d.x !== 0 || d.y !== 0)) {
			g.setLineWidth(3);
			g.drawLine(x - 15, y + 5, x - 15 + d.x, y + 5 + d.y);
			g.setLineWidth(1);
		}
		const bx = x - 15 + (d?.x ?? 0),
			by = y + 5 + (d?.y ?? 0);
		g.setColor(p.getAttr(IO_COLOR));
		g.fillOval(bx - 4, by - 4, 8, 8);
		g.setColor("#000000");
		g.drawOval(bx - 4, by - 4, 8, 8);
		p.drawPorts();
	}
}
export const BUTTON = new Button();
export const JOYSTICK = new Joystick();
