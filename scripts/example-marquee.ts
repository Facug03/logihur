// Generates public/examples/marquee.circ: a scrolling LED sign built from
// plain Logisim parts. A counter walks a ROM that holds the message one column
// per address; eight 1-bit shift registers (one per row) push each column in
// from the right, and a splitter per row turns the 32 stages into the row bus
// of a 32×8 dot matrix.
//
//   bun scripts/example-marquee.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { TEXT } from "@/components/base/text";
import { DOT_MATRIX } from "@/components/io/matrix";
import { ROM } from "@/components/memory/mem";
import { MemContents } from "@/components/memory/mem-contents";
import { COUNTER, SHIFT_REGISTER } from "@/components/memory/registers";
import { CLOCK } from "@/components/wiring/clock";
import { SPLITTER } from "@/components/wiring/splitter";
import { Circuit } from "@/engine/circuit";
import { type ComponentFactory, Instance } from "@/engine/component";
import { loc, locX, locY } from "@/engine/geom";
import { Wire } from "@/engine/wire";
import { writeCirc } from "@/format/circ-writer";
import { Project } from "@/project/project";

// --- message -------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
	U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
	N: ["X...X", "X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X"],
	A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
	H: ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
	R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
	L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
	O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
	G: [".XXX.", "X...X", "X....", "X.XXX", "X...X", "X...X", ".XXX."],
	I: ["XXX", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX"],
	"♥": [".XX.XX.", "XXXXXXX", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
	" ": ["..", "..", "..", "..", "..", "..", ".."],
};

/** One byte per column, bit r lit when row r (0 = top) is on. */
function columns(text: string): number[] {
	const out: number[] = [];
	for (const ch of text) {
		const g = GLYPHS[ch];
		for (let c = 0; c < g[0].length; c++) {
			let byte = 0;
			for (let r = 0; r < g.length; r++) if (g[r][c] === "X") byte |= 1 << (r + 1);
			out.push(byte);
		}
		out.push(0);
	}
	return out;
}

const message = columns("UNAHUR ♥ LOGIHUR ♥ ");
const addrBits = Math.ceil(Math.log2(message.length));
const contents = MemContents.create(addrBits, 8);
contents.setValues(0, message);

// --- placement helpers -----------------------------------------------------

const circuit = new Circuit("main");

function place(
	factory: ComponentFactory,
	x: number,
	y: number,
	values: Record<string, unknown> = {},
): Instance {
	const attrs = factory.createAttributeSet();
	for (const [name, value] of Object.entries(values)) {
		const attr = factory.getAttributes(attrs).find((a) => a.name === name);
		if (!attr) throw new Error(`${factory.name} has no attribute ${name}`);
		factory.setAttribute(attrs, attr, typeof value === "string" ? attr.parse(value) : value);
	}
	const inst = new Instance(factory, loc(x, y), attrs);
	circuit.addComponent(inst);
	return inst;
}

type Pt = [number, number];
const segments: [Pt, Pt, string][] = [];
/** A wire of net `net` through orthogonal points; split at junctions later. */
function wire(net: string, ...pts: Pt[]): void {
	for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i], pts[i + 1], net]);
}
const end = (inst: Instance, i: number): Pt => [locX(inst.ends[i].loc), locY(inst.ends[i].loc)];

function text(x: number, y: number, value: string, font = "SansSerif plain 12"): void {
	place(TEXT, x, y, { text: value, halign: "left", font });
}

// --- layout ----------------------------------------------------------------

const Y0 = 160; // first shift register
const PITCH = 100; // between shift registers
const SX = 520; // shift registers' left edge
const ROM_X = 400;
const ROM_Y = Y0 + 300;
const CLOCK_Y = Y0 + 7 * PITCH + 10;
const MX = SX + 340 + 80; // matrix
const MY = Y0 + 370;

const rom = place(ROM, ROM_X, ROM_Y, { addrWidth: addrBits, dataWidth: 8, contents });
const counter = place(COUNTER, ROM_X - 180, ROM_Y, {
	width: addrBits,
	max: message.length - 1,
	label: "columna",
});
const clock = place(CLOCK, 140, CLOCK_Y, { label: "reloj" });
const fan = place(SPLITTER, ROM_X + 20, ROM_Y, { facing: "east", appear: "right", fanout: 8, incoming: 8 });
const matrix = place(DOT_MATRIX, MX, MY, {
	inputtype: "row",
	matrixcols: 32,
	matrixrows: 8,
	color: "#ffb000",
	offcolor: "#3a2c10",
	dotshape: "circle",
});

