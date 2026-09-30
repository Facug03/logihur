// Port of com.cburch.logisim.std.plexers: Multiplexer, Demultiplexer,
// Decoder, Priority Encoder and BitSelector.

import { type AnyAttribute, AttributeSet, bitWidthAttr, boolAttr, optionAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
} from "@/engine/component";
import { Bounds, type Direction, type Loc, loc, locX, locY, reverseDir, translateDir } from "@/engine/geom";
import {
	drawCenteredText,
	drawText,
	type Graphics,
	H_CENTER,
	H_LEFT,
	H_RIGHT,
	V_BASELINE,
} from "@/engine/graphics";
import { Value } from "@/engine/value";
import { compareVersion } from "@/engine/version";
import { FACING, WIDTH } from "../std-attrs";

export const PLEXER_SELECT = bitWidthAttr("select", "plexer.selectBits", 1, 5);
export const PLEXER_TRISTATE = boolAttr("tristate", "plexer.threeState");
export const PLEXER_DISABLED = optionAttr("disabled", "plexer.disabled", [
	{ value: "Z", label: "plexer.disabledFloating" },
	{ value: "0", label: "plexer.disabledZero" },
]);
export const PLEXER_ENABLE = boolAttr("enable", "plexer.enable");
export const PLEXER_SELECT_LOC = optionAttr("selloc", "plexer.selectLoc", [
	{ value: "bl", label: "plexer.selectBottomLeft" },
	{ value: "tr", label: "plexer.selectTopRight" },
]);

const DELAY = 3;
const GRAY = "#808080";
const LIGHT_GRAY = "#c0c0c0";

function drawTrapezoid(g: Graphics, bds: Bounds, facing: Direction, facingLean: number): void {
	const x0 = bds.x;
	const x1 = x0 + bds.width;
	const y0 = bds.y;
	const y1 = y0 + bds.height;
	const xp = [x0, x1, x1, x0];
	const yp = [y0, y0, y1, y1];
	if (facing === "west") {
		yp[0] += facingLean;
		yp[3] -= facingLean;
	} else if (facing === "north") {
		xp[0] += facingLean;
		xp[1] -= facingLean;
	} else if (facing === "south") {
		xp[2] -= facingLean;
		xp[3] += facingLean;
	} else {
		yp[1] += facingLean;
		yp[2] -= facingLean;
	}
	g.setLineWidth(2);
	g.drawPolygon(xp, yp);
}

function plexerContains(x: number, y: number, bds: Bounds, facing: Direction): boolean {
	if (!bds.contains(x, y, 1)) return false;
	const x0 = bds.x;
	const x1 = x0 + bds.width;
	const y0 = bds.y;
	const y1 = y0 + bds.height;
	if (facing === "north" || facing === "south") {
		if (x < x0 + 5 || x > x1 - 5) return facing === "south" ? y < y0 + 5 : y > y1 - 5;
		return true;
	}
	if (y < y0 + 5 || y > y1 - 5) return facing === "east" ? x < x0 + 5 : x > x1 - 5;
	return true;
}

function drawSelectCircle(g: Graphics, bds: Bounds, l: Loc): void {
	const locDelta = Math.max(bds.height, bds.width) <= 50 ? 8 : 6;
	let cx = locX(l);
	let cy = locY(l);
	if (bds.height >= bds.width) {
		cy += cy < bds.y + Math.trunc(bds.height / 2) ? locDelta : -locDelta;
	} else {
		cx += cx < bds.x + Math.trunc(bds.width / 2) ? locDelta : -locDelta;
	}
	g.setColor(LIGHT_GRAY);
	g.fillOval(cx - 3, cy - 3, 6, 6);
}

function disabledBase(state: InstanceState): Value {
	return state.getAttr(PLEXER_DISABLED) === "0" ? Value.FALSE : Value.UNKNOWN;
}

