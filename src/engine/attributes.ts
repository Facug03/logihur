// Port of com.cburch.logisim.data.{Attribute, Attributes, AttributeSet}.
// Attribute values are plain JS values; `parse`/`format` convert to and from
// the exact strings stored in .circ files.

import { type Direction, parseDirection } from "./geom";

export type FontStyle = "plain" | "bold" | "italic" | "bolditalic";

export interface Font {
	readonly family: string;
	readonly style: FontStyle;
	readonly size: number;
}

export const DEFAULT_LABEL_FONT: Font = {
	family: "SansSerif",
	style: "plain",
	size: 12,
};

const FONT_STYLES: readonly FontStyle[] = ["plain", "bold", "italic", "bolditalic"];

/** java.awt.Font.decode for the forms Logisim writes ("SansSerif plain 12"). */
export function parseFont(value: string): Font {
	const tokens = value.trim().split(/[\s-]+/);
	let size = 12;
	let style: FontStyle = "plain";
	if (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1])) {
		size = Number.parseInt(tokens.pop() as string, 10);
	}
	if (tokens.length > 1) {
		const s = tokens[tokens.length - 1].toLowerCase();
		if ((FONT_STYLES as readonly string[]).includes(s)) {
			style = s as FontStyle;
			tokens.pop();
		}
	}
	const family = tokens.join(" ") || "Dialog";
	return { family, style, size };
}

export function formatFont(f: Font): string {
	return `${f.family} ${f.style} ${f.size}`;
}

export type AttrKind =
	| "direction"
	| "bitwidth"
	| "int"
	| "hex"
	| "bool"
	| "string"
	| "option"
	| "font"
	| "color"
	| "double"
	| "memory";

export interface AttrOption<T> {
	readonly value: T;
	/** i18n key (or literal text) shown in the attribute editor. */
	readonly label: string;
}

