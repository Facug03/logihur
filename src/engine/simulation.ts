// Port of com.cburch.logisim.circuit.{Propagator, CircuitState} and
// instance.InstanceStateImpl. The semantics (event queue ordered by time and
// serial number, per-point cause lists, dirty points/components, oscillation
// detection) follow Logisim 2.7.1 closely so circuits behave identically.

import type { Attribute } from "./attributes";
import type { Circuit, CircuitEvent } from "./circuit";
import type { Instance, InstanceState, ProjectOptions } from "./component";
import type { Loc } from "./geom";
import type { Netlist, WireBundle, WireThread } from "./netlist";
import { Value } from "./value";

export const DEFAULT_OPTIONS: ProjectOptions = {
	gateUndefined: "ignore",
	simLimit: 1000,
	simRandom: 0,
};

export interface SimContext {
	options: ProjectOptions;
}

export interface ClockLike {
	tick(state: CircuitState, ticks: number, comp: Instance): boolean;
}

class SetData {
	next: SetData | null = null;
	constructor(
		public time: number,
		public serial: number,
		public state: CircuitState,
		public loc: Loc,
		public cause: Instance,
		public val: Value | null,
	) {}
}

/** Binary min-heap ordered by (time, serial). */
class EventQueue {
	private heap: SetData[] = [];

	get size(): number {
		return this.heap.length;
	}

	isEmpty(): boolean {
		return this.heap.length === 0;
	}

	clear(): void {
		this.heap = [];
	}

	peek(): SetData | undefined {
		return this.heap[0];
	}

	private less(a: SetData, b: SetData): boolean {
		return a.time !== b.time ? a.time < b.time : a.serial < b.serial;
	}

	push(d: SetData): void {
		const h = this.heap;
		h.push(d);
		let i = h.length - 1;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (!this.less(h[i], h[p])) break;
			[h[i], h[p]] = [h[p], h[i]];
			i = p;
		}
	}

	pop(): SetData | undefined {
		const h = this.heap;
		if (h.length === 0) return undefined;
		const top = h[0];
		const last = h.pop() as SetData;
		if (h.length > 0) {
			h[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < h.length && this.less(h[l], h[m])) m = l;
				if (r < h.length && this.less(h[r], h[m])) m = r;
				if (m === i) break;
				[h[i], h[m]] = [h[m], h[i]];
				i = m;
			}
		}
		return top;
	}
}

export class Propagator {
	private readonly queue = new EventQueue();
	private clock = 0;
	private oscillating = false;
	private oscAdding = false;
	private oscPoints = new Map<CircuitState, Set<Loc>>();
	private ticks = 0;
	private noiseCount = 0;
	private serial = 0;

	constructor(readonly root: CircuitState) {}

	private get simLimit(): number {
		return this.root.context.options.simLimit || 1000;
	}

	private get simRandomShift(): number {
		const val = this.root.context.options.simRandom;
		let logVal = 0;
		while (1 << logVal < val) logVal++;
		return logVal;
	}

	isOscillating(): boolean {
		return this.oscillating;
	}

	/** Points involved in the oscillation, for highlighting. */
	getOscillatingPoints(state: CircuitState): ReadonlySet<Loc> {
		return this.oscPoints.get(state) ?? new Set();
	}

	isPending(): boolean {
		return !this.queue.isEmpty();
	}

	getTickCount(): number {
		return this.ticks;
	}

	reset(): void {
		this.queue.clear();
		this.root.reset();
		this.oscillating = false;
	}

	propagate(): void {
		this.oscPoints = new Map();
		this.clearDirtyPoints();
		this.clearDirtyComponents();

		const oscThreshold = this.simLimit;
		const logThreshold = Math.trunc((3 * oscThreshold) / 4);
		let iters = 0;
		while (!this.queue.isEmpty()) {
			iters++;
			if (iters < logThreshold) {
				this.stepInternal(null);
			} else if (iters < oscThreshold) {
				this.oscAdding = true;
				this.stepInternal(this.oscPoints);
			} else {
				this.oscillating = true;
				this.oscAdding = false;
				return;
			}
		}
		this.oscillating = false;
		this.oscAdding = false;
		this.oscPoints = new Map();
	}

