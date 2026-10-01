// Port of com.cburch.logisim.circuit.Circuit (model only; mutation goes
// through the editor's actions so it can be undone).

import { CircuitAppearance } from "./appearance";
import { AttributeSet, DEFAULT_LABEL_FONT, directionAttr, fontAttr, stringAttr } from "./attributes";
import type { Instance } from "./component";
import type { Loc } from "./geom";
import { type Connectable, computeNetlist, type Netlist } from "./netlist";
import type { Wire } from "./wire";

export const CIRCUIT_NAME_ATTR = stringAttr("circuit", "circuit.name");
export const CIRCUIT_LABEL_ATTR = stringAttr("clabel", "circuit.label");
export const CIRCUIT_LABEL_FACING_ATTR = directionAttr("clabelup", "circuit.labelDir");
export const CIRCUIT_LABEL_FONT_ATTR = fontAttr("clabelfont", "circuit.labelFont");
export const CIRCUIT_STATIC_ATTRS = [
	CIRCUIT_NAME_ATTR,
	CIRCUIT_LABEL_ATTR,
	CIRCUIT_LABEL_FACING_ATTR,
	CIRCUIT_LABEL_FONT_ATTR,
] as const;

export type CircuitEvent =
	| { type: "add"; comp: Connectable }
	| { type: "remove"; comp: Connectable }
	| { type: "change"; comp: Instance }
	| { type: "invalidate"; comp: Instance }
	| { type: "clear" }
	| { type: "rename"; name: string }
	| { type: "appearance" };

export type CircuitListener = (e: CircuitEvent) => void;

let nextCircuitId = 1;

export class Circuit {
	readonly id = nextCircuitId++;
	readonly staticAttrs = new AttributeSet();
	readonly components = new Set<Instance>();
	readonly wires = new Map<string, Wire>();
	readonly appearance: CircuitAppearance;
	private netlist: Netlist | null = null;
	private readonly listeners = new Set<CircuitListener>();
	/** Incremented on every structural or attribute change. */
	version = 0;

	constructor(name: string) {
		this.staticAttrs.set(CIRCUIT_NAME_ATTR, name);
		this.staticAttrs.set(CIRCUIT_LABEL_ATTR, "");
		this.staticAttrs.set(CIRCUIT_LABEL_FACING_ATTR, "east");
		this.staticAttrs.set(CIRCUIT_LABEL_FONT_ATTR, DEFAULT_LABEL_FONT);
		this.appearance = new CircuitAppearance(this);
	}

	get name(): string {
		return this.staticAttrs.get(CIRCUIT_NAME_ATTR);
	}

	setName(name: string): void {
		this.staticAttrs.set(CIRCUIT_NAME_ATTR, name);
		this.touch();
		this.fire({ type: "rename", name });
	}

	addListener(l: CircuitListener): void {
		this.listeners.add(l);
	}

	removeListener(l: CircuitListener): void {
		this.listeners.delete(l);
	}

	private fire(e: CircuitEvent): void {
		for (const l of Array.from(this.listeners)) l(e);
	}

	private touch(): void {
		this.version++;
	}

	/** Invalidate the netlist without an event (e.g. subcircuit ports moved). */
	voidNetlist(): void {
		this.netlist = null;
		this.touch();
	}

	getNetlist(): Netlist {
		if (this.netlist === null) {
			this.netlist = computeNetlist({
				wires: this.wires.values(),
				components: this.components,
			});
		}
		return this.netlist;
	}

	isNetlistVoided(): boolean {
		return this.netlist === null;
	}

	addWire(w: Wire): boolean {
		if (w.e0 === w.e1 || this.wires.has(w.key)) return false;
		this.wires.set(w.key, w);
		this.voidNetlist();
		this.fire({ type: "add", comp: w });
		return true;
	}

	removeWire(w: Wire): boolean {
		const existing = this.wires.get(w.key);
		if (!existing) return false;
		this.wires.delete(w.key);
		this.voidNetlist();
		this.fire({ type: "remove", comp: existing });
		return true;
	}

	addComponent(c: Instance): void {
		if (this.components.has(c)) return;
		this.components.add(c);
		this.voidNetlist();
		if (c.factory.role === "pin") this.appearance.pinsChanged();
		this.fire({ type: "add", comp: c });
	}

	removeComponent(c: Instance): void {
		if (!this.components.delete(c)) return;
		this.voidNetlist();
		if (c.factory.role === "pin") this.appearance.pinsChanged();
		this.fire({ type: "remove", comp: c });
	}

	/** Call after an instance's attributes or location changed. */
	componentChanged(c: Instance): void {
		c.invalidate();
		this.voidNetlist();
		if (c.factory.role === "pin") this.appearance.pinsChanged();
		this.fire({ type: "change", comp: c });
	}

	/** InstanceComponent.fireInvalidated: state changed, needs repropagation. */
	componentInvalidated(c: Instance): void {
		this.fire({ type: "invalidate", comp: c });
	}

	/** The subcircuit appearance was edited: users must refresh their ports and bounds. */
	appearanceChanged(): void {
		this.touch();
		this.fire({ type: "appearance" });
	}

	clear(): void {
		this.components.clear();
		this.wires.clear();
		this.voidNetlist();
		this.appearance.pinsChanged();
		this.fire({ type: "clear" });
	}

	getWidth(p: Loc): number {
		return this.getNetlist().getWidth(p);
	}

	getComponentsAt(p: Loc): readonly Connectable[] {
		return this.getNetlist().points.getComponents(p);
	}

	getNonWiresAt(p: Loc): Instance[] {
		return this.getNetlist().points.getNonWires(p);
	}

	getWiresAt(p: Loc): Wire[] {
		return this.getNetlist().points.getWires(p);
	}

	isConnected(p: Loc, ignore: Connectable): boolean {
		for (const o of this.getComponentsAt(p)) {
			if (o !== ignore) return true;
		}
		return false;
	}

	getSplitLocations(): Iterable<Loc> {
		return this.getNetlist().points.map.keys();
	}

	get clocks(): Instance[] {
		return Array.from(this.components).filter((c) => c.factory.role === "clock");
	}

	get pins(): Instance[] {
		return Array.from(this.components).filter((c) => c.factory.role === "pin");
	}
}
