// Port of com.cburch.logisim.std.memory.MemContents (paged, sparse memory)
// and com.cburch.logisim.gui.hex.HexFile (the "v2.0 raw" image format, also
// used for ROM contents inside .circ files).

import type { CloneableValue } from "@/engine/attributes";

const PAGE_SIZE_BITS = 12;
const PAGE_SIZE = 1 << PAGE_SIZE_BITS;
const PAGE_MASK = PAGE_SIZE - 1;

type Page = Int8Array | Int16Array | Int32Array;

/** MemContentsSub.createContents: storage type depends on the data width. */
function createPage(size: number, bits: number): Page {
	if (bits <= 8) return new Int8Array(size);
	if (bits <= 16) return new Int16Array(size);
	return new Int32Array(size);
}

function isClearPage(p: Page): boolean {
	for (let i = 0; i < p.length; i++) if (p[i] !== 0) return false;
	return true;
}

export class MemContents implements CloneableValue {
	private addrBits = -1;
	private width = -1;
	private mask = 0;
	private pages: (Page | null)[] = [];
	/** Incremented on every change, so views can tell when to repaint. */
	version = 0;

	private constructor() {}

	static create(addrBits: number, width: number): MemContents {
		const ret = new MemContents();
		ret.setDimensions(addrBits, width);
		return ret;
	}

	clone(): MemContents {
		const ret = new MemContents();
		ret.addrBits = this.addrBits;
		ret.width = this.width;
		ret.mask = this.mask;
		ret.pages = this.pages.map((p) => (p ? p.slice() : null));
		return ret;
	}

	get logLength(): number {
		return this.addrBits;
	}

	get dataWidth(): number {
		return this.width;
	}

	get lastOffset(): number {
		return 2 ** this.addrBits - 1;
	}

	get(addr: number): number {
		const page = Math.floor(addr / PAGE_SIZE);
		const offs = addr & PAGE_MASK;
		const p = this.pages[page];
		if (page < 0 || page >= this.pages.length || !p) return 0;
		return (offs < p.length ? p[offs] : 0) & this.mask;
	}

	isClear(): boolean {
		return this.pages.every((p) => !p || isClearPage(p));
	}

	set(addr: number, value: number): void {
		const page = Math.floor(addr / PAGE_SIZE);
		const offs = addr & PAGE_MASK;
		if (page < 0 || page >= this.pages.length) return;
		const p = this.pages[page];
		const old = p ? p[offs] & this.mask : 0;
		const val = value & this.mask;
		if (old !== val) {
			const target = p ?? createPage(PAGE_SIZE, this.width);
			this.pages[page] = target;
			target[offs] = val;
			this.version++;
		}
	}

	/** Store consecutive values starting at an address. */
	setValues(start: number, values: readonly number[]): void {
		for (let i = 0; i < values.length; i++) this.set(start + i, values[i]);
		for (let i = 0; i < this.pages.length; i++) {
			const p = this.pages[i];
			if (p && isClearPage(p)) this.pages[i] = null;
		}
	}

	fill(start: number, len: number, value: number): void {
		const val = value & this.mask;
		for (let a = start; a < start + len; a++) {
			if (val === 0 && !this.pages[Math.floor(a / PAGE_SIZE)]) {
				a = (Math.floor(a / PAGE_SIZE) + 1) * PAGE_SIZE - 1;
				continue;
			}
			this.set(a, val);
		}
	}

	clear(): void {
		for (let i = 0; i < this.pages.length; i++) {
			const p = this.pages[i];
			if (p && !isClearPage(p)) {
				this.pages[i] = null;
				this.version++;
			}
		}
	}

	setDimensions(addrBits: number, width: number): void {
		if (addrBits === this.addrBits && width === this.width) return;
		this.addrBits = addrBits;
		this.width = width;
		this.mask = width === 32 ? -1 : (1 << width) - 1;
		const oldPages = this.pages;
		let pageCount: number;
		let pageLength: number;
		if (addrBits < PAGE_SIZE_BITS) {
			pageCount = 1;
			pageLength = 1 << addrBits;
		} else {
			pageCount = 1 << (addrBits - PAGE_SIZE_BITS);
			pageLength = PAGE_SIZE;
		}
		this.pages = new Array(pageCount).fill(null);
		const n = Math.min(oldPages.length, pageCount);
		for (let i = 0; i < n; i++) {
			const old = oldPages[i];
			if (old) {
				// Values keep their stored (sign-extended) form, as in Java.
				const p = createPage(pageLength, width);
				const m = Math.min(old.length, pageLength);
				for (let j = 0; j < m; j++) p[j] = old[j];
				this.pages[i] = p;
			}
		}
		this.version++;
	}
}

/** HexFile.save: run-length encoded hex values, 8 tokens per line. */
export function saveHex(src: MemContents): string {
	let last = src.lastOffset;
	while (last > 0 && src.get(last) === 0) last--;
	let out = "";
	let tokens = 0;
	let cur = 0;
	while (cur <= last) {
		const val = src.get(cur);
		const start = cur;
		cur++;
		while (cur <= last && src.get(cur) === val) cur++;
		if (cur - start < 4) cur = start + 1;
		if (tokens > 0) out += tokens % 8 === 0 ? "\n" : " ";
		if (cur !== start + 1) out += `${cur - start}*`;
		out += (val >>> 0).toString(16);
		tokens++;
	}
	if (tokens > 0) out += "\n";
	return out;
}

export class HexFormatError extends Error {}

/** HexFile.parse: values from a hex image body (without header). */
export function parseHex(text: string): number[] {
	const values: number[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const hash = rawLine.indexOf("#");
		const line = hash >= 0 ? rawLine.slice(0, hash) : rawLine;
		for (const tok of line.split(/\s+/)) {
			if (tok === "") continue;
			const star = tok.indexOf("*");
			const countStr = star < 0 ? "1" : tok.slice(0, star);
			const valStr = star < 0 ? tok : tok.slice(star + 1);
			if (!/^\d+$/.test(countStr) || !/^[0-9a-fA-F]+$/.test(valStr)) {
				throw new HexFormatError("hex.numberFormat");
			}
			const count = Number.parseInt(countStr, 10);
			const value = Number(BigInt.asIntN(32, BigInt(`0x${valStr}`)));
			for (let i = 0; i < count; i++) values.push(value);
		}
	}
	return values;
}

/** HexFile.open(HexModel, Reader): load values, zero the rest. */
export function loadHex(dst: MemContents, text: string): void {
	const values = parseHex(text);
	if (values.length - 1 > dst.lastOffset) throw new HexFormatError("hex.sizeError");
	dst.setValues(0, values);
	dst.fill(values.length, dst.lastOffset - values.length + 1, 0);
}

export const RAW_IMAGE_HEADER = "v2.0 raw";

/** Contents of a "Save Image" file. */
export function saveImage(src: MemContents): string {
	return `${RAW_IMAGE_HEADER}\n${saveHex(src)}`;
}

/** Load a "v2.0 raw" image file. */
export function loadImage(dst: MemContents, text: string): void {
	const nl = text.indexOf("\n");
	const header = (nl < 0 ? text : text.slice(0, nl)).replace(/\r$/, "");
	if (header !== RAW_IMAGE_HEADER) throw new HexFormatError("hex.headerError");
	loadHex(dst, nl < 0 ? "" : text.slice(nl + 1));
}
