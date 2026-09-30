// Port of com.cburch.logisim.data.Value (Logisim 2.7.1).
// A value is a vector of up to 32 bits, each of which is 0, 1, X (unknown /
// floating) or E (error). Values are immutable; one-bit values are singletons
// so they can be compared with ===, exactly like the Java original.

export const MAX_WIDTH = 32;

function maskFor(width: number): number {
	return width === 32 ? -1 : ~(-1 << width);
}

export class Value {
	static readonly FALSE: Value = new Value(1, 0, 0, 0);
	static readonly TRUE: Value = new Value(1, 0, 0, 1);
	static readonly UNKNOWN: Value = new Value(1, 0, 1, 0);
	static readonly ERROR: Value = new Value(1, 1, 0, 0);
	static readonly NIL: Value = new Value(0, 0, 0, 0);

	static readonly NIL_COLOR = "#808080";
	static readonly FALSE_COLOR = "#006400";
	static readonly TRUE_COLOR = "#00d200";
	static readonly UNKNOWN_COLOR = "#2828ff";
	static readonly ERROR_COLOR = "#c00000";
	static readonly WIDTH_ERROR_COLOR = "#ff7b00";
	static readonly MULTI_COLOR = "#000000";

	private constructor(
		readonly width: number,
		readonly error: number,
		readonly unknown: number,
		readonly value: number,
	) {}

	static fromBits(values: Value[]): Value {
		if (values.length === 0) return Value.NIL;
		if (values.length === 1) return values[0];
		if (values.length > MAX_WIDTH) {
			throw new Error(`Cannot have more than ${MAX_WIDTH} bits in a value`);
		}
		let value = 0;
		let unknown = 0;
		let error = 0;
		for (let i = 0; i < values.length; i++) {
			const mask = 1 << i;
			const v = values[i];
			if (v === Value.TRUE) value |= mask;
			else if (v === Value.FALSE) {
				// nothing
			} else if (v === Value.UNKNOWN) unknown |= mask;
			else if (v === Value.ERROR) error |= mask;
			else throw new Error(`unrecognized value ${v}`);
		}
		return Value.create(values.length, error, unknown, value);
	}

	static createKnown(width: number, value: number): Value {
		return Value.create(width, 0, 0, value);
	}

	static createUnknown(width: number): Value {
		return Value.create(width, 0, -1, 0);
	}

	static createError(width: number): Value {
		return Value.create(width, -1, 0, 0);
	}

	static create(width: number, error: number, unknown: number, value: number): Value {
		if (width === 0) return Value.NIL;
		if (width === 1) {
			if ((error & 1) !== 0) return Value.ERROR;
			if ((unknown & 1) !== 0) return Value.UNKNOWN;
			if ((value & 1) !== 0) return Value.TRUE;
			return Value.FALSE;
		}
		const mask = maskFor(width);
		const e = error & mask;
		const u = unknown & mask & ~e;
		const v = value & mask & ~u & ~e;
		return new Value(width, e, u, v);
	}

	static repeat(base: Value, bits: number): Value {
		if (base.width !== 1) {
			throw new Error("first parameter must be one bit");
		}
		if (bits === 1) return base;
		return Value.fromBits(new Array<Value>(bits).fill(base));
	}

	isErrorValue(): boolean {
		return this.error !== 0;
	}

	extendWidth(newWidth: number, others: Value): Value {
		if (this.width === newWidth) return this;
		const maskInverse = this.width === 32 ? 0 : -1 << this.width;
		if (others === Value.ERROR) {
			return Value.create(newWidth, this.error | maskInverse, this.unknown, this.value);
		}
		if (others === Value.FALSE) {
			return Value.create(newWidth, this.error, this.unknown, this.value);
		}
		if (others === Value.TRUE) {
			return Value.create(newWidth, this.error, this.unknown, this.value | maskInverse);
		}
		return Value.create(newWidth, this.error, this.unknown | maskInverse, this.value);
	}

	isUnknown(): boolean {
		if (this.width === 32) return this.error === 0 && this.unknown === -1;
		return this.error === 0 && this.unknown === (1 << this.width) - 1;
	}

	isFullyDefined(): boolean {
		return this.width > 0 && this.error === 0 && this.unknown === 0;
	}

	set(which: number, val: Value): Value {
		if (val.width !== 1) throw new Error("Cannot set multiple values");
		if (which < 0 || which >= this.width) {
			throw new Error("Attempt to set outside value's width");
		}
		if (this.width === 1) return val;
		const mask = ~(1 << which);
		return Value.create(
			this.width,
			(this.error & mask) | (val.error << which),
			(this.unknown & mask) | (val.unknown << which),
			(this.value & mask) | (val.value << which),
		);
	}

	getAll(): Value[] {
		const ret: Value[] = new Array(this.width);
		for (let i = 0; i < this.width; i++) ret[i] = this.get(i);
		return ret;
	}

	get(which: number): Value {
		if (which < 0 || which >= this.width) return Value.ERROR;
		const mask = 1 << which;
		if ((this.error & mask) !== 0) return Value.ERROR;
		if ((this.unknown & mask) !== 0) return Value.UNKNOWN;
		if ((this.value & mask) !== 0) return Value.TRUE;
		return Value.FALSE;
	}

	equals(other: Value | null | undefined): boolean {
		if (other == null) return false;
		return (
			this.width === other.width &&
			this.error === other.error &&
			this.unknown === other.unknown &&
			this.value === other.value
		);
	}

	/** Signed 32-bit integer value, or -1 when not fully defined. */
	toIntValue(): number {
		if (this.error !== 0) return -1;
		if (this.unknown !== 0) return -1;
		return this.value;
	}