export interface Attribute<T = unknown> {
	readonly name: string;
	/** i18n key for the attribute's display name. */
	readonly label: string;
	/** Arguments substituted into the label ("Negate Input {0}"). */
	readonly labelArgs?: readonly (string | number)[];
	readonly kind: AttrKind;
	readonly options?: readonly AttrOption<T>[];
	readonly min?: number;
	readonly max?: number;
	parse(s: string): T;
	format(v: T): string;
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous attribute lists
export type AnyAttribute = Attribute<any>;

export function directionAttr(
	name: string,
	label: string,
	options: readonly Direction[] = ["north", "south", "east", "west"],
): Attribute<Direction> {
	return {
		name,
		label,
		kind: "direction",
		options: options.map((d) => ({ value: d, label: `direction.${d}` })),
		parse: parseDirection,
		format: (v) => v,
	};
}

export function bitWidthAttr(name: string, label: string, min = 1, max = 32): Attribute<number> {
	return {
		name,
		label,
		kind: "bitwidth",
		min,
		max,
		parse: (s) => {
			const str = s.startsWith("/") ? s.slice(1) : s;
			const n = Number.parseInt(str, 10);
			if (Number.isNaN(n) || n < 0) throw new Error(`bad width '${s}'`);
			return n;
		},
		format: (v) => `${v}`,
	};
}

export function intAttr(name: string, label: string): Attribute<number> {
	return {
		name,
		label,
		kind: "int",
		parse: (s) => {
			const n = Number.parseInt(s, 10);
			if (Number.isNaN(n)) throw new Error(`bad integer '${s}'`);
			return n;
		},
		format: (v) => `${v}`,
	};
}

export function intRangeAttr(name: string, label: string, min: number, max: number): Attribute<number> {
	return {
		name,
		label,
		kind: "int",
		min,
		max,
		parse: (s) => {
			const n = Number.parseInt(s, 10);
			if (Number.isNaN(n)) throw new Error(`bad integer '${s}'`);
			if (n < min) throw new Error("integer too small");
			if (n > max) throw new Error("integer too large");
			return n;
		},
		format: (v) => `${v}`,
	};
}

/** Attributes.forHexInteger: stored as "0x..", parsed in hex/bin/oct/dec. */
export function hexAttr(name: string, label: string): Attribute<number> {
	return {
		name,
		label,
		kind: "hex",
		parse: (raw) => {
			const s = raw.toLowerCase();
			let n: number;
			if (s.startsWith("0x")) n = Number.parseInt(s.slice(2), 16);
			else if (s.startsWith("0b")) n = Number.parseInt(s.slice(2), 2);
			else if (s.startsWith("0") && s.length > 1) {
				n = Number.parseInt(s.slice(1), 8);
			} else n = Number.parseInt(s, 10);
			if (Number.isNaN(n)) throw new Error(`bad integer '${raw}'`);
			return n | 0;
		},
		format: (v) => `0x${(v >>> 0).toString(16)}`,
	};
}

export function boolAttr(name: string, label: string): Attribute<boolean> {
	return {
		name,
		label,
		kind: "bool",
		options: [
			{ value: true, label: "bool.true" },
			{ value: false, label: "bool.false" },
		],
		parse: (s) => s.toLowerCase() === "true",
		format: (v) => (v ? "true" : "false"),
	};
}

export function stringAttr(name: string, label: string): Attribute<string> {
	return {
		name,
		label,
		kind: "string",
		parse: (s) => s,
		format: (v) => v,
	};
}

/** An option attribute whose values are the strings saved in the file. */
export function optionAttr(
	name: string,
	label: string,
	options: readonly AttrOption<string>[],
): Attribute<string> {
	return {
		name,
		label,
		kind: "option",
		options,
		parse: (s) => {
			const opt = options.find((o) => o.value === s);
			if (!opt) throw new Error(`value '${s}' not among choices`);
			return opt.value;
		},
		format: (v) => v,
	};
}

export function fontAttr(name: string, label: string): Attribute<Font> {
	return {
		name,
		label,
		kind: "font",
		parse: parseFont,
		format: formatFont,
	};
}

export function colorAttr(name: string, label: string): Attribute<string> {
	return {
		name,
		label,
		kind: "color",
		parse: (s) => {
			if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) return s.toLowerCase();
			const n = Number.parseInt(s, s.startsWith("#") ? undefined : 10);
			if (Number.isNaN(n)) throw new Error(`bad color '${s}'`);
			return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
		},
		format: (v) => v,
	};
}

export function attrEquals<T>(attr: Attribute<T>, a: T, b: T): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	return attr.format(a) === attr.format(b);
}

/** Attribute values that are mutable objects implement this. */
export interface CloneableValue {
	clone(): CloneableValue;
}

function isCloneable(v: unknown): v is CloneableValue {
	return typeof v === "object" && v !== null && typeof (v as CloneableValue).clone === "function";
}

/**
 * A mutable bag of attribute values keyed by attribute name. The ordered list
 * of attributes an instance exposes is decided by its factory.
 */
export class AttributeSet {
	private readonly values = new Map<string, unknown>();
	/** Incremented on every change so derived data can be cached. */
	version = 0;

	get<T>(attr: Attribute<T>): T {
		return this.values.get(attr.name) as T;
	}

	getByName(name: string): unknown {
		return this.values.get(name);
	}

	has(name: string): boolean {
		return this.values.has(name);
	}

	set<T>(attr: Attribute<T>, value: T): void {
		this.values.set(attr.name, value);
		this.version++;
	}

	setByName(name: string, value: unknown): void {
		this.values.set(name, value);
		this.version++;
	}

	delete(name: string): void {
		if (this.values.delete(name)) this.version++;
	}

	/** Replace all values with those of another set. */
	assign(other: AttributeSet): void {
		this.values.clear();
		for (const [k, v] of other.values) this.values.set(k, v);
		this.version++;
	}

	/** Mutable values (ROM contents) are deep-copied, like Java's copyInto. */
	clone(): AttributeSet {
		const ret = new AttributeSet();
		for (const [k, v] of this.values) ret.values.set(k, isCloneable(v) ? v.clone() : v);
		return ret;
	}

	entries(): IterableIterator<[string, unknown]> {
		return this.values.entries();
	}
}
