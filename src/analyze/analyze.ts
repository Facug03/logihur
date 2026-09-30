// Port of com.cburch.logisim.circuit.Analyze and the ExpressionComputer
// features of the gates, plus ProjectCircuitActions.doAnalyze, which decides
// what the analyzer shows for a circuit.

import { readGateConfig } from "@/components/gates/abstract-gate";
import {
	AND_GATE,
	EVEN_PARITY_GATE,
	NAND_GATE,
	NOR_GATE,
	ODD_PARITY_GATE,
	OR_GATE,
	XNOR_GATE,
	XOR_GATE,
} from "@/components/gates/gates";
import { BUFFER, NOT_GATE } from "@/components/gates/simple-gates";
import { SubcircuitFactory } from "@/components/subcircuit";
import { CONSTANT, CONSTANT_VALUE } from "@/components/wiring/constant";
import { isInputPin, PIN } from "@/components/wiring/pin";
import type { Circuit } from "@/engine/circuit";
import type { ComponentFactory, Instance } from "@/engine/component";
import type { Loc } from "@/engine/geom";
import { CircuitState, InstanceStateImpl } from "@/engine/simulation";
import { Value } from "@/engine/value";
import { t } from "@/i18n/es";
import type { Project } from "@/project/project";
import { getPinLabels } from "@/sim/pin-labels";
import { BUS_ERROR, DONT_CARE, type Entry, ONE, OSCILLATE_ERROR, ZERO } from "./entry";
import { and, constant, Expr, type Expression, equals, or, variable, xor } from "./expression";
import { type AnalyzerModel, isInputSet, MAX_INPUTS, MAX_OUTPUTS } from "./model";

const MAX_ITERATIONS = 100;
/** Expressions this large only come from feedback loops that double each pass. */
const MAX_EXPRESSION_SIZE = 1 << 20;

export class AnalyzeError extends Error {}

/** ExpressionComputer: thrown when a component has no expression. */
class Unsupported extends Error {}

class ExpressionMap {
	readonly values = new Map<Loc, Expression>();
	readonly dirtyPoints = new Set<Loc>();
	readonly causes = new Map<Loc, Instance>();
	currentCause: Instance | null = null;

	constructor(readonly circuit: Circuit) {}

	get(p: Loc): Expression | null {
		return this.values.get(p) ?? null;
	}

	put(p: Loc, e: Expression): void {
		const old = this.get(p);
		this.values.set(p, e);
		if (this.currentCause !== null) this.causes.set(p, this.currentCause);
		if (!equals(old, e)) this.dirtyPoints.add(p);
	}
}

type Computer = (inst: Instance, map: ExpressionMap) => void;

function gateComputer(
	isXor: boolean,
	combine: (inputs: Expression[]) => Expression,
	negateOutput = false,
): Computer {
	return (inst, map) => {
		const { inputs: inputCount, negated } = readGateConfig(inst.attrs, isXor);
		const inputs: Expression[] = [];
		for (let i = 1; i <= inputCount; i++) {
			const e = map.get(inst.getPortLocation(i));
			if (e !== null) inputs.push(((negated >> (i - 1)) & 1) === 1 ? Expr.not(e) : e);
		}
		if (inputs.length > 0) {
			const out = combine(inputs);
			map.put(inst.getPortLocation(0), negateOutput ? Expr.not(out) : out);
		}
	};
}

const fold = (op: typeof and) => (inputs: Expression[]) =>
	inputs.slice(1).reduce((acc, e) => op(acc, e) as Expression, inputs[0]);

/** XorGate.xorExpression: Logisim only derives expressions for two inputs. */
function xorExpression(inputs: Expression[]): Expression {
	if (inputs.length > 2) throw new Unsupported();
	return fold(xor)(inputs);
}

