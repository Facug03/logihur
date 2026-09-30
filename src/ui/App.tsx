"use client";

import {
	AlertTriangle,
	ChevronLeft,
	Clock,
	FilePlus2,
	FolderOpen,
	Info,
	Maximize,
	Menu,
	Minus,
	Pause,
	Play,
	Plus,
	Redo2,
	RotateCcw,
	Save,
	SlidersHorizontal,
	StepForward,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AND_GATE, OR_GATE } from "@/components/gates/gates";
import { NOT_GATE } from "@/components/gates/simple-gates";
import { PIN } from "@/components/wiring/pin";
import type { Font } from "@/engine/attributes";
import type { Direction } from "@/engine/geom";
import { setTextMeasurer } from "@/engine/graphics";
import { t } from "@/i18n/es";
import { measureWith } from "@/render/canvas-graphics";
import { CircuitCanvas, type CircuitCanvasHandle } from "./CircuitCanvas";
import { AttributesPanel, CircuitsPanel, LibraryPanel, LogisimIcon } from "./panels";
import { TICK_FREQUENCIES, Workspace } from "./workspace";

// Text metrics for bounds computed outside painting (tunnels, labels).
const measureCtx = document.createElement("canvas").getContext("2d");
if (measureCtx) setTextMeasurer((text: string, font: Font) => measureWith(measureCtx, text, font));

const EXAMPLES = [
	{ file: "half-adder.circ", label: "Semisumador" },
	{ file: "full-adder.circ", label: "Sumador completo (con subcircuitos)" },
];

/** Logisim's default toolbar: two pin presets and three gates. */
const QUICK_TOOLS = [
	{ id: "pin-in", factory: PIN, preset: { tristate: false }, icon: "pinInput.gif", label: "Pin de entrada" },
	{
		id: "pin-out",
		factory: PIN,
		preset: { facing: "west", output: true, labelloc: "east" },
		icon: "pinOutputReversed.gif",
		label: "Pin de salida",
	},
	{ id: NOT_GATE.name, factory: NOT_GATE, preset: {}, icon: "notGate.gif", label: t("gates.not") },
	{ id: AND_GATE.name, factory: AND_GATE, preset: {}, icon: "andGate.gif", label: t("gates.and") },
	{ id: OR_GATE.name, factory: OR_GATE, preset: {}, icon: "orGate.gif", label: t("gates.or") },
] as const;

/** Keys delivered to poke carets, as the characters Java's KeyEvent reports. */
const POKE_KEYS: Record<string, string> = { Backspace: "\b", Delete: "\u007f", Enter: "\n", Tab: "\t" };

const ARROWS: Record<string, Direction> = {
	ArrowUp: "north",
	ArrowDown: "south",
	ArrowLeft: "west",
	ArrowRight: "east",
};

function formatFreq(f: number): string {
	return f >= 1024 ? `${f / 1024} KHz` : `${f} Hz`;
}

