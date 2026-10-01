// Port of com.cburch.logisim.file.FileStatistics (Proyecto > Obtener
// estadísticas del circuito): component counts of a circuit, directly
// (simple), across the distinct circuits it uses (unique) and expanding every
// subcircuit instance (recursive).

import { LIBRARIES } from "@/components/libraries";
import { SubcircuitFactory } from "@/components/subcircuit";
import type { Circuit } from "@/engine/circuit";
import type { ComponentFactory } from "@/engine/component";
import type { Project } from "./project";

export interface ComponentCount {
	factory: ComponentFactory | null;
	/** i18n key of a built-in library, or a file name. */
	library: string;
	simple: number;
	unique: number;
	recursive: number;
}

export interface CircuitStatistics {
	counts: ComponentCount[];
	totalWithoutSubcircuits: ComponentCount;
	totalWithSubcircuits: ComponentCount;
}

type Counts = Map<ComponentFactory, ComponentCount>;

function count(factory: ComponentFactory | null): ComponentCount {
	return { factory, library: "", simple: 0, unique: 0, recursive: 0 };
}

function simpleCount(circuit: Circuit): Counts {
	const counts: Counts = new Map();
	for (const comp of circuit.components) {
		let c = counts.get(comp.factory);
		if (!c) {
			c = count(comp.factory);
			counts.set(comp.factory, c);
		}
		c.simple++;
	}
	return counts;
}

function recursiveCount(project: Project, circuit: Circuit, countMap: Map<Circuit, Counts>): Counts {
	const known = countMap.get(circuit);
	if (known) return known;
	const counts = simpleCount(circuit);
	countMap.set(circuit, counts);
	for (const c of counts.values()) {
		c.unique = c.simple;
		c.recursive = c.simple;
	}
	// only the project's own circuits are expanded, as in Logisim
	for (const sub of project.circuits) {
		const multiplier = counts.get(project.getSubcircuitFactory(sub))?.simple;
		if (multiplier === undefined) continue;
		for (const subcount of recursiveCount(project, sub, countMap).values()) {
			let supercount = counts.get(subcount.factory as ComponentFactory);
			if (!supercount) {
				supercount = count(subcount.factory);
				counts.set(subcount.factory as ComponentFactory, supercount);
			}
			supercount.recursive += multiplier * subcount.recursive;
		}
	}
	return counts;
}

function total(counts: ComponentCount[], exclude: readonly Circuit[] | null): ComponentCount {
	const ret = count(null);
	for (const c of counts) {
		const circ = c.factory instanceof SubcircuitFactory ? c.factory.source : null;
		if (exclude === null || circ === null || !exclude.includes(circ)) {
			ret.simple += c.simple;
			ret.unique += c.unique;
			ret.recursive += c.recursive;
		}
	}
	return ret;
}

export function computeStatistics(
	project: Project,
	circuit: Circuit,
	projectName: string,
): CircuitStatistics {
	const countMap = new Map<Circuit, Counts>();
	const counts = recursiveCount(project, circuit, countMap);
	for (const c of counts.values()) {
		let unique = 0;
		for (const other of countMap.values()) unique += other.get(c.factory as ComponentFactory)?.simple ?? 0;
		c.unique = unique;
	}

	// sorted like the tools: the project's circuits, then each library's tools
	const sorted: ComponentCount[] = [];
	const take = (factory: ComponentFactory, library: string) => {
		const c = counts.get(factory);
		if (c && !sorted.includes(c)) {
			c.library = library;
			sorted.push(c);
		}
	};
	for (const c of project.circuits) take(project.getSubcircuitFactory(c), projectName);
	for (const ref of project.libraries) {
		const loaded = project.loadedLibraries.get(ref.desc);
		if (loaded) for (const c of loaded.circuits) take(loaded.getFactory(c), loaded.fileName);
		const lib = LIBRARIES.find((l) => l.desc === ref.desc);
		if (lib) for (const f of lib.factories) take(f, lib.displayKey);
	}
	// anything else (e.g. placeholders of missing libraries) at the end
	for (const [factory] of counts) take(factory, factory.library);

	return {
		counts: sorted,
		totalWithoutSubcircuits: total(sorted, project.circuits),
		totalWithSubcircuits: total(sorted, null),
	};
}