const COMPUTERS = new Map<ComponentFactory, Computer>([
	[AND_GATE, gateComputer(false, fold(and))],
	[OR_GATE, gateComputer(false, fold(or))],
	[NAND_GATE, gateComputer(false, fold(and), true)],
	[NOR_GATE, gateComputer(false, fold(or), true)],
	[XOR_GATE, gateComputer(true, xorExpression)],
	[XNOR_GATE, gateComputer(true, xorExpression, true)],
	[ODD_PARITY_GATE, gateComputer(false, fold(xor))],
	[EVEN_PARITY_GATE, gateComputer(false, fold(xor), true)],
	[
		NOT_GATE,
		(inst, map) => {
			const e = map.get(inst.getPortLocation(1));
			if (e !== null) map.put(inst.getPortLocation(0), Expr.not(e));
		},
	],
	[
		BUFFER,
		(inst, map) => {
			const e = map.get(inst.getPortLocation(1));
			if (e !== null) map.put(inst.getPortLocation(0), e);
		},
	],
	[CONSTANT, (inst, map) => map.put(inst.loc, constant(inst.attrs.get(CONSTANT_VALUE)))],
]);

function displayName(f: ComponentFactory): string {
	if (f instanceof SubcircuitFactory) return f.name;
	return f.displayKey ? t(f.displayKey) : f.name;
}

function propagateComponents(map: ExpressionMap, components: Iterable<Instance>): void {
	for (const comp of components) {
		const computer = COMPUTERS.get(comp.factory);
		if (computer) {
			try {
				map.currentCause = comp;
				computer(comp, map);
			} catch (e) {
				if (e instanceof Unsupported) {
					throw new AnalyzeError(t("analyze.cannotHandleError", [displayName(comp.factory)]));
				}
				throw e;
			}
		} else if (comp.factory !== PIN) {
			// pins are handled elsewhere
			throw new AnalyzeError(t("analyze.cannotHandleError", [displayName(comp.factory)]));
		}
	}
}

/** Propagates expressions down wires (through every point of a bundle). */
function propagateWires(map: ExpressionMap, points: Loc[]): void {
	const netlist = map.circuit.getNetlist();
	map.currentCause = null;
	for (const p of points) {
		const e = map.get(p);
		map.currentCause = map.causes.get(p) ?? null;
		const bundle = netlist.getBundleAt(p);
		if (e === null || bundle === undefined) continue;
		for (const p2 of bundle.points) {
			if (p2 === p) continue;
			const old = map.get(p2);
			if (old !== null && map.currentCause !== (map.causes.get(p2) ?? null) && !equals(old, e)) {
				throw new AnalyzeError(t("analyze.conflictError"));
			}
			map.put(p2, e);
		}
	}
}

/** Analyze.computeExpression: sets the model's variables and expressions. */
export function computeExpression(
	model: AnalyzerModel,
	circuit: Circuit,
	pinNames: readonly { pin: Instance; label: string }[],
): void {
	const map = new ExpressionMap(circuit);
	const inputNames: string[] = [];
	const outputNames: string[] = [];
	const outputPins: Instance[] = [];
	for (const { pin, label } of pinNames) {
		if (isInputPin(pin)) {
			map.currentCause = pin;
			map.put(pin.loc, variable(label));
			inputNames.push(label);
		} else {
			outputPins.push(pin);
			outputNames.push(label);
		}
	}

	propagateComponents(map, circuit.components);
	for (let iterations = 0; map.dirtyPoints.size > 0; iterations++) {
		if (iterations > MAX_ITERATIONS) throw new AnalyzeError(t("analyze.circularError"));
		propagateWires(map, Array.from(map.dirtyPoints));

		const dirtyComponents = new Set<Instance>();
		for (const p of map.dirtyPoints) for (const comp of circuit.getNonWiresAt(p)) dirtyComponents.add(comp);
		map.dirtyPoints.clear();
		propagateComponents(map, dirtyComponents);

		// Java's isCircular can never hold for immutable trees; what can
		// happen is a loop whose expression doubles on every pass
		for (const p of map.dirtyPoints) {
			if ((map.get(p)?.size ?? 0) > MAX_EXPRESSION_SIZE) throw new AnalyzeError(t("analyze.circularError"));
		}
	}

	model.setVariables(inputNames, outputNames);
	outputPins.forEach((pin, i) => {
		model.outputExpressions.setExpression(outputNames[i], map.get(pin.loc));
	});
}

