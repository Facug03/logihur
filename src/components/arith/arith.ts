// Port of com.cburch.logisim.std.arith: Adder, Subtractor, Multiplier,
// Divider, Negator, Comparator, Shifter, BitAdder and BitFinder.

import { type AnyAttribute, AttributeSet, intRangeAttr, optionAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
} from "@/engine/component";
import { Bounds, locX, locY } from "@/engine/geom";
import { drawCenteredText, type Graphics } from "@/engine/graphics";
import { Value } from "@/engine/value";
import { WIDTH } from "../std-attrs";

const PER_DELAY = 1;
const BOX = Bounds.create(-40, -20, 40, 40);

/** Arithmetic components share the 40x40 box and a single WIDTH attribute. */
abstract class ArithFactory extends ComponentFactory {
	readonly library = "#Arithmetic";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(WIDTH, 8);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [WIDTH];
	}

	getOffsetBounds(_attrs?: AttributeSet): Bounds {
		return BOX;
	}
}

/** Adder.computeSum */
export function computeSum(w: number, a: Value, b: Value, cIn: Value): [Value, Value] {
	let c = cIn;
	if (c === Value.UNKNOWN || c === Value.NIL) c = Value.FALSE;
	if (a.isFullyDefined() && b.isFullyDefined() && c.isFullyDefined()) {
		if (w >= 32) {
			const sum = (a.toIntValue() >>> 0) + (b.toIntValue() >>> 0) + (c.toIntValue() >>> 0);
			const carry = Math.floor(sum / 2 ** 32) & 1;
			return [Value.createKnown(w, sum | 0), carry === 0 ? Value.FALSE : Value.TRUE];
		}
		const sum = (a.toIntValue() + b.toIntValue() + c.toIntValue()) | 0;
		return [Value.createKnown(w, sum), ((sum >> w) & 1) === 0 ? Value.FALSE : Value.TRUE];
	}
	const bits: Value[] = new Array(w);
	let carry = c;
	for (let i = 0; i < w; i++) {
		if (carry === Value.ERROR) {
			bits[i] = Value.ERROR;
		} else if (carry === Value.UNKNOWN) {
			bits[i] = Value.UNKNOWN;
		} else {
			const ab = a.get(i);
			const bb = b.get(i);
			if (ab === Value.ERROR || bb === Value.ERROR) {
				bits[i] = Value.ERROR;
				carry = Value.ERROR;
			} else if (ab === Value.UNKNOWN || bb === Value.UNKNOWN) {
				bits[i] = Value.UNKNOWN;
				carry = Value.UNKNOWN;
			} else {
				const sum =
					(ab === Value.TRUE ? 1 : 0) + (bb === Value.TRUE ? 1 : 0) + (carry === Value.TRUE ? 1 : 0);
				bits[i] = (sum & 1) === 1 ? Value.TRUE : Value.FALSE;
				carry = sum >= 2 ? Value.TRUE : Value.FALSE;
			}
		}
	}
	return [Value.fromBits(bits), carry];
}

class Adder extends ArithFactory {
	readonly name = "Adder";
	readonly displayKey = "arith.adder";
	override readonly iconName = "adder.gif";

	override getPorts(): PortDef[] {
		return [
			port(-40, -10, "input", WIDTH),
			port(-40, 10, "input", WIDTH),
			port(0, 0, "output", WIDTH),
			port(-20, -20, "input", 1),
			// Logisim 2.7.1 declares carry out as an input port (it still drives it).
			port(-20, 20, "input", 1),
		];
	}

	propagate(state: InstanceState): void {
		const w = state.getAttr(WIDTH);
		const [sum, carry] = computeSum(w, state.getPort(0), state.getPort(1), state.getPort(3));
		const delay = (w + 2) * PER_DELAY;
		state.setPort(2, sum, delay);
		state.setPort(4, carry, delay);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawPort(0);
		painter.drawPort(1);
		painter.drawPort(2);
		g.setColor("#808080");
		painter.drawPort(3, "c in", "north");
		painter.drawPort(4, "c out", "south");
		const x = locX(painter.getLocation());
		const y = locY(painter.getLocation());
		g.setLineWidth(2);
		g.setColor("#000000");
		g.drawLine(x - 15, y, x - 5, y);
		g.drawLine(x - 10, y - 5, x - 10, y + 5);
		g.setLineWidth(1);
	}
}

