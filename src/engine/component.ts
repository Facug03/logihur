// Port of the com.cburch.logisim.instance framework: factories describe a
// kind of component (like a class), instances are placed in circuits.

import type { AnyAttribute, Attribute, AttributeSet, Font } from "./attributes";
import type { Direction, Loc } from "./geom";
import { Bounds, loc, locX, locY } from "./geom";
import type { Graphics } from "./graphics";
import type { Value } from "./value";

export type PortType = "input" | "output" | "inout";

export interface PortDef {
	dx: number;
	dy: number;
	type: PortType;
	/** Fixed width, or the attribute holding the width. */
	width: number | Attribute<number>;
	exclusive?: boolean;
	tooltip?: string;
}

export function port(
	dx: number,
	dy: number,
	type: PortType,
	width: number | Attribute<number>,
	exclusive?: "exclusive" | "shared",
): PortDef {
	return {
		dx,
		dy,
		type,
		width,
		exclusive: exclusive === undefined ? type === "output" : exclusive === "exclusive",
	};
}

export interface EndData {
	readonly loc: Loc;
	readonly width: number;
	readonly type: PortType;
	readonly exclusive: boolean;
}

export interface TextFieldSpec {
	labelAttr: Attribute<string>;
	fontAttr: Attribute<Font>;
	x: number;
	y: number;
	halign: number;
	valign: number;
}

export type GateShape = "shaped" | "rectangular" | "din40700";

export interface ProjectOptions {
	gateUndefined: "ignore" | "error";
	simLimit: number;
	simRandom: number;
}

export interface InstanceState {
	readonly instance: Instance;
	readonly attrs: AttributeSet;
	getAttr<T>(attr: Attribute<T>): T;
	getPort(index: number): Value;
	isPortConnected(index: number): boolean;
	setPort(index: number, value: Value, delay: number): void;
	getData<T>(): T | undefined;
	setData(data: unknown): void;
	fireInvalidated(): void;
	isCircuitRoot(): boolean;
	getTickCount(): number;
	readonly options: ProjectOptions;
}

export interface InstancePainter {
	readonly g: Graphics;
	/** Null when painting a ghost/icon (no placed instance). */
	readonly instance: Instance | null;
	readonly attrs: AttributeSet;
	readonly showState: boolean;
	readonly printView: boolean;
	readonly shouldDrawColor: boolean;
	readonly gateShape: GateShape;
	getAttr<T>(attr: Attribute<T>): T;
	getLocation(): Loc;
	/** Absolute bounds (offset bounds when painting a ghost). */
	getBounds(): Bounds;
	getOffsetBounds(): Bounds;
	getPort(index: number): Value;
	isPortConnected(index: number): boolean;
	getData<T>(): T | undefined;
	drawBounds(): void;
	drawRectangle(x: number, y: number, w: number, h: number, label: string): void;
	drawDongle(x: number, y: number): void;
	drawPort(index: number, label?: string, dir?: Direction): void;
	drawPorts(): void;
	drawClock(index: number, dir: Direction): void;
	drawLabel(): void;
}

/**
 * InstancePoker. After a press, a poker whose init accepts it stays active
 * (it owns the keyboard "caret") until another component is poked.
 */
export interface Poker {
	/** Whether the poker accepts this press (default: yes). */
	init?(state: InstanceState, x: number, y: number): boolean;
	mousePressed?(state: InstanceState, x: number, y: number): void;
	mouseReleased?(state: InstanceState, x: number, y: number): void;
	/** A typed character ("\b" for backspace, "\n" for enter). */
	keyTyped?(state: InstanceState, key: string): void;
	/** Draw the caret (e.g. a red box around the edited value). */
	paint?(painter: InstancePainter): void;
	stopEditing?(state: InstanceState): void;
}

/** Special roles handled directly by the wiring layer, as in CircuitWires. */
export type FactoryRole = "normal" | "splitter" | "tunnel" | "pull" | "clock" | "pin" | "subcircuit" | "text";

export abstract class ComponentFactory {
	abstract readonly name: string;
	/** Descriptor of the library, e.g. "#Gates". Empty for subcircuits. */
	abstract readonly library: string;
	/** i18n key for the display name. */
	abstract readonly displayKey: string;
	readonly role: FactoryRole = "normal";
	readonly facingAttr: Attribute<Direction> | null = null;
	readonly shouldSnap: boolean = true;
	readonly iconName: string | null = null;