/** Plexers added an enable input in 2.6.3.220; older files have none. */
function enableDefault(sourceVersion: string | undefined): boolean {
	return sourceVersion === undefined || compareVersion(sourceVersion, "2.6.3.220") >= 0;
}

/** "0" label next to the first data port of a MUX (or first input of Pri). */
function zeroLabelMux(bds: Bounds, facing: Direction): [number, number, number] {
	if (facing === "west") return [bds.x + bds.width - 3, bds.y + 15, H_RIGHT];
	if (facing === "north") return [bds.x + 10, bds.y + bds.height - 2, H_CENTER];
	if (facing === "south") return [bds.x + 10, bds.y + 12, H_CENTER];
	return [bds.x + 3, bds.y + 15, H_LEFT];
}

/** "0" label for Demultiplexer/Decoder (outputs on the facing side). */
function zeroLabelDemux(bds: Bounds, facing: Direction): [number, number, number] {
	if (facing === "west") return [bds.x + 3, bds.y + 15, H_LEFT];
	if (facing === "north") return [bds.x + 10, bds.y + 15, H_CENTER];
	if (facing === "south") return [bds.x + 10, bds.y + bds.height - 3, H_CENTER];
	return [bds.x + bds.width - 3, bds.y + 15, H_RIGHT];
}

function drawStub(painter: InstancePainter, index: number, len: number, dx: number, dy: number): void {
	const g = painter.g;
	const pt = (painter.instance as Instance).getPortLocation(index);
	if (painter.showState) g.setColor(painter.getPort(index).getColor());
	g.drawLine(locX(pt) + len * dx, locY(pt) + len * dy, locX(pt), locY(pt));
}