	toString(): string {
		switch (this.width) {
			case 0:
				return "-";
			case 1:
				if (this.error !== 0) return "E";
				if (this.unknown !== 0) return "x";
				if (this.value !== 0) return "1";
				return "0";
			default: {
				let ret = "";
				for (let i = this.width - 1; i >= 0; i--) {
					ret += this.get(i).toString();
					if (i % 4 === 0 && i !== 0) ret += " ";
				}
				return ret;
			}
		}
	}

	private toRadixString(bitsPerDigit: number, radix: number): string {
		if (this.width <= 1) return this.toString();
		const vals = this.getAll();
		const n = Math.floor((vals.length + bitsPerDigit - 1) / bitsPerDigit);
		let out = "";
		for (let i = 0; i < n; i++) {
			const k = n - 1 - i;
			const first = bitsPerDigit * k;
			const last = Math.min(vals.length, bitsPerDigit * (k + 1));
			let v = 0;
			let c: string | null = null;
			for (let j = last - 1; j >= first; j--) {
				if (vals[j] === Value.ERROR) {
					c = "E";
					break;
				}
				if (vals[j] === Value.UNKNOWN) {
					c = "x";
					break;
				}
				v = 2 * v;
				if (vals[j] === Value.TRUE) v++;
			}
			out += c ?? v.toString(radix);
		}
		return out;
	}

	toOctalString(): string {
		return this.toRadixString(3, 8);
	}

	toHexString(): string {
		return this.toRadixString(4, 16);
	}

	toDecimalString(signed: boolean): string {
		if (this.width === 0) return "-";
		if (this.isErrorValue()) return "E";
		if (!this.isFullyDefined()) return "x";
		let value = this.toIntValue();
		if (signed) {
			if (this.width < 32 && value >> (this.width - 1) !== 0) {
				value |= -1 << this.width;
			}
			return `${value}`;
		}
		return `${value >>> 0}`;
	}

	toDisplayString(radix?: number): string {
		switch (radix) {
			case undefined:
			case 2:
				return this.toString();
			case 8:
				return this.toOctalString();
			case 16:
				return this.toHexString();
			default:
				if (this.width === 0) return "-";
				if (this.isErrorValue()) return "E";
				if (!this.isFullyDefined()) return "x";
				return this.toIntValue().toString(radix);
		}
	}

	combine(other: Value | null | undefined): Value {
		if (other == null) return this;
		if (this === Value.NIL) return other;
		if (other === Value.NIL) return this;
		if (this.width === 1 && other.width === 1) {
			if (this === other) return this;
			if (this === Value.UNKNOWN) return other;
			if (other === Value.UNKNOWN) return this;
			return Value.ERROR;
		}
		const disagree = (this.value ^ other.value) & ~(this.unknown | other.unknown);
		return Value.create(
			Math.max(this.width, other.width),
			this.error | other.error | disagree,
			this.unknown & other.unknown,
			(this.value & ~this.unknown) | (other.value & ~other.unknown),
		);
	}

	and(other: Value | null | undefined): Value {
		if (other == null) return this;
		if (this.width === 1 && other.width === 1) {
			if (this === Value.FALSE || other === Value.FALSE) return Value.FALSE;
			if (this === Value.TRUE && other === Value.TRUE) return Value.TRUE;
			return Value.ERROR;
		}
		const false0 = ~this.value & ~this.error & ~this.unknown;
		const false1 = ~other.value & ~other.error & ~other.unknown;
		const falses = false0 | false1;
		return Value.create(
			Math.max(this.width, other.width),
			(this.error | other.error | this.unknown | other.unknown) & ~falses,
			0,
			this.value & other.value,
		);
	}

	or(other: Value | null | undefined): Value {
		if (other == null) return this;
		if (this.width === 1 && other.width === 1) {
			if (this === Value.TRUE || other === Value.TRUE) return Value.TRUE;
			if (this === Value.FALSE && other === Value.FALSE) return Value.FALSE;
			return Value.ERROR;
		}
		const true0 = this.value & ~this.error & ~this.unknown;
		const true1 = other.value & ~other.error & ~other.unknown;
		const trues = true0 | true1;
		return Value.create(
			Math.max(this.width, other.width),
			(this.error | other.error | this.unknown | other.unknown) & ~trues,
			0,
			this.value | other.value,
		);
	}

	xor(other: Value | null | undefined): Value {
		if (other == null) return this;
		if (this.width <= 1 && other.width <= 1) {
			if (this === Value.ERROR || other === Value.ERROR) return Value.ERROR;
			if (this === Value.UNKNOWN || other === Value.UNKNOWN) {
				return Value.ERROR;
			}
			if (this === Value.NIL || other === Value.NIL) return Value.ERROR;
			if ((this === Value.TRUE) === (other === Value.TRUE)) return Value.FALSE;
			return Value.TRUE;
		}
		return Value.create(
			Math.max(this.width, other.width),
			this.error | other.error | this.unknown | other.unknown,
			0,
			this.value ^ other.value,
		);
	}

	not(): Value {
		if (this.width <= 1) {
			if (this === Value.TRUE) return Value.FALSE;
			if (this === Value.FALSE) return Value.TRUE;
			return Value.ERROR;
		}
		return Value.create(this.width, this.error | this.unknown, 0, ~this.value);
	}

	getColor(): string {
		if (this.error !== 0) return Value.ERROR_COLOR;
		if (this.width === 0) return Value.NIL_COLOR;
		if (this.width === 1) {
			if (this === Value.UNKNOWN) return Value.UNKNOWN_COLOR;
			if (this === Value.TRUE) return Value.TRUE_COLOR;
			return Value.FALSE_COLOR;
		}
		return Value.MULTI_COLOR;
	}
}
