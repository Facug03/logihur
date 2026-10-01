// Logisim libraries (`file#` descriptors): nested loading checked against
// Logisim 2.7.1 (scripts/golden-libs.ts), saving, and the workspace flow.

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AND_GATE } from "@/components/gates/gates";
import { SubcircuitFactory } from "@/components/subcircuit";
import { loc } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { renderMessage } from "@/i18n/i18n";
import { Simulator } from "@/sim/simulator";
import { Workspace } from "@/ui/workspace";
import { libraryFiles } from "./golden/libraries";

const dir = path.join(import.meta.dirname, "golden/libs");
const read = (name: string) => readFileSync(path.join(dir, name), "utf8");
const sources = () => new Map(["base.circ", "compuertas.circ"].map((f) => [f, read(f)]));

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("librerías Logisim (file#)", () => {
	it("simula librerías anidadas igual que Logisim 2.7.1", () => {
		const project = readCirc(read("principal.circ"), sources());
		expect(project.messages).toEqual([]);
		expect(project.missingLibraries).toEqual([]);
		const sim = new Simulator(project, project.mainCircuit as NonNullable<typeof project.mainCircuit>);
		const result = sim.runTtyTable(5000);
		expect(result.code).toBe(0);
		expect(result.lines).toEqual(read("expected.txt").trimEnd().split("\n"));
	});

	it("los casos grabados siguen siendo los que genera el código", () => {
		const files = libraryFiles();
		expect(files["base.circ"]).toBe(read("base.circ"));
		expect(files["compuertas.circ"]).toBe(read("compuertas.circ"));
	});

	it("sin los archivos quedan sustitutos que se guardan sin pérdida", () => {
		const text = read("principal.circ");
		const project = readCirc(text);
		expect(project.missingLibraries.sort()).toEqual(["base.circ", "compuertas.circ"]);
		expect(writeCirc(project)).toBe(text);
		const loaded = readCirc(text, sources());
		expect(writeCirc(loaded)).toBe(text);
	});

	it("informa una librería que se incluye a sí misma en lugar de colgarse", () => {
		const self = writeCirc(readCirc(read("base.circ"))).replace(
			'<lib desc="#Wiring" name="0"/>',
			'<lib desc="#Wiring" name="0"/>\n  <lib desc="file#yo.circ" name="99"/>',
		);
		const project = readCirc(self, new Map([["yo.circ", self]]));
		expect(project.loadedLibraries.size).toBe(1);
		expect(project.loadedLibraries.get("file#yo.circ")?.project.messages.map(renderMessage)).toContain(
			"La librería yo.circ se incluye a sí misma",
		);
	});

	it("carga, usa, persiste y protege una librería desde el workspace", () => {
		const ws = new Workspace();
		ws.loadLibrary("base.circ", read("base.circ"));
		const lib = ws.project.loadedLibraries.get("file#base.circ");
		const factory = lib?.findFactory("bloque");
		expect(factory).toBeInstanceOf(SubcircuitFactory);
		if (!factory) return;
		ws.selectAddTool(factory);
		const inst = ws.placeComponent(loc(300, 300));
		expect(inst?.factory).toBe(factory);
		expect(ws.project.usesLibrary("file#base.circ")).toBe(true);
		ws.unloadLibrary("file#base.circ");
		expect(ws.project.loadedLibraries.has("file#base.circ")).toBe(true);

		const xml = ws.saveToText();
		expect(xml).toContain('<lib desc="file#base.circ"');
		expect(xml).toMatch(/<comp lib="\d+" loc="\(300,300\)" name="bloque"/);

		// the library's circuits can be entered but not edited
		if (!inst) return;
		ws.enterSubcircuit(inst);
		const before = ws.viewCircuit.components.size;
		ws.selectAddTool(AND_GATE);
		ws.placeComponent(loc(900, 900));
		expect(ws.viewCircuit.components.size).toBe(before);
		expect(ws.notice?.()).toContain("librería");
	});

	it("pide los archivos faltantes y los incorpora al proyecto abierto", () => {
		const ws = new Workspace();
		ws.openFromText(read("principal.circ"), "principal.circ");
		expect(ws.project.missingLibraries.length).toBe(2);
		ws.provideLibraries(sources());
		expect(ws.project.missingLibraries).toEqual([]);
		expect(ws.fileName).toBe("principal.circ");
		// the library contents travel with the autosave
		const saved = (ws as unknown as { savedProjects: { libraries?: Record<string, string> }[] })
			.savedProjects;
		expect(Object.keys(saved.at(-1)?.libraries ?? {}).sort()).toEqual(["base.circ", "compuertas.circ"]);
	});
});
