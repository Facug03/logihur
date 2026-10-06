// Port of com.cburch.logisim.std.memory.{Mem, MemState, MemPoker, Ram, Rom,
// RomAttributes}.

import {
	type AnyAttribute,
	type Attribute,
	AttributeSet,
	bitWidthAttr,
	optionAttr,
} from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type Poker,
	type PortDef,
	port,
} from "@/engine/component";
import { Bounds } from "@/engine/geom";
import { drawCenteredText, drawText, type Graphics, H_CENTER, H_RIGHT, V_BASELINE } from "@/engine/graphics";
import { bitWidthConfigurator, JoinedConfigurator, type KeyConfigurator } from "@/engine/key-config";
import { Value } from "@/engine/value";
import { ClockState } from "./flipflops";
import { loadHex, MemContents, saveHex } from "./mem-contents";
import { toHexString } from "./registers";

export const MEM_ADDR = bitWidthAttr("addrWidth", "memory.addrWidth", 2, 24);
export const MEM_DATA = bitWidthAttr("dataWidth", "memory.dataWidth");

/** Rom.CONTENTS_ATTR: "addr/data: A D\n" followed by a hex image. */
export const ROM_CONTENTS: Attribute<MemContents> = {
	name: "contents",
	label: "memory.romContents",
	kind: "memory",
	parse: (value) => {
		const lineBreak = value.indexOf("\n");
		const first = lineBreak < 0 ? value : value.slice(0, lineBreak);
		const rest = lineBreak < 0 ? "" : value.slice(lineBreak + 1);
		const toks = first.trim().split(/\s+/);
		if (toks[0] !== "addr/data:" || toks.length < 3) throw new Error("bad ROM contents header");
		const addr = Number.parseInt(toks[1], 10);
		const data = Number.parseInt(toks[2], 10);
		if (Number.isNaN(addr) || Number.isNaN(data)) throw new Error("bad ROM contents header");
		const ret = MemContents.create(addr, data);
		loadHex(ret, rest);
		return ret;
	},
	format: (v) => `addr/data: ${v.logLength} ${v.dataWidth}\n${saveHex(v)}`,
};

export const RAM_BUS = optionAttr("bus", "memory.ramBus", [
	{ value: "combined", label: "memory.ramBusSynchCombined" },
	{ value: "asynch", label: "memory.ramBusAsynchCombined" },
	{ value: "separate", label: "memory.ramBusSeparate" },
]);

const DATA = 0;
const ADDR = 1;
const CS = 2;
const MEM_INPUTS = 3;
const DELAY = 10;

// --- MemState: the scrolling table shown inside the component -------------

const ROWS = 4;
const TABLE_WIDTH12 = 80;
const TABLE_WIDTH32 = 65;
const ENTRY_HEIGHT = 15;
const ENTRY_XOFFS12 = 40;
const ENTRY_XOFFS32 = 60;
const ENTRY_YOFFS = 5;
const ADDR_WIDTH_PER_CHAR = 10;

export class MemState {
	columns = 1;
	curScroll = 0;
	cursorLoc = -1;
	curAddr = -1;
	private dims = "";

	constructor(public contents: MemContents) {
		this.updateBits();
	}

	/** MemState.setBits, run whenever the contents' dimensions change. */
	updateBits(): void {
		const addrBits = this.contents.logLength;
		const dataBits = this.contents.dataWidth;
		const dims = `${addrBits}/${dataBits}`;
		if (dims === this.dims) return;
		this.dims = dims;
		if (addrBits <= 12) {
			if (dataBits <= 8) this.columns = dataBits <= 4 ? 8 : 4;
			else this.columns = dataBits <= 16 ? 2 : 1;
		} else {
			this.columns = dataBits <= 8 ? 2 : 1;
		}
		const newLast = this.contents.lastOffset;
		if (this.cursorLoc > newLast) this.cursorLoc = newLast;
		if (this.curAddr - newLast > 0) this.curAddr = -1;
		const maxScroll = Math.max(0, newLast + 1 - (ROWS - 1) * this.columns);
		if (this.curScroll > maxScroll) this.curScroll = maxScroll;
	}

