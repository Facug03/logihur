// Ports of com.cburch.logisim.data.{Location, Direction, Bounds}.

/**
 * A grid location packed into a single number so it can be used directly as a
 * Map/Set key. Coordinates must fit in [-32768, 32767].
 */
export type Loc = number;

const OFFSET = 0x8000;
const SCALE = 0x10000;

export function loc(x: number, y: number): Loc {
	return (x + OFFSET) * SCALE + (y + OFFSET);
}

export function locX(l: Loc): number {
	return Math.floor(l / SCALE) - OFFSET;
}

export function locY(l: Loc): number {
	return (l % SCALE) - OFFSET;
}

export function translate(l: Loc, dx: number, dy: number): Loc {
	return loc(locX(l) + dx, locY(l) + dy);
}

export function manhattan(a: Loc, b: Loc): number {
	return Math.abs(locX(a) - locX(b)) + Math.abs(locY(a) - locY(b));
}

export function manhattanTo(a: Loc, x: number, y: number): number {
	return Math.abs(locX(a) - x) + Math.abs(locY(a) - y);
}

/** Same ordering as Location.compareTo: by x, then by y. */
export function compareLoc(a: Loc, b: Loc): number {
	const dx = locX(a) - locX(b);
	return dx !== 0 ? dx : locY(a) - locY(b);
}

export function formatLoc(l: Loc): string {
	return `(${locX(l)},${locY(l)})`;
}

export function parseLoc(value: string): Loc {
	let v = value.trim();
	if (v.startsWith("(")) {
		if (!v.endsWith(")")) throw new Error(`invalid point '${value}'`);
		v = v.slice(1, -1);
	}
	v = v.trim();
	let comma = v.indexOf(",");
	if (comma < 0) comma = v.indexOf(" ");
	if (comma < 0) throw new Error(`invalid point '${value}'`);
	const x = Number.parseInt(v.slice(0, comma).trim(), 10);
	const y = Number.parseInt(v.slice(comma + 1).trim(), 10);
	if (Number.isNaN(x) || Number.isNaN(y)) {
		throw new Error(`invalid point '${value}'`);
	}
	return loc(x, y);
}

export type Direction = "east" | "west" | "north" | "south";

export const DIRECTIONS: readonly Direction[] = ["north", "south", "east", "west"];

export function parseDirection(s: string): Direction {
	if (s === "east" || s === "west" || s === "north" || s === "south") return s;
	throw new Error(`illegal direction '${s}'`);
}

export function dirDegrees(d: Direction): number {
	switch (d) {
		case "east":
			return 0;
		case "west":
			return 180;
		case "north":
			return 90;
		case "south":
			return 270;
	}
}

export function dirRadians(d: Direction): number {
	switch (d) {
		case "east":
			return 0;
		case "west":
			return Math.PI;
		case "north":
			return Math.PI / 2;
		case "south":
			return -Math.PI / 2;
	}
}

export function reverseDir(d: Direction): Direction {
	switch (d) {
		case "east":
			return "west";
		case "west":
			return "east";
		case "north":
			return "south";
		case "south":
			return "north";
	}
}

export function rightOf(d: Direction): Direction {
	switch (d) {
		case "east":
			return "south";
		case "west":
			return "north";
		case "north":
			return "east";
		case "south":
			return "west";
	}
}

export function leftOf(d: Direction): Direction {
	switch (d) {
		case "east":
			return "north";
		case "west":
			return "south";
		case "north":
			return "west";
		case "south":
			return "east";
	}
}

/** Location.translate(Direction, dist, right). */
export function translateDir(l: Loc, dir: Direction, dist: number, right = 0): Loc {
	if (dist === 0 && right === 0) return l;
	const x = locX(l);
	const y = locY(l);
	switch (dir) {
		case "east":
			return loc(x + dist, y + right);
		case "west":
			return loc(x - dist, y - right);
		case "south":
			return loc(x - right, y + dist);
		case "north":
			return loc(x + right, y - dist);
	}
}

function rotationDegrees(from: Direction, to: Direction): number {
	let degrees = dirDegrees(to) - dirDegrees(from);
	while (degrees >= 360) degrees -= 360;
	while (degrees < 0) degrees += 360;
	return degrees;
}

/** Location.rotate: rotate around (xc, yc) from one facing to another. */
export function rotateLoc(l: Loc, from: Direction, to: Direction, xc: number, yc: number): Loc {
	const degrees = rotationDegrees(from, to);
	const dx = locX(l) - xc;
	const dy = locY(l) - yc;
	if (degrees === 90) return loc(xc + dy, yc - dx);
	if (degrees === 180) return loc(xc - dx, yc - dy);
	if (degrees === 270) return loc(xc - dy, yc + dx);
	return l;
}