	private defaultSet: AttributeSet | null = null;

	abstract createAttributeSet(): AttributeSet;

	/** Ordered attributes of an instance; may depend on current values. */
	abstract getAttributes(attrs: AttributeSet): AnyAttribute[];

	getDefaultValue(attr: AnyAttribute, _sourceVersion?: string): unknown {
		if (this.defaultSet === null) this.defaultSet = this.createAttributeSet();
		return this.defaultSet.getByName(attr.name);
	}

	/** Hook for attributes with side effects (e.g. splitter fan-out). */
	setAttribute(attrs: AttributeSet, attr: AnyAttribute, value: unknown): void {
		attrs.set(attr, value);
	}

	/** Whether an attribute is written to .circ files (CircuitAttributes). */
	isToSave(_attr: AnyAttribute): boolean {
		return true;
	}

	abstract getOffsetBounds(attrs: AttributeSet, instance?: Instance): Bounds;

	getPorts(_instance: Instance): PortDef[] {
		return [];
	}

	getTextField(_instance: Instance): TextFieldSpec | null {
		return null;
	}

	/** Extra key mixed into the instance cache (e.g. subcircuit appearance). */
	getRevision(_instance: Instance): number {
		return 0;
	}

	/** Hit test in coordinates relative to the instance location. */
	contains(instance: Instance, dx: number, dy: number): boolean {
		return this.getOffsetBounds(instance.attrs, instance).contains(dx, dy, 1);
	}

	abstract propagate(state: InstanceState): void;

	abstract paintInstance(painter: InstancePainter): void;

	paintGhost(painter: InstancePainter): void {
		const b = painter.getOffsetBounds();
		const l = painter.getLocation();
		painter.g.setLineWidth(2);
		painter.g.drawRect(locX(l) + b.x, locY(l) + b.y, b.width, b.height);
	}

	createPoker(_instance: Instance): Poker | null {
		return null;
	}
}

let nextInstanceId = 1;

/** InstanceComponent + Instance: a component placed in a circuit. */
export class Instance {
	readonly id: number = nextInstanceId++;
	private cachedVersion = -1;
	private cachedRevision = -1;
	private _bounds: Bounds = Bounds.EMPTY;
	private _ports: PortDef[] = [];
	private _ends: EndData[] = [];
	private _textField: TextFieldSpec | null = null;

	constructor(
		readonly factory: ComponentFactory,
		public loc: Loc,
		readonly attrs: AttributeSet,
	) {}

	get x(): number {
		return locX(this.loc);
	}

	get y(): number {
		return locY(this.loc);
	}

	private ensure(): void {
		const rev = this.factory.getRevision(this);
		if (this.cachedVersion === this.attrs.version && this.cachedRevision === rev) {
			return;
		}
		// Mark as computed first: factories may read other derived data.
		this.cachedVersion = this.attrs.version;
		this.cachedRevision = rev;
		const x = this.x;
		const y = this.y;
		this._bounds = this.factory.getOffsetBounds(this.attrs, this).translate(x, y);
		this._ports = this.factory.getPorts(this);
		this._ends = this._ports.map((p) => ({
			loc: loc(x + p.dx, y + p.dy),
			width: typeof p.width === "number" ? p.width : (this.attrs.get(p.width) ?? 0),
			type: p.type,
			exclusive: p.exclusive ?? p.type === "output",
		}));
		this._textField = this.factory.getTextField(this);
	}

	/** Force recomputation of bounds, ports and label placement. */
	invalidate(): void {
		this.cachedVersion = -1;
	}

	get bounds(): Bounds {
		this.ensure();
		return this._bounds;
	}

	get ports(): readonly PortDef[] {
		this.ensure();
		return this._ports;
	}

	get ends(): readonly EndData[] {
		this.ensure();
		return this._ends;
	}

	get textField(): TextFieldSpec | null {
		this.ensure();
		return this._textField;
	}

	getPortLocation(index: number): Loc {
		return this.ends[index].loc;
	}

	getAttr<T>(attr: Attribute<T>): T {
		return this.attrs.get(attr);
	}

	contains(x: number, y: number): boolean {
		return this.factory.contains(this, x - this.x, y - this.y);
	}

	moveTo(l: Loc): void {
		this.loc = l;
		this.invalidate();
	}
}
