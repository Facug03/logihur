// Port of com.cburch.logisim.analyze.model.{Expression, Expressions}.
// Expressions are immutable trees; `equals` is structural, as in Java.

export const OR_LEVEL = 0;
export const XOR_LEVEL = 1;
export const AND_LEVEL = 2;
export const NOT_LEVEL = 3;
const ATOM_LEVEL = Number.MAX_SAFE_INTEGER;

export type Expression =
	| {
			readonly kind: "and" | "or" | "xor";
			readonly a: Expression;
			readonly b: Expression;
			readonly size: number;
	  }
	| { readonly kind: "not"; readonly a: Expression; readonly size: number }
	| { readonly kind: "var"; readonly name: string; readonly size: 1 }
	| { readonly kind: "const"; readonly value: number; readonly size: 1 };

function binary(kind: "and" | "or" | "xor", a: Expression | null, b: Expression | null): Expression | null {
	if (a === null) return b;
	if (b === null) return a;
	return { kind, a, b, size: a.size + b.size + 1 };
}

export function and(a: Expression | null, b: Expression | null): Expression | null {
	return binary("and", a, b);
}

export function or(a: Expression | null, b: Expression | null): Expression | null {
	return binary("or", a, b);
}

export function xor(a: Expression | null, b: Expression | null): Expression | null {
	return binary("xor", a, b);
}

export function not(a: Expression | null): Expression | null {
	return a === null ? null : { kind: "not", a, size: a.size + 1 };
}

export function variable(name: string): Expression {
	return { kind: "var", name, size: 1 };
}

export function constant(value: number): Expression {
	return { kind: "const", value, size: 1 };
}

/** Non-null variants for callers that know both operands exist. */
export const Expr = {
	and: (a: Expression, b: Expression) => and(a, b) as Expression,
	or: (a: Expression, b: Expression) => or(a, b) as Expression,
	xor: (a: Expression, b: Expression) => xor(a, b) as Expression,
	not: (a: Expression) => not(a) as Expression,
};

export function precedence(e: Expression): number {
	switch (e.kind) {
		case "or":
			return OR_LEVEL;
		case "xor":
			return XOR_LEVEL;
		case "and":
			return AND_LEVEL;
		case "not":
			return NOT_LEVEL;
		default:
			return ATOM_LEVEL;
	}
}

export function equals(x: Expression | null, y: Expression | null): boolean {
	if (x === y) return true;
	if (x === null || y === null || x.kind !== y.kind || x.size !== y.size) return false;
	switch (x.kind) {
		case "var":
			return x.name === (y as typeof x).name;
		case "const":
			return x.value === (y as typeof x).value;
		case "not":
			return equals(x.a, (y as typeof x).a);
		default: {
			const o = y as typeof x;
			return equals(x.a, o.a) && equals(x.b, o.b);
		}
	}
}

export const BINARY_OPS = { and: " ", or: " + ", xor: " ^ " } as const;

/** Expression.toString: the text form accepted back by the parser. */
export function toText(e: Expression): string {
	switch (e.kind) {
		case "var":
			return e.name;
		case "const":
			return e.value.toString(16);
		case "not":
			return precedence(e.a) < NOT_LEVEL ? `~(${toText(e.a)})` : `~${toText(e.a)}`;
		default: {
			const level = precedence(e);
			const side = (s: Expression) => (precedence(s) < level ? `(${toText(s)})` : toText(s));
			return side(e.a) + BINARY_OPS[e.kind] + side(e.b);
		}
	}
}

function evalBits(e: Expression, values: ReadonlyMap<string, boolean>): number {
	switch (e.kind) {
		case "and":
			return evalBits(e.a, values) & evalBits(e.b, values);
		case "or":
			return evalBits(e.a, values) | evalBits(e.b, values);
		case "xor":
			return evalBits(e.a, values) ^ evalBits(e.b, values);
		case "not":
			return ~evalBits(e.a, values);
		case "var":
			return values.get(e.name) ? 1 : 0;
		case "const":
			return e.value;
	}
}

export function evaluate(e: Expression, values: ReadonlyMap<string, boolean>): boolean {
	return (evalBits(e, values) & 1) !== 0;
}

export function containsXor(e: Expression): boolean {
	switch (e.kind) {
		case "xor":
			return true;
		case "and":
		case "or":
			return containsXor(e.a) || containsXor(e.b);
		case "not":
			return containsXor(e.a);
		default:
			return false;
	}
}

export function removeVariable(e: Expression, input: string): Expression | null {
	switch (e.kind) {
		case "and":
		case "or":
		case "xor":
			return binary(e.kind, removeVariable(e.a, input), removeVariable(e.b, input));
		case "not":
			return not(removeVariable(e.a, input));
		case "var":
			return e.name === input ? null : variable(e.name);
		case "const":
			return constant(e.value);
	}
}

export function replaceVariable(e: Expression, oldName: string, newName: string): Expression {
	switch (e.kind) {
		case "and":
		case "or":
		case "xor":
			return binary(
				e.kind,
				replaceVariable(e.a, oldName, newName),
				replaceVariable(e.b, oldName, newName),
			) as Expression;
		case "not":
			return Expr.not(replaceVariable(e.a, oldName, newName));
		case "var":
			return variable(e.name === oldName ? newName : e.name);
		case "const":
			return constant(e.value);
	}
}