class Subtractor extends ArithFactory {
	readonly name = "Subtractor";
	readonly displayKey = "arith.subtractor";
	override readonly iconName = "subtractor.gif";

	override getPorts(): PortDef[] {
		return [
			port(-40, -10, "input", WIDTH),
			port(-40, 10, "input", WIDTH),
			port(0, 0, "output", WIDTH),
			port(-20, -20, "input", 1),
			port(-20, 20, "output", 1),
		];
	}

	propagate(state: InstanceState): void {
		const w = state.getAttr(WIDTH);
		let bIn = state.getPort(3);
		if (bIn === Value.UNKNOWN || bIn === Value.NIL) bIn = Value.FALSE;
		const [diff, carry] = computeSum(w, state.getPort(0), state.getPort(1).not(), bIn.not());
		const delay = (w + 4) * PER_DELAY;
		state.setPort(2, diff, delay);
		state.setPort(4, carry.not(), delay);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawPort(0);
		painter.drawPort(1);
		painter.drawPort(2);
		g.setColor("#808080");
		painter.drawPort(3, "b in", "north");
		painter.drawPort(4, "b out", "south");
		const x = locX(painter.getLocation());
		const y = locY(painter.getLocation());
		g.setLineWidth(2);
		g.setColor("#000000");
		g.drawLine(x - 15, y, x - 5, y);
		g.setLineWidth(1);
	}
}

function findUnknown(vals: Value[]): number {
	for (let i = 0; i < vals.length; i++) if (!vals[i].isFullyDefined()) return i;
	return vals.length;
}

function findError(vals: Value[]): number {
	for (let i = 0; i < vals.length; i++) if (vals[i].isErrorValue()) return i;
	return vals.length;
}

function getKnown(vals: Value[]): number {
	let ret = 0;
	for (let i = 0; i < vals.length; i++) {
		const val = vals[i].toIntValue();
		if (val < 0) return ret;
		ret |= val << i;
	}
	return ret;
}

/** Multiplier.computeProduct (Java long arithmetic via BigInt). */
export function computeProduct(w: number, a: Value, b: Value, cIn: Value): [Value, Value] {
	let c = cIn;
	if (c === Value.NIL || c.isUnknown()) c = Value.createKnown(w, 0);
	if (a.isFullyDefined() && b.isFullyDefined() && c.isFullyDefined()) {
		const sum = BigInt(a.toIntValue()) * BigInt(b.toIntValue()) + BigInt(c.toIntValue());
		return [
			Value.createKnown(w, Number(BigInt.asIntN(32, sum))),
			Value.createKnown(w, Number(BigInt.asIntN(32, sum >> BigInt(w)))),
		];
	}
	const avals = a.getAll();
	const bvals = b.getAll();
	const cvals = c.getAll();
	const known = Math.min(findUnknown(avals), findUnknown(bvals), findUnknown(cvals));
	const error = Math.min(findError(avals), findError(bvals), findError(cvals));
	const ret = (Math.imul(getKnown(avals), getKnown(bvals)) + getKnown(cvals)) | 0;
	const bits: Value[] = new Array(w);
	for (let i = 0; i < w; i++) {
		if (i < known) bits[i] = (ret & (1 << i)) !== 0 ? Value.TRUE : Value.FALSE;
		else if (i < error) bits[i] = Value.UNKNOWN;
		else bits[i] = Value.ERROR;
	}
	return [Value.fromBits(bits), error < w ? Value.createError(w) : Value.createUnknown(w)];
}

class Multiplier extends ArithFactory {
	readonly name = "Multiplier";
	readonly displayKey = "arith.multiplier";
	override readonly iconName = "multiplier.gif";