class Multiplexer extends ComponentFactory {
	readonly name = "Multiplexer";
	readonly library = "#Plexers";
	readonly displayKey = "plexers.multiplexer";
	override readonly facingAttr = FACING;
	override readonly iconName = "multiplexer.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(PLEXER_SELECT_LOC, "bl");
		a.set(PLEXER_SELECT, 1);
		a.set(WIDTH, 1);
		a.set(PLEXER_DISABLED, "Z");
		a.set(PLEXER_ENABLE, true);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, PLEXER_SELECT_LOC, PLEXER_SELECT, WIDTH, PLEXER_DISABLED, PLEXER_ENABLE];
	}

	override getDefaultValue(attr: AnyAttribute, sourceVersion?: string): unknown {
		if (attr === PLEXER_ENABLE) return enableDefault(sourceVersion);
		return super.getDefaultValue(attr);
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const dir = attrs.get(FACING);
		const inputs = 1 << attrs.get(PLEXER_SELECT);
		if (inputs === 2) return Bounds.create(-30, -20, 30, 40).rotate("east", dir, 0, 0);
		const offs = -(inputs / 2) * 10 - 10;
		return Bounds.create(-40, offs, 40, inputs * 10 + 20).rotate("east", dir, 0, 0);
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		return plexerContains(dx, dy, this.getOffsetBounds(instance.attrs), instance.attrs.get(FACING));
	}

	override getPorts(instance: Instance): PortDef[] {
		const attrs = instance.attrs;
		const dir = attrs.get(FACING);
		const data = attrs.get(WIDTH);
		const select = attrs.get(PLEXER_SELECT);
		const enable = attrs.get(PLEXER_ENABLE);
		const selMult = attrs.get(PLEXER_SELECT_LOC) === "bl" ? 1 : -1;
		const inputs = 1 << select;
		const ps: PortDef[] = [];
		let sel: Loc;
		if (inputs === 2) {
			let end0: Loc;
			let end1: Loc;
			if (dir === "west") {
				end0 = loc(30, -10);
				end1 = loc(30, 10);
				sel = loc(20, selMult * 20);
			} else if (dir === "north") {
				end0 = loc(-10, 30);
				end1 = loc(10, 30);
				sel = loc(selMult * -20, 20);
			} else if (dir === "south") {
				end0 = loc(-10, -30);
				end1 = loc(10, -30);
				sel = loc(selMult * -20, -20);
			} else {
				end0 = loc(-30, -10);
				end1 = loc(-30, 10);
				sel = loc(-20, selMult * 20);
			}
			ps.push(port(locX(end0), locY(end0), "input", data));
			ps.push(port(locX(end1), locY(end1), "input", data));
		} else {
			let dx = -(inputs / 2) * 10;
			let ddx = 10;
			let dy = -(inputs / 2) * 10;
			let ddy = 10;
			if (dir === "west") {
				dx = 40;
				ddx = 0;
				sel = loc(20, selMult * (dy + 10 * inputs));
			} else if (dir === "north") {
				dy = 40;
				ddy = 0;
				sel = loc(selMult * dx, 20);
			} else if (dir === "south") {
				dy = -40;
				ddy = 0;
				sel = loc(selMult * dx, -20);
			} else {
				dx = -40;
				ddx = 0;
				sel = loc(-20, selMult * (dy + 10 * inputs));
			}
			for (let i = 0; i < inputs; i++) {
				ps.push(port(dx, dy, "input", data));
				dx += ddx;
				dy += ddy;
			}
		}
		const en = translateDir(sel, dir, 10);
		ps.push(port(locX(sel), locY(sel), "input", select));
		if (enable) ps.push(port(locX(en), locY(en), "input", 1));
		ps.push(port(0, 0, "output", data));
		return ps;
	}

	propagate(state: InstanceState): void {
		const data = state.getAttr(WIDTH);
		const enable = state.getAttr(PLEXER_ENABLE);
		const inputs = 1 << state.getAttr(PLEXER_SELECT);
		const en = enable ? state.getPort(inputs + 1) : Value.TRUE;
		let out: Value;
		if (en === Value.FALSE) {
			out = Value.repeat(disabledBase(state), data);
		} else if (en === Value.ERROR && state.isPortConnected(inputs + 1)) {
			out = Value.createError(data);
		} else {
			const sel = state.getPort(inputs);
			if (sel.isFullyDefined()) out = state.getPort(sel.toIntValue());
			else if (sel.isErrorValue()) out = Value.createError(data);
			else out = Value.createUnknown(data);
		}
		state.setPort(inputs + (enable ? 2 : 1), out, DELAY);
	}

	override paintGhost(painter: InstancePainter): void {
		drawTrapezoid(
			painter.g,
			painter.getBounds(),
			painter.getAttr(FACING),
			painter.getAttr(PLEXER_SELECT) === 1 ? 10 : 20,
		);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		const facing = painter.getAttr(FACING);
		const select = painter.getAttr(PLEXER_SELECT);
		const enable = painter.getAttr(PLEXER_ENABLE);
		const inputs = 1 << select;

		g.setLineWidth(3);
		const vertical = facing !== "north" && facing !== "south";
		const selMult = painter.getAttr(PLEXER_SELECT_LOC) === "bl" ? 1 : -1;
		const dx = vertical ? 0 : -selMult;
		const dy = vertical ? selMult : 0;
		if (inputs === 2) drawStub(painter, inputs, -2, dx, dy);
		if (enable) drawStub(painter, inputs + 1, -(inputs === 2 ? 6 : 4), dx, dy);
		g.setLineWidth(1);

		drawSelectCircle(g, bds, (painter.instance as Instance).getPortLocation(inputs));

		const [x0, y0, halign] = zeroLabelMux(bds, facing);
		g.setColor(GRAY);
		drawText(g, "0", x0, y0, halign, V_BASELINE);

		g.setColor("#000000");
		drawTrapezoid(g, bds, facing, select === 1 ? 10 : 20);
		drawCenteredText(g, "MUX", bds.x + Math.trunc(bds.width / 2), bds.y + Math.trunc(bds.height / 2));
		painter.drawPorts();
	}
}