export class Bounds {
	static readonly EMPTY = new Bounds(0, 0, 0, 0);

	private constructor(
		readonly x: number,
		readonly y: number,
		readonly width: number,
		readonly height: number,
	) {}

	static create(x: number, y: number, width: number, height: number): Bounds {
		return new Bounds(x, y, width, height);
	}

	static ofLoc(l: Loc): Bounds {
		return new Bounds(locX(l), locY(l), 1, 1);
	}

	isEmpty(): boolean {
		return this === Bounds.EMPTY;
	}

	equals(o: Bounds): boolean {
		return this.x === o.x && this.y === o.y && this.width === o.width && this.height === o.height;
	}

	contains(px: number, py: number, allowedError = 0): boolean {
		return (
			px >= this.x - allowedError &&
			px < this.x + this.width + allowedError &&
			py >= this.y - allowedError &&
			py < this.y + this.height + allowedError
		);
	}

	containsLoc(l: Loc, allowedError = 0): boolean {
		return this.contains(locX(l), locY(l), allowedError);
	}

	containsBounds(b: Bounds): boolean {
		const ox = b.width <= 0 ? b.x : b.x + b.width - 1;
		const oy = b.height <= 0 ? b.y : b.y + b.height - 1;
		return this.contains(b.x, b.y) && this.contains(ox, oy);
	}

	addPoint(x: number, y: number): Bounds {
		if (this === Bounds.EMPTY) return Bounds.create(x, y, 1, 1);
		if (this.contains(x, y)) return this;
		let nx = this.x;
		let nw = this.width;
		let ny = this.y;
		let nh = this.height;
		if (x < this.x) {
			nx = x;
			nw = this.x + this.width - x;
		} else if (x >= this.x + this.width) {
			nw = x - this.x + 1;
		}
		if (y < this.y) {
			ny = y;
			nh = this.y + this.height - y;
		} else if (y >= this.y + this.height) {
			nh = y - this.y + 1;
		}
		return Bounds.create(nx, ny, nw, nh);
	}

	addLoc(l: Loc): Bounds {
		return this.addPoint(locX(l), locY(l));
	}

	addRect(x: number, y: number, w: number, h: number): Bounds {
		if (this === Bounds.EMPTY) return Bounds.create(x, y, w, h);
		const rx = Math.min(x, this.x);
		const ry = Math.min(y, this.y);
		const rw = Math.max(x + w, this.x + this.width) - rx;
		const rh = Math.max(y + h, this.y + this.height) - ry;
		return Bounds.create(rx, ry, rw, rh);
	}

	add(b: Bounds): Bounds {
		if (this === Bounds.EMPTY) return b;
		if (b === Bounds.EMPTY) return this;
		return this.addRect(b.x, b.y, b.width, b.height);
	}

	expand(d: number): Bounds {
		if (this === Bounds.EMPTY || d === 0) return this;
		return Bounds.create(this.x - d, this.y - d, this.width + 2 * d, this.height + 2 * d);
	}

	translate(dx: number, dy: number): Bounds {
		if (this === Bounds.EMPTY) return this;
		if (dx === 0 && dy === 0) return this;
		return Bounds.create(this.x + dx, this.y + dy, this.width, this.height);
	}

	rotate(from: Direction, to: Direction, xc: number, yc: number): Bounds {
		const degrees = rotationDegrees(from, to);
		const dx = this.x - xc;
		const dy = this.y - yc;
		const { width: w, height: h } = this;
		if (degrees === 90) return Bounds.create(xc + dy, yc - dx - w, h, w);
		if (degrees === 180) return Bounds.create(xc - dx - w, yc - dy - h, w, h);
		if (degrees === 270) return Bounds.create(xc - dy - h, yc + dx, h, w);
		return this;
	}

	intersect(o: Bounds): Bounds {
		const x0 = Math.max(this.x, o.x);
		const y0 = Math.max(this.y, o.y);
		const x1 = Math.min(this.x + this.width, o.x + o.width);
		const y1 = Math.min(this.y + this.height, o.y + o.height);
		if (x1 < x0 || y1 < y0) return Bounds.EMPTY;
		return Bounds.create(x0, y0, x1 - x0, y1 - y0);
	}

	toString(): string {
		return `(${this.x},${this.y}): ${this.width}x${this.height}`;
	}
}