	get addrBits(): number {
		return this.contents.logLength;
	}

	get lastAddress(): number {
		return 2 ** this.contents.logLength - 1;
	}

	isValidAddr(addr: number): boolean {
		return addr >= 0 && addr <= this.lastAddress;
	}

	setCursor(value: number): void {
		this.cursorLoc = this.isValidAddr(value) ? value : -1;
	}

	setCurrent(value: number): void {
		this.curAddr = this.isValidAddr(value) ? value : -1;
	}

	scrollToShow(address: number): void {
		if (!this.isValidAddr(address)) return;
		const cols = this.columns;
		const addr = Math.floor(address / cols) * cols;
		const curTop = Math.floor(this.curScroll / cols) * cols;
		if (addr < curTop) {
			this.curScroll = addr;
		} else if (addr >= curTop + ROWS * cols) {
			this.curScroll = Math.max(0, addr - (ROWS - 1) * cols);
		}
	}

	setScroll(address: number): void {
		const maxAddr = this.lastAddress - ROWS * this.columns;
		let addr = address;
		if (addr > maxAddr) addr = maxAddr;
		if (addr < 0) addr = 0;
		this.curScroll = addr;
	}

	private boxX(): number {
		return this.addrBits <= 12 ? ENTRY_XOFFS12 : ENTRY_XOFFS32;
	}

	private boxW(): number {
		return this.addrBits <= 12 ? TABLE_WIDTH12 : TABLE_WIDTH32;
	}

	/** Address at a point relative to the component's top-left corner. */
	getAddressAt(x: number, y: number): number {
		const boxX = this.boxX();
		const boxW = this.boxW();
		if (x < boxX || x >= boxX + boxW || y <= ENTRY_YOFFS || y >= ENTRY_YOFFS + ROWS * ENTRY_HEIGHT) {
			return -1;
		}
		const col = Math.trunc((x - boxX) / Math.trunc(boxW / this.columns));
		const row = Math.trunc((y - ENTRY_YOFFS) / ENTRY_HEIGHT);
		const ret = Math.floor(this.curScroll / this.columns) * this.columns + this.columns * row + col;
		return this.isValidAddr(ret) ? ret : this.lastAddress;
	}

	getBounds(addr: number, bds: Bounds): Bounds {
		const boxX = bds.x + this.boxX();
		const boxW = this.boxW();
		if (addr < 0) {
			const addrLen = Math.trunc((this.contents.dataWidth + 3) / 4);
			const width = ADDR_WIDTH_PER_CHAR * addrLen;
			return Bounds.create(boxX - width, bds.y + ENTRY_YOFFS, width, ENTRY_HEIGHT);
		}
		const topRow = Math.floor(this.curScroll / this.columns);
		const row = Math.floor(addr / this.columns);
		if (row < topRow || row >= topRow + ROWS) return Bounds.create(-1, -1, 0, 0);
		const col = addr - row * this.columns;
		return Bounds.create(
			boxX + Math.trunc((boxW * col) / this.columns),
			bds.y + ENTRY_YOFFS + ENTRY_HEIGHT * (row - topRow),
			Math.trunc(boxW / this.columns),
			ENTRY_HEIGHT,
		);
	}

	paint(g: Graphics, leftX: number, topY: number): void {
		const dataBits = this.contents.dataWidth;
		const boxX = leftX + this.boxX();
		const boxY = topY + ENTRY_YOFFS;
		const boxW = this.boxW();
		g.setLineWidth(1);
		g.drawRect(boxX, boxY, boxW, ROWS * ENTRY_HEIGHT);
		const entryWidth = Math.trunc(boxW / this.columns);
		for (let row = 0; row < ROWS; row++) {
			let addr = Math.floor(this.curScroll / this.columns) * this.columns + this.columns * row;
			let x = boxX;
			const y = boxY + ENTRY_HEIGHT * row;
			const yoffs = ENTRY_HEIGHT - 3;
			if (this.isValidAddr(addr)) {
				g.setColor("#808080");
				drawText(g, toHexString(this.addrBits, addr), x - 2, y + yoffs, H_RIGHT, V_BASELINE);
			}
			g.setColor("#000000");
			for (let col = 0; col < this.columns && this.isValidAddr(addr); col++) {
				const text = toHexString(dataBits, this.contents.get(addr));
				const cx = x + Math.trunc(entryWidth / 2);
				if (addr === this.curAddr) {
					g.fillRect(x, y, entryWidth, ENTRY_HEIGHT);
					g.setColor("#ffffff");
					drawText(g, text, cx, y + yoffs, H_CENTER, V_BASELINE);
					g.setColor("#000000");
				} else {
					drawText(g, text, cx, y + yoffs, H_CENTER, V_BASELINE);
				}
				addr++;
				x += entryWidth;
			}
		}
	}
}

