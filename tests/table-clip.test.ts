// Copy/paste of truth table regions (TableTabClip).
import { describe, expect, it } from "vitest";
import { AnalyzerModel } from "@/analyze/model";
import { copyRegion, parsePaste, pasteRegion } from "@/analyze/table-clip";

function model(): AnalyzerModel {
	const m = new AnalyzerModel();
	m.setVariables(["a", "b"], ["x", "y"]);
	return m;
}
const column = (m: AnalyzerModel, c: number) =>
	Array.from({ length: m.truthTable.rowCount }, (_, r) => m.truthTable.getOutputEntry(r, c).description).join(
		"",
	);

describe("portapapeles de la tabla de verdad", () => {
	it("copia una región con su fila de encabezados", () => {
		const m = model();
		pasteRegion(m, { r0: 0, c0: 2, r1: 0, c1: 2 }, parsePaste("0\n1\n1\n0"));
		expect(copyRegion(m, { r0: 3, c0: 1, r1: 1, c1: 2 })).toBe("b\tx\n1\t1\n0\t1\n1\t0\n");
	});

	it("pega desde el cursor el tamaño del portapapeles, salteando encabezados y columnas de entrada", () => {
		const m = model();
		const text = "a\tx\ty\n0\t1\tx\n1\t0\t1\n";
		expect(pasteRegion(m, { r0: 1, c0: 1, r1: 1, c1: 1 }, parsePaste(text))).toBeNull();
		expect(column(m, 0)).toBe("x10x");
		expect(column(m, 1)).toBe("xx1x");
	});

	it("rechaza regiones de distinto tamaño o que pasan el final", () => {
		const m = model();
		const rows = parsePaste("1\t1\n0\t0");
		expect(rows.length).toBe(2); // the first line is data when every token is an entry
		expect(pasteRegion(m, { r0: 3, c0: 2, r1: 3, c1: 2 }, rows)).toBe("analyze.clipPasteEndError");
		expect(pasteRegion(m, { r0: 0, c0: 2, r1: 2, c1: 3 }, rows)).toBe("analyze.clipPasteSizeError");
		expect(pasteRegion(m, { r0: 0, c0: 2, r1: 1, c1: 3 }, rows)).toBeNull();
		expect(column(m, 0)).toBe("10xx");
		expect(pasteRegion(m, { r0: 0, c0: 0, r1: 0, c1: 0 }, parsePaste(""))).toBe(
			"analyze.clipPasteSupportedError",
		);
	});
});
