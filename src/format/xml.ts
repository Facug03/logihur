// A small, dependency-free XML DOM: enough for .circ files, and identical in
// the browser and in Node (tests, CLI).

export interface XmlElement {
	tag: string;
	attrs: Record<string, string>;
	/** Attribute names in document order. */
	attrOrder: string[];
	children: XmlNode[];
}

export type XmlNode = XmlElement | string;

export function isElement(n: XmlNode): n is XmlElement {
	return typeof n !== "string";
}

export function el(tag: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlElement {
	return { tag, attrs: { ...attrs }, attrOrder: Object.keys(attrs), children };
}

export function childElements(e: XmlElement, tag?: string): XmlElement[] {
	return e.children.filter((c): c is XmlElement => isElement(c) && (tag === undefined || c.tag === tag));
}

export function textContent(e: XmlElement): string {
	let out = "";
	for (const c of e.children) out += isElement(c) ? textContent(c) : c;
	return out;
}

export function getAttr(e: XmlElement, name: string): string {
	return e.attrs[name] ?? "";
}

export function hasAttr(e: XmlElement, name: string): boolean {
	return Object.hasOwn(e.attrs, name);
}

export function setAttr(e: XmlElement, name: string, value: string): void {
	if (!hasAttr(e, name)) e.attrOrder.push(name);
	e.attrs[name] = value;
}

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, code: string) => {
		if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
		if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
		return ENTITIES[code] ?? m;
	});
}

export class XmlParseError extends Error {}

export function parseXml(src: string): XmlElement {
	let pos = 0;
	const n = src.length;

	function fail(msg: string): never {
		const line = src.slice(0, pos).split("\n").length;
		throw new XmlParseError(`${msg} (line ${line})`);
	}

	function skipMisc(): void {
		for (;;) {
			while (pos < n && /\s/.test(src[pos])) pos++;
			if (src.startsWith("<?", pos)) {
				const end = src.indexOf("?>", pos);
				if (end < 0) fail("unterminated processing instruction");
				pos = end + 2;
			} else if (src.startsWith("<!--", pos)) {
				const end = src.indexOf("-->", pos);
				if (end < 0) fail("unterminated comment");
				pos = end + 3;
			} else if (src.startsWith("<!DOCTYPE", pos)) {
				const end = src.indexOf(">", pos);
				if (end < 0) fail("unterminated doctype");
				pos = end + 1;
			} else {
				return;
			}
		}
	}

	function parseName(): string {
		const start = pos;
		while (pos < n && /[^\s/>=]/.test(src[pos])) pos++;
		if (pos === start) fail("expected name");
		return src.slice(start, pos);
	}

	function parseElement(): XmlElement {
		if (src[pos] !== "<") fail("expected '<'");
		pos++;
		const tag = parseName();
		const node: XmlElement = { tag, attrs: {}, attrOrder: [], children: [] };
		for (;;) {
			while (pos < n && /\s/.test(src[pos])) pos++;
			if (src.startsWith("/>", pos)) {
				pos += 2;
				return node;
			}
			if (src[pos] === ">") {
				pos++;
				break;
			}
			const name = parseName();
			while (pos < n && /\s/.test(src[pos])) pos++;
			if (src[pos] !== "=") fail(`expected '=' after ${name}`);
			pos++;
			while (pos < n && /\s/.test(src[pos])) pos++;
			const quote = src[pos];
			if (quote !== '"' && quote !== "'") fail("expected quote");
			const end = src.indexOf(quote, pos + 1);
			if (end < 0) fail("unterminated attribute");
			if (!Object.hasOwn(node.attrs, name)) node.attrOrder.push(name);
			node.attrs[name] = decodeEntities(src.slice(pos + 1, end));
			pos = end + 1;
		}
		// children
		for (;;) {
			if (pos >= n) fail(`unterminated element <${tag}>`);
			if (src.startsWith("</", pos)) {
				pos += 2;
				const close = parseName();
				if (close !== tag) fail(`mismatched </${close}> for <${tag}>`);
				while (pos < n && /\s/.test(src[pos])) pos++;
				if (src[pos] !== ">") fail("expected '>'");
				pos++;
				return node;
			}
			if (src.startsWith("<!--", pos)) {
				const end = src.indexOf("-->", pos);
				if (end < 0) fail("unterminated comment");
				pos = end + 3;
			} else if (src.startsWith("<![CDATA[", pos)) {
				const end = src.indexOf("]]>", pos);
				if (end < 0) fail("unterminated CDATA");
				node.children.push(src.slice(pos + 9, end));
				pos = end + 3;
			} else if (src.startsWith("<?", pos)) {
				const end = src.indexOf("?>", pos);
				if (end < 0) fail("unterminated processing instruction");
				pos = end + 2;
			} else if (src[pos] === "<") {
				node.children.push(parseElement());
			} else {
				const end = src.indexOf("<", pos);
				const text = src.slice(pos, end < 0 ? n : end);
				node.children.push(decodeEntities(text));
				pos = end < 0 ? n : end;
			}
		}
	}

	skipMisc();
	const root = parseElement();
	stripIndentation(root);
	return root;
}

/** Drop whitespace-only text between elements (indentation). */
function stripIndentation(e: XmlElement): void {
	if (e.children.some(isElement)) {
		e.children = e.children.filter((c) => isElement(c) || c.trim() !== "");
		for (const c of e.children) if (isElement(c)) stripIndentation(c);
	}
}

function escapeAttr(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/\n/g, "&#10;")
		.replace(/\r/g, "&#13;")
		.replace(/\t/g, "&#9;");
}

function escapeText(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Serialize the way Java's Transformer does with indent=yes/indent-amount=2,
 * which is what Logisim 2.7.1 produces: attributes sorted by name, elements
 * with only element children indented, text-bearing elements kept inline.
 */
export function serializeXml(root: XmlElement): string {
	let out = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
	const write = (e: XmlElement, depth: number, indentSelf: boolean) => {
		const pad = "  ".repeat(depth);
		if (indentSelf) out += pad;
		out += `<${e.tag}`;
		for (const name of Object.keys(e.attrs).sort()) {
			out += ` ${name}="${escapeAttr(e.attrs[name])}"`;
		}
		if (e.children.length === 0) {
			out += "/>\n";
			return;
		}
		out += ">";
		const hasText = e.children.some((c) => !isElement(c));
		if (hasText && e.children.every((c) => !isElement(c))) {
			out += `${escapeText(e.children.join(""))}</${e.tag}>\n`;
			return;
		}
		// Mixed or element-only content. Java's indenter emits text nodes as-is
		// and indents elements that follow a newline.
		let atLineStart = false;
		for (const c of e.children) {
			if (isElement(c)) {
				if (!atLineStart) out += "\n";
				write(c, depth + 1, true);
				atLineStart = true;
			} else {
				out += escapeText(c);
				atLineStart = c.endsWith("\n");
			}
		}
		if (!atLineStart) out += "\n";
		out += `${pad}</${e.tag}>\n`;
	};
	write(root, 0, false);
	return out;
}
