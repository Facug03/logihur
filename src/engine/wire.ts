// Port of com.cburch.logisim.circuit.Wire.

import { Bounds, formatLoc, type Loc, loc, locX, locY } from "./geom";

export const WIRE_WIDTH = 3;

export class Wire {
	readonly isWire = true as const;
	readonly e0: Loc;
	readonly e1: Loc;
	readonly isXEqual: boolean;

	private constructor(a: Loc, b: Loc) {
		this.isXEqual = locX(a) === locX(b);
		if (this.isXEqual) {
			[this.e0, this.e1] = locY(a) > locY(b) ? [b, a] : [a, b];
		} else {
			[this.e0, this.e1] = locX(a) > locX(b) ? [b, a] : [a, b];
		}
	}

	static create(a: Loc, b: Loc): Wire {
		return new Wire(a, b);
	}

	get key(): string {
		return `${this.e0}:${this.e1}`;
	}

	get isVertical(): boolean {
		return this.isXEqual;
	}

	get length(): number {
		return Math.abs(locX(this.e1) - locX(this.e0)) + Math.abs(locY(this.e1) - locY(this.e0));
	}

	get bounds(): Bounds {
		const x0 = locX(this.e0);
		const y0 = locY(this.e0);
		return Bounds.create(x0 - 2, y0 - 2, locX(this.e1) - x0 + 5, locY(this.e1) - y0 + 5);
	}

	endsAt(l: Loc): boolean {
		return this.e0 === l || this.e1 === l;
	}

	/** Whether the point lies on the wire (including its ends). */
	contains(x: number, y: number, tolerance = 0): boolean {
		const x0 = locX(this.e0);
		const y0 = locY(this.e0);
		const x1 = locX(this.e1);
		const y1 = locY(this.e1);
		if (this.isXEqual) {
			return Math.abs(x - x0) <= tolerance && y >= y0 - tolerance && y <= y1 + tolerance;
		}
		return Math.abs(y - y0) <= tolerance && x >= x0 - tolerance && x <= x1 + tolerance;
	}

	/** Whether the grid location is strictly inside the wire (not an end). */
	containsInterior(l: Loc): boolean {
		const x = locX(l);
		const y = locY(l);
		if (this.isXEqual) {
			return x === locX(this.e0) && y > locY(this.e0) && y < locY(this.e1);
		}
		return y === locY(this.e0) && x > locX(this.e0) && x < locX(this.e1);
	}

	otherEnd(l: Loc): Loc {
		return l === this.e0 ? this.e1 : this.e0;
	}

	toString(): string {
		return `w${formatLoc(this.e0)}-${formatLoc(this.e1)}`;
	}
}

export function wireFrom(x0: number, y0: number, x1: number, y1: number): Wire {
	return Wire.create(loc(x0, y0), loc(x1, y1));
}
