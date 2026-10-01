// Port of com.cburch.logisim.circuit.{SubcircuitFactory, CircuitAttributes}.

import { type AnyAttribute, AttributeSet, DEFAULT_LABEL_FONT, directionAttr } from "@/engine/attributes";
import {
	CIRCUIT_LABEL_ATTR,
	CIRCUIT_LABEL_FACING_ATTR,
	CIRCUIT_LABEL_FONT_ATTR,
	CIRCUIT_STATIC_ATTRS,
	type Circuit,
} from "@/engine/circuit";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
	type TextFieldSpec,
} from "@/engine/component";
import { type Bounds, type Direction, dirRadians, locX, locY } from "@/engine/geom";
import {
	drawCenteredText,
	drawText,
	H_CENTER,
	H_LEFT,
	H_RIGHT,
	V_BASELINE,
	V_CENTER,
	V_TOP,
} from "@/engine/graphics";
import { CircuitState, InstanceStateImpl } from "@/engine/simulation";
import { FACING, LABEL, LABEL_FONT, WIDTH } from "./std-attrs";
import { isInputPin, PIN } from "./wiring/pin";

export const SUBCIRCUIT_LABEL_LOC = directionAttr("labelloc", "circuit.labelLoc");

const STATIC_NAMES = new Set(CIRCUIT_STATIC_ATTRS.map((a) => a.name));

export class SubcircuitFactory extends ComponentFactory {
	readonly displayKey = "";
	override readonly role = "subcircuit" as const;
	override readonly facingAttr = FACING;

	/** `library` is "" for the project's own circuits, or the "file#..." descriptor. */
	constructor(
		readonly source: Circuit,
		readonly library = "",
	) {
		super();
	}

