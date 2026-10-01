// Port of com.cburch.logisim.analyze.model.Parser: accepts ~ ! ' for NOT,
// juxtaposition & && AND for AND, + | || OR for OR, ^ XOR for XOR, 0 and 1.

import { TranslatedError, t } from "@/i18n/i18n";
import { isIdentPart, isIdentStart } from "@/sim/pin-labels";
import {
	AND_LEVEL,
	and,
	constant,
	type Expression,
	NOT_LEVEL,
	not,
	OR_LEVEL,
	or,
	variable,
	XOR_LEVEL,
	xor,
} from "./expression";

export class ParserError extends TranslatedError {
	constructor(
		message: () => string,
		readonly offset: number,
		readonly length: number,
	) {
		super(message);
	}

	get endOffset(): number {
		return this.offset + this.length;
	}
}

type TokenType =
	| "and"
	| "or"
	| "xor"
	| "not"
	| "notPostfix"
	| "lparen"
	| "rparen"
	| "ident"
	| "const"
	| "white"
	| "error";

interface Token {
	type: TokenType;
	offset: number;
	length: number;
	text: string;
}

function token(type: TokenType, offset: number, text: string, length = text.length): Token {
	return { type, offset, length, text };
}

function tokenError(tok: Token, key: string, arg?: string): ParserError {
	return new ParserError(() => t(key, arg === undefined ? undefined : [arg]), tok.offset, tok.length);
}

/** Character.isWhitespace: Unicode spaces except the non-breaking ones. */
export function isJavaWhitespace(c: string): boolean {
	const code = c.charCodeAt(0);
	if ((code >= 9 && code <= 13) || (code >= 0x1c && code <= 0x1f)) return true;
	if (code === 0xa0 || code === 0x2007 || code === 0x202f) return false;
	return /[\p{Zs}\p{Zl}\p{Zp}]/u.test(c);
}

function okCharacter(c: string): boolean {
	return isJavaWhitespace(c) || isIdentStart(c) || "()01~^+!&|".includes(c);
}

function toTokens(source: string, includeWhite: boolean): Token[] {
	const tokens: Token[] = [];
	// guarantee that we stop just after reading whitespace, not inside a token
	const s = `${source} `;
	let pos = 0;
	for (;;) {
		const whiteStart = pos;
		while (pos < s.length && isJavaWhitespace(s[pos])) pos++;
		if (includeWhite && pos !== whiteStart)
			tokens.push(token("white", whiteStart, s.substring(whiteStart, pos)));
		if (pos === s.length) return tokens;

		const start = pos;
		const c = s[pos];
		pos++;
		if (isIdentStart(c)) {
			while (isIdentPart(s[pos])) pos++;
			tokens.push(token("ident", start, s.substring(start, pos)));
			continue;
		}
		switch (c) {
			case "(":
				tokens.push(token("lparen", start, c));
				break;
			case ")":
				tokens.push(token("rparen", start, c));
				break;
			case "0":
			case "1":
				tokens.push(token("const", start, c));
				break;
			case "~":
			case "!":
				tokens.push(token("not", start, c));
				break;
			case "'":
				tokens.push(token("notPostfix", start, c));
				break;
			case "^":
				tokens.push(token("xor", start, c));
				break;
			case "+":
				tokens.push(token("or", start, c));
				break;
			case "&":
			case "|":
				if (s[pos] === c) pos++;
				tokens.push(token(c === "&" ? "and" : "or", start, s.substring(start, pos)));
				break;
			default:
				while (!okCharacter(s[pos])) pos++;
				tokens.push(token("error", start, s.substring(start, pos)));
		}
	}
}

/** Parser.replaceVariable: rename a variable keeping the user's formatting. */
export function replaceVariableInText(text: string, oldName: string, newName: string): string {
	return toTokens(text, true)
		.map((tok) => (tok.type === "ident" && tok.text === oldName ? newName : tok.text))
		.join("");
}

