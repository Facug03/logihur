// Combinational analysis checked against Logisim 2.7.1 (recorded by
// `bun run golden:analyze`): minimization in both formats, the expression
// parser, analysis of real circuits and "Crear Circuito".
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AnalyzeError, computeExpression, computeTable } from "@/analyze/analyze";
import { buildCircuit } from "@/analyze/circuit-builder";
import { parseEntry } from "@/analyze/entry";
import { toText } from "@/analyze/expression";
import { FORMAT_PRODUCT_OF_SUMS } from "@/analyze/implicant";
import { AnalyzerModel } from "@/analyze/model";
import { ParserError, parseExpression } from "@/analyze/parser";
import { isInputPin, PIN } from "@/components/wiring/pin";
import { Transaction } from "@/editor/history";
import { repairWires } from "@/editor/wires";
import { writeAppearanceShape } from "@/engine/appearance";
import { Circuit } from "@/engine/circuit";
import { compareLoc, formatLoc } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import type { XmlElement } from "@/format/xml";
import { t } from "@/i18n/es";
import { computeStatistics } from "@/project/statistics";
import { getPinLabels } from "@/sim/pin-labels";
import { type AnalyzeCase, analyzeCases } from "./golden/analyze-cases";
import reference from "./golden/analyze-reference.json";
import { make } from "./golden/harness";

const root = path.resolve(__dirname, "..");
const cases = analyzeCases();
const text = (e: Parameters<typeof toText>[0] | null) => (e === null ? null : toText(e));

function run(c: AnalyzeCase): unknown {
	switch (c.kind) {
		case "min": {
			const model = new AnalyzerModel();
			model.setVariables(c.inputs, ["x"]);
			model.truthTable.setOutputColumn(
				0,
				Array.from(c.column, (ch) => parseEntry(ch) as NonNullable<ReturnType<typeof parseEntry>>),
			);
			const exprs = model.outputExpressions;
			const sop = text(exprs.getMinimalExpression("x"));
			exprs.setMinimizedFormat("x", FORMAT_PRODUCT_OF_SUMS);
			return { sop, pos: text(exprs.getMinimalExpression("x")) };
		}
		case "parse":
			try {
				return { expr: text(parseExpression(c.text, c.inputs)) };
			} catch (e) {
				if (!(e instanceof ParserError)) throw e;
				return { error: [e.offset, e.endOffset] };
			}
		case "circ": {
			const project = readCirc(readFileSync(path.join(root, c.file), "utf8"));
			const circuit = project.getCircuit(c.circuit) as Circuit;
			const pins = getPinLabels(circuit);
			const inputs = pins.filter((p) => isInputPin(p.pin)).map((p) => p.label);
			const outputs = pins.filter((p) => !isInputPin(p.pin)).map((p) => p.label);
			for (const { pin } of pins) {
				if ((pin.attrs.getByName("width") as number) > 1) {
					return { error: isInputPin(pin) ? "multibitInput" : "multibitOutput" };
				}
			}
			if (inputs.length === 0 || outputs.length === 0 || inputs.length > 12 || outputs.length > 12) {
				return { inputs, outputs };
			}
			const model = new AnalyzerModel();
			model.setVariables(inputs, outputs);
			const ret: Record<string, unknown> = {};
			let notice: string | null = null;
			try {
				computeExpression(model, circuit, pins);
				ret.exprs = outputs.map((o) => text(model.outputExpressions.getExpression(o)));
			} catch (e) {
				if (!(e instanceof AnalyzeError)) throw e;
				notice =
					e.message === t("analyze.circularError")
						? "Circular"
						: e.message === t("analyze.conflictError")
							? "Conflict"
							: "CannotHandle";
				computeTable(model, project, circuit, pins);
			}
			const table = model.truthTable;
			const columns = outputs.map((_, col) =>
				Array.from({ length: table.rowCount }, (_, row) => table.getOutputEntry(row, col).description).join(
					"",
				),
			);
			return { ...ret, inputs, outputs, notice, table: columns };
		}
		case "stats": {
			const project = readCirc(readFileSync(path.join(root, c.file), "utf8"));
			const st = computeStatistics(project, project.getCircuit(c.circuit) as Circuit, "file");
			const row = (x: { simple: number; unique: number; recursive: number }) => [
				x.simple,
				x.unique,
				x.recursive,
			];
			return {
				counts: st.counts.map((x) => [x.factory?.name, ...row(x)]),
				without: row(st.totalWithoutSubcircuits),
				with: row(st.totalWithSubcircuits),
			};
		}
		case "appear": {
			const project = readCirc(readFileSync(path.join(root, c.file), "utf8"));
			const circuit = project.getCircuit(c.circuit) as Circuit;
			const svg = (e: XmlElement) => ({
				tag: e.tag,
				attrs: Object.fromEntries(Object.entries(e.attrs).sort(([a], [b]) => (a < b ? -1 : 1))),
				text: e.children.join(""),
			});
			const before = circuit.appearance.getShapes().map((sh) => svg(writeAppearanceShape(sh)));
			circuit.appearance.setShapes(circuit.appearance.getEditableShapes());
			const first = circuit.pins.sort((a, b) => compareLoc(a.loc, b.loc))[0];
			if (first) circuit.removeComponent(first);
			circuit.addComponent(make(PIN, 20, 900));
			circuit.addComponent(make(PIN, 900, 20, { facing: "south", output: true }));
			const after = (circuit.appearance.toXml() ?? []).map(svg);
			return { default: before, edited: after };
		}
		case "build": {
			const model = new AnalyzerModel();
			model.setVariables(c.inputs, c.outputs);
			c.outputs.forEach((o, i) => {
				model.outputExpressions.setExpression(o, parseExpression(c.exprs[i], c.inputs));
			});
			const circuit = new Circuit("built");
			const built = buildCircuit(model, c.twoInputs, c.nands);
			const tx = new Transaction("build");
			for (const comp of built.components) tx.addComponent(circuit, comp);
			for (const w of built.wires) tx.addWire(circuit, w);
			repairWires(tx, circuit);
			const components = Array.from(circuit.components).map((comp) => ({
				name: comp.factory.name,
				loc: formatLoc(comp.loc),
				attrs: Object.fromEntries(
					comp.factory.getAttributes(comp.attrs).map((a) => [a.name, a.format(comp.attrs.get(a) as never)]),
				),
			}));
			const wires = Array.from(circuit.wires.values()).map((w) => `${formatLoc(w.e0)}-${formatLoc(w.e1)}`);
			return { components, wires: wires.sort() };
		}
	}
}