	/** Single propagation step (Simulate > Step). */
	step(): Map<CircuitState, Set<Loc>> {
		const changed = new Map<CircuitState, Set<Loc>>();
		this.clearDirtyPoints();
		this.clearDirtyComponents();
		const old = this.oscPoints;
		this.oscAdding = true;
		this.oscPoints = changed;
		this.stepInternal(changed);
		this.oscAdding = false;
		this.oscPoints = old;
		return changed;
	}

	private stepInternal(changedPoints: Map<CircuitState, Set<Loc>> | null): void {
		const first = this.queue.peek();
		if (!first) return;
		this.clock = first.time;

		const visited = new Map<CircuitState, Set<string>>();
		for (;;) {
			const data = this.queue.peek();
			if (!data || data.time !== this.clock) break;
			this.queue.pop();
			const state = data.state;

			let handled = visited.get(state);
			if (!handled) {
				handled = new Set();
				visited.set(state, handled);
			}
			const key = `${data.cause.id}@${data.loc}`;
			if (handled.has(key)) continue;
			handled.add(key);

			if (changedPoints) addPoint(changedPoints, state, data.loc);

			const oldHead = state.causes.get(data.loc) ?? null;
			const oldVal = computeValue(oldHead);
			const newHead = this.addCause(state, oldHead, data);
			const newVal = computeValue(newHead);
			if (!newVal.equals(oldVal)) state.markPointAsDirty(data.loc);
		}

		this.clearDirtyPoints();
		this.clearDirtyComponents();
	}

	locationTouched(state: CircuitState, l: Loc): void {
		if (this.oscAdding) addPoint(this.oscPoints, state, l);
	}

	setValue(state: CircuitState, pt: Loc, val: Value, cause: Instance, delayIn: number): void {
		let delay = delayIn <= 0 ? 1 : delayIn;
		const randomShift = this.simRandomShift;
		if (randomShift > 0) {
			delay <<= randomShift;
			if (cause.factory.role !== "subcircuit") {
				if (this.noiseCount > 0) {
					this.noiseCount--;
				} else {
					delay++;
					this.noiseCount = Math.floor(Math.random() * (1 << randomShift));
				}
			}
		}
		this.queue.push(new SetData(this.clock + delay, this.serial++, state, pt, cause, val));
	}

	tick(): boolean {
		this.ticks++;
		return this.root.tick(this.ticks);
	}

	/** Remove a component's contributions (it was removed or changed). */
	checkComponentEnds(state: CircuitState, comp: Instance): void {
		for (const [l, head] of Array.from(state.causes)) {
			let found = false;
			for (let n: SetData | null = head; n; n = n.next) {
				if (n.cause === comp) {
					found = true;
					break;
				}
			}
			if (!found) continue;
			const oldVal = computeValue(head);
			const newHead = this.removeCause(state, head, l, comp);
			const newVal = computeValue(newHead);
			const wireVal = state.getValueByWire(l);
			if (!newVal.equals(oldVal) || wireVal !== undefined) state.markPointAsDirty(l);
			if (wireVal !== undefined) state.setValueByWire(l, Value.NIL);
		}
		for (const end of comp.ends) {
			if (state.getValueByWire(end.loc) !== undefined) state.markPointAsDirty(end.loc);
		}
	}

	private clearDirtyPoints(): void {
		this.root.processDirtyPoints();
	}

	private clearDirtyComponents(): void {
		this.root.processDirtyComponents();
	}

	private addCause(state: CircuitState, headIn: SetData | null, data: SetData): SetData | null {
		if (data.val === null) {
			return this.removeCause(state, headIn, data.loc, data.cause);
		}
		let head = headIn;
		let replaced = false;
		for (let n = head; n !== null; n = n.next) {
			if (n.cause === data.cause) {
				n.val = data.val;
				replaced = true;
				break;
			}
		}
		if (!replaced) {
			if (head === null) {
				state.causes.set(data.loc, data);
				head = data;
			} else {
				data.next = head.next;
				head.next = data;
			}
		}
		return head;
	}