	override getPorts(): PortDef[] {
		return [
			port(-40, -10, "input", WIDTH),
			port(-40, 10, "input", WIDTH),
			port(0, 0, "output", WIDTH),
			port(-20, -20, "input", WIDTH),
			port(-20, 20, "output", WIDTH),
		];
	}

	propagate(state: InstanceState): void {
		const w = state.getAttr(WIDTH);
		const [prod, carry] = computeProduct(w, state.getPort(0), state.getPort(1), state.getPort(3));
		const delay = w * (w + 2) * PER_DELAY;
		state.setPort(2, prod, delay);
		state.setPort(4, carry, delay);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawPort(0);
		painter.drawPort(1);
		painter.drawPort(2);
		g.setColor("#808080");
		painter.drawPort(3, "c in", "north");
		painter.drawPort(4, "c out", "south");
		const x = locX(painter.getLocation());
		const y = locY(painter.getLocation());
		g.setLineWidth(2);
		g.setColor("#000000");
		g.drawLine(x - 15, y - 5, x - 5, y + 5);
		g.drawLine(x - 15, y + 5, x - 5, y - 5);
		g.setLineWidth(1);
	}
}

/** Divider.computeResult (Java long arithmetic via BigInt). */
export function computeQuotient(w: number, a: Value, b: Value, upperIn: Value): [Value, Value] {
	let upper = upperIn;
	if (upper === Value.NIL || upper.isUnknown()) upper = Value.createKnown(w, 0);
	if (a.isFullyDefined() && b.isFullyDefined() && upper.isFullyDefined()) {
		const num = BigInt.asIntN(64, (BigInt(upper.toIntValue()) << BigInt(w)) | BigInt(a.toIntValue() >>> 0));
		let den = BigInt(b.toIntValue() >>> 0);
		if (den === 0n) den = 1n;
		let result = num / den;
		let rem = num % den;
		if (rem < 0n) {
			rem += den;
			result--;
		}
		return [
			Value.createKnown(w, Number(BigInt.asIntN(32, result))),
			Value.createKnown(w, Number(BigInt.asIntN(32, rem))),
		];
	}
	if (a.isErrorValue() || b.isErrorValue() || upper.isErrorValue()) {
		return [Value.createError(w), Value.createError(w)];
	}
	return [Value.createUnknown(w), Value.createUnknown(w)];
}

class Divider extends ArithFactory {
	readonly name = "Divider";
	readonly displayKey = "arith.divider";
	override readonly iconName = "divider.gif";

	override getPorts(): PortDef[] {
		return [
			port(-40, -10, "input", WIDTH),
			port(-40, 10, "input", WIDTH),
			port(0, 0, "output", WIDTH),
			port(-20, -20, "input", WIDTH),
			port(-20, 20, "output", WIDTH),
		];
	}

	propagate(state: InstanceState): void {
		const w = state.getAttr(WIDTH);
		const [quot, rem] = computeQuotient(w, state.getPort(0), state.getPort(1), state.getPort(3));
		const delay = w * (w + 2) * PER_DELAY;
		state.setPort(2, quot, delay);
		state.setPort(4, rem, delay);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawPort(0);
		painter.drawPort(1);
		painter.drawPort(2);
		g.setColor("#808080");
		painter.drawPort(3, "superior", "north");
		painter.drawPort(4, "resto", "south");
		const x = locX(painter.getLocation());
		const y = locY(painter.getLocation());
		g.setLineWidth(2);
		g.setColor("#000000");
		g.fillOval(x - 12, y - 7, 4, 4);
		g.drawLine(x - 15, y, x - 5, y);
		g.fillOval(x - 12, y + 3, 4, 4);
		g.setLineWidth(1);
	}
}

