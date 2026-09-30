// Port of com.cburch.logisim.file.{XmlReader, XmlCircuitReader}.

import { findFactory, findLibrary } from "@/components/libraries";
import { PlaceholderFactory } from "@/components/placeholder";
import type { AnyAttribute, AttributeSet } from "@/engine/attributes";
import { CIRCUIT_STATIC_ATTRS, Circuit } from "@/engine/circuit";
import { type ComponentFactory, Instance } from "@/engine/component";
import { type Loc, parseLoc } from "@/engine/geom";
import { compareVersion } from "@/engine/version";
import { Wire } from "@/engine/wire";
import { type LibraryRef, Project } from "@/project/project";
import { childElements, getAttr, hasAttr, parseXml, setAttr, textContent, type XmlElement } from "./xml";

export class CircReadError extends Error {}

/** Collect <a name=".." val=".."/> children (val attribute or text content). */
function readAttrElements(parent: XmlElement, messages: string[]): Map<string, string> {
	const defined = new Map<string, string>();
	for (const a of childElements(parent, "a")) {
		if (!hasAttr(a, "name")) {
			messages.push("attribute name missing");
			continue;
		}
		defined.set(getAttr(a, "name"), hasAttr(a, "val") ? getAttr(a, "val") : textContent(a));
	}
	return defined;
}

/**
 * ReadContext.initAttributeSet: walk the factory's attribute list in order,
 * re-fetching it each step (it can grow, e.g. splitter bits and gate
 * negations), parsing defined values and setting defaults for missing ones.
 */
export function initAttributeSet(
	factory: ComponentFactory,
	attrs: AttributeSet,
	defined: Map<string, string>,
	sourceVersion: string,
	messages: string[],
	context: string,
): void {
	for (let i = 0; ; i++) {
		const list: AnyAttribute[] = factory.getAttributes(attrs);
		if (i >= list.length) break;
		const attr = list[i];
		if (!factory.isToSave(attr)) continue;
		const raw = defined.get(attr.name);
		if (raw === undefined) {
			const dflt = factory.getDefaultValue(attr, sourceVersion);
			if (dflt !== null && dflt !== undefined) factory.setAttribute(attrs, attr, dflt);
		} else {
			try {
				factory.setAttribute(attrs, attr, attr.parse(raw));
			} catch {
				messages.push(`${context}: invalid value "${raw}" for ${attr.name}`);
			}
		}
	}
}

/** XmlReader.considerRepairs for files from before Logisim 2.6.3. */
function considerRepairs(root: XmlElement): void {
	const version = getAttr(root, "source") || "2.7.1";
	if (compareVersion(version, "2.3.0") < 0) {
		for (const toolbar of childElements(root, "toolbar")) {
			const tools = childElements(toolbar, "tool");
			const select = tools.find((t) => getAttr(t, "name") === "Select Tool");
			const wiring = tools.find((t) => getAttr(t, "name") === "Wiring Tool");
			const edit = tools.find((t) => getAttr(t, "name") === "Edit Tool");
			if (select && wiring && !edit) {
				setAttr(select, "name", "Edit Tool");
				toolbar.children = toolbar.children.filter((c) => c !== wiring);
			}
		}
	}
	if (compareVersion(version, "2.6.3") < 0) {
		for (const circ of childElements(root, "circuit")) {
			for (const a of childElements(circ, "a")) {
				const name = getAttr(a, "name");
				if (name.startsWith("label")) setAttr(a, "name", `c${name}`);
			}
		}
		repairForWiringLibrary(root);
		repairForLegacyLibrary(root);
	}
}

function descendants(e: XmlElement, tag: string, out: XmlElement[] = []): XmlElement[] {
	for (const c of childElements(e)) {
		if (c.tag === tag) out.push(c);
		descendants(c, tag, out);
	}
	return out;
}

