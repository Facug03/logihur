// Port of CircuitPoints, CircuitWires (bundle map), WireBundle and WireThread.
// A netlist groups connected points into bundles (multi-bit buses) and bits
// into threads, following wires, tunnels, pull resistors and splitters.

import type { EndData, Instance } from "./component";
import type { Loc } from "./geom";
import { Value } from "./value";
import type { Wire } from "./wire";

export type Connectable = Instance | Wire;

export interface SplitterLike {
	/** For each bit of the combined end, the end index it goes to (0 = none). */
	getBitEnds(instance: Instance): readonly number[];
}

export interface PullLike {
	getPullValue(instance: Instance): Value;
}

export class LocationData {
	width = 0;
	readonly components: Connectable[] = [];
	/** Parallel to components; null for wires. */
	readonly ends: (EndData | null)[] = [];
}

export class WidthIncompatibility {
	readonly points: Loc[] = [];
	readonly widths: number[] = [];

	add(p: Loc, width: number): void {
		for (let i = 0; i < this.points.length; i++) {
			if (this.points[i] === p && this.widths[i] === width) return;
		}
		this.points.push(p);
		this.widths.push(width);
	}
}

export class WireThread {
	private parent: WireThread = this;
	readonly bundles: ThreadBundle[] = [];

	unite(other: WireThread): void {
		const g1 = this.find();
		const g2 = other.find();
		if (g1 !== g2) g1.parent = g2;
	}

	find(): WireThread {
		let ret: WireThread = this;
		if (ret.parent !== ret) {
			do ret = ret.parent;
			while (ret.parent !== ret);
			this.parent = ret;
		}
		return ret;
	}
}

export interface ThreadBundle {
	/** Bit index of the thread within the bundle. */
	readonly loc: number;
	readonly b: WireBundle;
}

export class WireBundle {
	private width = 0;
	private pullValue: Value = Value.UNKNOWN;
	private parent: WireBundle = this;
	private widthDeterminant: Loc | null = null;
	threads: WireThread[] | null = null;
	readonly points = new Set<Loc>();
	incompatibility: WidthIncompatibility | null = null;

	isValid(): boolean {
		return this.incompatibility === null;
	}

	setWidth(width: number, det: Loc): void {
		if (width === 0) return;
		if (this.incompatibility !== null) {
			this.incompatibility.add(det, width);
			return;
		}
		if (this.width !== 0) {
			if (width === this.width) return;
			this.incompatibility = new WidthIncompatibility();
			if (this.widthDeterminant !== null) {
				this.incompatibility.add(this.widthDeterminant, this.width);
			}
			this.incompatibility.add(det, width);
			return;
		}
		this.width = width;
		this.widthDeterminant = det;
		this.threads = [];
		for (let i = 0; i < width; i++) this.threads.push(new WireThread());
	}

	getWidth(): number {
		return this.incompatibility !== null ? 0 : this.width;
	}

	getWidthDeterminant(): Loc | null {
		return this.incompatibility !== null ? null : this.widthDeterminant;
	}

	unite(other: WireBundle): void {
		const g1 = this.find();
		const g2 = other.find();
		if (g1 !== g2) g1.parent = g2;
	}

	find(): WireBundle {
		let ret: WireBundle = this;
		if (ret.parent !== ret) {
			do ret = ret.parent;
			while (ret.parent !== ret);
			this.parent = ret;
		}
		return ret;
	}

	addPullValue(val: Value): void {
		this.pullValue = this.pullValue.combine(val);
	}

	getPullValue(): Value {
		return this.pullValue;
	}
}

function isWire(c: Connectable): c is Wire {
	return (c as Wire).isWire === true;
}

/** CircuitPoints: which components touch each location, and their widths. */
export class CircuitPoints {
	readonly map = new Map<Loc, LocationData>();
	readonly incompatibility = new Map<Loc, WidthIncompatibility>();

	add(comp: Connectable): void {
		if (isWire(comp)) {
			this.addSub(comp.e0, comp, null);
			this.addSub(comp.e1, comp, null);
		} else {
			for (const end of comp.ends) this.addSub(end.loc, comp, end);
		}
	}

	getWidth(l: Loc): number {
		return this.map.get(l)?.width ?? 0;
	}

	getComponents(l: Loc): readonly Connectable[] {
		return this.map.get(l)?.components ?? [];
	}

	getComponentCount(l: Loc): number {
		return this.map.get(l)?.components.length ?? 0;
	}

