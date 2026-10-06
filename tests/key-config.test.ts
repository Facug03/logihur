import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GATE_INPUTS } from "@/components/gates/abstract-gate";
import { AND_GATE } from "@/components/gates/gates";
import { MEM_ADDR, MEM_DATA, RAM } from "@/components/memory/mem";
import { MULTIPLEXER, PLEXER_SELECT } from "@/components/plexers/plexers";
import { LABEL_LOC, WIDTH } from "@/components/std-attrs";
import { CONSTANT, CONSTANT_VALUE } from "@/components/wiring/constant";
import { PIN } from "@/components/wiring/pin";
import { SPLITTER, SPLITTER_FANOUT, SPLITTER_WIDTH } from "@/components/wiring/splitter";
import type { ComponentFactory } from "@/engine/component";
import { loc } from "@/engine/geom";
import { KeyConfigurationEvent, MOD_ALT } from "@/engine/key-config";
import { Wire } from "@/engine/wire";
import { Workspace } from "@/ui/workspace";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

/** Feeds typed characters to a factory's configurator, `gap` ms apart. */
function typeKeys(factory: ComponentFactory, keys: string, mods = 0, gap = 100) {
	const attrs = factory.createAttributeSet();
	const handler = factory.createKeyConfigurator();
	let when = 1_000_000;
	for (const key of keys) {
		const result = handler?.keyEventReceived(new KeyConfigurationEvent("typed", key, mods, attrs, when));
		if (result) for (const [a, v] of result) factory.setAttribute(attrs, a, v);
		when += gap;
	}
	return attrs;
}

describe("configuradores de teclas (tools.key)", () => {
	it("dígitos solos cambian las entradas de una puerta y se acumulan dentro de 800 ms", () => {
		expect(typeKeys(AND_GATE, "3").get(GATE_INPUTS)).toBe(3);
		expect(typeKeys(AND_GATE, "12").get(GATE_INPUTS)).toBe(12);
		// separated by more than 800 ms, the second digit starts over
		expect(typeKeys(AND_GATE, "12", 0, 900).get(GATE_INPUTS)).toBe(2);
		// below the minimum (2) the digit is consumed but nothing changes
		expect(typeKeys(AND_GATE, "1").get(GATE_INPUTS)).toBe(5);
		// past the maximum (32) the new digit restarts the number
		expect(typeKeys(AND_GATE, "45").get(GATE_INPUTS)).toBe(5);
	});

	it("Alt + dígitos cambian el ancho de bits", () => {
		const attrs = typeKeys(AND_GATE, "16", MOD_ALT);
		expect(attrs.get(WIDTH)).toBe(16);
		expect(attrs.get(GATE_INPUTS)).toBe(5);
		expect(typeKeys(PIN, "8", MOD_ALT).get(WIDTH)).toBe(8);
		// without Alt a pin ignores digits
		expect(typeKeys(PIN, "8").get(WIDTH)).toBe(1);
	});

	it("cada componente usa sus atributos y límites de Logisim", () => {
		expect(typeKeys(MULTIPLEXER, "3").get(PLEXER_SELECT)).toBe(3);
		expect(typeKeys(MULTIPLEXER, "9").get(PLEXER_SELECT)).toBe(1); // max 5
		const ram = typeKeys(RAM, "10");
		expect(ram.get(MEM_ADDR)).toBe(10);
		expect(typeKeys(RAM, "4", MOD_ALT).get(MEM_DATA)).toBe(4);
		const splitter = typeKeys(SPLITTER, "4");
		expect(splitter.get(SPLITTER_FANOUT)).toBe(4);
		const alt = typeKeys(SPLITTER, "3", MOD_ALT);
		expect(alt.get(SPLITTER_WIDTH)).toBe(3);
		expect(alt.get(SPLITTER_FANOUT)).toBe(3);
	});

	it("la constante acepta dígitos hexadecimales dentro de su ancho", () => {
		const one = CONSTANT.createAttributeSet();
		expect(one.get(WIDTH)).toBe(1);
		expect(typeKeys(CONSTANT, "0").get(CONSTANT_VALUE)).toBe(0);
		const wide = CONSTANT.createAttributeSet();
		CONSTANT.setAttribute(wide, WIDTH, 8);
		const handler = CONSTANT.createKeyConfigurator();
		let when = 0;
		for (const key of "a5") {
			when += 100;
			const r = handler?.keyEventReceived(new KeyConfigurationEvent("typed", key, 0, wide, when));
			if (r) for (const [a, v] of r) CONSTANT.setAttribute(wide, a, v);
		}
		expect(wide.get(CONSTANT_VALUE)).toBe(0xa5);
	});

	it("Alt + flechas mueven la etiqueta del pin", () => {
		const attrs = PIN.createAttributeSet();
		const r = PIN.createKeyConfigurator()?.keyEventReceived(
			new KeyConfigurationEvent("pressed", "ArrowUp", MOD_ALT, attrs, 0),
		);
		expect(r?.get(LABEL_LOC)).toBe("north");
	});
});

describe("teclas del editor", () => {
	it("aplica la tecla a la selección como una acción deshacible", () => {
		const ws = new Workspace();
		ws.selectAddTool(AND_GATE);
		const gate = ws.placeComponent(loc(100, 100));
		ws.setTool({ kind: "edit" });
		ws.select(gate);
		expect(ws.keyConfigure("typed", "3", 0)).toBe(true);
		expect(gate?.attrs.get(GATE_INPUTS)).toBe(3);
		ws.undo();
		expect(gate?.attrs.get(GATE_INPUTS)).toBe(5);
	});

	it("aplica la tecla a la herramienta de agregar sin tocar el historial", () => {
		const ws = new Workspace();
		ws.selectAddTool(PIN);
		expect(ws.keyConfigure("typed", "4", MOD_ALT)).toBe(true);
		expect(ws.history.canUndo()).toBe(false);
		const pin = ws.placeComponent(loc(100, 100));
		expect(pin?.attrs.get(WIDTH)).toBe(4);
	});

	it("Retroceso deshace sólo lo último que se agregó", () => {
		const ws = new Workspace();
		ws.selectAddTool(AND_GATE);
		ws.placeComponent(loc(100, 100));
		ws.placeComponent(loc(200, 100));
		expect(ws.undoLastAddition("component")).toBe(true);
		expect(ws.circuit.components.size).toBe(1);
		// only the last addition, and only once
		expect(ws.undoLastAddition("component")).toBe(false);
		expect(ws.circuit.components.size).toBe(1);

		ws.setTool({ kind: "wiring" });
		ws.addWires([Wire.create(loc(300, 300), loc(400, 300))]);
		expect(ws.undoLastAddition("component")).toBe(false);
		expect(ws.undoLastAddition("wire")).toBe(true);
		expect(ws.circuit.wires.size).toBe(0);
	});
});
