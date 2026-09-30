// Ports of Power, Ground, PullResistor, Transistor, TransmissionGate and
// BitExtender from com.cburch.logisim.std.wiring.

import { type AnyAttribute, AttributeSet, bitWidthAttr, optionAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
} from "@/engine/component";
import {
	Bounds,
	type Direction,
	dirDegrees,
	dirRadians,
	loc,
	locX,
	locY,
	manhattanTo,
	translateDir,
} from "@/engine/geom";
import { drawText, H_CENTER, H_LEFT, H_RIGHT, V_BASELINE, V_CENTER, V_TOP } from "@/engine/graphics";
import type { PullLike } from "@/engine/netlist";
import { Value } from "@/engine/value";
import { WIRE_WIDTH } from "@/engine/wire";
import { FACING, WIDTH } from "../std-attrs";

function rotationFromEast(facing: Direction): number {
	const degrees = dirDegrees("east") - dirDegrees(facing);
	return (((degrees + 360) % 360) * Math.PI) / 180;
}

class PowerGround extends ComponentFactory {
	readonly library = "#Wiring";
	override readonly facingAttr = FACING;

	constructor(
		readonly name: string,
		readonly displayKey: string,
		override readonly iconName: string,
		private readonly isPower: boolean,
	) {
		super();
	}

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, this.isPower ? "north" : "south");
		a.set(WIDTH, 1);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIDTH];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return Bounds.create(0, -8, this.isPower ? 15 : 14, 16).rotate("east", attrs.get(FACING), 0, 0);
	}

	override getPorts(): PortDef[] {
		return [port(0, 0, "output", WIDTH)];
	}

	propagate(state: InstanceState): void {
		const v = this.isPower ? Value.TRUE : Value.FALSE;
		state.setPort(0, Value.repeat(v, state.getAttr(WIDTH)), 1);
	}

	override paintGhost(painter: InstancePainter): void {
		this.draw(painter, true);
	}

	paintInstance(painter: InstancePainter): void {
		this.draw(painter, false);
		painter.drawPorts();
	}

	private draw(painter: InstancePainter, isGhost: boolean): void {
		const g = painter.g;
		const l = painter.getLocation();
		g.save();
		g.translate(locX(l), locY(l));
		g.rotate(rotationFromEast(painter.getAttr(FACING)));
		g.setLineWidth(WIRE_WIDTH);
		if (!isGhost && painter.showState) g.setColor(painter.getPort(0).getColor());
		g.drawLine(0, 0, 5, 0);
		g.setLineWidth(1);
		if (!isGhost && painter.shouldDrawColor) {
			const v = this.isPower ? Value.TRUE : Value.FALSE;
			g.setColor(Value.repeat(v, painter.getAttr(WIDTH)).getColor());
		}
		if (this.isPower) {
			g.drawPolygon([6, 14, 6], [-8, 0, 8]);
		} else {
			g.drawLine(6, -8, 6, 8);
			g.drawLine(9, -5, 9, 5);
			g.drawLine(12, -2, 12, 2);
		}
		g.restore();
	}
}

export const POWER = new PowerGround("Power", "wiring.power", "power.gif", true);
export const GROUND = new PowerGround("Ground", "wiring.ground", "ground.gif", false);

export const PULL_TYPE = optionAttr("pull", "pull.type", [
	{ value: "0", label: "pull.zero" },
	{ value: "1", label: "pull.one" },
	{ value: "X", label: "pull.error" },
]);

function pullValueOf(opt: string): Value {
	if (opt === "1") return Value.TRUE;
	if (opt === "X") return Value.ERROR;
	return Value.FALSE;
}