class RamState extends MemState {
	readonly clock = new ClockState();
}

function memLabel(isRom: boolean, addrBits: number): string {
	const kind = isRom ? "ROM" : "RAM";
	const bytes = 2 ** addrBits;
	if (addrBits >= 30) return `${bytes / 2 ** 30}GB ${kind}`;
	if (addrBits >= 20) return `${bytes / 2 ** 20}MB ${kind}`;
	if (addrBits >= 10) return `${bytes / 2 ** 10}KB ${kind}`;
	return `${bytes}B ${kind}`;
}

/** MemPoker: click the table to edit a value, or the address column to scroll. */
function memPoker(getState: (state: InstanceState) => MemState): Poker {
	let addrMode = false;
	let curValue = 0;
	const moveTo = (data: MemState, addr: number) => {
		if (data.isValidAddr(addr)) {
			data.setCursor(addr);
			data.scrollToShow(addr);
			curValue = data.contents.get(addr);
		}
	};
	return {
		init: (state, x, y) => {
			const bds = state.instance.bounds;
			const data = getState(state);
			const addr = data.getAddressAt(x - bds.x, y - bds.y);
			addrMode = addr < 0;
			if (!addrMode) {
				data.setCursor(addr);
				curValue = data.contents.get(data.cursorLoc);
			}
			return true;
		},
		paint: (painter) => {
			const data = painter.getData<MemState>();
			if (!data) return;
			const b = data.getBounds(addrMode ? -1 : data.cursorLoc, painter.getBounds());
			painter.g.setColor("#ff0000");
			painter.g.setLineWidth(1);
			painter.g.drawRect(b.x, b.y, b.width, b.height);
			painter.g.setColor("#000000");
		},
		stopEditing: (state) => {
			if (!addrMode) state.getData<MemState>()?.setCursor(-1);
		},
		keyTyped: (state, key) => {
			const data = getState(state);
			const val = key.length === 1 ? Number.parseInt(key, 16) : Number.NaN;
			if (addrMode) {
				if (!Number.isNaN(val)) {
					data.setScroll((data.curScroll * 16 + val) & data.lastAddress);
				} else if (key === " ") {
					data.setScroll(data.curScroll + (ROWS - 1) * data.columns);
				} else if (key === "\n") {
					data.setScroll(data.curScroll + data.columns);
				} else if (key === "\b" || key === "\u007f") {
					data.setScroll(data.curScroll - data.columns);
				}
			} else if (!Number.isNaN(val)) {
				curValue = (curValue * 16 + val) | 0;
				data.contents.set(data.cursorLoc, curValue);
			} else if (key === " " || key === "\t") {
				moveTo(data, data.cursorLoc + 1);
			} else if (key === "\n") {
				moveTo(data, data.cursorLoc + data.columns);
			} else if (key === "\b" || key === "\u007f") {
				moveTo(data, data.cursorLoc - 1);
			}
			state.fireInvalidated();
		},
	};
}

abstract class Mem extends ComponentFactory {
	override createKeyConfigurator(): KeyConfigurator {
		return new JoinedConfigurator(bitWidthConfigurator(MEM_ADDR, 2, 24, 0), bitWidthConfigurator(MEM_DATA));
	}

	readonly library = "#Memory";
	protected abstract readonly isRom: boolean;

	getOffsetBounds(): Bounds {
		return Bounds.create(-140, -40, 140, 80);
	}