	private removeCause(state: CircuitState, headIn: SetData | null, l: Loc, cause: Instance): SetData | null {
		let head = headIn;
		if (head === null) return null;
		if (head.cause === cause) {
			head = head.next;
			if (head === null) state.causes.delete(l);
			else state.causes.set(l, head);
		} else {
			let prev = head;
			let cur = head.next;
			while (cur !== null) {
				if (cur.cause === cause) {
					prev.next = cur.next;
					break;
				}
				prev = cur;
				cur = cur.next;
			}
		}
		return head;
	}
}

function addPoint(map: Map<CircuitState, Set<Loc>>, state: CircuitState, l: Loc): void {
	let set = map.get(state);
	if (!set) {
		set = new Set();
		map.set(state, set);
	}
	set.add(l);
}

function computeValue(causes: SetData | null): Value {
	if (causes === null) return Value.NIL;
	let ret = causes.val ?? Value.NIL;
	for (let n = causes.next; n !== null; n = n.next) ret = ret.combine(n.val);
	return ret;
}

interface WireData {
	netlist: Netlist;
	threadValues: Map<WireThread, Value>;
}

export class CircuitState {
	base: Propagator | null = null;
	parentState: CircuitState | null = null;
	parentComp: Instance | null = null;
	readonly substates = new Set<CircuitState>();
	private wireData: WireData | null = null;
	private readonly componentData = new Map<Instance, unknown>();
	private readonly values = new Map<Loc, Value>();
	private dirtyComponents = new Set<Instance>();
	private dirtyPoints = new Set<Loc>();
	readonly causes = new Map<Loc, SetData>();
	private readonly listener = (e: CircuitEvent) => this.circuitChanged(e);
	/** Incremented when anything visible may have changed (for repainting). */
	version = 0;

	constructor(
		readonly context: SimContext,
		readonly circuit: Circuit,
	) {
		circuit.addListener(this.listener);
	}

	/** Create the root state of a simulation, with its own propagator. */
	static createRoot(context: SimContext, circuit: Circuit): CircuitState {
		const state = new CircuitState(context, circuit);
		state.getPropagator();
		return state;
	}

	dispose(): void {
		this.circuit.removeListener(this.listener);
		for (const sub of this.substates) sub.dispose();
	}

	private circuitChanged(e: CircuitEvent): void {
		this.version++;
		switch (e.type) {
			case "add":
				if ("isWire" in e.comp) {
					this.markPointAsDirty(e.comp.e0);
					this.markPointAsDirty(e.comp.e1);
				} else {
					this.markComponentAsDirty(e.comp);
				}
				break;
			case "remove":
				if ("isWire" in e.comp) {
					this.markPointAsDirty(e.comp.e0);
					this.markPointAsDirty(e.comp.e1);
				} else {
					const comp = e.comp;
					if (comp.factory.role === "subcircuit") {
						const sub = this.componentData.get(comp);
						if (sub instanceof CircuitState && sub.parentComp === comp) {
							this.substates.delete(sub);
							sub.parentState = null;
							sub.parentComp = null;
							sub.dispose();
						}
						this.componentData.delete(comp);
					}
					this.base?.checkComponentEnds(this, comp);
					this.dirtyComponents.delete(comp);
				}
				break;
			case "change":
				this.markComponentAsDirty(e.comp);
				this.base?.checkComponentEnds(this, e.comp);
				break;
			case "invalidate":
				this.markComponentAsDirty(e.comp);
				break;
			case "clear":
				for (const sub of this.substates) sub.dispose();
				this.substates.clear();
				this.wireData = null;
				this.componentData.clear();
				this.values.clear();
				this.dirtyComponents.clear();
				this.dirtyPoints.clear();
				this.causes.clear();
				break;
			case "rename":
				break;
		}
	}

	getPropagator(): Propagator {
		if (this.base === null) {
			this.base = new Propagator(this);
			this.markAllComponentsDirty();
		}
		return this.base;
	}

	isSubstate(): boolean {
		return this.parentState !== null;
	}

	getData(comp: Instance): unknown {
		return this.componentData.get(comp);
	}