export function computeNegation(input: Value): Value {
	if (input.isFullyDefined()) return Value.createKnown(input.width, -input.toIntValue());
	const bits = input.getAll();
	let fill = Value.FALSE;
	let pos = 0;
	while (pos < bits.length) {
		if (bits[pos] === Value.FALSE) {
			bits[pos] = fill;
		} else if (bits[pos] === Value.TRUE) {
			if (fill !== Value.FALSE) bits[pos] = fill;
			pos++;
			break;
		} else if (bits[pos] === Value.ERROR) {
			fill = Value.ERROR;
		} else if (fill === Value.FALSE) {
			fill = bits[pos];
		} else {
			bits[pos] = fill;
		}
		pos++;
	}
	while (pos < bits.length) {
		if (bits[pos] === Value.TRUE) bits[pos] = Value.FALSE;
		else if (bits[pos] === Value.FALSE) bits[pos] = Value.TRUE;
		pos++;
	}
	return Value.fromBits(bits);
}

class Negator extends ArithFactory {
	readonly name = "Negator";
	readonly displayKey = "arith.negator";
	override readonly iconName = "negator.gif";

	override getPorts(): PortDef[] {
		return [port(-40, 0, "input", WIDTH), port(0, 0, "output", WIDTH)];
	}

	propagate(state: InstanceState): void {
		state.setPort(1, computeNegation(state.getPort(0)), (state.getAttr(WIDTH) + 2) * PER_DELAY);
	}

	paintInstance(painter: InstancePainter): void {
		painter.drawBounds();
		painter.drawPort(0);
		painter.drawPort(1, "-x", "west");
	}
}

export const COMPARATOR_MODE = optionAttr("mode", "arith.comparatorType", [
	{ value: "twosComplement", label: "arith.twosComplement" },
	{ value: "unsigned", label: "arith.unsigned" },
]);

class Comparator extends ArithFactory {
	readonly name = "Comparator";
	readonly displayKey = "arith.comparator";
	override readonly iconName = "comparator.gif";

	override createAttributeSet(): AttributeSet {
		const a = super.createAttributeSet();
		a.set(COMPARATOR_MODE, "twosComplement");
		return a;
	}

	override getAttributes(): AnyAttribute[] {
		return [WIDTH, COMPARATOR_MODE];
	}

	override getPorts(): PortDef[] {
		return [
			port(-40, -10, "input", WIDTH),
			port(-40, 10, "input", WIDTH),
			port(0, -10, "output", 1),
			port(0, 0, "output", 1),
			port(0, 10, "output", 1),
		];
	}

	propagate(state: InstanceState): void {
		let gt = Value.FALSE;
		let eq = Value.TRUE;
		let lt = Value.FALSE;
		const ax = state.getPort(0).getAll();
		const bx = state.getPort(1).getAll();
		const maxlen = Math.max(ax.length, bx.length);
		for (let pos = maxlen - 1; pos >= 0; pos--) {
			let ab = pos < ax.length ? ax[pos] : Value.ERROR;
			let bb = pos < bx.length ? bx[pos] : Value.ERROR;
			if (pos === ax.length - 1 && ab !== bb && state.getAttr(COMPARATOR_MODE) !== "unsigned") {
				const t = ab;
				ab = bb;
				bb = t;
			}
			if (ab === Value.ERROR || bb === Value.ERROR) {
				gt = eq = lt = Value.ERROR;
				break;
			}
			if (ab === Value.UNKNOWN || bb === Value.UNKNOWN) {
				gt = eq = lt = Value.UNKNOWN;
				break;
			}
			if (ab !== bb) {
				eq = Value.FALSE;
				if (ab === Value.TRUE) gt = Value.TRUE;
				else lt = Value.TRUE;
				break;
			}
		}
		const delay = (state.getAttr(WIDTH) + 2) * PER_DELAY;
		state.setPort(2, gt, delay);
		state.setPort(3, eq, delay);
		state.setPort(4, lt, delay);
	}

	paintInstance(painter: InstancePainter): void {
		painter.drawBounds();
		painter.drawPort(0);
		painter.drawPort(1);
		painter.drawPort(2, ">", "west");
		painter.drawPort(3, "=", "west");
		painter.drawPort(4, "<", "west");
	}
}

