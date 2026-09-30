// A Logisim project (LogisimFile + Options): circuits, referenced libraries,
// simulation options, and the file sections we keep verbatim for fidelity.

import { SubcircuitFactory } from "@/components/subcircuit";
import { Circuit, type CircuitEvent } from "@/engine/circuit";
import type { ProjectOptions } from "@/engine/component";
import { DEFAULT_OPTIONS } from "@/engine/simulation";
import { el, type XmlElement } from "@/format/xml";

export interface LibraryRef {
	/** Name used in the file ("0", "1", ...). */
	name: string;
	/** Descriptor ("#Gates", "file#other.circ", ...). */
	desc: string;
	/** Raw <tool> children with customized tool attributes. */
	tools: XmlElement[];
}

export const DEFAULT_LIBRARIES: LibraryRef[] = [
	{ name: "0", desc: "#Wiring", tools: [] },
	{ name: "1", desc: "#Gates", tools: [] },
	{ name: "2", desc: "#Plexers", tools: [] },
	{ name: "3", desc: "#Arithmetic", tools: [] },
	{ name: "4", desc: "#Memory", tools: [] },
	{ name: "5", desc: "#I/O", tools: [] },
	{
		name: "6",
		desc: "#Base",
		tools: [
			el("tool", { name: "Text Tool" }, [
				el("a", { name: "text", val: "" }),
				el("a", { name: "font", val: "SansSerif plain 12" }),
				el("a", { name: "halign", val: "center" }),
				el("a", { name: "valign", val: "base" }),
			]),
		],
	},
];

function defaultMappings(): XmlElement {
	return el("mappings", {}, [
		el("tool", { lib: "6", map: "Button2", name: "Menu Tool" }),
		el("tool", { lib: "6", map: "Button3", name: "Menu Tool" }),
		el("tool", { lib: "6", map: "Ctrl Button1", name: "Menu Tool" }),
	]);
}

function defaultToolbar(): XmlElement {
	return el("toolbar", {}, [
		el("tool", { lib: "6", name: "Poke Tool" }),
		el("tool", { lib: "6", name: "Edit Tool" }),
		el("tool", { lib: "6", name: "Text Tool" }, [
			el("a", { name: "text", val: "" }),
			el("a", { name: "font", val: "SansSerif plain 12" }),
			el("a", { name: "halign", val: "center" }),
			el("a", { name: "valign", val: "base" }),
		]),
		el("sep"),
		el("tool", { lib: "0", name: "Pin" }, [el("a", { name: "tristate", val: "false" })]),
		el("tool", { lib: "0", name: "Pin" }, [
			el("a", { name: "facing", val: "west" }),
			el("a", { name: "output", val: "true" }),
			el("a", { name: "labelloc", val: "east" }),
		]),
		el("tool", { lib: "1", name: "NOT Gate" }),
		el("tool", { lib: "1", name: "AND Gate" }),
		el("tool", { lib: "1", name: "OR Gate" }),
	]);
}

export class Project {
	readonly circuits: Circuit[] = [];
	mainCircuit: Circuit | null = null;
	options: ProjectOptions = { ...DEFAULT_OPTIONS };
	libraries: LibraryRef[] = DEFAULT_LIBRARIES.map((l) => ({ ...l, tools: [...l.tools] }));
	mappings: XmlElement = defaultMappings();
	toolbar: XmlElement = defaultToolbar();
	/** Warnings produced while loading. */
	messages: string[] = [];
	sourceVersion = "2.7.1";

	private readonly factories = new Map<Circuit, SubcircuitFactory>();
	private readonly revisions = new Map<Circuit, number>();
	private readonly listeners = new Map<Circuit, (e: CircuitEvent) => void>();

	static createEmpty(): Project {
		const p = new Project();
		const main = new Circuit("main");
		p.addCircuit(main);
		p.mainCircuit = main;
		return p;
	}

	getSubcircuitFactory(c: Circuit): SubcircuitFactory {
		let f = this.factories.get(c);
		if (!f) {
			f = new SubcircuitFactory(c);
			this.factories.set(c, f);
		}
		return f;
	}

	getCircuit(name: string): Circuit | undefined {
		return this.circuits.find((c) => c.name === name);
	}

	addCircuit(c: Circuit, index = this.circuits.length): void {
		this.circuits.splice(index, 0, c);
		this.revisions.set(c, c.appearance.revision);
		const listener = () => this.circuitChanged(c);
		this.listeners.set(c, listener);
		c.addListener(listener);
		if (this.mainCircuit === null) this.mainCircuit = c;
	}

	removeCircuit(c: Circuit): void {
		const i = this.circuits.indexOf(c);
		if (i < 0) return;
		this.circuits.splice(i, 1);
		const l = this.listeners.get(c);
		if (l) c.removeListener(l);
		this.listeners.delete(c);
		if (this.mainCircuit === c) this.mainCircuit = this.circuits[0] ?? null;
	}

	/** Circuits (other than c) that contain c as a subcircuit. */
	getUsers(c: Circuit): Circuit[] {
		const f = this.factories.get(c);
		if (!f) return [];
		return this.circuits.filter((other) => {
			for (const comp of other.components) if (comp.factory === f) return true;
			return false;
		});
	}

	/** Whether placing `inner` inside `outer` would create a cycle. */
	wouldCreateCycle(outer: Circuit, inner: Circuit): boolean {
		if (outer === inner) return true;
		const seen = new Set<Circuit>();
		const visit = (c: Circuit): boolean => {
			if (c === outer) return true;
			if (seen.has(c)) return false;
			seen.add(c);
			for (const comp of c.components) {
				if (comp.factory instanceof SubcircuitFactory && visit(comp.factory.source)) return true;
			}
			return false;
		};
		return visit(inner);
	}

	/** Propagate port changes of a subcircuit to the circuits using it. */
	private circuitChanged(c: Circuit): void {
		const rev = c.appearance.revision;
		if (this.revisions.get(c) === rev) return;
		this.revisions.set(c, rev);
		const f = this.factories.get(c);
		if (!f) return;
		for (const user of this.circuits) {
			for (const comp of Array.from(user.components)) {
				if (comp.factory === f) user.componentChanged(comp);
			}
		}
	}
}