	setData(comp: Instance, data: unknown): void {
		if (data instanceof CircuitState) {
			const oldState = this.componentData.get(comp);
			if (oldState !== data) {
				if (oldState instanceof CircuitState && oldState.parentComp === comp) {
					this.substates.delete(oldState);
					oldState.parentState = null;
					oldState.parentComp = null;
				}
				if (data.parentState !== this) {
					this.substates.add(data);
					data.setBase(this.base);
					data.parentState = this;
					data.parentComp = comp;
					data.markAllComponentsDirty();
				}
			}
		}
		this.componentData.set(comp, data);
	}

	private setBase(base: Propagator | null): void {
		this.base = base;
		for (const sub of this.substates) sub.setBase(base);
	}

	getValue(pt: Loc): Value {
		const ret = this.values.get(pt);
		if (ret !== undefined) return ret;
		return Value.createUnknown(this.circuit.getWidth(pt));
	}

	setValue(pt: Loc, val: Value, cause: Instance, delay: number): void {
		this.base?.setValue(this, pt, val, cause, delay);
	}

	markComponentAsDirty(comp: Instance): void {
		this.dirtyComponents.add(comp);
	}

	markPointAsDirty(pt: Loc): void {
		this.dirtyPoints.add(pt);
	}

	getInstanceState(comp: Instance): InstanceState {
		return new InstanceStateImpl(this, comp);
	}

	/** Mark a component as needing propagation after its state changed. */
	fireInvalidated(comp: Instance): void {
		this.circuit.componentInvalidated(comp);
	}

	processDirtyComponents(): void {
		if (this.dirtyComponents.size > 0) {
			const toProcess = Array.from(this.dirtyComponents);
			this.dirtyComponents.clear();
			for (const comp of toProcess) {
				comp.factory.propagate(new InstanceStateImpl(this, comp));
				if (comp.factory.role === "pin" && this.parentState && this.parentComp) {
					// should be propagated in superstate
					this.parentComp.factory.propagate(new InstanceStateImpl(this.parentState, this.parentComp));
				}
			}
			this.version++;
		}
		for (const sub of Array.from(this.substates)) sub.processDirtyComponents();
	}

	processDirtyPoints(): void {
		const dirty = new Set(this.dirtyPoints);
		this.dirtyPoints.clear();
		const netlist = this.circuit.getNetlist();
		if (this.wireData === null || this.wireData.netlist !== netlist) {
			for (const p of netlist.points.map.keys()) dirty.add(p);
		}
		if (dirty.size > 0) {
			this.propagateWires(netlist, dirty);
			this.version++;
		}
		for (const sub of Array.from(this.substates)) sub.processDirtyPoints();
	}

	/** CircuitWires.propagate */
	private propagateWires(map: Netlist, points: Set<Loc>): void {
		const dirtyThreads = new Set<WireThread>();
		let s = this.wireData;
		if (s === null || s.netlist !== map) {
			s = { netlist: map, threadValues: new Map() };
			for (const b of map.bundles) {
				if (b.isValid() && b.threads !== null) {
					for (const t of b.threads) dirtyThreads.add(t);
				}
			}
			this.wireData = s;
		}

		for (const p of points) {
			const pb = map.getBundleAt(p);
			if (pb === undefined) {
				this.setValueByWire(p, this.getComponentOutputAt(p));
			} else if (!pb.isValid() || pb.threads === null) {
				for (const loc2 of pb.points) this.setValueByWire(loc2, Value.NIL);
			} else {
				for (const t of pb.threads) dirtyThreads.add(t);
			}
		}

		if (dirtyThreads.size === 0) return;

		const bundles = new Set<WireBundle>();
		for (const t of dirtyThreads) {
			s.threadValues.set(t, this.getThreadValue(t));
			for (const tb of t.bundles) bundles.add(tb.b);
		}

		for (const b of bundles) {
			let bv: Value | null = null;
			if (!b.isValid() || b.threads === null) {
				// nothing
			} else if (b.threads.length === 1) {
				bv = s.threadValues.get(b.threads[0]) ?? null;
			} else {
				const tvs: Value[] = [];
				let valid = true;
				for (const t of b.threads) {
					const tv = s.threadValues.get(t);
					if (tv === undefined) {
						valid = false;
						break;
					}
					tvs.push(tv);
				}
				if (valid) bv = Value.fromBits(tvs);
			}
			if (bv !== null) {
				for (const p of b.points) this.setValueByWire(p, bv);
			}
		}
	}