export const SHIFTER_SHIFT = optionAttr("shift", "arith.shiftType", [
	{ value: "ll", label: "arith.shiftLogicalLeft" },
	{ value: "lr", label: "arith.shiftLogicalRight" },
	{ value: "ar", label: "arith.shiftArithmeticRight" },
	{ value: "rl", label: "arith.shiftRollLeft" },
	{ value: "rr", label: "arith.shiftRollRight" },
]);

export function computeShift(shift: string, bits: number, vx: Value, vd: Value): Value {
	if (!vd.isFullyDefined() || vx.width !== bits) return Value.createError(bits);
	let d = vd.toIntValue();
	if (d === 0) return vx;
	if (vx.isFullyDefined()) {
		const x = vx.toIntValue();
		let y: number;
		if (shift === "lr") {
			y = x >>> d;
		} else if (shift === "ar") {
			if (d >= bits) d = bits - 1;
			y = (x >> d) | ((x << (32 - bits)) >> (32 - bits + d));
		} else if (shift === "rr") {
			if (d >= bits) d -= bits;
			y = (x >>> d) | (x << (bits - d));
		} else if (shift === "rl") {
			if (d >= bits) d -= bits;
			y = (x << d) | (x >>> (bits - d));
		} else {
			y = x << d;
		}
		return Value.createKnown(bits, y);
	}
	const x = vx.getAll();
	const y: Value[] = new Array(bits);
	const copy = (src: number, dst: number, len: number) => {
		for (let i = 0; i < len; i++) y[dst + i] = x[src + i];
	};
	const fill = (from: number, to: number, v: Value) => {
		for (let i = from; i < to; i++) y[i] = v;
	};
	if (shift === "lr") {
		if (d >= bits) d = bits;
		copy(d, 0, bits - d);
		fill(bits - d, bits, Value.FALSE);
	} else if (shift === "ar") {
		if (d >= bits) d = bits;
		copy(d, 0, x.length - d);
		fill(bits - d, y.length, x[bits - 1]);
	} else if (shift === "rr") {
		if (d >= bits) d -= bits;
		copy(d, 0, bits - d);
		copy(0, bits - d, d);
	} else if (shift === "rl") {
		if (d >= bits) d -= bits;
		copy(x.length - d, 0, d);
		copy(0, d, bits - d);
	} else {
		if (d >= bits) d = bits;
		fill(0, d, Value.FALSE);
		copy(0, d, bits - d);
	}
	return Value.fromBits(y);
}

function shiftBits(data: number): number {
	let shift = 1;
	while (1 << shift < data) shift++;
	return shift;
}

class Shifter extends ArithFactory {
	readonly name = "Shifter";
	readonly displayKey = "arith.shifter";
	override readonly iconName = "shifter.gif";

	override createAttributeSet(): AttributeSet {
		const a = super.createAttributeSet();
		a.set(SHIFTER_SHIFT, "ll");
		return a;
	}

	override getAttributes(): AnyAttribute[] {
		return [WIDTH, SHIFTER_SHIFT];
	}

	override getPorts(instance: Instance): PortDef[] {
		const data = instance.attrs.get(WIDTH);
		return [
			port(-40, -10, "input", data),
			port(-40, 10, "input", shiftBits(data)),
			port(0, 0, "output", data),
		];
	}