interface Context {
	level: number;
	current: Expression | null;
	cause: Token;
}

const OPERATORS: Record<string, TokenType> = { NOT: "not", AND: "and", XOR: "xor", OR: "or" };

/** Parser.parse: null for an empty expression; throws ParserError. */
export function parseExpression(text: string, inputs: readonly string[]): Expression | null {
	const tokens = toTokens(text, false);
	if (tokens.length === 0) return null;
	for (const tok of tokens) {
		if (tok.type === "error") throw tokenError(tok, "analyze.invalidCharacterError", tok.text);
		if (tok.type === "ident" && !inputs.includes(tok.text)) {
			// not an input; but maybe it's an operator
			const op = OPERATORS[tok.text.toUpperCase()];
			if (!op) throw tokenError(tok, "analyze.badVariableName", tok.text);
			tok.type = op;
		}
	}
	return parse(tokens);
}

function parse(tokens: Token[]): Expression | null {
	const stack: Context[] = [];
	const peekLevel = () => stack.at(-1)?.level ?? -3;
	const push = (current: Expression | null, level: number, cause: Token) =>
		stack.push({ current, level, cause });
	const popTo = (level: number, current: Expression | null): Expression | null => {
		while (stack.length > 0 && peekLevel() >= level) {
			const top = stack.pop() as Context;
			if (current === null) throw tokenError(top.cause, "analyze.missingRightOperandError", top.cause.text);
			switch (top.level) {
				case AND_LEVEL:
					current = and(top.current, current);
					break;
				case OR_LEVEL:
					current = or(top.current, current);
					break;
				case XOR_LEVEL:
					current = xor(top.current, current);
					break;
				case NOT_LEVEL:
					current = not(current);
					break;
			}
		}
		return current;
	};

	let current: Expression | null = null;
	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		if (tok.type === "ident" || tok.type === "const") {
			let here: Expression | null =
				tok.type === "ident" ? variable(tok.text) : constant(Number.parseInt(tok.text, 16));
			while (i + 1 < tokens.length && tokens[i + 1].type === "notPostfix") {
				here = not(here);
				i++;
			}
			while (peekLevel() === NOT_LEVEL) {
				here = not(here);
				stack.pop();
			}
			current = and(current, here);
			if (peekLevel() === AND_LEVEL) {
				const top = stack.pop() as Context;
				current = and(top.current, current);
			}
		} else if (tok.type === "not") {
			if (current !== null)
				push(current, AND_LEVEL, token("and", tok.offset, t("analyze.implicitAndOperator")));
			push(null, NOT_LEVEL, tok);
			current = null;
		} else if (tok.type === "notPostfix") {
			throw tokenError(tok, "analyze.unexpectedApostrophe");
		} else if (tok.type === "lparen") {
			if (current !== null)
				push(current, AND_LEVEL, token("and", tok.offset, t("analyze.implicitAndOperator"), 0));
			push(null, -2, tok);
			current = null;
		} else if (tok.type === "rparen") {
			current = popTo(-1, current);
			// there had better be a left parenthesis atop the stack now
			if (stack.length === 0) throw tokenError(tok, "analyze.lparenMissingError");
			stack.pop();
			while (i + 1 < tokens.length && tokens[i + 1].type === "notPostfix") {
				current = not(current);
				i++;
			}
			current = popTo(AND_LEVEL, current);
		} else {
			if (current === null) throw tokenError(tok, "analyze.missingLeftOperandError", tok.text);
			const level = tok.type === "and" ? AND_LEVEL : tok.type === "or" ? OR_LEVEL : XOR_LEVEL;
			push(popTo(level, current), level, tok);
			current = null;
		}
	}
	current = popTo(-1, current);
	if (stack.length > 0) throw tokenError(stack.pop()?.cause as Token, "analyze.rparenMissingError");
	return current;
}