type BuildResult = {
	components: { name: string; loc: string; attrs: Record<string, string> }[];
	wires: string[];
};

/** Compare components by name/location and the attributes both sides know. */
function normalizeBuild(ours: BuildResult, java: BuildResult): [unknown, unknown] {
	const key = (c: { name: string; loc: string }) => `${c.name}@${c.loc}`;
	const javaAttrs = new Map(java.components.map((c) => [key(c), c.attrs]));
	const pick = (attrs: Record<string, string>, names: string[]) =>
		Object.fromEntries(names.filter((n) => n in attrs).map((n) => [n, attrs[n]]));
	const shared = ours.components.map((c) => {
		const names = Object.keys(javaAttrs.get(key(c)) ?? {}).filter((n) => n in c.attrs && n !== "labelfont");
		return { key: key(c), ours: pick(c.attrs, names), java: pick(javaAttrs.get(key(c)) ?? {}, names) };
	});
	return [
		{
			comps: shared.map((s) => [s.key, s.ours]).sort(),
			keys: ours.components.map(key).sort(),
			wires: ours.wires,
		},
		{
			comps: shared.map((s) => [s.key, s.java]).sort(),
			keys: java.components.map(key).sort(),
			wires: java.wires,
		},
	];
}

describe("combinational analysis matches Logisim 2.7.1", () => {
	it("has one recorded answer per case", () => {
		expect(reference.length).toBe(cases.length);
	});

	for (const kind of ["min", "parse", "circ", "build", "stats", "appear"] as const) {
		it(`${kind} cases`, () => {
			const mismatches: string[] = [];
			cases.forEach((c, i) => {
				if (c.kind !== kind) return;
				let ours = run(c);
				let java: unknown = reference[i];
				if (kind === "build") [ours, java] = normalizeBuild(ours as BuildResult, java as BuildResult);
				try {
					expect(ours).toEqual(java);
				} catch {
					mismatches.push(
						`#${i} ${JSON.stringify(c)}\n  ours: ${JSON.stringify(ours)}\n  java: ${JSON.stringify(java)}`,
					);
				}
			});
			expect(mismatches.slice(0, 5).join("\n"), `${mismatches.length} mismatches`).toBe("");
		});
	}
});