	protected standardPorts(): PortDef[] {
		return [port(0, 0, "inout", MEM_DATA), port(-140, 0, "input", MEM_ADDR), port(-90, 40, "input", 1)];
	}

	/** The simulation state of a placed memory (created on demand). */
	abstract getState(state: Pick<InstanceState, "instance" | "getData" | "setData">): MemState;

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const bds = painter.getBounds();
		painter.drawBounds();
		if (painter.showState) {
			const data = painter.getData<MemState>();
			if (data) {
				data.updateBits();
				data.paint(g, bds.x, bds.y);
			} else {
				new MemState(this.emptyContents(painter)).paint(g, bds.x, bds.y);
			}
		} else {
			drawCenteredText(
				g,
				memLabel(this.isRom, painter.getAttr(MEM_ADDR)),
				bds.x + Math.trunc(bds.width / 2),
				bds.y + Math.trunc(bds.height / 2),
			);
		}
		painter.drawPort(DATA, "D", "west");
		painter.drawPort(ADDR, "A", "east");
		g.setColor("#808080");
		painter.drawPort(CS, "sel", "south");
	}

	protected abstract emptyContents(painter: InstancePainter): MemContents;

	override createPoker(): Poker {
		return memPoker((state) => this.getState(state));
	}
}

class Ram extends Mem {
	readonly name = "RAM";
	readonly displayKey = "memory.ram";
	override readonly iconName = "ram.gif";
	protected readonly isRom = false;

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(MEM_ADDR, 8);
		a.set(MEM_DATA, 8);
		a.set(RAM_BUS, "combined");
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [MEM_ADDR, MEM_DATA, RAM_BUS];
	}

	override getPorts(instance: Instance): PortDef[] {
		const bus = instance.attrs.get(RAM_BUS);
		const ps = this.standardPorts();
		ps[MEM_INPUTS] = port(-50, 40, "input", 1); // OE
		ps[MEM_INPUTS + 1] = port(-30, 40, "input", 1); // CLR
		if (bus !== "asynch") ps[MEM_INPUTS + 2] = port(-70, 40, "input", 1); // CLK
		if (bus === "separate") {
			ps[MEM_INPUTS + 3] = port(-110, 40, "input", 1); // WE
			ps[MEM_INPUTS + 4] = port(-140, 20, "input", MEM_DATA); // DIN
		}
		return ps;
	}

	getState(state: Pick<InstanceState, "instance" | "getData" | "setData">): RamState {
		const addrBits = state.instance.attrs.get(MEM_ADDR);
		const dataBits = state.instance.attrs.get(MEM_DATA);
		let s = state.getData<RamState>();
		if (s === undefined) {
			s = new RamState(MemContents.create(addrBits, dataBits));
			state.setData(s);
		} else {
			s.contents.setDimensions(addrBits, dataBits);
			s.updateBits();
		}
		return s;
	}

	protected emptyContents(painter: InstancePainter): MemContents {
		return MemContents.create(painter.getAttr(MEM_ADDR), painter.getAttr(MEM_DATA));
	}

	propagate(state: InstanceState): void {
		const myState = this.getState(state);
		const dataBits = state.getAttr(MEM_DATA);
		const bus = state.getAttr(RAM_BUS);
		const asynch = bus === "asynch";
		const separate = bus === "separate";
		const OE = MEM_INPUTS;
		const CLR = MEM_INPUTS + 1;
		const CLK = MEM_INPUTS + 2;
		const WE = MEM_INPUTS + 3;
		const DIN = MEM_INPUTS + 4;

		const addrValue = state.getPort(ADDR);
		const chipSelect = state.getPort(CS) !== Value.FALSE;
		const triggered = asynch || myState.clock.updateClock(state.getPort(CLK), "rising");
		const outputEnabled = state.getPort(OE) !== Value.FALSE;
		const shouldClear = state.getPort(CLR) === Value.TRUE;

		if (shouldClear) myState.contents.clear();

		if (!chipSelect) {
			myState.setCurrent(-1);
			state.setPort(DATA, Value.createUnknown(dataBits), DELAY);
			return;
		}

		const addr = addrValue.toIntValue();
		if (!addrValue.isFullyDefined() || addr < 0) return;
		if (addr !== myState.curAddr) {
			myState.setCurrent(addr);
			myState.scrollToShow(addr);
		}

		if (!shouldClear && triggered) {
			const shouldStore = separate ? state.getPort(WE) !== Value.FALSE : !outputEnabled;
			if (shouldStore) {
				const dataValue = state.getPort(separate ? DIN : DATA);
				myState.contents.set(addr, dataValue.toIntValue());
			}
		}

		if (outputEnabled) {
			state.setPort(DATA, Value.createKnown(dataBits, myState.contents.get(addr)), DELAY);
		} else {
			state.setPort(DATA, Value.createUnknown(dataBits), DELAY);
		}
	}

	override paintInstance(painter: InstancePainter): void {
		super.paintInstance(painter);
		const bus = painter.getAttr(RAM_BUS);
		if (bus !== "asynch") painter.drawClock(MEM_INPUTS + 2, "north");
		// Logisim 2.7.1's Spanish translation labels the OE input "out".
		painter.drawPort(MEM_INPUTS, "out", "south");
		painter.drawPort(MEM_INPUTS + 1, "clr", "south");
		if (bus === "separate") {
			painter.drawPort(MEM_INPUTS + 3, "str", "south");
			painter.g.setColor("#000000");
			painter.drawPort(MEM_INPUTS + 4, "D", "east");
		}
	}
}