	propagate(state: InstanceState): void {
		const bits = state.getAttr(WIDTH);
		const vy = computeShift(state.getAttr(SHIFTER_SHIFT), bits, state.getPort(0), state.getPort(1));
		state.setPort(2, vy, bits * (3 * PER_DELAY));
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawPorts();
		const x = locX(painter.getLocation()) - 15;
		const y = locY(painter.getLocation());
		const shift = painter.getAttr(SHIFTER_SHIFT);
		g.setColor("#000000");
		const arrow = (ax: number, ay: number, d: number) =>
			g.fillPolygon([ax + d, ax, ax + d], [ay + d, ay, ay - d]);
		if (shift === "lr") {
			g.fillRect(x, y - 1, 8, 3);
			arrow(x + 10, y, -4);
		} else if (shift === "ar") {
			g.fillRect(x, y - 1, 2, 3);
			g.fillRect(x + 3, y - 1, 5, 3);
			arrow(x + 10, y, -4);
		} else if (shift === "rr") {
			g.fillRect(x, y - 1, 5, 3);
			g.fillRect(x + 8, y - 7, 2, 8);
			g.fillRect(x, y - 7, 2, 8);
			g.fillRect(x, y - 7, 10, 2);
			arrow(x + 8, y, -4);
		} else if (shift === "rl") {
			g.fillRect(x + 6, y - 1, 4, 3);
			g.fillRect(x + 8, y - 7, 2, 8);
			g.fillRect(x, y - 7, 2, 8);
			g.fillRect(x, y - 7, 10, 2);
			arrow(x + 3, y, 4);
		} else {
			g.fillRect(x + 2, y - 1, 8, 3);
			arrow(x, y, 4);
		}
	}
}

export const BIT_ADDER_INPUTS = intRangeAttr("inputs", "gate.inputs", 1, 32);

function bitAdderOutputBits(width: number, inputs: number): number {
	const maxBits = width * inputs;
	let outWidth = 1;
	while (1 << outWidth <= maxBits) outWidth++;
	return outWidth;
}

class BitAdder extends ArithFactory {
	readonly name = "BitAdder";
	readonly displayKey = "arith.bitAdder";
	override readonly iconName = "bitadder.gif";

	override createAttributeSet(): AttributeSet {
		const a = super.createAttributeSet();
		a.set(BIT_ADDER_INPUTS, 1);
		return a;
	}

	override getAttributes(): AnyAttribute[] {
		return [WIDTH, BIT_ADDER_INPUTS];
	}

	override getOffsetBounds(attrs: AttributeSet): Bounds {
		const inputs = attrs.get(BIT_ADDER_INPUTS);
		const h = Math.max(40, 10 * inputs);
		const y = inputs < 4 ? 20 : Math.trunc((inputs - 1) / 2) * 10 + 5;
		return Bounds.create(-40, -y, 40, h);
	}

	override getPorts(instance: Instance): PortDef[] {
		const inWidth = instance.attrs.get(WIDTH);
		const inputs = instance.attrs.get(BIT_ADDER_INPUTS);
		let y: number;
		let dy = 10;
		if (inputs === 1) y = 0;
		else if (inputs === 2) {
			y = -10;
			dy = 20;
		} else if (inputs === 3) y = -10;
		else y = Math.trunc((inputs - 1) / 2) * -10;
		const ps = [port(0, 0, "output", bitAdderOutputBits(inWidth, inputs))];
		for (let i = 0; i < inputs; i++) ps.push(port(-40, y + i * dy, "input", WIDTH));
		return ps;
	}

	propagate(state: InstanceState): void {
		const width = state.getAttr(WIDTH);
		const inputs = state.getAttr(BIT_ADDER_INPUTS);
		let minCount = 0;
		let maxCount = 0;
		for (let i = 1; i <= inputs; i++) {
			for (const b of state.getPort(i).getAll()) {
				if (b === Value.TRUE) minCount++;
				if (b !== Value.FALSE) maxCount++;
			}
		}
		let unknownMask = 0;
		for (let i = minCount + 1; i <= maxCount; i++) unknownMask |= minCount ^ i;
		const out: Value[] = new Array(bitAdderOutputBits(width, inputs));
		for (let i = 0; i < out.length; i++) {
			if (((unknownMask >> i) & 1) !== 0) out[i] = Value.ERROR;
			else if (((minCount >> i) & 1) !== 0) out[i] = Value.TRUE;
			else out[i] = Value.FALSE;
		}
		state.setPort(0, Value.fromBits(out), out.length * PER_DELAY);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawPorts();
		g.setLineWidth(2);
		const x = locX(painter.getLocation()) - 10;
		const y = locY(painter.getLocation());
		g.drawLine(x - 2, y - 5, x - 2, y + 5);
		g.drawLine(x + 2, y - 5, x + 2, y + 5);
		g.drawLine(x - 5, y - 2, x + 5, y - 2);
		g.drawLine(x - 5, y + 2, x + 5, y + 2);
		g.setLineWidth(1);
	}
}

