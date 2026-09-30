// Ports of com.cburch.logisim.std.wiring.{Pin, PinAttributes, Probe,
// ProbeAttributes}.

import {
	type AnyAttribute,
	AttributeSet,
	boolAttr,
	DEFAULT_LABEL_FONT,
	optionAttr,
} from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type Poker,
	type PortDef,
	port,
	type TextFieldSpec,
} from "@/engine/component";
import { Bounds, type Direction } from "@/engine/geom";
import { drawCenteredText, H_CENTER, H_LEFT, H_RIGHT, V_BOTTOM, V_CENTER, V_TOP } from "@/engine/graphics";
import { Value } from "@/engine/value";
import { FACING, LABEL, LABEL_FONT, LABEL_LOC, WIDTH } from "../std-attrs";
import { RADIX, radixMaxLength, radixToString } from "./radix";

export const PIN_TRISTATE = boolAttr("tristate", "pin.threeState");
export const PIN_OUTPUT = boolAttr("output", "pin.output");
export const PIN_PULL = optionAttr("pull", "pin.pull", [
	{ value: "none", label: "pin.pullNone" },
	{ value: "up", label: "pin.pullUp" },
	{ value: "down", label: "pin.pullDown" },
]);

/** Probe.getOffsetBounds */
export function probeOffsetBounds(dir: Direction, width: number, radix: string): Bounds {
	const len = radix === "2" ? width : radixMaxLength(radix, width);
	let w: number;
	let h: number;
	if (len <= 2) {
		w = 20;
		h = 20;
	} else if (len <= 8) {
		w = 10 * len;
		h = 20;
	} else {
		w = 80;
		h = len <= 16 ? 40 : len <= 24 ? 60 : 80;
	}
	switch (dir) {
		case "east":
			return Bounds.create(-w, -Math.trunc(h / 2), w, h);
		case "west":
			return Bounds.create(0, -Math.trunc(h / 2), w, h);
		case "south":
			return Bounds.create(-Math.trunc(w / 2), -h, w, h);
		case "north":
			return Bounds.create(-Math.trunc(w / 2), 0, w, h);
	}
}

/** Probe.configureLabel */
export function probeLabel(instance: Instance, labelLoc: Direction, facing: Direction): TextFieldSpec {
	const bds = instance.bounds;
	let x: number;
	let y: number;
	let halign: number;
	let valign: number;
	if (labelLoc === "north") {
		halign = H_CENTER;
		valign = V_BOTTOM;
		x = bds.x + Math.trunc(bds.width / 2);
		y = bds.y - 2;
		if (facing === labelLoc) {
			halign = H_LEFT;
			x += 2;
		}
	} else if (labelLoc === "south") {
		halign = H_CENTER;
		valign = V_TOP;
		x = bds.x + Math.trunc(bds.width / 2);
		y = bds.y + bds.height + 2;
		if (facing === labelLoc) {
			halign = H_LEFT;
			x += 2;
		}
	} else if (labelLoc === "east") {
		halign = H_LEFT;
		valign = V_CENTER;
		x = bds.x + bds.width + 2;
		y = bds.y + Math.trunc(bds.height / 2);
		if (facing === labelLoc) {
			valign = V_BOTTOM;
			y -= 2;
		}
	} else {
		halign = H_RIGHT;
		valign = V_CENTER;
		x = bds.x - 2;
		y = bds.y + Math.trunc(bds.height / 2);
		if (facing === labelLoc) {
			valign = V_BOTTOM;
			y -= 2;
		}
	}
	return { labelAttr: LABEL, fontAttr: LABEL_FONT, x, y, halign, valign };
}

/** Probe.paintValue */
export function paintProbeValue(painter: InstancePainter, value: Value): void {
	const g = painter.g;
	const bds = painter.getBounds();
	const radix = (painter.attrs.getByName("radix") as string | undefined) ?? "2";
	if (radix === "2") {
		const wid = value.width;
		if (wid === 0) {
			const x = bds.x + Math.trunc(bds.width / 2);
			const y = bds.y + Math.trunc(bds.height / 2);
			g.setLineWidth(2);
			g.drawLine(x - 4, y, x + 4, y);
			return;
		}
		let x0 = bds.x + bds.width - 5;
		const compWidth = wid * 10;
		if (compWidth < bds.width - 3) {
			x0 = bds.x + Math.trunc((bds.width + compWidth) / 2) - 5;
		}
		let cx = x0;
		let cy = bds.y + bds.height - 12;
		let cur = 0;
		for (let k = 0; k < wid; k++) {
			drawCenteredText(g, value.get(k).toDisplayString(), cx, cy);
			++cur;
			if (cur === 8) {
				cur = 0;
				cx = x0;
				cy -= 20;
			} else {
				cx -= 10;
			}
		}
	} else {
		drawCenteredText(
			g,
			radixToString(radix, value),
			bds.x + Math.trunc(bds.width / 2),
			bds.y + Math.trunc(bds.height / 2),
		);
	}
}