class Demultiplexer extends ComponentFactory {
	readonly name = "Demultiplexer";
	readonly library = "#Plexers";
	readonly displayKey = "plexers.demultiplexer";
	override readonly facingAttr = FACING;
	override readonly iconName = "demultiplexer.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(PLEXER_SELECT_LOC, "bl");
		a.set(PLEXER_SELECT, 1);
		a.set(WIDTH, 1);
		a.set(PLEXER_TRISTATE, false);
		a.set(PLEXER_DISABLED, "Z");
		a.set(PLEXER_ENABLE, true);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, PLEXER_SELECT_LOC, PLEXER_SELECT, WIDTH, PLEXER_TRISTATE, PLEXER_DISABLED, PLEXER_ENABLE];
	}

	override getDefaultValue(attr: AnyAttribute, sourceVersion?: string): unknown {
		if (attr === PLEXER_ENABLE) return enableDefault(sourceVersion);
		return super.getDefaultValue(attr);
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const outputs = 1 << attrs.get(PLEXER_SELECT);
		const bds =
			outputs === 2
				? Bounds.create(0, -20, 30, 40)
				: Bounds.create(0, -(outputs / 2) * 10 - 10, 40, outputs * 10 + 20);
		return bds.rotate("east", attrs.get(FACING), 0, 0);
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		return plexerContains(
			dx,
			dy,
			this.getOffsetBounds(instance.attrs),
			reverseDir(instance.attrs.get(FACING)),
		);
	}

	override getPorts(instance: Instance): PortDef[] {
		const attrs = instance.attrs;
		const facing = attrs.get(FACING);
		const data = attrs.get(WIDTH);
		const select = attrs.get(PLEXER_SELECT);
		const enable = attrs.get(PLEXER_ENABLE);
		const selMult = attrs.get(PLEXER_SELECT_LOC) === "bl" ? 1 : -1;
		const outputs = 1 << select;
		const ps: PortDef[] = [];
		let sel: Loc;
		if (outputs === 2) {
			let end0: Loc;
			let end1: Loc;
			if (facing === "west") {
				end0 = loc(-30, -10);
				end1 = loc(-30, 10);
				sel = loc(-20, selMult * 20);
			} else if (facing === "north") {
				end0 = loc(-10, -30);
				end1 = loc(10, -30);
				sel = loc(selMult * -20, -20);
			} else if (facing === "south") {
				end0 = loc(-10, 30);
				end1 = loc(10, 30);
				sel = loc(selMult * -20, 20);
			} else {
				end0 = loc(30, -10);
				end1 = loc(30, 10);
				sel = loc(20, selMult * 20);
			}
			ps.push(port(locX(end0), locY(end0), "output", data));
			ps.push(port(locX(end1), locY(end1), "output", data));
		} else {
			let dx = -(outputs / 2) * 10;
			let ddx = 10;
			let dy = dx;
			let ddy = 10;
			if (facing === "west") {
				dx = -40;
				ddx = 0;
				sel = loc(-20, selMult * (dy + 10 * outputs));
			} else if (facing === "north") {
				dy = -40;
				ddy = 0;
				sel = loc(selMult * dx, -20);
			} else if (facing === "south") {
				dy = 40;
				ddy = 0;
				sel = loc(selMult * dx, 20);
			} else {
				dx = 40;
				ddx = 0;
				sel = loc(20, selMult * (dy + 10 * outputs));
			}
			for (let i = 0; i < outputs; i++) {
				ps.push(port(dx, dy, "output", data));
				dx += ddx;
				dy += ddy;
			}
		}
		const en = translateDir(sel, facing, -10);
		ps.push(port(locX(sel), locY(sel), "input", select));
		if (enable) ps.push(port(locX(en), locY(en), "input", 1));
		ps.push(port(0, 0, "input", data));
		return ps;
	}

	propagate(state: InstanceState): void {
		const data = state.getAttr(WIDTH);
		const enable = state.getAttr(PLEXER_ENABLE);
		const outputs = 1 << state.getAttr(PLEXER_SELECT);
		const en = enable ? state.getPort(outputs + 1) : Value.TRUE;
		let others = state.getAttr(PLEXER_TRISTATE) ? Value.createUnknown(data) : Value.createKnown(data, 0);
		let outIndex = -1;
		let out: Value | null = null;
		if (en === Value.FALSE) {
			others = Value.repeat(disabledBase(state), data);
		} else if (en === Value.ERROR && state.isPortConnected(outputs + 1)) {
			others = Value.createError(data);
		} else {
			const sel = state.getPort(outputs);
			if (sel.isFullyDefined()) {
				outIndex = sel.toIntValue();
				out = state.getPort(outputs + (enable ? 2 : 1));
			} else if (sel.isErrorValue()) {
				others = Value.createError(data);
			} else {
				others = Value.createUnknown(data);
			}
		}
		for (let i = 0; i < outputs; i++) {
			state.setPort(i, i === outIndex ? (out as Value) : others, DELAY);
		}
	}

	override paintGhost(painter: InstancePainter): void {
		drawTrapezoid(
			painter.g,
			painter.getBounds(),
			reverseDir(painter.getAttr(FACING)),
			painter.getAttr(PLEXER_SELECT) === 1 ? 10 : 20,
		);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		const facing = painter.getAttr(FACING);
		const select = painter.getAttr(PLEXER_SELECT);
		const enable = painter.getAttr(PLEXER_ENABLE);
		const outputs = 1 << select;

		g.setLineWidth(3);
		const vertical = facing === "north" || facing === "south";
		const selMult = painter.getAttr(PLEXER_SELECT_LOC) === "bl" ? 1 : -1;
		const dx = vertical ? selMult : 0;
		const dy = vertical ? 0 : -selMult;
		if (outputs === 2) drawStub(painter, outputs, 2, dx, dy);
		if (enable) drawStub(painter, outputs + 1, outputs === 2 ? 6 : 4, dx, dy);
		g.setLineWidth(1);

		drawSelectCircle(g, bds, (painter.instance as Instance).getPortLocation(outputs));

		const [x0, y0, halign] = zeroLabelDemux(bds, facing);
		g.setColor(GRAY);
		drawText(g, "0", x0, y0, halign, V_BASELINE);

		g.setColor("#000000");
		drawTrapezoid(g, bds, reverseDir(facing), select === 1 ? 10 : 20);
		drawCenteredText(g, "DMX", bds.x + Math.trunc(bds.width / 2), bds.y + Math.trunc(bds.height / 2));
		painter.drawPorts();
	}
}