class PullResistor extends ComponentFactory implements PullLike {
	readonly name = "Pull Resistor";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.pull";
	override readonly role = "pull" as const;
	override readonly facingAttr = FACING;
	override readonly iconName = "pullshap.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "south");
		a.set(PULL_TYPE, "0");
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, PULL_TYPE];
	}

	getPullValue(instance: Instance): Value {
		return pullValueOf(instance.attrs.get(PULL_TYPE));
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		switch (attrs.get(FACING)) {
			case "east":
				return Bounds.create(-42, -6, 42, 12);
			case "west":
				return Bounds.create(0, -6, 42, 12);
			case "north":
				return Bounds.create(-6, 0, 12, 42);
			default:
				return Bounds.create(-6, -42, 12, 42);
		}
	}

	override getPorts(): PortDef[] {
		return [port(0, 0, "inout", 0)];
	}

	propagate(): void {
		// handled by the netlist
	}

	override paintGhost(painter: InstancePainter): void {
		const l = painter.getLocation();
		painter.g.save();
		painter.g.translate(locX(l), locY(l));
		this.paintBase(painter, pullValueOf(painter.getAttr(PULL_TYPE)), null, null);
		painter.g.restore();
	}

	paintInstance(painter: InstancePainter): void {
		const l = painter.getLocation();
		const g = painter.g;
		g.save();
		g.translate(locX(l), locY(l));
		const pull = pullValueOf(painter.getAttr(PULL_TYPE));
		const actual = painter.getPort(0);
		this.paintBase(painter, pull, pull.getColor(), actual.getColor());
		g.restore();
		painter.drawPorts();
	}

	private paintBase(
		painter: InstancePainter,
		pullValue: Value,
		inColor: string | null,
		outColor: string | null,
	): void {
		const color = painter.shouldDrawColor;
		const facing = painter.getAttr(FACING);
		const g = painter.g;
		const baseColor = g.getColor();
		g.setLineWidth(3);
		if (color && inColor !== null) g.setColor(inColor);
		const text = pullValue.toDisplayString();
		if (facing === "east") drawText(g, text, -32, 0, H_RIGHT, V_CENTER);
		else if (facing === "west") drawText(g, text, 32, 0, H_LEFT, V_CENTER);
		else if (facing === "north") drawText(g, text, 0, 32, H_CENTER, V_TOP);
		else drawText(g, text, 0, -32, H_CENTER, V_BASELINE);

		g.save();
		const rotate = dirRadians("south") - dirRadians(facing);
		if (rotate !== 0) g.rotate(rotate);
		g.drawLine(0, -30, 0, -26);
		g.drawLine(-6, -30, 6, -30);
		if (color && outColor !== null) g.setColor(outColor);
		g.drawLine(0, -4, 0, 0);
		g.setColor(baseColor);
		g.setLineWidth(2);
		if (painter.gateShape === "shaped") {
			g.drawPolyline([0, -5, 5, -5, 5, -5, 0], [-25, -23, -19, -15, -11, -7, -5]);
		} else {
			g.drawRect(-5, -25, 10, 20);
		}
		g.restore();
	}
}

export const PULL_RESISTOR = new PullResistor();

export const WIRING_GATE = optionAttr("gate", "wiring.gateLoc", [
	{ value: "tl", label: "wiring.gateTopLeft" },
	{ value: "br", label: "wiring.gateBottomRight" },
]);

export const TRANSISTOR_TYPE = optionAttr("type", "transistor.type", [
	{ value: "p", label: "transistor.p" },
	{ value: "n", label: "transistor.n" },
]);

function facingDelta(facing: Direction): [number, number] {
	switch (facing) {
		case "north":
			return [0, 1];
		case "east":
			return [-1, 0];
		case "south":
			return [0, -1];
		default:
			return [1, 0];
	}
}

function isFlipped(attrs: AttributeSet): boolean {
	const facing = attrs.get(FACING);
	return (facing === "south" || facing === "west") === (attrs.get(WIRING_GATE) === "tl");
}

type PortReader = { getPort(i: number): Value; getAttr: InstanceState["getAttr"] };

