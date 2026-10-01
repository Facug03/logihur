// Projects that use Logisim libraries (`file#` descriptors), nested two
// levels: principal.circ → compuertas.circ → base.circ, plus a direct use of
// base.circ from the main file. Shared by scripts/golden-libs.ts and
// tests/libraries.test.ts.

import { isInputPin, PIN } from "@/components/wiring/pin";
import { TUNNEL } from "@/components/wiring/tunnel";
import type { Circuit } from "@/engine/circuit";
import type { ComponentFactory } from "@/engine/component";
import { locX, locY } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { Project } from "@/project/project";
import { getPinLabels } from "@/sim/pin-labels";
import { make, randomCircuit } from "./harness";

/**
 * Place `factory` (a subcircuit) in `c` at (x, y), connecting each of its
 * ports through tunnels to nets named `${prefix}${portLabel}`.
 */
function placeWired(
	c: Circuit,
	factory: ComponentFactory,
	x: number,
	y: number,
	net: (label: string, input: boolean) => string,
) {
	const inst = make(factory, x, y);
	c.addComponent(inst);
	const source = (factory as unknown as { source: Circuit }).source;
	const pins = getPinLabels(source);
	const ports = (factory as unknown as { getPinInstances(i: unknown): unknown[] }).getPinInstances(inst);
	for (const { pin, label } of pins) {
		const at = inst.ends[ports.indexOf(pin)].loc;
		c.addComponent(
			make(TUNNEL, locX(at), locY(at), {
				facing: isInputPin(pin) ? "east" : "west",
				label: net(label, isInputPin(pin)),
			}),
		);
	}
	return { inst, pins };
}

function addLibrarySource(project: Project, fileName: string, text: string): void {
	project.libraries.push({ name: `${project.libraries.length}`, desc: `file#${fileName}`, tools: [] });
	project.librarySources.set(fileName, text);
}

/** Returns the three files; the main project already has its libraries loaded. */
export function libraryFiles(): Record<"base.circ" | "compuertas.circ" | "principal.circ", string> {
	const baseProject = randomCircuit(7);
	(baseProject.mainCircuit as Circuit).setName("bloque");
	const base = writeCirc(baseProject);

	// compuertas.circ: two "bloque" instances chained
	const comp = new Project();
	addLibrarySource(comp, "base.circ", base);
	const compLoaded = readCirc(writeCirc(comp), comp.librarySources);
	const bloque = compLoaded.loadedLibraries.get("file#base.circ")?.findFactory("bloque");
	if (!bloque) throw new Error("bloque");
	const circuit = compLoaded.circuits[0];
	circuit.setName("doble");
	const first = placeWired(circuit, bloque, 300, 200, (l, input) => (input ? `x_${l}` : `m_${l}`));
	const outs = first.pins.filter((p) => !isInputPin(p.pin)).map((p) => p.label);
	placeWired(circuit, bloque, 600, 200, (l, input) => {
		if (!input) return `y_${l}`;
		// feed the second block from the first block's outputs (cycling)
		const i = Number.parseInt(l.replace(/\D/g, ""), 10) || 0;
		return `m_${outs[i % outs.length]}`;
	});
	let y = 60;
	for (const { label, pin } of first.pins) {
		if (!isInputPin(pin)) continue;
		circuit.addComponent(make(PIN, 60, y, { tristate: false, label: `x_${label}` }));
		circuit.addComponent(make(TUNNEL, 60, y, { facing: "west", label: `x_${label}` }));
		y += 40;
	}
	y = 60;
	for (const out of outs) {
		circuit.addComponent(make(PIN, 1000, y, { facing: "west", output: true, label: `y_${out}` }));
		circuit.addComponent(make(TUNNEL, 1000, y, { facing: "east", label: `y_${out}` }));
		y += 40;
	}
	const compuertas = writeCirc(compLoaded);

	// principal.circ: uses compuertas' "doble" and base's "bloque" side by side
	const main = new Project();
	addLibrarySource(main, "compuertas.circ", compuertas);
	addLibrarySource(main, "base.circ", base);
	const loaded = readCirc(writeCirc(main), new Map([...main.librarySources]));
	const top = loaded.circuits[0];
	const dobleF = loaded.loadedLibraries.get("file#compuertas.circ")?.findFactory("doble");
	const bloqueF = loaded.loadedLibraries.get("file#base.circ")?.findFactory("bloque");
	if (!dobleF || !bloqueF) throw new Error("factories");
	const net = (prefix: string) => (l: string, input: boolean) =>
		input ? `in_${l.replace(/^x_/, "")}` : `${prefix}${l}`;
	const d = placeWired(top, dobleF, 400, 200, net("d_"));
	const b = placeWired(top, bloqueF, 400, 600, net("b_"));
	y = 60;
	const inputs = new Set(
		[...d.pins, ...b.pins].filter((p) => isInputPin(p.pin)).map((p) => p.label.replace(/^x_/, "")),
	);
	for (const label of inputs) {
		top.addComponent(make(PIN, 60, y, { tristate: false, label: `in_${label}` }));
		top.addComponent(make(TUNNEL, 60, y, { facing: "west", label: `in_${label}` }));
		y += 40;
	}
	y = 60;
	for (const [prefix, pins] of [
		["d_", d.pins],
		["b_", b.pins],
	] as const) {
		for (const { label, pin } of pins) {
			if (isInputPin(pin)) continue;
			top.addComponent(make(PIN, 1000, y, { facing: "west", output: true, label: `${prefix}${label}` }));
			top.addComponent(make(TUNNEL, 1000, y, { facing: "east", label: `${prefix}${label}` }));
			y += 40;
		}
	}
	return { "base.circ": base, "compuertas.circ": compuertas, "principal.circ": writeCirc(loaded) };
}