class Decoder extends ComponentFactory {
	readonly name = "Decoder";
	readonly library = "#Plexers";
	readonly displayKey = "plexers.decoder";
	override readonly facingAttr = FACING;
	override readonly iconName = "decoder.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(PLEXER_SELECT_LOC, "bl");
		a.set(PLEXER_SELECT, 1);
		a.set(PLEXER_TRISTATE, false);
		a.set(PLEXER_DISABLED, "Z");
		a.set(PLEXER_ENABLE, true);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, PLEXER_SELECT_LOC, PLEXER_SELECT, PLEXER_TRISTATE, PLEXER_DISABLED, PLEXER_ENABLE];
	}

	override getDefaultValue(attr: AnyAttribute, sourceVersion?: string): unknown {
		if (attr === PLEXER_ENABLE) return enableDefault(sourceVersion);
		return super.getDefaultValue(attr);
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const facing = attrs.get(FACING);
		const outputs = 1 << attrs.get(PLEXER_SELECT);
		let reversed = facing === "west" || facing === "north";
		if (attrs.get(PLEXER_SELECT_LOC) === "tr") reversed = !reversed;
		const bds =
			outputs === 2
				? Bounds.create(-20, reversed ? 0 : -40, 30, 40)
				: Bounds.create(-20, reversed ? -10 : -(outputs * 10 + 10), 40, outputs * 10 + 20);
		return bds.rotate("east", facing, 0, 0);
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		return plexerContains(
			dx,
			dy,
			this.getOffsetBounds(instance.attrs),
			reverseDir(instance.attrs.get(FACING)),
		);
	}

	override getPorts(instance: Instance): PortDef[] {
		const attrs = instance.attrs;
		const facing = attrs.get(FACING);
		const topRight = attrs.get(PLEXER_SELECT_LOC) === "tr";
		const select = attrs.get(PLEXER_SELECT);
		const enable = attrs.get(PLEXER_ENABLE);
		const outputs = 1 << select;
		const ps: PortDef[] = [];
		if (outputs === 2) {
			let end0: Loc;
			let end1: Loc;
			if (facing === "north" || facing === "south") {
				const y = facing === "north" ? -10 : 10;
				end0 = topRight ? loc(-30, y) : loc(10, y);
				end1 = topRight ? loc(-10, y) : loc(30, y);
			} else {
				const x = facing === "west" ? -10 : 10;
				end0 = topRight ? loc(x, 10) : loc(x, -30);
				end1 = topRight ? loc(x, 30) : loc(x, -10);
			}
			ps.push(port(locX(end0), locY(end0), "output", 1));
			ps.push(port(locX(end1), locY(end1), "output", 1));
		} else {
			let dx: number;
			let ddx: number;
			let dy: number;
			let ddy: number;
			if (facing === "north" || facing === "south") {
				dy = facing === "north" ? -20 : 20;
				ddy = 0;
				dx = topRight ? -10 * outputs : 0;
				ddx = 10;
			} else {
				dx = facing === "west" ? -20 : 20;
				ddx = 0;
				dy = topRight ? 0 : -10 * outputs;
				ddy = 10;
			}
			for (let i = 0; i < outputs; i++) {
				ps.push(port(dx, dy, "output", 1));
				dx += ddx;
				dy += ddy;
			}
		}
		const en = translateDir(loc(0, 0), facing, -10);
		ps.push(port(0, 0, "input", select));
		if (enable) ps.push(port(locX(en), locY(en), "input", 1));
		return ps;
	}

	propagate(state: InstanceState): void {
		const enable = state.getAttr(PLEXER_ENABLE);
		const outputs = 1 << state.getAttr(PLEXER_SELECT);
		let others = state.getAttr(PLEXER_TRISTATE) ? Value.UNKNOWN : Value.FALSE;
		let outIndex = -1;
		const en = enable ? state.getPort(outputs + 1) : Value.TRUE;
		if (en === Value.FALSE) {
			others = disabledBase(state);
		} else if (en === Value.ERROR && state.isPortConnected(outputs + 1)) {
			others = Value.ERROR;
		} else {
			const sel = state.getPort(outputs);
			if (sel.isFullyDefined()) outIndex = sel.toIntValue();
			else if (sel.isErrorValue()) others = Value.ERROR;
			else others = Value.UNKNOWN;
		}
		for (let i = 0; i < outputs; i++) {
			state.setPort(i, i === outIndex ? Value.TRUE : others, DELAY);
		}
	}

	override paintGhost(painter: InstancePainter): void {
		drawTrapezoid(
			painter.g,
			painter.getBounds(),
			reverseDir(painter.getAttr(FACING)),
			painter.getAttr(PLEXER_SELECT) === 1 ? 10 : 20,
		);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		const facing = painter.getAttr(FACING);
		const selMult = painter.getAttr(PLEXER_SELECT_LOC) === "tr" ? -1 : 1;
		const enable = painter.getAttr(PLEXER_ENABLE);
		const outputs = 1 << painter.getAttr(PLEXER_SELECT);

		g.setLineWidth(3);
		const vertical = facing === "north" || facing === "south";
		const dx = vertical ? selMult : 0;
		const dy = vertical ? 0 : -selMult;
		if (outputs === 2) drawStub(painter, outputs, 2, dx, dy);
		if (enable) drawStub(painter, outputs + 1, outputs === 2 ? 6 : 4, dx, dy);
		g.setLineWidth(1);

		drawSelectCircle(g, bds, (painter.instance as Instance).getPortLocation(outputs));

		const [x0, y0, halign] = zeroLabelDemux(bds, facing);
		g.setColor(GRAY);
		drawText(g, "0", x0, y0, halign, V_BASELINE);

		g.setColor("#000000");
		drawTrapezoid(g, bds, reverseDir(facing), outputs === 2 ? 10 : 20);
		drawCenteredText(g, "Decd", bds.x + Math.trunc(bds.width / 2), bds.y + Math.trunc(bds.height / 2));
		painter.drawPorts();
	}
}