export const BIT_FINDER_TYPE = optionAttr("type", "arith.bitFinderType", [
	{ value: "low1", label: "arith.bitFinderLow1" },
	{ value: "high1", label: "arith.bitFinderHigh1" },
	{ value: "low0", label: "arith.bitFinderLow0" },
	{ value: "high0", label: "arith.bitFinderHigh0" },
]);

function bitFinderOutputBits(maxBits: number): number {
	let outWidth = 1;
	while (1 << outWidth <= maxBits) outWidth++;
	return outWidth;
}

class BitFinder extends ArithFactory {
	readonly name = "BitFinder";
	readonly displayKey = "arith.bitFinder";
	override readonly iconName = "bitfindr.gif";

	override createAttributeSet(): AttributeSet {
		const a = super.createAttributeSet();
		a.set(BIT_FINDER_TYPE, "low1");
		return a;
	}

	override getAttributes(): AnyAttribute[] {
		return [WIDTH, BIT_FINDER_TYPE];
	}

	override getPorts(instance: Instance): PortDef[] {
		const inWidth = instance.attrs.get(WIDTH);
		return [
			port(-20, 20, "output", 1),
			port(0, 0, "output", bitFinderOutputBits(inWidth - 1)),
			port(-40, 0, "input", WIDTH),
		];
	}

	propagate(state: InstanceState): void {
		const outWidth = bitFinderOutputBits(state.getAttr(WIDTH) - 1);
		const type = state.getAttr(BIT_FINDER_TYPE);
		const bits = state.getPort(2).getAll();
		let want: Value;
		let i: number;
		if (type === "high0") {
			want = Value.FALSE;
			for (i = bits.length - 1; i >= 0 && bits[i] === Value.TRUE; i--);
		} else if (type === "low0") {
			want = Value.FALSE;
			for (i = 0; i < bits.length && bits[i] === Value.TRUE; i++);
		} else if (type === "high1") {
			want = Value.TRUE;
			for (i = bits.length - 1; i >= 0 && bits[i] === Value.FALSE; i--);
		} else {
			want = Value.TRUE;
			for (i = 0; i < bits.length && bits[i] === Value.FALSE; i++);
		}
		let present: Value;
		let index: Value;
		if (i < 0 || i >= bits.length) {
			present = Value.FALSE;
			index = Value.createKnown(outWidth, 0);
		} else if (bits[i] === want) {
			present = Value.TRUE;
			index = Value.createKnown(outWidth, i);
		} else {
			present = Value.ERROR;
			index = Value.createError(outWidth);
		}
		const delay = outWidth * PER_DELAY;
		state.setPort(0, present, delay);
		state.setPort(1, index, delay);
	}

	paintInstance(painter: InstancePainter): void {
		const g: Graphics = painter.g;
		painter.drawBounds();
		painter.drawPorts();
		const type = painter.getAttr(BIT_FINDER_TYPE);
		// Logisim 2.7.1 has no Spanish translation for these labels.
		const mid = type === "high0" || type === "high1" ? "high" : "low";
		const bot = type === "high0" || type === "low0" ? "0" : "1";
		const bds = painter.getBounds();
		const x = bds.x + Math.trunc(bds.width / 2);
		g.setColor("#000000");
		drawCenteredText(g, "find", x, bds.y + 8);
		drawCenteredText(g, mid, x, bds.y + 20);
		drawCenteredText(g, bot, x, bds.y + 32);
	}
}

export const ADDER = new Adder();
export const SUBTRACTOR = new Subtractor();
export const MULTIPLIER = new Multiplier();
export const DIVIDER = new Divider();
export const NEGATOR = new Negator();
export const COMPARATOR = new Comparator();
export const SHIFTER = new Shifter();
export const BIT_ADDER = new BitAdder();
export const BIT_FINDER = new BitFinder();