function repairForWiringLibrary(root: XmlElement): void {
	let oldBase: XmlElement | null = null;
	let oldBaseLabel: string | null = null;
	let gates: XmlElement | null = null;
	let gatesLabel: string | null = null;
	let maxLabel = -1;
	let lastLib: XmlElement | null = null;
	for (const lib of childElements(root, "lib")) {
		const desc = getAttr(lib, "desc");
		const label = getAttr(lib, "name");
		if (desc === "#Base") {
			oldBase = lib;
			oldBaseLabel = label;
		} else if (desc === "#Wiring") {
			return;
		} else if (desc === "#Gates") {
			gates = lib;
			gatesLabel = label;
		}
		lastLib = lib;
		const n = Number.parseInt(label, 10);
		if (!Number.isNaN(n) && n > maxLabel) maxLabel = n;
	}
	const insertAfter = (node: XmlElement) => {
		const idx = lastLib ? root.children.indexOf(lastLib) + 1 : 0;
		root.children.splice(idx, 0, node);
	};
	let wiring: XmlElement;
	let wiringLabel: string;
	let newBase: XmlElement | null = null;
	let newBaseLabel: string | null = null;
	if (oldBase !== null) {
		wiringLabel = oldBaseLabel as string;
		wiring = oldBase;
		setAttr(wiring, "desc", "#Wiring");
		newBaseLabel = `${maxLabel + 1}`;
		newBase = {
			tag: "lib",
			attrs: { desc: "#Base", name: newBaseLabel },
			attrOrder: ["desc", "name"],
			children: [],
		};
		insertAfter(newBase);
	} else {
		wiringLabel = `${maxLabel + 1}`;
		wiring = {
			tag: "lib",
			attrs: { desc: "#Wiring", name: wiringLabel },
			attrOrder: ["desc", "name"],
			children: [],
		};
		insertAfter(wiring);
	}
	const labelMap = new Map<string, string>();
	const addToMap = (src: string | null, dst: string | null, names: string) => {
		if (src !== null && dst !== null) for (const t of names.split(";")) labelMap.set(`${src}:${t}`, dst);
	};
	addToMap(
		oldBaseLabel,
		newBaseLabel,
		"Poke Tool;Edit Tool;Select Tool;Wiring Tool;Text Tool;Menu Tool;Text",
	);
	addToMap(oldBaseLabel, wiringLabel, "Splitter;Pin;Probe;Tunnel;Clock;Pull Resistor;Bit Extender");
	addToMap(gatesLabel, wiringLabel, "Constant");
	const relocate = (src: XmlElement | null, dest: XmlElement | null) => {
		if (src === null || src === dest) return;
		const srcLabel = getAttr(src, "name");
		const toMove = childElements(src, "tool").filter((t) =>
			labelMap.has(`${srcLabel}:${getAttr(t, "name")}`),
		);
		src.children = src.children.filter((c) => !toMove.includes(c as XmlElement));
		if (dest) dest.children.push(...toMove);
	};
	relocate(oldBase, newBase);
	relocate(oldBase, wiring);
	relocate(gates, wiring);
	for (const e of [...descendants(root, "comp"), ...descendants(root, "tool")]) {
		const newLib = labelMap.get(`${getAttr(e, "lib")}:${getAttr(e, "name")}`);
		if (newLib !== undefined) setAttr(e, "lib", newLib);
	}
}

function repairForLegacyLibrary(root: XmlElement): void {
	const legacy = childElements(root, "lib").find((l) => getAttr(l, "desc") === "#Legacy");
	if (!legacy) return;
	const label = getAttr(legacy, "name");
	root.children = root.children.filter((c) => c !== legacy);
	const remove = (parent: XmlElement): boolean => {
		let removedComp = false;
		parent.children = parent.children.filter((c) => {
			if (typeof c === "string") return true;
			if ((c.tag === "comp" || c.tag === "tool") && getAttr(c, "lib") === label) {
				if (c.tag === "comp") removedComp = true;
				return false;
			}
			if (remove(c)) removedComp = true;
			return true;
		});
		return removedComp;
	};
	if (remove(root)) {
		root.children.push({
			tag: "message",
			attrs: { value: "Some components have been deleted; the Legacy library is no longer supported." },
			attrOrder: ["value"],
			children: [],
		});
	}
}

export interface ReadResult {
	project: Project;
	messages: string[];
}