class Rom extends Mem {
	readonly name = "ROM";
	readonly displayKey = "memory.rom";
	override readonly iconName = "rom.gif";
	protected readonly isRom = true;

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(MEM_ADDR, 8);
		a.set(MEM_DATA, 8);
		a.set(ROM_CONTENTS, MemContents.create(8, 8));
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [MEM_ADDR, MEM_DATA, ROM_CONTENTS];
	}

	/** Contents are always written (Java compares them by identity). */
	override getDefaultValue(attr: AnyAttribute): unknown {
		if (attr === ROM_CONTENTS) return null;
		return super.getDefaultValue(attr);
	}

	/** RomAttributes.setValue: resizing keeps the contents. */
	override setAttribute(attrs: AttributeSet, attr: AnyAttribute, value: unknown): void {
		if (attr === MEM_ADDR || attr === MEM_DATA) {
			attrs.set(attr, value);
			const contents = attrs.get(ROM_CONTENTS).clone();
			contents.setDimensions(attrs.get(MEM_ADDR), attrs.get(MEM_DATA));
			attrs.set(ROM_CONTENTS, contents);
		} else {
			attrs.set(attr, value);
		}
	}

	override getPorts(): PortDef[] {
		return this.standardPorts();
	}

	getState(state: Pick<InstanceState, "instance" | "getData" | "setData">): MemState {
		const contents = state.instance.attrs.get(ROM_CONTENTS);
		let s = state.getData<MemState>();
		if (s === undefined || s.contents !== contents) {
			s = new MemState(contents);
			state.setData(s);
		} else {
			s.updateBits();
		}
		return s;
	}

	protected emptyContents(painter: InstancePainter): MemContents {
		return painter.getAttr(ROM_CONTENTS);
	}

	propagate(state: InstanceState): void {
		const myState = this.getState(state);
		const dataBits = state.getAttr(MEM_DATA);
		const addrValue = state.getPort(ADDR);
		const chipSelect = state.getPort(CS) !== Value.FALSE;
		if (!chipSelect) {
			myState.setCurrent(-1);
			state.setPort(DATA, Value.createUnknown(dataBits), DELAY);
			return;
		}
		const addr = addrValue.toIntValue();
		if (!addrValue.isFullyDefined() || addr < 0) return;
		if (addr !== myState.curAddr) {
			myState.setCurrent(addr);
			myState.scrollToShow(addr);
		}
		state.setPort(DATA, Value.createKnown(dataBits, myState.contents.get(addr)), DELAY);
	}
}

export const RAM = new Ram();
export const ROM = new Rom();
export { Mem };