	get name(): string {
		return this.source.name;
	}

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, this.source.appearance.getFacing());
		a.set(LABEL, "");
		a.set(SUBCIRCUIT_LABEL_LOC, "north");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	/** The instance attributes plus the circuit's static ones (not saved). */
	getAttributes(): AnyAttribute[] {
		return [FACING, LABEL, SUBCIRCUIT_LABEL_LOC, LABEL_FONT, ...CIRCUIT_STATIC_ATTRS];
	}

	override isToSave(attr: AnyAttribute): boolean {
		return !STATIC_NAMES.has(attr.name);
	}

	override getDefaultValue(attr: AnyAttribute): unknown {
		if (STATIC_NAMES.has(attr.name)) return this.source.staticAttrs.getByName(attr.name);
		if (attr === FACING) return this.source.appearance.getFacing();
		return super.getDefaultValue(attr);
	}

	override getRevision(): number {
		return this.source.appearance.revision * 1_000_003 + this.source.version;
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const facing = attrs.get(FACING);
		const app = this.source.appearance;
		return app.getOffsetBounds().rotate(app.getFacing(), facing, 0, 0);
	}

	/** Pin instances in port order. */
	getPinInstances(instance: Instance): Instance[] {
		return this.source.appearance.getPortOffsets(instance.attrs.get(FACING)).map((p) => p.pin);
	}

	override getPorts(instance: Instance): PortDef[] {
		const offsets = this.source.appearance.getPortOffsets(instance.attrs.get(FACING));
		return offsets.map(({ loc: l, pin }) => {
			const p = port(locX(l), locY(l), isInputPin(pin) ? "input" : "output", pin.attrs.get(WIDTH));
			const label = pin.attrs.get(LABEL);
			if (label) p.tooltip = label;
			return p;
		});
	}

	override getTextField(instance: Instance): TextFieldSpec {
		const bds = instance.bounds;
		const where = instance.attrs.get(SUBCIRCUIT_LABEL_LOC);
		let x = bds.x + Math.trunc(bds.width / 2);
		let y = bds.y + Math.trunc(bds.height / 2);
		let ha = H_CENTER;
		let va = V_CENTER;
		if (where === "east") {
			x = bds.x + bds.width + 2;
			ha = H_LEFT;
		} else if (where === "west") {
			x = bds.x - 2;
			ha = H_RIGHT;
		} else if (where === "south") {
			y = bds.y + bds.height + 2;
			va = V_TOP;
		} else {
			y = bds.y - 2;
			va = V_BASELINE;
		}
		return { labelAttr: LABEL, fontAttr: LABEL_FONT, x, y, halign: ha, valign: va };
	}

	/** SubcircuitFactory.getSubstate */
	getSubstate(superState: CircuitState, instance: Instance): CircuitState {
		let sub = superState.getData(instance);
		if (!(sub instanceof CircuitState)) {
			sub = new CircuitState(superState.context, this.source);
			superState.setData(instance, sub);
			superState.fireInvalidated(instance);
		}
		return sub as CircuitState;
	}

	propagate(superState: InstanceState): void {
		const impl = superState as InstanceStateImpl;
		const subState = this.getSubstate(impl.circuitState, impl.instance);
		const pins = this.getPinInstances(impl.instance);
		for (let i = 0; i < pins.length; i++) {
			const pin = pins[i];
			const pinState = new InstanceStateImpl(subState, pin);
			if (isInputPin(pin)) {
				const newVal = superState.getPort(i);
				const oldVal = PIN.getValue(pinState);
				if (!newVal.equals(oldVal)) {
					PIN.setValue(pinState, newVal);
					PIN.propagate(pinState);
				}
			} else {
				superState.setPort(i, pinState.getPort(0), 1);
			}
		}
	}

	override paintGhost(painter: InstancePainter): void {
		painter.g.save();
		painter.g.setAlpha(0.5);
		this.paintBase(painter);
		painter.g.restore();
	}

	paintInstance(painter: InstancePainter): void {
		this.paintBase(painter);
		painter.drawPorts();
	}

	private paintBase(painter: InstancePainter): void {
		const g = painter.g;
		const facing = painter.getAttr(FACING);
		const app = this.source.appearance;
		const defaultFacing = app.getFacing();
		const l = painter.getLocation();
		g.save();
		g.translate(locX(l), locY(l));
		app.paintSubcircuit(g, facing);
		this.drawCircuitLabel(painter, this.getOffsetBounds(painter.attrs), facing, defaultFacing);
		g.restore();
		painter.drawLabel();
	}

	private drawCircuitLabel(
		painter: InstancePainter,
		bds: Bounds,
		facing: Direction,
		defaultFacing: Direction,
	): void {
		const st = this.source.staticAttrs;
		let label = st.get(CIRCUIT_LABEL_ATTR);
		if (!label) return;
		const up = st.get(CIRCUIT_LABEL_FACING_ATTR);
		const font = st.get(CIRCUIT_LABEL_FONT_ATTR);
		let back = label.indexOf("\\");
		let lines = 1;
		let backs = false;
		while (back >= 0 && back <= label.length - 2) {
			const c = label.charAt(back + 1);
			if (c === "n") lines++;
			else if (c === "\\") backs = true;
			back = label.indexOf("\\", back + 2);
		}
		const x = bds.x + Math.trunc(bds.width / 2);
		let y = bds.y + Math.trunc(bds.height / 2);
		const g = painter.g;
		g.save();
		const angle = Math.PI / 2 - (dirRadians(up) - dirRadians(defaultFacing)) - dirRadians(facing);
		if (Math.abs(angle) > 0.01) g.rotate(angle, x, y);
		g.setFont(font);
		if (lines === 1 && !backs) {
			drawCenteredText(g, label, x, y);
		} else {
			const m = g.measureText("Ag");
			const height = m.ascent + m.descent;
			y = y - Math.trunc((height * lines) / 2) + m.ascent;
			back = label.indexOf("\\");
			while (back >= 0 && back <= label.length - 2) {
				const c = label.charAt(back + 1);
				if (c === "n") {
					drawText(g, label.substring(0, back), x, y, H_CENTER, V_BASELINE);
					y += height;
					label = label.substring(back + 2);
					back = label.indexOf("\\");
				} else if (c === "\\") {
					label = label.substring(0, back) + label.substring(back + 1);
					back = label.indexOf("\\", back + 1);
				} else {
					back = label.indexOf("\\", back + 2);
				}
			}
			drawText(g, label, x, y, H_CENTER, V_BASELINE);
		}
		g.restore();
	}
}
