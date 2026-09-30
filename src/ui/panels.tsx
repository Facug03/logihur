"use client";

import { ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { LIBRARIES } from "@/components/libraries";
import { loadImage, type MemContents } from "@/components/memory/mem-contents";
import { SubcircuitFactory } from "@/components/subcircuit";
import type { AnyAttribute, Font, FontStyle } from "@/engine/attributes";
import { CIRCUIT_STATIC_ATTRS, type Circuit } from "@/engine/circuit";
import type { ComponentFactory, Instance } from "@/engine/component";
import { prefs } from "@/engine/prefs";
import { t } from "@/i18n/es";
import { downloadMemory, HexEditor, memoryImageError } from "./HexEditor";
import { Disclosure } from "./PanelControls";
import { usePreference } from "./preferences";
import type { Workspace } from "./workspace";

export function iconFor(factory: ComponentFactory, output?: boolean): string {
	if (factory instanceof SubcircuitFactory) return "subcirc.gif";
	if (factory.name === "Pin" && output) return "pinOutput.gif";
	const icon = factory.iconName ?? "subcirc.gif";
	if (prefs.gateShape === "rectangular") {
		const rect = icon.replace(/Gate\.gif$/, "GateRect.gif");
		if (rect !== icon && RECT_ICONS.has(rect)) return rect;
	}
	return icon;
}

const RECT_ICONS = new Set([
	"andGateRect.gif",
	"nandGateRect.gif",
	"norGateRect.gif",
	"notGateRect.gif",
	"orGateRect.gif",
	"xnorGateRect.gif",
	"xorGateRect.gif",
]);

/** A 16×16 Logisim icon, scaled without smoothing like the original. */
export function LogisimIcon({
	name,
	size = 16,
	className = "",
}: {
	name: string;
	size?: number;
	className?: string;
}) {
	return (
		// biome-ignore lint/performance/noImgElement: tiny static GIFs, next/image adds nothing
		<img
			src={`/icons/${name}`}
			width={size}
			height={size}
			alt=""
			draggable={false}
			className={`shrink-0 ${className}`}
			style={{ imageRendering: "pixelated" }}
		/>
	);
}

export function componentName(inst: Instance | { factory: ComponentFactory }): string {
	const f = inst.factory;
	if (f instanceof SubcircuitFactory) return f.name;
	return f.displayKey ? t(f.displayKey) : f.name;
}

function attrLabel(attr: AnyAttribute): string {
	return t(attr.label, attr.labelArgs);
}

// --- circuits ---------------------------------------------------------------

export function CircuitsPanel({ ws }: { ws: Workspace }) {
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const tool = ws.tool;
	return (
		<section className="flex flex-col gap-0.5 p-3">
			<Disclosure id="circuits" title="Circuitos">
				<div className="flex items-center justify-end px-1 pb-1">
					<button
						type="button"
						title="Agregar circuito"
						aria-label="Agregar circuito"
						onClick={() => {
							setAdding(true);
							setName(`circuito${ws.project.circuits.length + 1}`);
						}}
						className="ml-auto rounded p-1 hover:bg-black/5"
					>
						<Plus className="size-3.5" />
					</button>
				</div>
				{adding && (
					<form
						className="mb-1 flex gap-1"
						onSubmit={(e) => {
							e.preventDefault();
							ws.addCircuit(name);
							setAdding(false);
						}}
					>
						<input
							// biome-ignore lint/a11y/noAutofocus: inline creation field
							autoFocus
							value={name}
							onChange={(e) => setName(e.target.value)}
							onBlur={() => setAdding(false)}
							onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
							className="min-w-0 flex-1 rounded-md border border-accent px-2 py-1 text-sm outline-none"
						/>
					</form>
				)}
				{ws.project.circuits.map((c) => {
					const active = c === ws.circuit;
					const isMain = c === ws.project.mainCircuit;
					const factory = ws.project.getSubcircuitFactory(c);
					const toolActive = tool.kind === "add" && tool.factory === factory;
					const canInsert = !ws.project.wouldCreateCycle(ws.viewCircuit, c);
					return (
						<div
							key={c.id}
							className={`group flex items-center gap-1 rounded-md pr-1 ${active ? "bg-accent/10" : "hover:bg-black/5"}`}
						>
							<button
								type="button"
								title={
									canInsert
										? `Agregar ${c.name} como subcircuito`
										: "No se puede agregar un circuito dentro de sí mismo"
								}
								disabled={!canInsert}
								onClick={() => ws.selectAddTool(factory)}
								className={`rounded p-1.5 disabled:opacity-30 ${toolActive ? "bg-accent/20" : "hover:bg-black/10"}`}
							>
								<LogisimIcon name="subcirc.gif" />
							</button>
							<button
								type="button"
								onClick={() => ws.setCircuit(c)}
								className={`min-w-0 flex-1 truncate py-1.5 text-left text-sm ${active ? "font-medium text-accent" : ""}`}
							>
								{c.name}
							</button>
							<button
								type="button"
								title={isMain ? "Circuito principal" : "Usar como circuito principal"}
								onClick={() => ws.setMainCircuit(c)}
								className={`rounded p-1 ${isMain ? "text-amber-500" : "text-muted opacity-0 group-hover:opacity-100"}`}
							>
								<Star className={`size-3.5 ${isMain ? "fill-current" : ""}`} />
							</button>
							<button
								type="button"
								title="Borrar circuito"
								onClick={() => ws.removeCircuit(c)}
								className="rounded p-1 text-muted opacity-0 hover:text-red-600 group-hover:opacity-100"
							>
								<Trash2 className="size-3.5" />
							</button>
						</div>
					);
				})}
			</Disclosure>
		</section>
	);
}

// --- component palette --------------------------------------------------------

export function LibraryPanel({ ws, onPick }: { ws: Workspace; onPick?: () => void }) {
	const tool = ws.tool;
	return (
		<section className="flex flex-col gap-0.5 p-3">
			<Disclosure id="libraries" title="Librerías">
				{LIBRARIES.map((lib) => (
					<LibraryDisclosure key={lib.desc} id={lib.desc}>
						<summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-black/5">
							<ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
							{t(lib.displayKey)}
							{lib.factories.length === 0 && <span className="ml-auto text-[10px] text-muted">pronto</span>}
						</summary>
						<ul className="ml-3 border-l border-line pl-1">
							{lib.factories.map((f) => {
								const active = tool.kind === "add" && tool.id === f.name;
								return (
									<li key={f.name}>
										<button
											type="button"
											title={f.name}
											onClick={() => {
												ws.selectAddTool(f);
												onPick?.();
											}}
											className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] ${
												active ? "bg-accent/15 font-medium text-accent" : "hover:bg-black/5"
											}`}
										>
											<LogisimIcon name={iconFor(f)} />
											{t(f.displayKey)}
										</button>
									</li>
								);
							})}
						</ul>
					</LibraryDisclosure>
				))}
			</Disclosure>
		</section>
	);
}

function LibraryDisclosure({ id, children }: { id: string; children: React.ReactNode }) {
	const [open, setOpen] = usePreference(`library.${id}`, id === "#Gates" || id === "#Wiring");
	return (
		<details className="group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
			{children}
		</details>
	);
}

// --- attribute editor ---------------------------------------------------------

const FONT_FAMILIES = ["SansSerif", "Serif", "Monospaced", "Dialog", "DialogInput"];
const FONT_STYLES: FontStyle[] = ["plain", "bold", "italic", "bolditalic"];
const FONT_STYLE_LABELS: Record<FontStyle, string> = {
	plain: "Normal",
	bold: "Negrita",
	italic: "Cursiva",
	bolditalic: "Negrita cursiva",
};

const inputClass =
	"w-full rounded-md border border-line bg-white px-2 py-1 text-[13px] outline-none focus:border-accent";

function AttrEditor({
	attr,
	value,
	onChange,
}: {
	attr: AnyAttribute;
	value: unknown;
	onChange: (v: unknown) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const [validationError, setValidationError] = useState<string | null>(null);
	const [editingMemory, setEditingMemory] = useState(false);

	if (attr.kind === "memory") {
		return (
			<>
				<button type="button" className={inputClass} onClick={() => setEditingMemory(true)}>
					(click para editar)
				</button>
				{editingMemory && (
					<HexEditor
						contents={value as MemContents}
						onClose={() => setEditingMemory(false)}
						onAccept={(contents) => {
							onChange(contents);
							setEditingMemory(false);
						}}
					/>
				)}
			</>
		);
	}

	if (attr.options && attr.kind !== "int") {
		const idx = attr.options.findIndex((o) => o.value === value);
		return (
			<select
				className={inputClass}
				value={idx}
				onChange={(e) => onChange(attr.options?.[Number(e.target.value)].value)}
			>
				{attr.options.map((o, i) => (
					<option key={String(o.value)} value={i}>
						{t(o.label)}
					</option>
				))}
			</select>
		);
	}
	if (attr.kind === "bitwidth") {
		const min = attr.min ?? 1;
		const max = attr.max ?? 32;
		return (
			<select
				className={inputClass}
				value={value as number}
				onChange={(e) => onChange(Number(e.target.value))}
			>
				{Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
					<option key={n} value={n}>
						{n}
					</option>
				))}
			</select>
		);
	}
	if (attr.name.startsWith("bit") && attr.kind === "int" && attr.label === "splitter.bit") {
		// splitter bit → end; choices are 0 (none) … fanout, filled in by caller via max
		const max = attr.max ?? 32;
		return (
			<select
				className={inputClass}
				value={value as number}
				onChange={(e) => onChange(Number(e.target.value))}
			>
				<option value={0}>Nada</option>
				{Array.from({ length: max }, (_, i) => i + 1).map((n) => (
					<option key={n} value={n}>
						{n - 1}
					</option>
				))}
			</select>
		);
	}
	if (attr.kind === "font") {
		const f = value as Font;
		return (
			<div className="flex flex-col gap-1">
				<select
					className={inputClass}
					value={f.family}
					onChange={(e) => onChange({ ...f, family: e.target.value })}
				>
					{[...new Set([f.family, ...FONT_FAMILIES])].map((fam) => (
						<option key={fam} value={fam}>
							{fam}
						</option>
					))}
				</select>
				<div className="flex gap-1">
					<select
						className={inputClass}
						value={f.style}
						onChange={(e) => onChange({ ...f, style: e.target.value as FontStyle })}
					>
						{FONT_STYLES.map((s) => (
							<option key={s} value={s}>
								{FONT_STYLE_LABELS[s]}
							</option>
						))}
					</select>
					<input
						type="number"
						min={4}
						max={72}
						className={`${inputClass} w-16`}
						value={f.size}
						onChange={(e) => onChange({ ...f, size: Number(e.target.value) || f.size })}
					/>
				</div>
			</div>
		);
	}
	if (attr.kind === "color") {
		const color = String(value);
		const opacity = color.length === 9 ? Number.parseInt(color.slice(7), 16) : 255;
		return (
			<div className="flex items-center gap-2">
				<input
					type="color"
					aria-label={attrLabel(attr)}
					value={color.slice(0, 7)}
					className="h-7 w-8 shrink-0"
					onChange={(e) => onChange(e.target.value + (opacity === 255 ? "" : color.slice(7)))}
				/>
				<label className="flex min-w-0 items-center gap-1 text-xs text-muted">
					<input
						type="number"
						aria-label={`Opacidad de ${attrLabel(attr)} (%)`}
						min={0}
						max={100}
						value={Math.round((opacity * 100) / 255)}
						className={`${inputClass} w-14`}
						onChange={(e) => {
							const alpha = Math.round((Math.max(0, Math.min(100, Number(e.target.value))) * 255) / 100);
							onChange(color.slice(0, 7) + (alpha === 255 ? "" : alpha.toString(16).padStart(2, "0")));
						}}
					/>
					%
				</label>
			</div>
		);
	}
	// text-like: string, int, hex — commit on Enter/blur, validated by parse()
	const text = draft ?? attr.format(value);
	const commit = () => {
		if (draft === null) return;
		try {
			onChange(attr.parse(draft));
			setValidationError(null);
		} catch {
			setValidationError(`Valor inválido. Se conservó ${attr.format(value)}.`);
		}
		setDraft(null);
	};
	return (
		<div>
			<input
				aria-label={attrLabel(attr)}
				aria-invalid={validationError ? true : undefined}
				className={`${inputClass} ${attr.kind !== "string" ? "font-mono" : ""}`}
				value={text}
				inputMode={attr.kind === "int" ? "numeric" : undefined}
				onChange={(e) => {
					setDraft(e.target.value);
					setValidationError(null);
				}}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") (e.target as HTMLInputElement).blur();
					if (e.key === "Escape") {
						setDraft(null);
						setValidationError(null);
					}
					e.stopPropagation();
				}}
			/>
			{validationError && (
				<p role="alert" className="mt-1 text-xs text-red-700">
					{validationError}
				</p>
			)}
		</div>
	);
}

function AttrTable({
	rows,
	onChange,
}: {
	rows: { attr: AnyAttribute; value: unknown }[];
	onChange: (attr: AnyAttribute, value: unknown) => void;
}) {
	return (
		<div className="flex flex-col">
			{rows.map(({ attr, value }) => (
				<div
					key={attr.name}
					className="grid grid-cols-[1fr_1.2fr] items-center gap-2 border-b border-line/60 px-4 py-1.5"
				>
					<span className="text-[12px] leading-tight text-muted">{attrLabel(attr)}</span>
					<AttrEditor attr={attr} value={value} onChange={(v) => onChange(attr, v)} />
				</div>
			))}
		</div>
	);
}

function withSplitterMax(attr: AnyAttribute, fanout: unknown): AnyAttribute {
	if (attr.label === "splitter.bit") return { ...attr, max: fanout as number };
	return attr;
}

export function AttributesPanel({ ws }: { ws: Workspace }) {
	const selected = Array.from(ws.selection);
	const tool = ws.tool;

	// one component (or several of the same kind) selected
	if (selected.length > 0) {
		const first = selected[0];
		const sameKind = selected.every((c) => c.factory === first.factory);
		if (!sameKind) {
			return <div className="p-4 text-sm text-muted">{selected.length} componentes seleccionados.</div>;
		}
		const isSub = first.factory instanceof SubcircuitFactory;
		const attrs = first.factory.getAttributes(first.attrs);
		const fanout = first.attrs.getByName("fanout");
		return (
			<div className="flex flex-col">
				<Header
					icon={iconFor(first.factory, first.attrs.getByName("output") === true)}
					title={selected.length > 1 ? `${componentName(first)} (${selected.length})` : componentName(first)}
					subtitle={`${first.factory.name} · (${first.x},${first.y})`}
				/>
				<AttrTable
					rows={attrs.map((attr) => ({
						attr: withSplitterMax(attr, fanout),
						value:
							isSub && !first.factory.isToSave(attr)
								? (first.factory as SubcircuitFactory).source.staticAttrs.get(attr)
								: (first.attrs.get(attr) ?? first.factory.getDefaultValue(attr)),
					}))}
					onChange={(attr, v) => ws.setAttribute(attr, v)}
				/>
				{isSub && (
					<button
						type="button"
						onClick={() => ws.enterSubcircuit(first)}
						className="m-4 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-black/5"
					>
						Ver adentro de {first.factory.name}
					</button>
				)}
				{selected.length === 1 && ws.memoryContents(first) && (
					<MemoryActions key={first.id} ws={ws} inst={first} />
				)}
			</div>
		);
	}

	// adding a component: edit the tool's attributes (as Logisim does)
	if (tool.kind === "add") {
		const attrs = tool.factory.getAttributes(tool.attrs);
		const fanout = tool.attrs.getByName("fanout");
		return (
			<div className="flex flex-col">
				<Header
					icon={iconFor(tool.factory, tool.attrs.getByName("output") === true)}
					title={`Herramienta: ${componentName(tool)}`}
					subtitle="Tocá el lienzo para colocar · flechas para orientar"
				/>
				<AttrTable
					rows={attrs
						.filter((a) => tool.factory.isToSave(a))
						.map((attr) => ({
							attr: withSplitterMax(attr, fanout),
							value: tool.attrs.get(attr) ?? tool.factory.getDefaultValue(attr),
						}))}
					onChange={(attr, v) => ws.setAttribute(attr, v)}
				/>
			</div>
		);
	}

	// nothing selected: the circuit's own attributes
	const circuit: Circuit = ws.viewCircuit;
	return (
		<div className="flex flex-col">
			<Header icon="subcirc.gif" title={`Circuito: ${circuit.name}`} subtitle="Atributos del circuito" />
			<AttrTable
				rows={CIRCUIT_STATIC_ATTRS.map((attr) => ({
					attr: attr as AnyAttribute,
					value: circuit.staticAttrs.get(attr as AnyAttribute),
				}))}
				onChange={(attr, v) => ws.setCircuitAttribute(circuit, attr, v)}
			/>
			<p className="p-4 text-xs leading-relaxed text-muted">
				Con la herramienta de edición: tocá un componente para seleccionarlo, arrastrá desde un puerto para
				cablear, arrastrá en vacío para seleccionar varios. Con la mano: tocá pines de entrada y relojes.
			</p>
		</div>
	);
}

function MemoryActions({ ws, inst }: { ws: Workspace; inst: Instance }) {
	const [editing, setEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const contents = ws.memoryContents(inst);
	if (!contents) return null;
	const actionClass = "rounded-md border border-line px-3 py-1.5 text-left text-sm hover:bg-black/5";
	return (
		<div className="flex flex-col gap-2 p-4">
			<button type="button" className={actionClass} onClick={() => setEditing(true)}>
				Editar contenidos
			</button>
			<button
				type="button"
				className={actionClass}
				onClick={() => {
					const next = contents.clone();
					next.clear();
					ws.setMemoryContents(inst, next);
				}}
			>
				Borrar contenidos
			</button>
			<button type="button" className={actionClass} onClick={() => fileRef.current?.click()}>
				Cargar imagen
			</button>
			<button
				type="button"
				className={actionClass}
				onClick={() => downloadMemory(contents, `${inst.factory.name.toLowerCase()}.hex`)}
			>
				Guardar imagen
			</button>
			<input
				ref={fileRef}
				type="file"
				accept=".hex,.txt"
				className="hidden"
				aria-label="Cargar imagen de memoria"
				onChange={async (e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (!file) return;
					try {
						const next = contents.clone();
						loadImage(next, await file.text());
						ws.setMemoryContents(inst, next);
						setError(null);
					} catch (err) {
						setError(memoryImageError(err));
					}
				}}
			/>
			{error && (
				<p role="alert" className="text-xs text-red-600">
					{error}
				</p>
			)}
			{editing && (
				<HexEditor
					contents={contents}
					onClose={() => setEditing(false)}
					onAccept={(next) => {
						ws.setMemoryContents(inst, next);
						setEditing(false);
					}}
				/>
			)}
		</div>
	);
}

function Header({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
	return (
		<div className="flex items-center gap-3 border-b border-line px-4 py-3">
			<div className="flex size-9 items-center justify-center rounded-md border border-line bg-white">
				<LogisimIcon name={icon} size={32} />
			</div>
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold">{title}</div>
				<div className="truncate font-mono text-[11px] text-muted">{subtitle}</div>
			</div>
		</div>
	);
}