function passErrors(input: Value, width: number): Value {
	if (input.isFullyDefined()) return Value.createError(width);
	return Value.fromBits(input.getAll().map((v) => (v !== Value.UNKNOWN ? Value.ERROR : v)));
}

class Transistor extends ComponentFactory {
	readonly name = "Transistor";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.transistor";
	override readonly facingAttr = FACING;
	override readonly iconName = "trans0.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(TRANSISTOR_TYPE, "p");
		a.set(FACING, "east");
		a.set(WIRING_GATE, "tl");
		a.set(WIDTH, 1);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [TRANSISTOR_TYPE, FACING, WIRING_GATE, WIDTH];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const delta = attrs.get(WIRING_GATE) === "tl" ? -20 : 0;
		switch (attrs.get(FACING)) {
			case "north":
				return Bounds.create(delta, 0, 20, 40);
			case "south":
				return Bounds.create(delta, -40, 20, 40);
			case "west":
				return Bounds.create(0, delta, 40, 20);
			default:
				return Bounds.create(-40, delta, 40, 20);
		}
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		if (!this.getOffsetBounds(instance.attrs).contains(dx, dy, 1)) return false;
		const center = translateDir(loc(0, 0), instance.attrs.get(FACING), -20);
		return manhattanTo(center, dx, dy) < 24;
	}

	override getPorts(instance: Instance): PortDef[] {
		const [dx, dy] = facingDelta(instance.attrs.get(FACING));
		const gate = isFlipped(instance.attrs)
			? port(20 * (dx + dy), 20 * (-dx + dy), "input", 1)
			: port(20 * (dx - dy), 20 * (dx + dy), "input", 1);
		return [port(0, 0, "output", WIDTH), port(40 * dx, 40 * dy, "input", WIDTH), gate];
	}

	private computeOutput(state: PortReader): Value {
		const width = state.getAttr(WIDTH);
		const gate = state.getPort(2);
		const input = state.getPort(1);
		const desired = state.getAttr(TRANSISTOR_TYPE) === "p" ? Value.FALSE : Value.TRUE;
		if (!gate.isFullyDefined()) return passErrors(input, width);
		if (gate !== desired) return Value.createUnknown(width);
		return input;
	}

	propagate(state: InstanceState): void {
		state.setPort(0, this.computeOutput(state), 1);
	}

	override paintGhost(painter: InstancePainter): void {
		this.draw(painter, true);
	}

	paintInstance(painter: InstancePainter): void {
		this.draw(painter, false);
		painter.drawPorts();
	}

	private draw(painter: InstancePainter, isGhost: boolean): void {
		const type = painter.getAttr(TRANSISTOR_TYPE);
		const m = isFlipped(painter.attrs) ? 1 : -1;
		const g = painter.g;
		const l = painter.getLocation();
		g.save();
		g.translate(locX(l), locY(l));
		g.rotate(rotationFromEast(painter.getAttr(FACING)));
		const base = g.getColor();
		let gate = base;
		let input = base;
		let output = base;
		let platform = base;
		if (!isGhost && painter.showState) {
			gate = painter.getPort(2).getColor();
			input = painter.getPort(1).getColor();
			output = painter.getPort(0).getColor();
			const out = this.computeOutput(painter);
			platform = out.isUnknown() ? Value.UNKNOWN.getColor() : out.getColor();
		}
		g.setLineWidth(WIRE_WIDTH);
		g.setColor(output);
		g.drawLine(0, 0, -11, 0);
		g.drawLine(-11, m * 7, -11, 0);
		g.setColor(input);
		g.drawLine(-40, 0, -29, 0);
		g.drawLine(-29, m * 7, -29, 0);
		g.setColor(gate);
		if (type === "p") {
			g.drawLine(-20, m * 20, -20, m * 15);
			g.setLineWidth(1);
			g.drawOval(-22, m * 12 - 2, 4, 4);
		} else {
			g.drawLine(-20, m * 20, -20, m * 11);
			g.setLineWidth(1);
		}
		g.drawLine(-10, m * 10, -30, m * 10);
		g.setColor(platform);
		g.drawLine(-9, m * 8, -31, m * 8);
		g.drawLine(-21, m * 6, -18, m * 3);
		g.drawLine(-21, 0, -18, m * 3);
		g.restore();
	}
}