export function readCirc(source: string): Project {
	let root: XmlElement;
	try {
		root = parseXml(source);
	} catch (e) {
		throw new CircReadError(`El archivo no es XML válido: ${(e as Error).message}`);
	}
	if (root.tag !== "project") throw new CircReadError("El archivo no es un proyecto de Logisim");
	considerRepairs(root);

	const project = new Project();
	const messages = project.messages;
	const sourceVersion = getAttr(root, "source") || "2.7.1";
	project.sourceVersion = sourceVersion;

	// first, the libraries
	project.libraries = [];
	const libsByName = new Map<string, LibraryRef>();
	for (const libElt of childElements(root, "lib")) {
		if (!hasAttr(libElt, "name") || !hasAttr(libElt, "desc")) {
			messages.push("library name or descriptor missing");
			continue;
		}
		const ref: LibraryRef = {
			name: getAttr(libElt, "name"),
			desc: getAttr(libElt, "desc"),
			tools: childElements(libElt, "tool"),
		};
		if (!ref.desc.startsWith("#")) {
			messages.push(`Librería externa no soportada todavía: ${ref.desc}`);
		} else if (!findLibrary(ref.desc)) {
			messages.push(`Librería desconocida: ${ref.desc}`);
		}
		project.libraries.push(ref);
		libsByName.set(ref.name, ref);
	}

	// second, create the circuits - empty for now
	const circuitElts = childElements(root, "circuit");
	for (const circElt of circuitElts) {
		const name = getAttr(circElt, "name");
		if (!name) messages.push("circuit name missing");
		project.addCircuit(new Circuit(name));
	}
	project.mainCircuit = null;

	// third, the other elements
	for (const sub of childElements(root)) {
		switch (sub.tag) {
			case "options": {
				const defined = readAttrElements(sub, messages);
				const gu = defined.get("gateUndefined");
				if (gu === "error" || gu === "ignore") project.options.gateUndefined = gu;
				const limit = Number.parseInt(defined.get("simlimit") ?? "", 10);
				if (!Number.isNaN(limit)) project.options.simLimit = limit;
				const rand = Number.parseInt(defined.get("simrand") ?? "", 10);
				if (!Number.isNaN(rand)) project.options.simRandom = rand;
				break;
			}
			case "mappings":
				project.mappings = sub;
				break;
			case "toolbar":
				project.toolbar = sub;
				break;
			case "main": {
				const circ = project.getCircuit(getAttr(sub, "name"));
				if (circ) project.mainCircuit = circ;
				break;
			}
			case "message":
				messages.push(getAttr(sub, "value"));
				break;
		}
	}
	if (project.mainCircuit === null) project.mainCircuit = project.circuits[0] ?? null;

	// fourth, build the circuits
	circuitElts.forEach((circElt, index) => {
		const circuit = project.circuits[index];
		buildCircuit(project, circuit, circElt, libsByName, sourceVersion, messages);
	});

	if (project.circuits.length === 0) {
		const main = new Circuit("main");
		project.addCircuit(main);
		project.mainCircuit = main;
	}
	return project;
}

function resolveFactory(
	project: Project,
	compElt: XmlElement,
	libsByName: Map<string, LibraryRef>,
): ComponentFactory | null {
	const name = getAttr(compElt, "name");
	const libName = getAttr(compElt, "lib");
	if (libName === "") {
		const circ = project.getCircuit(name);
		return circ ? project.getSubcircuitFactory(circ) : null;
	}
	const lib = libsByName.get(libName);
	if (!lib) return null;
	return findFactory(lib.desc, name) ?? new PlaceholderFactory(name, lib.desc);
}

function buildCircuit(
	project: Project,
	circuit: Circuit,
	circElt: XmlElement,
	libsByName: Map<string, LibraryRef>,
	sourceVersion: string,
	messages: string[],
): void {
	// static attributes (circuit name, shared label)
	const staticDefined = readAttrElements(circElt, messages);
	for (const attr of CIRCUIT_STATIC_ATTRS) {
		const raw = staticDefined.get(attr.name);
		if (raw === undefined) continue;
		try {
			circuit.staticAttrs.set(attr as AnyAttribute, attr.parse(raw));
		} catch {
			messages.push(`${circuit.name}: invalid value "${raw}" for ${attr.name}`);
		}
	}
	// The circuit name always comes from the element.
	circuit.staticAttrs.set(CIRCUIT_STATIC_ATTRS[0], getAttr(circElt, "name"));

	for (const sub of childElements(circElt)) {
		if (sub.tag === "comp") {
			const context = `${circuit.name}.${getAttr(sub, "name")}${getAttr(sub, "loc")}`;
			const factory = resolveFactory(project, sub, libsByName);
			if (!factory) {
				messages.push(`${context}: componente desconocido`);
				continue;
			}
			const locStr = getAttr(sub, "loc");
			let l: Loc;
			try {
				l = parseLoc(locStr);
			} catch {
				messages.push(`${context}: ubicación inválida`);
				continue;
			}
			const attrs = factory.createAttributeSet();
			const defined = readAttrElements(sub, messages);
			if (factory instanceof PlaceholderFactory) {
				for (const [k, v] of defined) attrs.set(factory.rawAttribute(k), v);
			} else {
				initAttributeSet(factory, attrs, defined, sourceVersion, messages, context);
			}
			circuit.addComponent(new Instance(factory, l, attrs));
		} else if (sub.tag === "wire") {
			try {
				const w = Wire.create(parseLoc(getAttr(sub, "from")), parseLoc(getAttr(sub, "to")));
				circuit.addWire(w);
			} catch {
				messages.push(`${circuit.name}: cable inválido`);
			}
		}
	}

	const appear = childElements(circElt, "appear");
	if (appear.length > 0) {
		const shapes = appear.flatMap((a) => childElements(a));
		if (shapes.length > 0) circuit.appearance.setCustom(shapes);
	}
}
