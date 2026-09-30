// Port of com.cburch.logisim.std.gates.{AbstractGate, GateAttributes,
// GateAttributeList, NegateAttribute}.

import {
	type AnyAttribute,
	AttributeSet,
	boolAttr,
	DEFAULT_LABEL_FONT,
	intRangeAttr,
	optionAttr,
} from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
	type TextFieldSpec,
} from "@/engine/component";
import { Bounds, type Direction, dirRadians, type Loc, loc, locX, locY, translateDir } from "@/engine/geom";
import { H_CENTER, V_CENTER } from "@/engine/graphics";
import { prefs } from "@/engine/prefs";
import { Value } from "@/engine/value";
import { FACING, LABEL, LABEL_FONT, WIDTH } from "../std-attrs";
import { paintInputLines } from "./painter-shaped";

export const MAX_INPUTS = 32;
export const GATE_DELAY = 1;

export const GATE_SIZE = optionAttr("size", "gate.size", [
	{ value: "30", label: "gate.sizeNarrow" },
	{ value: "50", label: "gate.sizeNormal" },
	{ value: "70", label: "gate.sizeWide" },
]);
export const GATE_INPUTS = intRangeAttr("inputs", "gate.inputs", 2, MAX_INPUTS);
export const GATE_XOR = optionAttr("xor", "gate.xorBehavior", [
	{ value: "1", label: "gate.xorOne" },
	{ value: "odd", label: "gate.xorOdd" },
]);
export const GATE_OUTPUT = optionAttr("out", "gate.output", [
	{ value: "01", label: "gate.output01" },
	{ value: "0Z", label: "gate.output0Z" },
	{ value: "Z1", label: "gate.outputZ1" },
]);

const negateAttrs: AnyAttribute[] = [];
export function negateAttr(index: number): AnyAttribute {
	let a = negateAttrs[index];
	if (!a) {
		a = { ...boolAttr(`negate${index}`, "gate.negate"), labelArgs: [index + 1] };
		negateAttrs[index] = a;
	}
	return a;
}

export interface GateConfig {
	facing: Direction;
	size: number;
	inputs: number;
	negated: number;
	width: number;
	out: string;
	xor: string | null;
}

export function readGateConfig(attrs: AttributeSet, isXor: boolean): GateConfig {
	const inputs = attrs.get(GATE_INPUTS);
	let negated = 0;
	for (let i = 0; i < inputs; i++) {
		if (attrs.getByName(`negate${i}`) === true) negated |= 1 << i;
	}
	return {
		facing: attrs.get(FACING),
		size: Number.parseInt(attrs.get(GATE_SIZE), 10),
		inputs,
		negated,
		width: attrs.get(WIDTH),
		out: attrs.get(GATE_OUTPUT),
		xor: isXor ? attrs.get(GATE_XOR) : null,
	};
}

/** AbstractGate.pullOutput */
export function pullOutput(value: Value, outType: string): Value {
	if (outType === "01") return value;
	const v = value.getAll();
	if (outType === "0Z") {
		for (let i = 0; i < v.length; i++) if (v[i] === Value.TRUE) v[i] = Value.UNKNOWN;
	} else if (outType === "Z1") {
		for (let i = 0; i < v.length; i++) if (v[i] === Value.FALSE) v[i] = Value.UNKNOWN;
	}
	return Value.fromBits(v);
}

export abstract class AbstractGate extends ComponentFactory {
	readonly library = "#Gates";
	override readonly facingAttr = FACING;
	protected bonusWidth = 0;
	protected negateOutput = false;
	protected rectLabel = "";
	protected paintInputLinesFlag = false;

	constructor(protected readonly isXor = false) {
		super();
	}