export const TRANSISTOR = new Transistor();

class TransmissionGate extends ComponentFactory {
	readonly name = "Transmission Gate";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.transmissionGate";
	override readonly facingAttr = FACING;
	override readonly iconName = "transmis.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIRING_GATE, "tl");
		a.set(WIDTH, 1);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIRING_GATE, WIDTH];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return Bounds.create(0, -20, 40, 40).rotate("west", attrs.get(FACING), 0, 0);
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		if (!this.getOffsetBounds(instance.attrs).contains(dx, dy, 1)) return false;
		const center = translateDir(loc(0, 0), instance.attrs.get(FACING), -20);
		return manhattanTo(center, dx, dy) < 24;
	}

	override getPorts(instance: Instance): PortDef[] {
		const [dx, dy] = facingDelta(instance.attrs.get(FACING));
		const a = port(20 * (dx - dy), 20 * (dx + dy), "input", 1);
		const b = port(20 * (dx + dy), 20 * (-dx + dy), "input", 1);
		const flip = isFlipped(instance.attrs);
		return [
			port(0, 0, "output", WIDTH),
			port(40 * dx, 40 * dy, "input", WIDTH),
			flip ? b : a, // GATE0
			flip ? a : b, // GATE1
		];
	}

	private computeOutput(state: PortReader): Value {
		const width = state.getAttr(WIDTH);
		const input = state.getPort(1);
		const gate0 = state.getPort(2);
		const gate1 = state.getPort(3);
		if (gate0.isFullyDefined() && gate1.isFullyDefined() && gate0 !== gate1) {
			return gate0 === Value.TRUE ? Value.createUnknown(width) : input;
		}
		return passErrors(input, width);
	}

	propagate(state: InstanceState): void {
		state.setPort(0, this.computeOutput(state), 1);
	}

	override paintGhost(painter: InstancePainter): void {
		this.draw(painter, true);
	}

	paintInstance(painter: InstancePainter): void {
		this.draw(painter, false);
		painter.drawPorts();
	}

	private draw(painter: InstancePainter, isGhost: boolean): void {
		const bds = painter.getBounds();
		const facing = painter.getAttr(FACING);
		const flip = isFlipped(painter.attrs);
		let degrees = dirDegrees("west") - dirDegrees(facing);
		if (flip) degrees += 180;
		const radians = (((degrees + 360) % 360) * Math.PI) / 180;
		const g = painter.g;
		g.save();
		g.rotate(radians, bds.x + 20, bds.y + 20);
		g.translate(bds.x, bds.y);
		g.setLineWidth(WIRE_WIDTH);
		const base = g.getColor();
		let gate0 = base;
		let gate1 = base;
		let input = base;
		let output = base;
		let platform = base;
		if (!isGhost && painter.showState) {
			gate0 = painter.getPort(2).getColor();
			gate1 = painter.getPort(2).getColor();
			input = painter.getPort(1).getColor();
			output = painter.getPort(0).getColor();
			platform = this.computeOutput(painter).getColor();
		}
		g.setColor(flip ? input : output);
		g.drawLine(0, 20, 11, 20);
		g.drawLine(11, 13, 11, 27);
		g.setColor(flip ? output : input);
		g.drawLine(29, 20, 40, 20);
		g.drawLine(29, 13, 29, 27);
		g.setColor(gate0);
		g.drawLine(20, 35, 20, 40);
		g.setLineWidth(1);
		g.drawOval(18, 30, 4, 4);
		g.drawLine(10, 30, 30, 30);
		g.setLineWidth(WIRE_WIDTH);
		g.setColor(gate1);
		g.drawLine(20, 9, 20, 0);
		g.setLineWidth(1);
		g.drawLine(10, 10, 30, 10);
		g.setColor(platform);
		g.drawLine(9, 12, 31, 12);
		g.drawLine(9, 28, 31, 28);
		if (flip) {
			g.drawLine(18, 17, 21, 20);
			g.drawLine(18, 23, 21, 20);
		} else {
			g.drawLine(22, 17, 19, 20);
			g.drawLine(22, 23, 19, 20);
		}
		g.restore();
	}
}