interface PinState {
	sending: Value;
	receiving: Value;
}

type StateLike = Pick<InstanceState, "attrs" | "getData"> & { setData?(d: unknown): void };

function getPinState(state: StateLike): PinState {
	const attrs = state.attrs;
	const width = attrs.get(WIDTH);
	const threeState = attrs.get(PIN_TRISTATE);
	let ret = state.getData<PinState>();
	if (ret === undefined) {
		const val = Value.repeat(threeState ? Value.UNKNOWN : Value.FALSE, Math.max(1, width));
		ret = { sending: val, receiving: val };
		state.setData?.(ret);
	}
	if (ret.sending.width !== width) {
		ret.sending = ret.sending.extendWidth(width, threeState ? Value.UNKNOWN : Value.FALSE);
	}
	if (ret.receiving.width !== width) {
		ret.receiving = ret.receiving.extendWidth(width, Value.UNKNOWN);
	}
	return ret;
}

function pull2(mod: Value, expectedWidth: number): Value {
	if (mod.width === expectedWidth) {
		return Value.fromBits(mod.getAll().map((v) => (v === Value.UNKNOWN ? Value.FALSE : v)));
	}
	return Value.createKnown(expectedWidth, 0);
}

export function isInputPin(instance: Instance): boolean {
	return instance.attrs.get(PIN_OUTPUT) !== true;
}

class Pin extends ComponentFactory {
	readonly name = "Pin";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.pin";
	override readonly role = "pin" as const;
	override readonly facingAttr = FACING;
	override readonly iconName = "pinInput.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(PIN_OUTPUT, false);
		a.set(WIDTH, 1);
		a.set(PIN_TRISTATE, true);
		a.set(PIN_PULL, "none");
		a.set(LABEL, "");
		a.set(LABEL_LOC, "west");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, PIN_OUTPUT, WIDTH, PIN_TRISTATE, PIN_PULL, LABEL, LABEL_LOC, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return probeOffsetBounds(attrs.get(FACING), attrs.get(WIDTH), "2");
	}

	override getPorts(instance: Instance): PortDef[] {
		const output = instance.attrs.get(PIN_OUTPUT);
		const p = port(0, 0, output ? "input" : "output", WIDTH);
		p.tooltip = output ? "pin.outputToolTip" : "pin.inputToolTip";
		return [p];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return probeLabel(instance, instance.attrs.get(LABEL_LOC), instance.attrs.get(FACING));
	}

	propagate(state: InstanceState): void {
		const width = state.getAttr(WIDTH);
		const val = state.getPort(0);
		const q = getPinState(state);
		if (state.getAttr(PIN_OUTPUT)) {
			q.sending = val;
			q.receiving = val;
			state.setPort(0, Value.createUnknown(width), 1);
		} else if (!val.isFullyDefined() && !state.getAttr(PIN_TRISTATE) && state.isCircuitRoot()) {
			q.sending = pull2(q.sending, width);
			q.receiving = pull2(val, width);
			state.setPort(0, q.sending, 1);
		} else {
			q.receiving = val;
			if (!val.equals(q.sending)) state.setPort(0, q.sending, 1);
		}
	}

	/** Pin.getValue: the value this pin drives. */
	getValue(state: StateLike): Value {
		return getPinState(state).sending;
	}

	/** Pin.setValue: used by subcircuits to drive input pins. */
	setValue(state: StateLike, valueIn: Value): void {
		const pull = state.attrs.get(PIN_PULL);
		let value = valueIn;
		if (pull !== "none" && !value.isFullyDefined()) {
			const bits = value.getAll();
			for (let i = 0; i < bits.length; i++) {
				if (pull === "up" && bits[i] !== Value.FALSE) bits[i] = Value.TRUE;
				else if (pull === "down" && bits[i] !== Value.TRUE) bits[i] = Value.FALSE;
			}
			value = Value.fromBits(bits);
		}
		const my = getPinState(state);
		my.sending = value === Value.NIL ? Value.createUnknown(state.attrs.get(WIDTH)) : value;
	}

	override paintGhost(painter: InstancePainter): void {
		const g = painter.g;
		const abs = painter.getBounds();
		g.setLineWidth(2);
		if (painter.getAttr(PIN_OUTPUT)) {
			if (painter.getAttr(WIDTH) === 1) {
				g.drawOval(abs.x + 1, abs.y + 1, abs.width - 1, abs.height - 1);
			} else {
				g.drawRoundRect(abs.x + 1, abs.y + 1, abs.width - 1, abs.height - 1, 6, 6);
			}
		} else {
			g.drawRect(abs.x + 1, abs.y + 1, abs.width - 1, abs.height - 1);
		}
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		const { x, y } = bds;
		const width = painter.getAttr(WIDTH);
		g.setLineWidth(2);
		g.setColor("#000000");
		if (painter.getAttr(PIN_OUTPUT)) {
			if (width === 1) g.drawOval(x + 1, y + 1, bds.width - 1, bds.height - 1);
			else g.drawRoundRect(x + 1, y + 1, bds.width - 1, bds.height - 1, 6, 6);
		} else {
			g.drawRect(x + 1, y + 1, bds.width - 1, bds.height - 1);
		}

		painter.drawLabel();

		if (!painter.showState) {
			g.setColor("#000000");
			drawCenteredText(g, `x${width}`, bds.x + Math.trunc(bds.width / 2), bds.y + Math.trunc(bds.height / 2));
		} else {
			const state = getPinState({ attrs: painter.attrs, getData: () => painter.getData() });
			if (width <= 1) {
				g.setColor(state.receiving.getColor());
				g.fillOval(x + 4, y + 4, 13, 13);
				if (width === 1) {
					g.setColor("#ffffff");
					drawCenteredText(g, state.sending.toDisplayString(), x + 11, y + 9);
				}
			} else {
				g.setColor("#000000");
				paintProbeValue(painter, state.sending);
			}
		}
		painter.drawPorts();
	}

	override createPoker(): Poker {
		let bitPressed = -1;
		const getBit = (state: InstanceState, px: number, py: number): number => {
			const width = state.getAttr(WIDTH);
			if (width === 1) return 0;
			const bds = state.instance.bounds;
			const i = Math.trunc((bds.x + bds.width - px) / 10);
			const j = Math.trunc((bds.y + bds.height - py) / 20);
			const bit = 8 * j + i;
			return bit < 0 || bit >= width ? -1 : bit;
		};
		return {
			mousePressed: (state, x, y) => {
				bitPressed = getBit(state, x, y);
			},
			mouseReleased: (state, x, y) => {
				const bit = getBit(state, x, y);
				if (bit === bitPressed && bit >= 0 && !state.getAttr(PIN_OUTPUT)) {
					const pinState = getPinState(state);
					let val = pinState.sending.get(bit);
					if (val === Value.FALSE) val = Value.TRUE;
					else if (val === Value.TRUE) {
						val = state.getAttr(PIN_TRISTATE) ? Value.UNKNOWN : Value.FALSE;
					} else val = Value.FALSE;
					pinState.sending = pinState.sending.set(bit, val);
					state.fireInvalidated();
				}
				bitPressed = -1;
			},
		};
	}
}