/** Analyze.computeTable: simulates every input combination. */
export function computeTable(
	model: AnalyzerModel,
	project: Project,
	circuit: Circuit,
	pinNames: readonly { pin: Instance; label: string }[],
): void {
	const inputs = pinNames.filter((p) => isInputPin(p.pin));
	const outputs = pinNames.filter((p) => !isInputPin(p.pin));
	const rowCount = 1 << inputs.length;
	const columns = outputs.map(() => new Array<Entry>(rowCount));
	for (let i = 0; i < rowCount; i++) {
		const state = CircuitState.createRoot({ options: project.options }, circuit);
		try {
			inputs.forEach(({ pin }, j) => {
				const pinState = new InstanceStateImpl(state, pin);
				PIN.setValue(pinState, isInputSet(i, j, inputs.length) ? Value.TRUE : Value.FALSE);
				pinState.fireInvalidated();
			});
			const prop = state.getPropagator();
			prop.propagate();
			outputs.forEach(({ pin }, j) => {
				if (prop.isOscillating()) {
					columns[j][i] = OSCILLATE_ERROR;
					return;
				}
				const out = PIN.getValue(new InstanceStateImpl(state, pin)).get(0);
				columns[j][i] =
					out === Value.TRUE ? ONE : out === Value.FALSE ? ZERO : out === Value.ERROR ? BUS_ERROR : DONT_CARE;
			});
		} finally {
			state.dispose();
		}
	}
	model.setVariables(
		inputs.map((p) => p.label),
		outputs.map((p) => p.label),
	);
	columns.forEach((column, i) => {
		model.truthTable.setOutputColumn(i, column);
	});
}

export type AnalyzerTab = "inputs" | "outputs" | "table" | "expression" | "minimized";

export type AnalyzeResult =
	| { ok: false; error: string }
	| { ok: true; tab: AnalyzerTab; notice: string | null };

/** ProjectCircuitActions.doAnalyze + configureAnalyzer. */
export function analyzeCircuit(model: AnalyzerModel, project: Project, circuit: Circuit): AnalyzeResult {
	const pinNames = getPinLabels(circuit);
	const inputNames: string[] = [];
	const outputNames: string[] = [];
	for (const { pin, label } of pinNames) {
		const input = isInputPin(pin);
		(input ? inputNames : outputNames).push(label);
		if ((pin.attrs.getByName("width") as number) > 1) {
			return { ok: false, error: t(input ? "analyze.multibitInputError" : "analyze.multibitOutputError") };
		}
	}
	if (inputNames.length > MAX_INPUTS)
		return { ok: false, error: t("analyze.tooManyInputsError", [MAX_INPUTS]) };
	if (outputNames.length > MAX_OUTPUTS)
		return { ok: false, error: t("analyze.tooManyOutputsError", [MAX_OUTPUTS]) };

	model.currentCircuit = circuit;
	model.setVariables(inputNames, outputNames);
	// with no inputs or no outputs, stop with that tab selected
	if (inputNames.length === 0) return { ok: true, tab: "inputs", notice: null };
	if (outputNames.length === 0) return { ok: true, tab: "outputs", notice: null };

	// attempt to show the corresponding expression
	let notice: string;
	try {
		computeExpression(model, circuit, pinNames);
		return { ok: true, tab: "expression", notice: null };
	} catch (e) {
		if (!(e instanceof AnalyzeError)) throw e;
		notice = e.message;
	}
	// as a backup measure, compute a truth table
	computeTable(model, project, circuit, pinNames);
	return { ok: true, tab: "table", notice };
}
