// Wire repair, as Logisim does when wires are added or removed:
// - collinear overlapping wires are merged,
// - collinear wires meeting end to end are merged unless something else
//   connects at that point,
// - wires are split wherever another wire ends or a component port lies on
//   them (so a T connects, and files store split wires like Logisim's).
// Crossing wires stay unconnected.

import type { Circuit } from "@/engine/circuit";
import { type Loc, loc, locX, locY } from "@/engine/geom";
import { Wire } from "@/engine/wire";
import type { Transaction } from "./history";

interface Segment {
	/** Fixed coordinate (y for horizontal, x for vertical). */
	c: number;
	a: number;
	b: number;
}

function toWire(s: Segment, horizontal: boolean): Wire {
	return horizontal ? Wire.create(loc(s.a, s.c), loc(s.b, s.c)) : Wire.create(loc(s.c, s.a), loc(s.c, s.b));
}

export function repairWires(tx: Transaction, circuit: Circuit): void {
	const compEnds = new Set<Loc>();
	for (const comp of circuit.components) for (const e of comp.ends) compEnds.add(e.loc);

	const horiz = new Map<number, Segment[]>();
	const vert = new Map<number, Segment[]>();
	for (const w of circuit.wires.values()) {
		if (w.isVertical) {
			const x = locX(w.e0);
			const list = vert.get(x) ?? [];
			list.push({ c: x, a: locY(w.e0), b: locY(w.e1) });
			vert.set(x, list);
		} else {
			const y = locY(w.e0);
			const list = horiz.get(y) ?? [];
			list.push({ c: y, a: locX(w.e0), b: locX(w.e1) });
			horiz.set(y, list);
		}
	}

	// endpoints of perpendicular wires, per point, to decide end-to-end merges
	const endsOf = (m: Map<number, Segment[]>, horizontal: boolean) => {
		const set = new Set<Loc>();
		for (const list of m.values()) {
			for (const s of list) {
				set.add(horizontal ? loc(s.a, s.c) : loc(s.c, s.a));
				set.add(horizontal ? loc(s.b, s.c) : loc(s.c, s.b));
			}
		}
		return set;
	};
	const horizEnds = endsOf(horiz, true);
	const vertEnds = endsOf(vert, false);

	const mergeLine = (list: Segment[], horizontal: boolean): Segment[] => {
		list.sort((p, q) => p.a - q.a || p.b - q.b);
		const out: Segment[] = [];
		for (const s of list) {
			const last = out.at(-1);
			if (last && s.a < last.b) {
				last.b = Math.max(last.b, s.b);
			} else if (last && s.a === last.b) {
				const p = horizontal ? loc(s.a, s.c) : loc(s.c, s.a);
				const perpendicular = horizontal ? vertEnds : horizEnds;
				if (!compEnds.has(p) && !perpendicular.has(p)) last.b = Math.max(last.b, s.b);
				else out.push({ ...s });
			} else {
				out.push({ ...s });
			}
		}
		return out;
	};

	const merged: { s: Segment; horizontal: boolean }[] = [];
	for (const list of horiz.values())
		for (const s of mergeLine(list, true)) merged.push({ s, horizontal: true });
	for (const list of vert.values())
		for (const s of mergeLine(list, false)) merged.push({ s, horizontal: false });

	// split points: all wire ends and component ends
	const splitPoints = new Set<Loc>(compEnds);
	for (const { s, horizontal } of merged) {
		splitPoints.add(horizontal ? loc(s.a, s.c) : loc(s.c, s.a));
		splitPoints.add(horizontal ? loc(s.b, s.c) : loc(s.c, s.b));
	}

	const desired = new Map<string, Wire>();
	for (const { s, horizontal } of merged) {
		const cuts = [s.a, s.b];
		for (const p of splitPoints) {
			const px = locX(p);
			const py = locY(p);
			if (horizontal ? py === s.c && px > s.a && px < s.b : px === s.c && py > s.a && py < s.b) {
				cuts.push(horizontal ? px : py);
			}
		}
		cuts.sort((p, q) => p - q);
		for (let i = 0; i + 1 < cuts.length; i++) {
			if (cuts[i] === cuts[i + 1]) continue;
			const w = toWire({ c: s.c, a: cuts[i], b: cuts[i + 1] }, horizontal);
			desired.set(w.key, w);
		}
	}

	for (const w of Array.from(circuit.wires.values())) {
		if (!desired.has(w.key)) tx.removeWire(circuit, w);
	}
	for (const [key, w] of desired) {
		if (!circuit.wires.has(key)) tx.addWire(circuit, w);
	}
}

/**
 * The L-shaped path Logisim draws while dragging a wire: first along the
 * axis of the initial movement, then the other.
 */
export function wirePath(start: Loc, end: Loc, horizontalFirst: boolean): Wire[] {
	const x0 = locX(start);
	const y0 = locY(start);
	const x1 = locX(end);
	const y1 = locY(end);
	const corner = horizontalFirst ? loc(x1, y0) : loc(x0, y1);
	const ret: Wire[] = [];
	if (corner !== start) ret.push(Wire.create(start, corner));
	if (corner !== end) ret.push(Wire.create(corner, end));
	return ret;
}
