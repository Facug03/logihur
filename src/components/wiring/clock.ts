// Port of com.cburch.logisim.std.wiring.Clock.

import { type AnyAttribute, AttributeSet, DEFAULT_LABEL_FONT, intRangeAttr } from "@/engine/attributes";
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
import type { Bounds } from "@/engine/geom";
import type { CircuitState, ClockLike } from "@/engine/simulation";
import { Value } from "@/engine/value";
import { FACING, LABEL, LABEL_FONT, LABEL_LOC } from "../std-attrs";
import { probeLabel, probeOffsetBounds } from "./pin";

export const CLOCK_HIGH = intRangeAttr("highDuration", "clock.high", 1, 0x7fffffff);
export const CLOCK_LOW = intRangeAttr("lowDuration", "clock.low", 1, 0x7fffffff);

interface ClockState {
	sending: Value;
	clicks: number;
}

function getState(state: { getData<T>(): T | undefined; setData?(d: unknown): void }): ClockState {
	let ret = state.getData<ClockState>();
	if (ret === undefined) {
		ret = { sending: Value.FALSE, clicks: 0 };
		state.setData?.(ret);
	}
	return ret;
}

class Clock extends ComponentFactory implements ClockLike {
	readonly name = "Clock";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.clock";
	override readonly role = "clock" as const;
	override readonly facingAttr = FACING;
	override readonly iconName = "clock.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(CLOCK_HIGH, 1);
		a.set(CLOCK_LOW, 1);
		a.set(LABEL, "");
		a.set(LABEL_LOC, "west");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, CLOCK_HIGH, CLOCK_LOW, LABEL, LABEL_LOC, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return probeOffsetBounds(attrs.get(FACING), 1, "2");
	}

	override getPorts(): PortDef[] {
		return [port(0, 0, "output", 1)];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return probeLabel(instance, instance.attrs.get(LABEL_LOC), instance.attrs.get(FACING));
	}

	propagate(state: InstanceState): void {
		const val = state.getPort(0);
		const q = getState(state);
		if (!val.equals(q.sending)) state.setPort(0, q.sending, 1);
	}

	tick(circState: CircuitState, ticks: number, comp: Instance): boolean {
		const high = comp.attrs.get(CLOCK_HIGH);
		const low = comp.attrs.get(CLOCK_LOW);
		let state = circState.getData(comp) as ClockState | undefined;
		if (state === undefined) {
			state = { sending: Value.FALSE, clicks: 0 };
			circState.setData(comp, state);
		}
		let curValue = ticks % (high + low) < low;
		if (state.clicks % 2 === 1) curValue = !curValue;
		const desired = curValue ? Value.FALSE : Value.TRUE;
		if (!state.sending.equals(desired)) {
			state.sending = desired;
			circState.fireInvalidated(comp);
			return true;
		}
		return false;
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		let { x, y } = bds;
		g.setLineWidth(2);
		g.setColor("#000000");
		g.drawRect(x, y, bds.width, bds.height);
		painter.drawLabel();
		let drawUp: boolean;
		if (painter.showState) {
			const state = getState({ getData: () => painter.getData() });
			g.setColor(state.sending.getColor());
			drawUp = state.sending === Value.TRUE;
		} else {
			g.setColor("#000000");
			drawUp = true;
		}
		x += 10;
		y += 10;
		const xs = [x - 6, x - 6, x, x, x + 6, x + 6];
		const ys = drawUp ? [y, y - 4, y - 4, y + 4, y + 4, y] : [y, y + 4, y + 4, y - 4, y - 4, y];
		g.drawPolyline(xs, ys);
		painter.drawPorts();
	}

	override createPoker(): Poker {
		let isPressed = true;
		const inside = (state: InstanceState, x: number, y: number) => state.instance.bounds.contains(x, y);
		return {
			mousePressed: (state, x, y) => {
				isPressed = inside(state, x, y);
			},
			mouseReleased: (state, x, y) => {
				if (isPressed && inside(state, x, y)) {
					const my = getState(state);
					my.sending = my.sending.not();
					my.clicks++;
					state.fireInvalidated();
				}
				isPressed = false;
			},
		};
	}
}

export const CLOCK = new Clock();