const PRI_OUT = 0;
const PRI_EN_IN = 1;
const PRI_EN_OUT = 2;
const PRI_GS = 3;

class PriorityEncoder extends ComponentFactory {
	readonly name = "Priority Encoder";
	readonly library = "#Plexers";
	readonly displayKey = "plexers.priorityEncoder";
	override readonly facingAttr = FACING;
	override readonly iconName = "priencod.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(PLEXER_SELECT, 3);
		a.set(PLEXER_DISABLED, "Z");
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, PLEXER_SELECT, PLEXER_DISABLED];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const dir = attrs.get(FACING);
		const inputs = 1 << attrs.get(PLEXER_SELECT);
		const offs = -5 * inputs;
		const len = 10 * inputs + 10;
		if (dir === "north") return Bounds.create(offs, 0, len, 40);
		if (dir === "south") return Bounds.create(offs, -40, len, 40);
		if (dir === "west") return Bounds.create(0, offs, 40, len);
		return Bounds.create(-40, offs, 40, len);
	}

	override getPorts(instance: Instance): PortDef[] {
		const dir = instance.attrs.get(FACING);
		const select = instance.attrs.get(PLEXER_SELECT);
		const n = 1 << select;
		const ps: PortDef[] = [];
		if (dir === "north" || dir === "south") {
			const x = -5 * n + 10;
			const y = dir === "north" ? 40 : -40;
			for (let i = 0; i < n; i++) ps.push(port(x + 10 * i, y, "input", 1));
			ps.push(port(0, 0, "output", select));
			ps.push(port(x + 10 * n, y / 2, "input", 1));
			ps.push(port(x - 10, y / 2, "output", 1));
			ps.push(port(10, 0, "output", 1));
		} else {
			const x = dir === "east" ? -40 : 40;
			const y = -5 * n + 10;
			for (let i = 0; i < n; i++) ps.push(port(x, y + 10 * i, "input", 1));
			ps.push(port(0, 0, "output", select));
			ps.push(port(x / 2, y + 10 * n, "input", 1));
			ps.push(port(x / 2, y - 10, "output", 1));
			ps.push(port(0, 10, "output", 1));
		}
		return ps;
	}

	propagate(state: InstanceState): void {
		const select = state.getAttr(PLEXER_SELECT);
		const n = 1 << select;
		const enabled = state.getPort(n + PRI_EN_IN) !== Value.FALSE;
		let out = -1;
		let outDefault: Value;
		if (enabled) {
			outDefault = Value.createUnknown(select);
			for (let i = n - 1; i >= 0; i--) {
				if (state.getPort(i) === Value.TRUE) {
					out = i;
					break;
				}
			}
		} else {
			outDefault = Value.repeat(disabledBase(state), select);
		}
		if (out < 0) {
			state.setPort(n + PRI_OUT, outDefault, DELAY);
			state.setPort(n + PRI_EN_OUT, enabled ? Value.TRUE : Value.FALSE, DELAY);
			state.setPort(n + PRI_GS, Value.FALSE, DELAY);
		} else {
			state.setPort(n + PRI_OUT, Value.createKnown(select, out), DELAY);
			state.setPort(n + PRI_EN_OUT, Value.FALSE, DELAY);
			state.setPort(n + PRI_GS, Value.TRUE, DELAY);
		}
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		const bds = painter.getBounds();
		const [x0, y0, halign] = zeroLabelMux(bds, painter.getAttr(FACING));
		g.setColor(GRAY);
		drawText(g, "0", x0, y0, halign, V_BASELINE);
		g.setColor("#000000");
		drawCenteredText(g, "Pri", bds.x + Math.trunc(bds.width / 2), bds.y + Math.trunc(bds.height / 2));
		painter.drawPorts();
	}
}