	getWires(l: Loc): Wire[] {
		return this.getComponents(l).filter(isWire);
	}

	getNonWires(l: Loc): Instance[] {
		return this.getComponents(l).filter((c): c is Instance => !isWire(c));
	}

	getExclusive(l: Loc): Instance | null {
		const data = this.map.get(l);
		if (!data) return null;
		for (let i = 0; i < data.ends.length; i++) {
			const e = data.ends[i];
			if (e?.exclusive) return data.components[i] as Instance;
		}
		return null;
	}

	private addSub(l: Loc, comp: Connectable, end: EndData | null): void {
		let data = this.map.get(l);
		if (!data) {
			data = new LocationData();
			this.map.set(l, data);
		}
		data.components.push(comp);
		data.ends.push(end);
		this.computeIncompatibility(l, data);
	}

	private computeIncompatibility(l: Loc, data: LocationData): void {
		let error: WidthIncompatibility | null = null;
		let width = 0;
		for (const end of data.ends) {
			if (end === null) continue;
			if (width === 0) {
				width = end.width;
			} else if (width !== end.width && end.width !== 0) {
				if (error === null) {
					error = new WidthIncompatibility();
					error.add(l, width);
				}
				error.add(l, end.width);
			}
		}
		data.width = width;
		if (error === null) this.incompatibility.delete(l);
		else this.incompatibility.set(l, error);
	}
}

export interface SplitterData {
	/** WireBundle associated with each end (index 0 is the combined end). */
	endBundles: (WireBundle | null)[];
	/** For each bit of the combined end, its thread index within its end. */
	bitThread: number[];
	bitEnd: readonly number[];
}

/** CircuitWires.BundleMap plus the CircuitPoints it was computed from. */
export class Netlist {
	readonly pointBundles = new Map<Loc, WireBundle>();
	readonly bundles = new Set<WireBundle>();
	readonly splitters = new Map<Instance, SplitterData>();
	readonly incompatibilities: WidthIncompatibility[] = [];
	isValid = true;

	constructor(readonly points: CircuitPoints) {}

	getBundleAt(p: Loc): WireBundle | undefined {
		return this.pointBundles.get(p);
	}

	createBundleAt(p: Loc): WireBundle {
		let ret = this.pointBundles.get(p);
		if (!ret) {
			ret = new WireBundle();
			this.pointBundles.set(p, ret);
			ret.points.add(p);
			this.bundles.add(ret);
		}
		return ret;
	}

	/** Circuit.getWidth / CircuitWires.getWidth */
	getWidth(q: Loc): number {
		const det = this.points.getWidth(q);
		if (det !== 0) return det;
		if (!this.isValid) return 0;
		const qb = this.pointBundles.get(q);
		if (qb?.isValid()) return qb.getWidth();
		return 0;
	}
}

export interface NetlistInput {
	wires: Iterable<Wire>;
	components: Iterable<Instance>;
}

export function computeNetlist(input: NetlistInput): Netlist {
	const points = new CircuitPoints();
	const splitters: Instance[] = [];
	const tunnels: Instance[] = [];
	const pulls: Instance[] = [];
	const wires: Wire[] = [];
	for (const w of input.wires) {
		wires.push(w);
		points.add(w);
	}
	for (const c of input.components) {
		points.add(c);
		const role = c.factory.role;
		if (role === "splitter") splitters.push(c);
		else if (role === "tunnel") tunnels.push(c);
		else if (role === "pull") pulls.push(c);
	}

	const ret = new Netlist(points);
	try {
		buildBundles(ret, wires, splitters, tunnels, pulls);
	} catch (e) {
		ret.isValid = false;
		console.error("netlist computation failed", e);
	}
	return ret;
}

