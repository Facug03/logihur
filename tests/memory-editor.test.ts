import { afterEach, describe, expect, it, vi } from "vitest";
import { RAM, ROM, ROM_CONTENTS } from "@/components/memory/mem";
import { HexFormatError, loadImage, MemContents, saveImage } from "@/components/memory/mem-contents";
import { CONSTANT } from "@/components/wiring/constant";
import { Circuit } from "@/engine/circuit";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { Workspace } from "@/ui/workspace";
import { place } from "./helpers";

// Avoid autosave timers; these tests exercise edits and the real propagator.
vi.useFakeTimers();
afterEach(() => vi.clearAllTimers());

describe("memory images", () => {
	it("round-trips unsigned 32-bit values and compressed runs", () => {
		const original = MemContents.create(4, 32);
		original.set(0, 0xffffffff);
		original.fill(1, 5, 0x80000000);
		const loaded = MemContents.create(4, 32);
		loaded.set(15, 1);
		loadImage(loaded, saveImage(original));
		expect(Array.from({ length: 16 }, (_, i) => loaded.get(i))).toEqual(
			Array.from({ length: 16 }, (_, i) => original.get(i)),
		);
		expect(saveImage(original)).toContain("5*80000000");
	});

	it("rejects malformed and oversized images without changing the destination", () => {
		const memory = MemContents.create(2, 8);
		memory.set(0, 42);
		for (const image of ["bad header\n12", "v2.0 raw\nzz", "v2.0 raw\n5*ff"]) {
			expect(() => loadImage(memory, image)).toThrow(HexFormatError);
			expect(memory.get(0)).toBe(42);
		}
	});
});

describe("workspace memory edits", () => {
	it("edits only the RAM in the subcircuit instance being viewed", () => {
		const ws = new Workspace();
		const child = new Circuit("memory");
		ws.project.addCircuit(child);
		const ram = place(child, RAM, 200, 100, { addrWidth: 2, dataWidth: 8 });
		const factory = ws.project.getSubcircuitFactory(child);
		const first = place(ws.viewCircuit, factory, 100, 100);
		const second = place(ws.viewCircuit, factory, 300, 100);
		ws.enterSubcircuit(first);
		const next = ws.memoryContents(ram)?.clone() as MemContents;
		next.set(0, 42);
		ws.setMemoryContents(ram, next);
		ws.leaveSubcircuit();
		ws.enterSubcircuit(second);
		expect(ws.memoryContents(ram)?.get(0)).toBe(0);
		ws.leaveSubcircuit();
		ws.enterSubcircuit(first);
		expect(ws.memoryContents(ram)?.get(0)).toBe(42);
	});

	it("commits ROM snapshots with undo/redo, propagation and .circ persistence", () => {
		const ws = new Workspace();
		const rom = place(ws.viewCircuit, ROM, 200, 100, { addrWidth: 2, dataWidth: 8 });
		place(ws.viewCircuit, CONSTANT, 60, 100, { width: 2, value: 0 });
		const next = ws.memoryContents(rom)?.clone() as MemContents;
		next.set(0, 0xab);
		expect(ws.memoryContents(rom)?.get(0)).toBe(0);
		ws.setMemoryContents(rom, next);
		expect(ws.viewState.getValue(rom.loc).toIntValue()).toBe(0xab);
		next.set(0, 0x12);
		expect(ws.memoryContents(rom)?.get(0)).toBe(0xab);
		const reopened = readCirc(writeCirc(ws.project));
		const savedRom = Array.from(reopened.circuits[0].components).find((inst) => inst.factory === ROM);
		expect(savedRom?.attrs.get(ROM_CONTENTS).get(0)).toBe(0xab);
		ws.undo();
		expect(ws.memoryContents(rom)?.get(0)).toBe(0);
		expect(ws.viewState.getValue(rom.loc).toIntValue()).toBe(0);
		ws.redo();
		expect(ws.viewState.getValue(rom.loc).toIntValue()).toBe(0xab);
	});

	it("updates RAM output immediately without recording a project edit", () => {
		const ws = new Workspace();
		const ram = place(ws.viewCircuit, RAM, 200, 100, { addrWidth: 2, dataWidth: 8, bus: "separate" });
		place(ws.viewCircuit, CONSTANT, 60, 100, { width: 2, value: 0 });
		const next = ws.memoryContents(ram)?.clone() as MemContents;
		next.set(0, 0x7e);
		ws.setMemoryContents(ram, next);
		expect(ws.memoryContents(ram)?.get(0)).toBe(0x7e);
		expect(ws.viewState.getValue(ram.loc).toIntValue()).toBe(0x7e);
		expect(ws.history.canUndo()).toBe(false);
		expect(ws.dirty).toBe(false);
		next.clear();
		expect(ws.memoryContents(ram)?.get(0)).toBe(0x7e);
		ws.resetSimulation();
		expect(ws.memoryContents(ram)?.isClear()).toBe(true);
	});
});