wire("addr", end(counter, 0), end(rom, 1));
wire("data", end(rom, 0), end(fan, 0));
const clockBusX = SX - 10;
wire("clk", end(clock, 0), [clockBusX, CLOCK_Y]);
wire("clk", end(counter, 2), [locX(counter.ends[2].loc), CLOCK_Y]);
wire("clk", [clockBusX, Y0 + 10], [clockBusX, CLOCK_Y]);

for (let r = 0; r < 8; r++) {
	const sy = Y0 + r * PITCH;
	const sr = place(SHIFT_REGISTER, SX, sy, { width: 1, length: 32, parallel: true, label: `fila ${r}` });
	// stage i (0 = newest) feeds bit i of the row, which lights column 31 - i
	const row = place(SPLITTER, SX + 10, sy + 50, {
		facing: "north",
		appear: "right",
		fanout: 32,
		incoming: 32,
	});
	for (let i = 0; i < 32; i++) {
		const bit = SPLITTER.getAttributes(row.attrs).find((a) => a.name === `bit${i}`);
		if (!bit) throw new Error("splitter bit attribute");
		SPLITTER.setAttribute(row.attrs, bit, 32 - i);
	}
	for (let i = 0; i < 32; i++) wire(`s${r}.${i}`, end(sr, 7 + 2 * i), end(row, 32 - i));
	// clock stub and data from the ROM's splitter
	wire("clk", [clockBusX, sy + 10], end(sr, 2));
	const [fx, fy] = end(fan, r + 1);
	const dataX = fan.x + 40 + 10 * (fy < sy ? 7 - r : r);
	wire(`d${r}`, [fx, fy], [dataX, fy], [dataX, sy], end(sr, 0));
	// row bus to the matrix
	const busY = sy + 60;
	const target = end(matrix, r);
	const busX = SX + 360 + 10 * (busY < target[1] ? 3 - r : r - 4);
	wire(`row${r}`, end(row, 0), [row.x, busY], [busX, busY], [busX, target[1]], target);
}

text(100, 40, "Marquesina LED", "SansSerif bold 28");
text(
	100,
	75,
	"Activá los ticks automáticos (Ctrl+K) y subí la frecuencia a 16 o 32 Hz para ver el mensaje correr.",
	"SansSerif plain 14",
);
text(100, 100, "El contador recorre la ROM, que guarda el mensaje columna por columna.");
text(
	100,
	120,
	"Cada fila es un registro de desplazamiento de 32 bits: en cada flanco entra una columna nueva",
);
text(
	100,
	140,
	"por la izquierda, y el divisor la manda a la derecha de la matriz, así el texto avanza hacia la izquierda.",
);
text(ROM_X - 160, ROM_Y - 60, "mensaje (1 columna por dirección)");
text(MX, MY - 30, "Matriz de puntos 32×8 (entrada por filas)");

// --- wires: drop duplicates and split at T-junctions --------------------------

const key = ([x, y]: Pt) => `${x},${y}`;
const points = new Map<string, string>();
for (const [a, b, net] of segments)
	for (const p of [a, b]) {
		if ((points.get(key(p)) ?? net) !== net)
			throw new Error(`nets ${net} and ${points.get(key(p))} touch at ${p}`);
		points.set(key(p), net);
	}
const pieces = new Set<string>();
for (const [[x0, y0], [x1, y1], net] of segments) {
	if (x0 !== x1 && y0 !== y1) throw new Error(`diagonal wire ${x0},${y0} → ${x1},${y1}`);
	if (x0 === x1 && y0 === y1) continue;
	const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
	const dx = Math.sign(x1 - x0) * 10,
		dy = Math.sign(y1 - y0) * 10;
	let start: Pt = [x0, y0];
	for (let s = 10; s <= len; s += 10) {
		const p: Pt = [x0 + (dx * s) / 10, y0 + (dy * s) / 10];
		const other = points.get(key(p));
		if (other !== undefined && other !== net) throw new Error(`net ${net} runs over ${other} at ${p}`);
		if (s === len || other !== undefined) {
			pieces.add(JSON.stringify(start[0] < p[0] || start[1] < p[1] ? [start, p] : [p, start]));
			start = p;
		}
	}
}
for (const piece of pieces) {
	const [a, b] = JSON.parse(piece) as [Pt, Pt];
	circuit.addWire(Wire.create(loc(...a), loc(...b)));
}

const project = new Project();
project.addCircuit(circuit);
project.mainCircuit = circuit;
const file = path.join(import.meta.dirname, "../public/examples/marquee.circ");
writeFileSync(file, writeCirc(project));
console.log(`${file}: ${message.length} columns, ${pieces.size} wires`);