export const TRANSMISSION_GATE = new TransmissionGate();

export const EXTENDER_IN = bitWidthAttr("in_width", "extender.in");
export const EXTENDER_OUT = bitWidthAttr("out_width", "extender.out");
export const EXTENDER_TYPE = optionAttr("type", "extender.type", [
	{ value: "zero", label: "extender.zeroType" },
	{ value: "one", label: "extender.oneType" },
	{ value: "sign", label: "extender.signType" },
	{ value: "input", label: "extender.inputType" },
]);

/** Labels drawn inside the extender (std.properties extender*Label). */
export const extenderLabels = {
	zero: "0",
	one: "1",
	sign: "sign",
	input: "input",
	main: "extend",
};

class BitExtender extends ComponentFactory {
	readonly name = "Bit Extender";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.extender";
	override readonly iconName = "extender.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(EXTENDER_IN, 8);
		a.set(EXTENDER_OUT, 16);
		a.set(EXTENDER_TYPE, "zero");
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [EXTENDER_IN, EXTENDER_OUT, EXTENDER_TYPE];
	}

	getOffsetBounds(): Bounds {
		return Bounds.create(-40, -20, 40, 40);
	}

	override getPorts(instance: Instance): PortDef[] {
		const p0 = port(0, 0, "output", EXTENDER_OUT);
		const p1 = port(-40, 0, "input", EXTENDER_IN);
		if (instance.attrs.get(EXTENDER_TYPE) === "input") return [p0, p1, port(-20, -20, "input", 1)];
		return [p0, p1];
	}

	propagate(state: InstanceState): void {
		const input = state.getPort(1);
		const wout = state.getAttr(EXTENDER_OUT);
		const type = state.getAttr(EXTENDER_TYPE);
		let extend: Value;
		if (type === "one") extend = Value.TRUE;
		else if (type === "sign") {
			const win = input.width;
			extend = win > 0 ? input.get(win - 1) : Value.ERROR;
		} else if (type === "input") {
			extend = state.getPort(2);
			if (extend.width !== 1) extend = Value.ERROR;
		} else extend = Value.FALSE;
		state.setPort(0, input.extendWidth(wout, extend), 1);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const asc = g.measureText("0").ascent;
		painter.drawBounds();
		const type = painter.getAttr(EXTENDER_TYPE) as keyof typeof extenderLabels;
		const s0 = extenderLabels[type] ?? "???";
		const bds = painter.getBounds();
		const x = bds.x + Math.trunc(bds.width / 2);
		const y0 = bds.y + Math.trunc((Math.trunc(bds.height / 2) + asc) / 2);
		const y1 = bds.y + Math.trunc((Math.trunc((3 * bds.height) / 2) + asc) / 2);
		drawText(g, s0, x, y0, H_CENTER, V_BASELINE);
		drawText(g, extenderLabels.main, x, y1, H_CENTER, V_BASELINE);
		painter.drawPort(0, `${painter.getAttr(EXTENDER_OUT)}`, "west");
		painter.drawPort(1, `${painter.getAttr(EXTENDER_IN)}`, "east");
		if (type === "input") painter.drawPort(2);
	}
}

export const BIT_EXTENDER = new BitExtender();