	private getThreadValue(t: WireThread): Value {
		let ret = Value.UNKNOWN;
		let pull = Value.UNKNOWN;
		for (const tb of t.bundles) {
			for (const p of tb.b.points) {
				const val = this.getComponentOutputAt(p);
				if (val !== Value.NIL) ret = ret.combine(val.get(tb.loc));
			}
			const pullHere = tb.b.getPullValue();
			if (pullHere !== Value.UNKNOWN) pull = pull.combine(pullHere);
		}
		if (pull !== Value.UNKNOWN) ret = pullValue(ret, pull);
		return ret;
	}

	reset(): void {
		this.wireData = null;
		for (const comp of Array.from(this.componentData.keys())) {
			if (comp.factory.role !== "subcircuit") this.componentData.delete(comp);
		}
		this.values.clear();
		this.dirtyComponents.clear();
		this.dirtyPoints.clear();
		this.causes.clear();
		this.markAllComponentsDirty();
		for (const sub of this.substates) sub.reset();
		this.version++;
	}

	tick(ticks: number): boolean {
		let ret = false;
		for (const clock of this.circuit.clocks) {
			ret = (clock.factory as unknown as ClockLike).tick(this, ticks, clock) || ret;
		}
		for (const sub of Array.from(this.substates)) ret = sub.tick(ticks) || ret;
		return ret;
	}

	getComponentOutputAt(p: Loc): Value {
		return computeValue(this.causes.get(p) ?? null);
	}

	getValueByWire(p: Loc): Value | undefined {
		return this.values.get(p);
	}

	setValueByWire(p: Loc, v: Value): void {
		let changed: boolean;
		if (v === Value.NIL) {
			const old = this.values.get(p);
			this.values.delete(p);
			changed = old !== undefined && old !== Value.NIL;
		} else {
			const old = this.values.get(p);
			this.values.set(p, v);
			changed = !v.equals(old);
		}
		if (changed) {
			let found = false;
			for (const comp of this.circuit.getNonWiresAt(p)) {
				if (comp.factory.role !== "splitter") {
					found = true;
					this.markComponentAsDirty(comp);
				}
			}
			if (found) this.base?.locationTouched(this, p);
		}
	}

	private markAllComponentsDirty(): void {
		for (const c of this.circuit.components) this.dirtyComponents.add(c);
	}
}

function pullValue(base: Value, pullTo: Value): Value {
	if (base.isFullyDefined()) return base;
	if (base.width === 1) return base === Value.UNKNOWN ? pullTo : base;
	const ret = base.getAll().map((v) => (v === Value.UNKNOWN ? pullTo : v));
	return Value.fromBits(ret);
}

export class InstanceStateImpl implements InstanceState {
	constructor(
		readonly circuitState: CircuitState,
		readonly instance: Instance,
	) {}

	get attrs() {
		return this.instance.attrs;
	}

	get options(): ProjectOptions {
		return this.circuitState.context.options;
	}

	getAttr<T>(attr: Attribute<T>): T {
		return this.instance.attrs.get(attr);
	}

	getPort(index: number): Value {
		return this.circuitState.getValue(this.instance.ends[index].loc);
	}

	isPortConnected(index: number): boolean {
		return this.circuitState.circuit.isConnected(this.instance.ends[index].loc, this.instance);
	}

	setPort(index: number, value: Value, delay: number): void {
		this.circuitState.setValue(this.instance.ends[index].loc, value, this.instance, delay);
	}

	getData<T>(): T | undefined {
		return this.circuitState.getData(this.instance) as T | undefined;
	}

	setData(data: unknown): void {
		this.circuitState.setData(this.instance, data);
	}

	fireInvalidated(): void {
		this.circuitState.fireInvalidated(this.instance);
	}

	isCircuitRoot(): boolean {
		return !this.circuitState.isSubstate();
	}

	getTickCount(): number {
		return this.circuitState.getPropagator().getTickCount();
	}
}