export const BIT_SELECTOR_GROUP = bitWidthAttr("group", "plexer.bitSelectorGroup");

class BitSelector extends ComponentFactory {
	readonly name = "BitSelector";
	readonly library = "#Plexers";
	readonly displayKey = "plexers.bitSelector";
	override readonly facingAttr = FACING;
	override readonly iconName = "bitSelector.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIDTH, 8);
		a.set(BIT_SELECTOR_GROUP, 1);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIDTH, BIT_SELECTOR_GROUP];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return Bounds.create(-30, -15, 30, 30).rotate("east", attrs.get(FACING), 0, 0);
	}

	override getPorts(instance: Instance): PortDef[] {
		const facing = instance.attrs.get(FACING);
		const data = instance.attrs.get(WIDTH);
		const group = instance.attrs.get(BIT_SELECTOR_GROUP);
		let groups = Math.trunc((data + group - 1) / group) - 1;
		let selectBits = 1;
		if (groups > 0) {
			while (groups !== 1) {
				groups >>= 1;
				selectBits++;
			}
		}
		let inPt: Loc;
		let selPt: Loc;
		if (facing === "west") {
			inPt = loc(30, 0);
			selPt = loc(10, 10);
		} else if (facing === "north") {
			inPt = loc(0, 30);
			selPt = loc(-10, 10);
		} else if (facing === "south") {
			inPt = loc(0, -30);
			selPt = loc(-10, -10);
		} else {
			inPt = loc(-30, 0);
			selPt = loc(-10, 10);
		}
		return [
			port(0, 0, "output", group),
			port(locX(inPt), locY(inPt), "input", data),
			port(locX(selPt), locY(selPt), "input", selectBits),
		];
	}

	propagate(state: InstanceState): void {
		const data = state.getPort(1);
		const select = state.getPort(2);
		const groupBits = state.getAttr(BIT_SELECTOR_GROUP);
		let group: Value;
		if (!select.isFullyDefined()) {
			group = Value.createUnknown(groupBits);
		} else {
			const shift = select.toIntValue() * groupBits;
			if (shift >= data.width) {
				group = Value.createKnown(groupBits, 0);
			} else if (groupBits === 1) {
				group = data.get(shift);
			} else {
				const bits: Value[] = [];
				for (let i = 0; i < groupBits; i++) {
					bits.push(shift + i >= data.width ? Value.FALSE : data.get(shift + i));
				}
				group = Value.fromBits(bits);
			}
		}
		state.setPort(0, group, DELAY);
	}

	override paintGhost(painter: InstancePainter): void {
		drawTrapezoid(painter.g, painter.getBounds(), painter.getAttr(FACING), 9);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		drawTrapezoid(g, bds, painter.getAttr(FACING), 9);
		g.setColor("#000000");
		drawCenteredText(g, "Sel", bds.x + Math.trunc(bds.width / 2), bds.y + Math.trunc(bds.height / 2));
		painter.drawPorts();
	}
}

export const MULTIPLEXER = new Multiplexer();
export const DEMULTIPLEXER = new Demultiplexer();
export const DECODER = new Decoder();
export const PRIORITY_ENCODER = new PriorityEncoder();
export const BIT_SELECTOR = new BitSelector();
