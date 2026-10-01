import { describe, expect, it } from "vitest";
import { GATE_INPUTS, readGateConfig } from "@/components/gates/abstract-gate";
import { OR_GATE } from "@/components/gates/gates";
import { paintDin } from "@/components/gates/painter-din";
import type { InstancePainter } from "@/engine/component";
import type { Graphics } from "@/engine/graphics";

/** A painter whose Graphics records the shape calls (PainterDin only draws these). */
function recorder() {
	const calls: string[] = [];
	const record =
		(name: string) =>
		(...args: number[]) =>
			calls.push(`${name}(${args.join(",")})`);
	const g = {
		getColor: () => "#000000",
		setColor: () => {},
		setLineWidth: () => {},
		drawLine: record("line"),
		drawArc: record("arc"),
		fillOval: record("fillOval"),
	} as unknown as Graphics;
	const painter = {
		g,
		instance: null,
		showState: false,
		printView: false,
		isPortConnected: () => true,
	} as unknown as InstancePainter;
	return { painter, calls };
}

describe("DIN 40700 gate shapes (PainterDin)", () => {
	it("draws AND as a half circle on a vertical back", () => {
		const { painter, calls } = recorder();
		paintDin(painter, 50, 50, false, "and");
		expect(calls).toEqual(["line(-25,0,0,0)", "arc(-75,-25,50,50,-90,180)", "line(-50,-25,-50,25)"]);
	});

	it("puts the NAND bubble inside the width", () => {
		const { painter, calls } = recorder();
		paintDin(painter, 60, 50, true, "and");
		expect(calls).toEqual([
			"line(-35,0,0,0)",
			"arc(-85,-25,50,50,-90,180)",
			"line(-60,-25,-60,25)",
			"fillOval(-39,-4,8,8)",
		]);
	});

	it("runs the OR input lines up to the curve", () => {
		const { painter, calls } = recorder();
		const attrs = OR_GATE.createAttributeSet();
		attrs.set(GATE_INPUTS, 2);
		paintDin(painter, 50, 50, false, "or", { factory: OR_GATE, cfg: readGateConfig(attrs, false) });
		expect(calls.slice(0, 2)).toEqual(["line(-50,-20,-35,-20)", "line(-50,20,-35,20)"]);
	});
});
