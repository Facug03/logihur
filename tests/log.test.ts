// Simular > Registro: selection, recorded rows, radix and the log file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RAM } from "@/components/memory/mem";
import { REGISTER, SHIFT_REGISTER } from "@/components/memory/registers";
import { PIN } from "@/components/wiring/pin";
import { loc } from "@/engine/geom";
import { Value } from "@/engine/value";
import { type LogItem, type LogTreeNode, logTree } from "@/log/log-model";
import { formatLogValue } from "@/log/loggers";
import { Workspace } from "@/ui/workspace";
import { fixture } from "./helpers";

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function items(node: LogTreeNode): LogItem[] {
	return [...(node.item ? [node.item] : []), ...node.children.flatMap(items)];
}

describe("registro (logging)", () => {
	it("lista componentes registrables por nombre y luego subcircuitos, con nombres largos", () => {
		const ws = new Workspace();
		ws.openFromText(fixture("full-adder.circ"), "full-adder.circ");
		const tree = logTree(ws.logModel.root);
		expect(tree.label).toBe("main");
		const labels = tree.children.map((c) => c.label);
		expect(labels.slice(0, 5)).toEqual(["A", "B", "Cin", "Cout", "Sum"]);
		expect(tree.children.length).toBe(7); // five pins and two "half" subcircuits
		const nested = items(tree).filter((i) => i.path.length === 1);
		expect(nested.length).toBe(8);
		expect(nested[0].longName(ws.logModel.root)).toMatch(/^half\(\d+,\d+\)\.\w+$/);
	});

	it("agrega una fila sólo cuando cambia algún valor y la vuelca al archivo con cabecera", () => {
		const ws = new Workspace();
		ws.openFromText(fixture("half-adder.circ"), "half-adder.circ");
		const log = ws.logModel;
		for (const item of items(logTree(log.root))) log.add(item);
		expect(log.selection.map((i) => i.shortName(log.root))).toEqual(["A", "B", "C", "S"]);
		log.setFileEnabled(true);
		const sim = ws.rootSimulator;
		sim.setInput("A", 1);
		sim.setInput("A", 1); // no change: no new row
		sim.setInput("B", 1);
		expect(log.rowCount).toBe(2);
		expect(log.getValues(log.selection[3]).map((v) => v.toString())).toEqual(["1", "0"]);
		expect(log.fileLines).toEqual(["A\tB\tC\tS", "1\t0\t0\t1", "1\t1\t1\t0"]);
	});

	it("cambia de base 2 → 10 → 16 → 2 y muestra errores como Logisim", () => {
		const ws = new Workspace();
		const log = ws.logModel;
		ws.selectAddTool(REGISTER);
		ws.placeComponent(loc(200, 200));
		const [item] = items(logTree(log.root));
		log.add(item);
		const radixes = [item.radix];
		for (let i = 0; i < 3; i++) {
			log.changeRadix(item);
			radixes.push(item.radix);
		}
		expect(radixes).toEqual([2, 10, 16, 2]);
		expect(formatLogValue(Value.createKnown(8, 0xa5), 2)).toBe("1010 0101");
		expect(formatLogValue(Value.createKnown(8, 0xa5), 16)).toBe("a5");
		expect(formatLogValue(Value.createUnknown(8), 10)).toBe("???");
		expect(formatLogValue(Value.createError(8), 10)).toBe("Error");
	});

	it("ofrece una opción por palabra de RAM (hasta 256) y por etapa del registro de desplazamiento", () => {
		const ws = new Workspace();
		ws.selectAddTool(RAM);
		ws.placeComponent(loc(300, 300));
		ws.selectAddTool(SHIFT_REGISTER);
		ws.placeComponent(loc(300, 600));
		const tree = logTree(ws.logModel.root);
		const ram = tree.children.find((c) => c.label.startsWith("RAM"));
		const shift = tree.children.find((c) => c.label.startsWith("Registro de desplazamiento"));
		expect(ram?.children.length).toBe(256);
		expect(ram?.children[3].label).toBe("RAM(300,300)[3]");
		expect(shift?.children.length).toBe(8);
		expect(shift?.children[0].label).toBe("Registro de desplazamiento(300,600)[0]");
	});

	it("quita de la selección los componentes borrados", () => {
		const ws = new Workspace();
		ws.selectAddTool(PIN);
		const pin = ws.placeComponent(loc(100, 100));
		const log = ws.logModel;
		for (const item of items(logTree(log.root))) log.add(item);
		expect(log.selection.length).toBe(1);
		if (pin) ws.deleteComponent(pin);
		expect(log.selection.length).toBe(0);
	});
});