export const PIN = new Pin();

interface ProbeState {
	curValue: Value;
}

class Probe extends ComponentFactory {
	readonly name = "Probe";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.probe";
	override readonly facingAttr = FACING;
	override readonly iconName = "probe.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(RADIX, "2");
		a.set(LABEL, "");
		a.set(LABEL_LOC, "west");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		// not an attribute: the width of the value last seen
		a.setByName("width", 1);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, RADIX, LABEL, LABEL_LOC, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return probeOffsetBounds(attrs.get(FACING), (attrs.getByName("width") as number) ?? 1, attrs.get(RADIX));
	}

	override getPorts(): PortDef[] {
		return [port(0, 0, "input", 0)];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return probeLabel(instance, instance.attrs.get(LABEL_LOC), instance.attrs.get(FACING));
	}

	propagate(state: InstanceState): void {
		let data = state.getData<ProbeState>();
		const oldValue = data === undefined ? Value.NIL : data.curValue;
		const newValue = state.getPort(0);
		if (!oldValue.equals(newValue)) {
			if (data === undefined) {
				data = { curValue: newValue };
				state.setData(data);
			} else {
				data.curValue = newValue;
			}
			const oldWidth = oldValue.width;
			const newWidth = newValue.width;
			if (oldWidth !== newWidth) {
				state.attrs.setByName("width", newWidth);
			}
			state.fireInvalidated();
		}
	}

	override paintGhost(painter: InstancePainter): void {
		const b = painter.getBounds();
		painter.g.drawOval(b.x + 1, b.y + 1, b.width - 1, b.height - 1);
	}

	paintInstance(painter: InstancePainter): void {
		const value = painter.getData<ProbeState>()?.curValue ?? Value.NIL;
		const g = painter.g;
		const bds = painter.getBounds();
		const { x, y } = bds;
		g.setColor("#ffffff");
		g.fillRect(x + 5, y + 5, bds.width - 10, bds.height - 10);
		g.setColor("#808080");
		g.setLineWidth(1);
		if (value.width <= 1) g.drawOval(x + 1, y + 1, bds.width - 2, bds.height - 2);
		else g.drawRoundRect(x + 1, y + 1, bds.width - 2, bds.height - 2, 6, 6);
		g.setColor("#000000");
		painter.drawLabel();
		if (!painter.showState) {
			if (value.width > 0) {
				drawCenteredText(
					g,
					`x${value.width}`,
					bds.x + Math.trunc(bds.width / 2),
					bds.y + Math.trunc(bds.height / 2),
				);
			}
		} else {
			paintProbeValue(painter, value);
		}
		painter.drawPorts();
	}
}

export const PROBE = new Probe();