function buildBundles(
	ret: Netlist,
	wires: Wire[],
	splitters: Instance[],
	tunnels: Instance[],
	pulls: Instance[],
): void {
	// create bundles corresponding to wires, tunnels and pull resistors
	for (const w of wires) {
		const b0 = ret.getBundleAt(w.e0);
		if (b0 === undefined) {
			const b1 = ret.createBundleAt(w.e1);
			b1.points.add(w.e0);
			ret.pointBundles.set(w.e0, b1);
		} else {
			const b1 = ret.getBundleAt(w.e1);
			if (b1 === undefined) {
				b0.points.add(w.e1);
				ret.pointBundles.set(w.e1, b0);
			} else {
				b1.unite(b0);
			}
		}
	}

	const tunnelSets = new Map<string, Loc[]>();
	for (const comp of tunnels) {
		const label = String(comp.attrs.getByName("label") ?? "").trim();
		if (label !== "") {
			let set = tunnelSets.get(label);
			if (!set) {
				set = [];
				tunnelSets.set(label, set);
			}
			set.push(comp.loc);
		}
	}
	for (const set of tunnelSets.values()) {
		let foundBundle: WireBundle | undefined;
		let foundLocation: Loc | undefined;
		for (const l of set) {
			const b = ret.getBundleAt(l);
			if (b !== undefined) {
				foundBundle = b;
				foundLocation = l;
				break;
			}
		}
		if (foundBundle === undefined) {
			foundLocation = set[0];
			foundBundle = ret.createBundleAt(foundLocation);
		}
		for (const l of set) {
			if (l !== foundLocation) {
				const b = ret.getBundleAt(l);
				if (b === undefined) {
					foundBundle.points.add(l);
					ret.pointBundles.set(l, foundBundle);
				} else {
					b.unite(foundBundle);
				}
			}
		}
	}

	for (const comp of pulls) {
		const l = comp.ends[0].loc;
		let b = ret.getBundleAt(l);
		if (b === undefined) {
			b = ret.createBundleAt(l);
		}
		b.addPullValue((comp.factory as unknown as PullLike).getPullValue(comp));
	}

	// merge any WireBundle objects united by previous steps
	for (const b of Array.from(ret.bundles)) {
		const bpar = b.find();
		if (bpar !== b) {
			for (const pt of b.points) {
				ret.pointBundles.set(pt, bpar);
				bpar.points.add(pt);
			}
			bpar.addPullValue(b.getPullValue());
			ret.bundles.delete(b);
		}
	}

	// make a WireBundle object for each end of a splitter
	for (const spl of splitters) {
		for (const end of spl.ends) {
			const pb = ret.createBundleAt(end.loc);
			pb.setWidth(end.width, end.loc);
		}
	}

	// set the width for each bundle whose size is known based on components
	for (const [p, pb] of ret.pointBundles) {
		const width = ret.points.getWidth(p);
		if (width !== 0) pb.setWidth(width, p);
	}

	// determine the bundles at the end of each splitter
	for (const spl of splitters) {
		const bitEnd = (spl.factory as unknown as SplitterLike).getBitEnds(spl);
		const ends = spl.ends;
		const endWidth = new Array<number>(ends.length).fill(0);
		const bitThread = bitEnd.map((e) => {
			if (e > 0) return endWidth[e]++;
			return -1;
		});
		const data: SplitterData = {
			endBundles: new Array(ends.length).fill(null),
			bitThread,
			bitEnd,
		};
		ends.forEach((end, index) => {
			const pb = ret.getBundleAt(end.loc);
			if (pb !== undefined) {
				pb.setWidth(end.width, end.loc);
				data.endBundles[index] = pb;
			}
		});
		ret.splitters.set(spl, data);
	}

	// unite threads going through splitters
	for (const [, data] of ret.splitters) {
		const from = data.endBundles[0];
		if (from == null || !from.isValid()) continue;
		for (let i = 0; i < data.bitEnd.length; i++) {
			const j = data.bitEnd[i];
			if (j > 0) {
				const thr = data.bitThread[i];
				const to = data.endBundles[j];
				const toThreads = to?.threads;
				if (to && toThreads && to.isValid()) {
					const fromThreads = from.threads;
					if (!fromThreads || i >= fromThreads.length) {
						throw new Error(`from ${i} of ${fromThreads?.length}`);
					}
					if (thr >= toThreads.length) {
						throw new Error(`to ${thr} of ${toThreads.length}`);
					}
					fromThreads[i].unite(toThreads[thr]);
				}
			}
		}
	}

	// merge any threads united by previous step
	for (const b of ret.bundles) {
		if (b.isValid() && b.threads !== null) {
			for (let i = 0; i < b.threads.length; i++) {
				const thr = b.threads[i].find();
				b.threads[i] = thr;
				thr.bundles.push({ loc: i, b });
			}
		}
	}

	for (const wid of ret.points.incompatibility.values()) {
		ret.incompatibilities.push(wid);
	}
	for (const b of ret.bundles) {
		if (b.incompatibility) ret.incompatibilities.push(b.incompatibility);
	}
}