function IconButton({
	label,
	onClick,
	children,
	active,
	disabled,
	className = "",
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
	active?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-35 ${
				active ? "bg-accent/15 ring-1 ring-accent/40" : "hover:bg-black/5"
			} ${className}`}
		>
			{children}
		</button>
	);
}

function Divider() {
	return <div className="mx-1 h-6 w-px shrink-0 bg-line" />;
}

export default function App() {
	const wsRef = useRef<Workspace | null>(null);
	if (wsRef.current === null) {
		const ws = new Workspace();
		if (ws.restoreAutosave()) ws.notice = "Se recuperó tu último trabajo.";
		wsRef.current = ws;
	}
	const ws = wsRef.current;
	const version = useSyncExternalStore(ws.subscribe, ws.getVersion, ws.getVersion);
	const canvasRef = useRef<CircuitCanvasHandle>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const [zoom, setZoom] = useState(1);
	const [leftOpen, setLeftOpen] = useState(false);
	const [rightOpen, setRightOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const openText = (text: string, name: string) => {
		try {
			ws.openFromText(text, name);
			setError(null);
			requestAnimationFrame(() => canvasRef.current?.fit());
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const onOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (file) openText(await file.text(), file.name);
	};

	const onSave = () => {
		const blob = new Blob([ws.saveToText()], { type: "application/xml" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = ws.fileName.endsWith(".circ") ? ws.fileName : `${ws.fileName}.circ`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	};

	const loadExample = async (file: string) => {
		const res = await fetch(`/examples/${file}`);
		openText(await res.text(), file);
	};

	// keyboard shortcuts (Logisim's where they exist)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest("input, select, textarea")) return;
			const mod = e.ctrlKey || e.metaKey;
			const k = e.key.toLowerCase();
			if (mod) {
				if (k === "z" && !e.shiftKey) ws.undo();
				else if (k === "y" || (k === "z" && e.shiftKey)) ws.redo();
				else if (k === "c") ws.copy();
				else if (k === "x") ws.cut();
				else if (k === "v") ws.paste();
				else if (k === "d") ws.duplicate();
				else if (k === "a") ws.selectAll();
				else if (k === "t") ws.tickOnce();
				else if (k === "k") ws.setTicksEnabled(!ws.ticksEnabled);
				else if (k === "r") ws.resetSimulation();
				else if (k === "s") onSave();
				else if (k === "o") fileRef.current?.click();
				else return;
				e.preventDefault();
				return;
			}
			if (ws.tool.kind === "poke" && ws.pokeCaret) {
				// typed keys go to the poked component (registers, memories…)
				const key = POKE_KEYS[e.key] ?? (e.key.length === 1 ? e.key : null);
				if (key !== null && ws.pokeKey(key)) {
					e.preventDefault();
					return;
				}
			}
			if (e.key === "Delete" || e.key === "Backspace") ws.deleteSelection();
			else if (e.key === "Escape") ws.setTool({ kind: "edit" });
			else if (ARROWS[e.key]) ws.setFacing(ARROWS[e.key]);
			else if (/^[2-9]$/.test(e.key)) {
				// Logisim: typing a digit sets the number of gate inputs
				const inputs = Number(e.key);
				const owner = Array.from(ws.selection)[0] ?? (ws.tool.kind === "add" ? ws.tool : null);
				const attr = owner?.factory.getAttributes(owner.attrs).find((a) => a.name === "inputs");
				if (attr) ws.setAttribute(attr, inputs);
				else return;
			} else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const oscillating = ws.isOscillating();
	const tool = ws.tool;

	return (
		<div className="flex h-dvh flex-col">
			{/* top bar */}
			<header className="flex h-12 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [scrollbar-width:none]">
				<IconButton
					label="Componentes y circuitos"
					onClick={() => setLeftOpen((v) => !v)}
					className="md:hidden"
				>
					<Menu className="size-5" />
				</IconButton>
				<div className="mr-2 hidden items-center gap-2 md:flex">
					<LogisimIcon name="logisim-icon-24.png" size={24} />
					<div className="flex flex-col leading-tight">
						<span className="text-sm font-semibold tracking-tight">
							LogiHUR{ws.dirty && <span className="text-muted"> •</span>}
						</span>
						<span className="max-w-36 truncate font-mono text-[10px] text-muted">{ws.fileName}</span>
					</div>
				</div>

				<IconButton label={t("menu.new")} onClick={() => ws.newProject()}>
					<FilePlus2 className="size-[18px]" />
				</IconButton>
				<IconButton label={`${t("menu.open")} (Ctrl+O)`} onClick={() => fileRef.current?.click()}>
					<FolderOpen className="size-[18px]" />
				</IconButton>
				<IconButton label={`${t("menu.save")} (Ctrl+S)`} onClick={onSave}>
					<Save className="size-[18px]" />
				</IconButton>

				<Divider />

				<IconButton
					label="Tocar (cambiar valores)"
					active={tool.kind === "poke"}
					onClick={() => ws.setTool({ kind: "poke" })}
				>
					<LogisimIcon name="poke.gif" size={20} />
				</IconButton>
				<IconButton
					label="Editar (Esc)"
					active={tool.kind === "edit"}
					onClick={() => ws.setTool({ kind: "edit" })}
				>
					<LogisimIcon name="select.gif" size={20} />
				</IconButton>
				<IconButton
					label="Cablear"
					active={tool.kind === "wiring"}
					onClick={() => ws.setTool({ kind: "wiring" })}
				>
					<LogisimIcon name="wiring.gif" size={20} />
				</IconButton>
				{QUICK_TOOLS.map((q) => (
					<IconButton
						key={q.id}
						label={q.label}
						active={tool.kind === "add" && tool.id === q.id}
						onClick={() => ws.selectAddTool(q.factory, q.id, q.preset)}
					>
						<LogisimIcon name={q.icon} size={20} />
					</IconButton>
				))}

				<Divider />

				<IconButton
					label={`Deshacer${ws.history.undoLabel() ? `: ${ws.history.undoLabel()}` : ""} (Ctrl+Z)`}
					disabled={!ws.history.canUndo()}
					onClick={() => ws.undo()}
				>
					<Undo2 className="size-[18px]" />
				</IconButton>
				<IconButton label={`Rehacer (Ctrl+Y)`} disabled={!ws.history.canRedo()} onClick={() => ws.redo()}>
					<Redo2 className="size-[18px]" />
				</IconButton>
				<IconButton
					label="Borrar selección (Supr)"
					disabled={!ws.hasSelection()}
					onClick={() => ws.deleteSelection()}
				>
					<Trash2 className="size-[18px]" />
				</IconButton>

				<Divider />

				<IconButton
					label={t("sim.enabled")}
					active={ws.simEnabled}
					onClick={() => ws.setSimEnabled(!ws.simEnabled)}
				>
					{ws.simEnabled ? <Play className="size-[18px]" /> : <Pause className="size-[18px]" />}
				</IconButton>
				<IconButton label={`${t("sim.reset")} (Ctrl+R)`} onClick={() => ws.resetSimulation()}>
					<RotateCcw className="size-[18px]" />
				</IconButton>
				<IconButton label={`${t("sim.tickOnce")} (Ctrl+T)`} onClick={() => ws.tickOnce()}>
					<StepForward className="size-[18px]" />
				</IconButton>
				<IconButton
					label={`${t("sim.ticksEnabled")} (Ctrl+K)`}
					active={ws.ticksEnabled}
					onClick={() => ws.setTicksEnabled(!ws.ticksEnabled)}
				>
					<Clock className="size-[18px]" />
				</IconButton>
				<select
					aria-label={t("sim.tickFreq")}
					title={t("sim.tickFreq")}
					value={ws.tickFrequency}
					onChange={(e) => ws.setTickFrequency(Number(e.target.value))}
					className="h-8 shrink-0 rounded-md border border-line bg-panel px-1 text-xs"
				>
					{TICK_FREQUENCIES.map((f) => (
						<option key={f} value={f}>
							{formatFreq(f)}
						</option>
					))}
				</select>

				<div className="ml-auto flex items-center pl-2">
					<IconButton label="Alejar" onClick={() => canvasRef.current?.zoomBy(1 / 1.25)}>
						<Minus className="size-[18px]" />
					</IconButton>
					<span className="hidden w-12 text-center font-mono text-xs tabular-nums text-muted sm:inline">
						{Math.round(zoom * 100)}%
					</span>
					<IconButton label="Acercar" onClick={() => canvasRef.current?.zoomBy(1.25)}>
						<Plus className="size-[18px]" />
					</IconButton>
					<IconButton label="Ajustar a la pantalla" onClick={() => canvasRef.current?.fit()}>
						<Maximize className="size-[18px]" />
					</IconButton>
					<IconButton label="Atributos" onClick={() => setRightOpen((v) => !v)} className="lg:hidden">
						<SlidersHorizontal className="size-[18px]" />
					</IconButton>
				</div>
				<input
					ref={fileRef}
					type="file"
					accept=".circ,application/xml,text/xml"
					hidden
					onChange={onOpenFile}
				/>
			</header>

			<div className="relative flex min-h-0 flex-1">
				{/* left: circuits + palette */}
				<aside
					className={`absolute inset-y-0 left-0 z-20 w-64 shrink-0 overflow-y-auto border-r border-line bg-panel shadow-xl transition-transform md:static md:translate-x-0 md:shadow-none ${
						leftOpen ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					<div className="flex justify-end p-1 md:hidden">
						<IconButton label="Cerrar" onClick={() => setLeftOpen(false)}>
							<X className="size-4" />
						</IconButton>
					</div>
					<CircuitsPanel ws={ws} />
					<div className="mx-3 h-px bg-line" />
					<LibraryPanel ws={ws} onPick={() => setLeftOpen(false)} />
					<div className="mx-3 h-px bg-line" />
					<section className="flex flex-col gap-1 p-3">
						<h2 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
							Ejemplos
						</h2>
						{EXAMPLES.map((ex) => (
							<button
								key={ex.file}
								type="button"
								onClick={() => {
									loadExample(ex.file);
									setLeftOpen(false);
								}}
								className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5"
							>
								{ex.label}
							</button>
						))}
					</section>
				</aside>

				{/* canvas */}
				<main className="relative min-w-0 flex-1">
					<CircuitCanvas ref={canvasRef} ws={ws} version={version} onZoomChange={setZoom} />

					<div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-line bg-panel/95 py-1 pl-1 pr-3 text-sm shadow-sm">
						{ws.viewStack.length > 1 ? (
							<IconButton label="Volver" onClick={() => ws.leaveSubcircuit()}>
								<ChevronLeft className="size-4" />
							</IconButton>
						) : (
							<LogisimIcon name="subcirc.gif" className="mx-2" />
						)}
						<span className={ws.viewStack.length > 1 ? "text-muted" : "font-medium"}>{ws.circuit.name}</span>
						{ws.viewStack.slice(1).map((v, i) => (
							<span key={v.via?.id ?? v.state.circuit.id} className="flex items-center gap-1">
								<span className="text-muted">/</span>
								<span className={i === ws.viewStack.length - 2 ? "font-medium" : "text-muted"}>
									{v.state.circuit.name}
								</span>
							</span>
						))}
					</div>

					<div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-col items-start gap-2">
						{oscillating && (
							<div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white shadow">
								<AlertTriangle className="size-4" /> {t("sim.oscillation")}
							</div>
						)}
						{ws.notice && (
							<div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-sm shadow ring-1 ring-line">
								<Info className="size-4 text-accent" /> {ws.notice}
								<button
									type="button"
									aria-label="Cerrar"
									onClick={() => {
										ws.notice = null;
										ws.changed();
									}}
								>
									<X className="size-4" />
								</button>
							</div>
						)}
						{error && (
							<div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 shadow ring-1 ring-red-200">
								<AlertTriangle className="size-4" /> {error}
								<button type="button" onClick={() => setError(null)} aria-label="Cerrar">
									<X className="size-4" />
								</button>
							</div>
						)}
						{ws.messages.length > 0 && (
							<div className="pointer-events-auto max-w-lg rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200">
								<div className="mb-1 flex items-center gap-2 font-medium">
									<AlertTriangle className="size-4" /> Avisos al abrir el archivo
									<button
										type="button"
										className="ml-auto"
										onClick={() => {
											ws.messages = [];
											ws.changed();
										}}
										aria-label="Cerrar"
									>
										<X className="size-4" />
									</button>
								</div>
								<ul className="list-disc pl-5">
									{ws.messages.slice(0, 6).map((m) => (
										<li key={m}>{m}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				</main>

				{/* right: attributes */}
				<aside
					className={`absolute inset-y-0 right-0 z-20 w-72 shrink-0 overflow-y-auto border-l border-line bg-panel shadow-xl transition-transform lg:static lg:translate-x-0 lg:shadow-none ${
						rightOpen ? "translate-x-0" : "translate-x-full"
					}`}
				>
					<div className="flex items-center justify-between border-b border-line px-4 py-2 lg:hidden">
						<span className="text-sm font-medium">Atributos</span>
						<IconButton label="Cerrar" onClick={() => setRightOpen(false)}>
							<X className="size-4" />
						</IconButton>
					</div>
					<AttributesPanel ws={ws} />
				</aside>
			</div>
		</div>
	);
}