	/** Used for OR-style input line lengths (PainterShaped uses OrGate). */
	static orGate: AbstractGate;

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIDTH, 1);
		a.set(GATE_SIZE, "50");
		a.set(GATE_INPUTS, 5);
		a.set(GATE_OUTPUT, "01");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		if (this.isXor) a.set(GATE_XOR, "1");
		return a;
	}

	getAttributes(attrs: AttributeSet): AnyAttribute[] {
		const ret: AnyAttribute[] = [FACING, WIDTH, GATE_SIZE, GATE_INPUTS, GATE_OUTPUT, LABEL, LABEL_FONT];
		if (this.isXor) ret.push(GATE_XOR);
		const inputs = attrs.get(GATE_INPUTS);
		for (let i = 0; i < inputs; i++) ret.push(negateAttr(i));
		return ret;
	}

	override getDefaultValue(attr: AnyAttribute): unknown {
		if (attr.name.startsWith("negate")) return false;
		return super.getDefaultValue(attr);
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const cfg = readGateConfig(attrs, this.isXor);
		let inputs = cfg.inputs;
		if (inputs % 2 === 0) inputs++;
		let width = cfg.size + this.bonusWidth + (this.negateOutput ? 10 : 0);
		if (cfg.negated !== 0) width += 10;
		const height = Math.max(10 * inputs, cfg.size);
		const h2 = Math.trunc(height / 2);
		switch (cfg.facing) {
			case "south":
				return Bounds.create(-h2, -width, height, width);
			case "north":
				return Bounds.create(-h2, 0, height, width);
			case "west":
				return Bounds.create(0, -h2, width, height);
			default:
				return Bounds.create(-width, -h2, width, height);
		}
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		const cfg = readGateConfig(instance.attrs, this.isXor);
		const bds = this.getOffsetBounds(instance.attrs);
		if (!bds.contains(dx, dy, 1)) return false;
		if (cfg.negated === 0) return true;
		let delt: number;
		if (cfg.facing === "north") delt = dy - (bds.y + bds.height);
		else if (cfg.facing === "south") delt = dy - bds.y;
		else if (cfg.facing === "west") delt = dx - (bds.x + bds.height);
		else delt = dx - bds.x;
		if (Math.abs(delt) > 5) return true;
		for (let i = 1; i <= cfg.inputs; i++) {
			const offs = this.getInputOffset(cfg, i);
			if (Math.abs(locX(offs) - dx) + Math.abs(locY(offs) - dy) <= 5) return true;
		}
		return false;
	}

	getInputOffset(cfg: GateConfig, index: number): Loc {
		const { inputs, facing, size, negated } = cfg;
		const axisLength = size + this.bonusWidth + (this.negateOutput ? 10 : 0);

		let skipStart: number;
		let skipDist: number;
		let skipLowerEven = 10;
		if (inputs <= 3) {
			if (size < 40) {
				skipStart = -5;
				skipDist = 10;
				skipLowerEven = 10;
			} else if (size < 60 || inputs <= 2) {
				skipStart = -10;
				skipDist = 20;
				skipLowerEven = 20;
			} else {
				skipStart = -15;
				skipDist = 30;
				skipLowerEven = 30;
			}
		} else if (inputs === 4 && size >= 60) {
			skipStart = -5;
			skipDist = 20;
			skipLowerEven = 0;
		} else {
			skipStart = -5;
			skipDist = 10;
			skipLowerEven = 10;
		}

		let dy: number;
		if ((inputs & 1) === 1) {
			dy = skipStart * (inputs - 1) + skipDist * index;
		} else {
			dy = skipStart * inputs + skipDist * index;
			if (index >= inputs / 2) dy += skipLowerEven;
		}

		let dx = axisLength;
		if (((negated >> index) & 1) === 1) dx += 10;

		switch (facing) {
			case "north":
				return loc(dy, dx);
			case "south":
				return loc(dy, -dx);
			case "west":
				return loc(dx, dy);
			default:
				return loc(-dx, dy);
		}
	}

	override getPorts(instance: Instance): PortDef[] {
		const cfg = readGateConfig(instance.attrs, this.isXor);
		const ports: PortDef[] = [port(0, 0, "output", WIDTH)];
		for (let i = 0; i < cfg.inputs; i++) {
			const offs = this.getInputOffset(cfg, i);
			ports.push(port(locX(offs), locY(offs), "input", WIDTH));
		}
		return ports;
	}

	override getTextField(instance: Instance): TextFieldSpec {
		const facing = instance.attrs.get(FACING);
		const baseWidth = Number.parseInt(instance.attrs.get(GATE_SIZE), 10);
		const axis = Math.trunc(baseWidth / 2) + (this.negateOutput ? 10 : 0);
		const perp = prefs.gateShape === "rectangular" ? 6 : 0;
		const { x, y } = instance;
		let cx: number;
		let cy: number;
		if (facing === "north") {
			cx = x + perp;
			cy = y + axis;
		} else if (facing === "south") {
			cx = x - perp;
			cy = y - axis;
		} else if (facing === "west") {
			cx = x + axis;
			cy = y - perp;
		} else {
			cx = x - axis;
			cy = y + perp;
		}
		return { labelAttr: LABEL, fontAttr: LABEL_FONT, x: cx, y: cy, halign: H_CENTER, valign: V_CENTER };
	}

	getRectangularLabel(_attrs: AttributeSet | null): string {
		return this.rectLabel;
	}

	protected abstract computeOutput(inputs: Value[], numInputs: number, state: InstanceState): Value;
	protected abstract paintShape(painter: InstancePainter, width: number, height: number): void;
	abstract getIdentity(): Value;

	/** Boolean expression for combinational analysis (null if unsupported). */
	computeExpression?(inputs: string[]): string | null;

	protected paintRectangular(painter: InstancePainter, width: number, height: number): void {
		const don = this.negateOutput ? 10 : 0;
		painter.drawRectangle(
			-width,
			-Math.trunc(height / 2),
			width - don,
			height,
			this.getRectangularLabel(painter.attrs),
		);
		if (this.negateOutput) painter.drawDongle(-5, 0);
	}

	propagate(state: InstanceState): void {
		const cfg = readGateConfig(state.attrs, this.isXor);
		const errorIfUndefined = state.options.gateUndefined === "error";
		const inputs: Value[] = [];
		let error = false;
		for (let i = 1; i <= cfg.inputs; i++) {
			if (state.isPortConnected(i)) {
				const v = state.getPort(i);
				inputs.push(((cfg.negated >> (i - 1)) & 1) === 1 ? v.not() : v);
			} else if (errorIfUndefined) {
				error = true;
			}
		}
		let out: Value;
		if (inputs.length === 0 || error) {
			out = Value.createError(cfg.width);
		} else {
			out = this.computeOutput(inputs, inputs.length, state);
			out = pullOutput(out, cfg.out);
		}
		state.setPort(0, out, GATE_DELAY);
	}

	override paintGhost(painter: InstancePainter): void {
		this.paintBase(painter);
	}

	paintInstance(painter: InstancePainter): void {
		this.paintBase(painter);
		if (!painter.printView || painter.gateShape === "rectangular") painter.drawPorts();
	}

	private paintBase(painter: InstancePainter): void {
		const cfg = readGateConfig(painter.attrs, this.isXor);
		const { facing, inputs, negated } = cfg;
		const shape = painter.gateShape;
		const l = painter.getLocation();
		const bds = painter.getOffsetBounds();
		let width = bds.width;
		let height = bds.height;
		if (facing === "north" || facing === "south") {
			[width, height] = [height, width];
		}
		if (negated !== 0) width -= 10;

		const g = painter.g;
		const baseColor = g.getColor();
		if (shape === "shaped" && this.paintInputLinesFlag) {
			paintInputLines(painter, this, AbstractGate.orGate, cfg);
		} else if (negated !== 0) {
			for (let i = 0; i < inputs; i++) {
				if (((negated >> i) & 1) === 1) {
					const inp = this.getInputOffset(cfg, i);
					const cen = translateDir(inp, facing, 5);
					painter.drawDongle(locX(l) + locX(cen), locY(l) + locY(cen));
				}
			}
		}

		g.setColor(baseColor);
		g.save();
		g.translate(locX(l), locY(l));
		if (facing !== "east") g.rotate(-dirRadians(facing));
		if (shape === "rectangular" || shape === "din40700") {
			this.paintRectangular(painter, width, height);
		} else if (this.negateOutput) {
			g.translate(-10, 0);
			this.paintShape(painter, width - 10, height);
			painter.drawDongle(5, 0);
			g.translate(10, 0);
		} else {
			this.paintShape(painter, width, height);
		}
		g.restore();
		painter.drawLabel();
	}
}
