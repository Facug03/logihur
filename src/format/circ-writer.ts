// Port of com.cburch.logisim.file.XmlWriter: produces files Logisim 2.7.1
// reads (and that look like the ones it writes).

import { findLibrary } from "@/components/libraries";
import { PlaceholderFactory } from "@/components/placeholder";
import { SubcircuitFactory } from "@/components/subcircuit";
import { type AnyAttribute, attrEquals } from "@/engine/attributes";
import { CIRCUIT_STATIC_ATTRS, type Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import { formatLoc } from "@/engine/geom";
import type { LibraryRef, Project } from "@/project/project";
import { el, serializeXml, type XmlElement, type XmlNode } from "./xml";

export const LOGISIM_VERSION = "2.7.1";

function attrElement(name: string, value: string): XmlElement {
	if (value.includes("\n")) return el("a", { name }, [value]);
	return el("a", { name, val: value });
}

/** XmlWriter.addAttributeSetContent for a component. */
function componentAttributes(comp: Instance): XmlElement[] {
	const factory = comp.factory;
	const out: XmlElement[] = [];
	for (const attr of factory.getAttributes(comp.attrs) as AnyAttribute[]) {
		if (!factory.isToSave(attr)) continue;
		const val = comp.attrs.get(attr);
		if (val === undefined || val === null) continue;
		const dflt = factory.getDefaultValue(attr, LOGISIM_VERSION);
		if (dflt === null || dflt === undefined || !attrEquals(attr, dflt, val)) {
			out.push(attrElement(attr.name, attr.format(val)));
		}
	}
	return out;
}

function ensureLibrary(project: Project, desc: string): LibraryRef {
	let lib = project.libraries.find((l) => l.desc === desc);
	if (!lib) {
		let n = project.libraries.length;
		while (project.libraries.some((l) => l.name === `${n}`)) n++;
		lib = { name: `${n}`, desc, tools: [] };
		project.libraries.push(lib);
	}
	return lib;
}

function circuitElement(project: Project, circuit: Circuit): XmlElement {
	const children: XmlNode[] = [];
	for (const attr of CIRCUIT_STATIC_ATTRS) {
		const a = attr as AnyAttribute;
		children.push(attrElement(a.name, a.format(circuit.staticAttrs.get(a))));
	}
	if (!circuit.appearance.isDefault() && circuit.appearance.customXml) {
		children.push(el("appear", {}, circuit.appearance.customXml));
	}
	for (const w of circuit.wires.values()) {
		children.push(el("wire", { from: formatLoc(w.e0), to: formatLoc(w.e1) }));
	}
	for (const comp of circuit.components) {
		const factory = comp.factory;
		const attrs: Record<string, string> = {};
		if (factory instanceof SubcircuitFactory) {
			// component from the file itself: no lib attribute
		} else {
			attrs.lib = ensureLibrary(project, factory.library).name;
		}
		attrs.loc = formatLoc(comp.loc);
		attrs.name = factory.name;
		const content =
			factory instanceof PlaceholderFactory
				? Array.from(comp.attrs.entries()).map(([k, v]) => attrElement(k, String(v)))
				: componentAttributes(comp);
		children.push(el("comp", attrs, content));
	}
	return el("circuit", { name: circuit.name }, children);
}

export function projectToXml(project: Project): XmlElement {
	// make sure every library used by a component is declared
	for (const c of project.circuits) {
		for (const comp of c.components) {
			if (!(comp.factory instanceof SubcircuitFactory) && findLibrary(comp.factory.library)) {
				ensureLibrary(project, comp.factory.library);
			}
		}
	}

	const children: XmlNode[] = [
		"\nThis file is intended to be loaded by Logisim (http://www.cburch.com/logisim/).\n",
	];
	for (const lib of project.libraries) {
		children.push(el("lib", { desc: lib.desc, name: lib.name }, lib.tools));
	}
	if (project.mainCircuit) children.push(el("main", { name: project.mainCircuit.name }));
	children.push(
		el("options", {}, [
			attrElement("gateUndefined", project.options.gateUndefined),
			attrElement("simlimit", `${project.options.simLimit}`),
			attrElement("simrand", `${project.options.simRandom}`),
		]),
	);
	children.push(project.mappings);
	children.push(project.toolbar);
	const circuitElts = project.circuits.map((c) => circuitElement(project, c));
	children.push(...circuitElts);
	return el("project", { source: LOGISIM_VERSION, version: "1.0" }, children);
}

export function writeCirc(project: Project): string {
	return serializeXml(projectToXml(project));
}
