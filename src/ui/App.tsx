"use client";

import {
	AlertTriangle,
	ChevronLeft,
	FilePlus2,
	FolderOpen,
	Keyboard,
	Maximize,
	Menu,
	Minus,
	Plus,
	Redo2,
	RotateCcw,
	Save,
	ScrollText,
	SlidersHorizontal,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Toaster, toast } from "sonner";
import type { AnalyzerTab } from "@/analyze/analyze";
import { AND_GATE, OR_GATE } from "@/components/gates/gates";
import { NOT_GATE } from "@/components/gates/simple-gates";
import { loadImage } from "@/components/memory/mem-contents";
import { SubcircuitFactory } from "@/components/subcircuit";
import { PIN } from "@/components/wiring/pin";
import type { Font } from "@/engine/attributes";
import type { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import type { Direction } from "@/engine/geom";
import { setTextMeasurer } from "@/engine/graphics";
import { t } from "@/i18n/es";
import { measureWith } from "@/render/canvas-graphics";
import { AppearanceEditor } from "./AppearanceEditor";
import { AnalyzeMenu } from "./analyzer/AnalyzeMenu";
import { AnalyzerDialog } from "./analyzer/AnalyzerDialog";
import { CircuitCanvas, type CircuitCanvasHandle } from "./CircuitCanvas";
import { ContextMenu, type MenuEntry, type MenuRequest } from "./ContextMenu";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { downloadMemory, HexEditor, memoryImageError } from "./HexEditor";
import { LogDialog } from "./LogDialog";
import { LogisimLibrariesSection, MissingLibrariesNotice, pickMainFile, readFiles } from "./LogisimLibraries";
import { Disclosure, PanelResize } from "./PanelControls";
import { ProjectMenu } from "./ProjectMenu";
import { AttributesPanel, CircuitsPanel, componentName, LibraryPanel, LogisimIcon } from "./panels";
import { useMediaQuery, usePreference } from "./preferences";
import { onLaunchFiles, pwa } from "./pwa";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { StatisticsDialog } from "./StatisticsDialog";
import { Tooltip } from "./Tooltip";
import { TouchKeyInput } from "./TouchKeyInput";
import { TICK_FREQUENCIES, Workspace } from "./workspace";

// Text metrics for bounds computed outside painting (tunnels, labels).
const measureCtx = document.createElement("canvas").getContext("2d");
if (measureCtx) setTextMeasurer((text: string, font: Font) => measureWith(measureCtx, text, font));

const EXAMPLES = [
	{ file: "half-adder.circ", label: "Semisumador" },
	{ file: "full-adder.circ", label: "Sumador completo (con subcircuitos)" },
	{ file: "io-demo.circ", label: "Entrada/salida: teclado, TTY y controles" },
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
	description,
	onClick,
	children,
	active,
	disabled,
	className = "",
}: {
	label: string;
	description?: string;
	onClick: () => void;
	children: React.ReactNode;
	active?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Tooltip label={label} description={description}>
			{(tooltipId) => (
				<button
					type="button"
					aria-describedby={tooltipId}
					aria-label={label}
					aria-pressed={active}
					disabled={disabled}
					onClick={onClick}
					className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md press disabled:opacity-35 ${
						active ? "bg-accent/15 ring-1 ring-accent/40" : "hover:bg-black/5"
					} ${className}`}
				>
					{children}
				</button>
			)}
		</Tooltip>
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
	const desktopLeft = useMediaQuery("(min-width: 768px)");
	const desktopRight = useMediaQuery("(min-width: 1024px)");
	const coarsePointer = useMediaQuery("(pointer: coarse)");
	const [zoom, setZoom] = useState(1);
	const [leftOpen, setLeftOpen] = useState(false);
	const [rightOpen, setRightOpen] = useState(false);
	const [leftVisible, setLeftVisible] = usePreference<boolean>("leftVisible", true);
	const [rightVisible, setRightVisible] = usePreference<boolean>("rightVisible", true);
	const [leftWidth, setLeftWidth] = usePreference<number>("leftWidth", 256);
	const [rightWidth, setRightWidth] = usePreference<number>("rightWidth", 288);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [projectToDelete, setProjectToDelete] = useState<{ id: number; name: string } | null>(null);
	const [analyzer, setAnalyzer] = useState<{ tab: AnalyzerTab; notice: string | null } | null>(null);
	const [loadingExample, setLoadingExample] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const autosaveStatus = ws.autosaveStatus;
	useEffect(() => {
		if (autosaveStatus === "error") {
			toast.error(
				"No se pudo autoguardar en este navegador. Descargá tu archivo .circ para conservar los cambios.",
				{
					id: "autosave-error",
					duration: 10000,
				},
			);
		}
	}, [autosaveStatus]);

	useEffect(() => {
		const showNotice = () => {
			if (ws.notice) {
				toast.info(ws.notice, { id: "workspace-notice" });
				ws.notice = null;
			}
		};
		showNotice();
		return ws.subscribe(showNotice);
	}, [ws]);
	useEffect(() => {
		if (error) {
			toast.error(error, { duration: 10000 });
			setError(null);
		}
	}, [error]);

	useEffect(() => {
		if (desktopLeft) setLeftOpen(false);
	}, [desktopLeft]);
	useEffect(() => {
		if (desktopRight) setRightOpen(false);
	}, [desktopRight]);

	useEffect(() => {
		const save = () => {
			ws.finishTextEditing();
			ws.flushAutosave();
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") save();
		};
		window.addEventListener("pagehide", save);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("pagehide", save);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [ws]);

	const openText = (
		text: string,
		name: string,
		kind: "project" | "example" = "project",
		libraries: ReadonlyMap<string, string> = new Map(),
	) => {
		try {
			ws.openFromText(text, name, kind, libraries);
			setLibraryNoticeHidden(false);
			setError(null);
			ws.notify(`Se abrió ${name}.`);
			requestAnimationFrame(() => canvasRef.current?.fit());
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const [menu, setMenu] = useState<MenuRequest | null>(null);
	const [libraryNoticeHidden, setLibraryNoticeHidden] = useState(false);
	const [statsCircuit, setStatsCircuit] = useState<Circuit | null>(null);
	const [logOpen, setLogOpen] = useState(false);
	const [memoryEditing, setMemoryEditing] = useState<Instance | null>(null);
	const memoryFileRef = useRef<HTMLInputElement>(null);
	const memoryTarget = useRef<Instance | null>(null);
	const showAttributes = () => (desktopRight ? setRightVisible(true) : setRightOpen(true));

	const analyze = () => {
		const result = ws.analyzeViewedCircuit();
		if (result.ok) setAnalyzer({ tab: result.tab, notice: result.notice });
		else toast.error(t("analyze.errorTitle"), { description: result.error, duration: 8000 });
	};

	/** MenuTool: a selection menu, or a component menu plus its MenuExtender items. */
	const openComponentMenu = (inst: Instance, x: number, y: number) => {
		if (ws.selection.has(inst) && ws.selection.size + ws.selectedWires.size > 1) {
			setMenu({
				x,
				y,
				title: `${ws.selection.size + ws.selectedWires.size} elementos seleccionados`,
				items: [
					{ label: "Eliminar Selección", danger: true, onSelect: () => ws.deleteSelection() },
					{ label: "Cortar Selección", onSelect: () => ws.cut() },
					{ label: "Copiar Selección", onSelect: () => ws.copy() },
				],
			});
			return;
		}
		ws.select(inst);
		const items: MenuEntry[] = [
			{ label: "Borrar", danger: true, onSelect: () => ws.deleteComponent(inst) },
			{ label: "Mostrar Atributos", onSelect: showAttributes },
		];
		if (inst.factory instanceof SubcircuitFactory) {
			items.push("separator", {
				label: `Vista ${inst.factory.name}`,
				onSelect: () => ws.enterSubcircuit(inst),
			});
		}
		const contents = ws.memoryContents(inst);
		if (contents) {
			items.push(
				"separator",
				{ label: "Editar Contenidos...", onSelect: () => setMemoryEditing(inst) },
				{
					label: "Borrar Contenidos",
					onSelect: () => {
						const next = contents.clone();
						next.clear();
						ws.setMemoryContents(inst, next);
					},
				},
				{
					label: "Cargar Imagen...",
					onSelect: () => {
						memoryTarget.current = inst;
						memoryFileRef.current?.click();
					},
				},
				{
					label: "Salvar Imagen...",
					onSelect: () => downloadMemory(contents, `${inst.factory.name.toLowerCase()}.hex`),
				},
			);
		}
		if (inst.factory.name === "Splitter") {
			items.push(
				"separator",
				{
					label: "Distribuir ascendente",
					disabled: ws.splitterDistribution(inst, 1) === null,
					onSelect: () => ws.distributeSplitter(inst, 1),
				},
				{
					label: "Distribuir descendente",
					disabled: ws.splitterDistribution(inst, -1) === null,
					onSelect: () => ws.distributeSplitter(inst, -1),
				},
			);
		}
		setMenu({ x, y, title: componentName(inst), items });
	};

	/** The explorer's circuit popup (Popups.CircuitPopup) plus the up/down arrows. */
	const openCircuitMenu = (c: Circuit, x: number, y: number) => {
		const index = ws.project.circuits.indexOf(c);
		const isMain = ws.project.mainCircuit === c;
		setMenu({
			x,
			y,
			title: c.name,
			items: [
				{
					label: "Editar Circuito",
					onSelect: () => {
						ws.setCircuit(c);
						ws.setAppearanceMode(false);
					},
				},
				{
					label: t("analyze.projectAnalyzeCircuitItem"),
					onSelect: () => {
						ws.setCircuit(c);
						analyze();
					},
				},
				{
					label: "Editar Apariencia del Circuito",
					onSelect: () => {
						ws.setCircuit(c);
						ws.setAppearanceMode(true);
					},
				},
				{ label: "Obtener Estadísticas del Circuito", onSelect: () => setStatsCircuit(c) },
				"separator",
				{ label: "Mover Arriba", disabled: index <= 0, onSelect: () => ws.moveCircuit(c, -1) },
				{
					label: "Mover Abajo",
					disabled: index >= ws.project.circuits.length - 1,
					onSelect: () => ws.moveCircuit(c, 1),
				},
				"separator",
				{
					label: "Seleccionar Como Circuito Principal",
					disabled: isMain,
					onSelect: () => ws.setMainCircuit(c),
				},
				{ label: "Eliminar Circuito", danger: true, onSelect: () => ws.removeCircuit(c) },
			],
		});
	};

	const pwaState = useSyncExternalStore(pwa.subscribe, pwa.getState, pwa.getState);
	// biome-ignore lint/correctness/useExhaustiveDependencies: register once; openText only uses stable refs
	useEffect(() => {
		pwa.start();
		onLaunchFiles(async (file) => openText(await file.text(), file.name));
	}, []);
	useEffect(() => {
		if (!pwaState.updateReady) return;
		toast("Hay una versión nueva de LogiHUR.", {
			id: "pwa-update",
			duration: Number.POSITIVE_INFINITY,
			description: "Tu trabajo queda guardado en este navegador.",
			action: {
				label: "Actualizar",
				onClick: () =>
					pwa.applyUpdate(() => {
						ws.finishTextEditing();
						ws.flushAutosave();
					}),
			},
		});
	}, [pwaState.updateReady, ws]);

	/** Several .circ files at once: one project plus the libraries it uses. */
	const onOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files || files.length === 0) return;
		let sources: Map<string, string>;
		try {
			sources = await readFiles(files);
		} catch {
			setError("No se pudo leer el archivo.");
			return;
		} finally {
			e.target.value = "";
		}
		const main = pickMainFile(sources);
		const text = sources.get(main) as string;
		sources.delete(main);
		openText(text, main, "project", sources);
	};

	const onSave = () => {
		const blob = new Blob([ws.saveToText()], { type: "application/xml" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = ws.fileName.endsWith(".circ") ? ws.fileName : `${ws.fileName}.circ`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		ws.notify(`Se inició la descarga de ${a.download}.`);
	};

	const loadExample = async (file: string) => {
		setLoadingExample(true);
		try {
			const res = await fetch(`/examples/${file}`);
			if (!res.ok) throw new Error("No se pudo cargar el ejemplo. Intentá de nuevo.");
			openText(await res.text(), file, "example");
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoadingExample(false);
		}
	};

	// keyboard shortcuts (Logisim's where they exist)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.closest("input, select, textarea, [contenteditable=true]") ||
				// modal dialogs and menus own the keyboard; the non-modal log window does not
				document.querySelector("dialog:modal, [popover]:popover-open")
			)
				return;
			if (e.key === "?" && !ws.pokeCaret && !e.ctrlKey && !e.metaKey && !e.altKey) {
				setShortcutsOpen(true);
				e.preventDefault();
				return;
			}
			if (e.key === "Escape" && (leftOpen || rightOpen)) {
				setLeftOpen(false);
				setRightOpen(false);
				e.preventDefault();
				return;
			}
			const mod = e.ctrlKey || e.metaKey;
			const k = e.key.toLowerCase();
			if (
				e.ctrlKey &&
				k === "l" &&
				ws.tool.kind === "poke" &&
				ws.pokeCaret?.state.instance.factory.name === "Keyboard"
			) {
				ws.pokeKey("\f");
				e.preventDefault();
				return;
			}
			if (mod) {
				if (k === "z" && !e.shiftKey) ws.undo();
				else if (k === "y" || (k === "z" && e.shiftKey)) ws.redo();
				else if (k === "c") ws.copy();
				else if (k === "x") ws.cut();
				else if (k === "v") ws.paste();
				else if (k === "d") ws.duplicate();
				else if (k === "a") ws.selectAll();
				else if (k === "t") ws.tickOnce();
				else if (k === "i") ws.stepSimulation();
				else if (k === "e") ws.setSimEnabled(!ws.simEnabled);
				else if (k === "k") ws.setTicksEnabled(!ws.ticksEnabled);
				else if (k === "r") ws.resetSimulation();
				else if (k === "s") onSave();
				else if (k === "o") fileRef.current?.click();
				else return;
				e.preventDefault();
				return;
			}
			if (ws.tool.kind === "poke" && ws.pokeCaret) {
				if (ws.pokeKeyPressed(e.key)) {
					e.preventDefault();
					return;
				}
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
			{projectToDelete && (
				<DeleteProjectDialog
					name={projectToDelete.name}
					onClose={() => setProjectToDelete(null)}
					onConfirm={() => {
						ws.deleteProject(projectToDelete.id);
						setProjectToDelete(null);
						ws.notify(`Se eliminó ${projectToDelete.name}.`);
						requestAnimationFrame(() => canvasRef.current?.fit());
					}}
				/>
			)}
			{menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
			{coarsePointer && <TouchKeyInput ws={ws} />}
			{logOpen && (
				<LogDialog
					key={ws.circuit.id}
					model={ws.logModel}
					circuitName={ws.circuit.name}
					fileName={ws.fileName}
					onClose={() => setLogOpen(false)}
				/>
			)}
			{statsCircuit && (
				<StatisticsDialog ws={ws} circuit={statsCircuit} onClose={() => setStatsCircuit(null)} />
			)}
			{memoryEditing && ws.memoryContents(memoryEditing) && (
				<HexEditor
					contents={ws.memoryContents(memoryEditing) as NonNullable<ReturnType<typeof ws.memoryContents>>}
					onClose={() => setMemoryEditing(null)}
					onAccept={(next) => {
						ws.setMemoryContents(memoryEditing, next);
						setMemoryEditing(null);
					}}
				/>
			)}
			<input
				ref={memoryFileRef}
				type="file"
				accept=".hex,.txt"
				hidden
				aria-label="Cargar imagen de memoria"
				onChange={async (e) => {
					const file = e.target.files?.[0];
					const inst = memoryTarget.current;
					e.target.value = "";
					const contents = inst && ws.memoryContents(inst);
					if (!file || !inst || !contents) return;
					try {
						const next = contents.clone();
						loadImage(next, await file.text());
						ws.setMemoryContents(inst, next);
					} catch (err) {
						setError(memoryImageError(err));
					}
				}}
			/>
			{analyzer && (
				<AnalyzerDialog
					ws={ws}
					initialTab={analyzer.tab}
					notice={analyzer.notice}
					onClose={() => setAnalyzer(null)}
					onBuilt={() => {
						setAnalyzer(null);
						ws.notify(`Se creó el circuito ${ws.viewCircuit.name}.`);
						requestAnimationFrame(() => canvasRef.current?.fit());
					}}
				/>
			)}
			{/* top bar */}
			<header className="flex h-12 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [scrollbar-width:none]">
				<IconButton
					label="Componentes y circuitos"
					active={desktopLeft ? leftVisible : leftOpen}
					onClick={() => (desktopLeft ? setLeftVisible((v) => !v) : setLeftOpen((v) => !v))}
				>
					<Menu className="size-5" />
				</IconButton>
				<IconButton
					label="Atributos"
					active={desktopRight ? rightVisible : rightOpen}
					onClick={() => (desktopRight ? setRightVisible((v) => !v) : setRightOpen((v) => !v))}
				>
					<SlidersHorizontal className="size-[18px]" />
				</IconButton>
				<ProjectMenu
					ws={ws}
					onSelect={() => requestAnimationFrame(() => canvasRef.current?.fit())}
					onDelete={setProjectToDelete}
					pwa={pwaState}
					onInstall={() => pwa.install()}
				/>

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
					description="Probá el circuito: cambiá pines, pulsá botones, arrastrá el joystick o escribí en el componente tocado."
					active={tool.kind === "poke"}
					onClick={() => ws.setTool({ kind: "poke" })}
				>
					<LogisimIcon name="poke.gif" size={20} />
				</IconButton>
				<IconButton
					label="Editar (Esc)"
					description="Seleccioná y mové componentes o cables. Shift suma a la selección; arrastrar desde un puerto permite cablear."
					active={tool.kind === "edit"}
					onClick={() => ws.setTool({ kind: "edit" })}
				>
					<LogisimIcon name="select.gif" size={20} />
				</IconButton>
				<IconButton
					label="Cablear"
					description="Arrastrá entre puertos o puntos de la grilla para crear un cable. Escape vuelve a edición."
					active={tool.kind === "wiring"}
					onClick={() => ws.setTool({ kind: "wiring" })}
				>
					<LogisimIcon name="wiring.gif" size={20} />
				</IconButton>
				<IconButton
					label="Texto"
					description="Creá una etiqueta con un clic en vacío, o editá el texto de una etiqueta o componente. Enter confirma; Escape cancela."
					active={tool.kind === "text"}
					onClick={() => ws.selectTextTool()}
				>
					<LogisimIcon name="text.gif" size={20} />
				</IconButton>
				<Divider />

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
					label={ws.simEnabled ? "Pausar simulación (Ctrl+E)" : "Reanudar simulación (Ctrl+E)"}
					description={
						ws.simEnabled
							? "Detiene la propagación automática de señales. Podés avanzar con Paso de simulación."
							: "Vuelve a propagar los cambios de entradas y conexiones hasta estabilizar el circuito."
					}
					active={ws.simEnabled}
					onClick={() => ws.setSimEnabled(!ws.simEnabled)}
				>
					<LogisimIcon name={ws.simEnabled ? "simstop.png" : "simplay.png"} size={20} />
				</IconButton>
				<IconButton
					label={`${t("sim.reset")} (Ctrl+R)`}
					description="Borra el estado de registros, memorias y controles de toda la jerarquía; conserva el circuito."
					onClick={() => ws.resetSimulation()}
				>
					<RotateCcw className="size-[18px]" />
				</IconButton>
				<IconButton
					label="Paso de simulación (Ctrl+I)"
					description="Pausa y avanza un solo paso de propagación. Los puntos que cambian aparecen marcados en azul. No es un tick de reloj."
					onClick={() => ws.stepSimulation()}
				>
					<LogisimIcon name="simstep.png" size={20} />
				</IconButton>
				<IconButton
					label={`${t("sim.tickOnce")} (Ctrl+T)`}
					description="Avanza un tick de todos los relojes del circuito. Un ciclo completo requiere al menos dos ticks."
					onClick={() => ws.tickOnce()}
				>
					<LogisimIcon name="simtstep.png" size={20} />
				</IconButton>
				<IconButton
					label={`${ws.ticksEnabled ? "Detener ticks automáticos" : "Activar ticks automáticos"} (Ctrl+K)`}
					description="Activa o detiene los ticks del reloj a la frecuencia elegida. Mientras la simulación está pausada, los ticks automáticos quedan suspendidos."
					active={ws.ticksEnabled}
					onClick={() => ws.setTicksEnabled(!ws.ticksEnabled)}
				>
					<LogisimIcon name={ws.ticksEnabled ? "simtstop.png" : "simtplay.png"} size={20} />
				</IconButton>
				<select
					aria-label={t("sim.tickFreq")}
					title="Frecuencia de ticks por segundo. Un ciclo de reloj necesita al menos dos ticks."
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

				<IconButton
					label="Registro"
					description="Registra los valores de pines, sondas, relojes, biestables, registros y memorias en cada cambio, y permite descargarlos."
					active={logOpen}
					onClick={() => setLogOpen((v) => !v)}
				>
					<ScrollText className="size-[18px]" />
				</IconButton>
				<Divider />
				<AnalyzeMenu
					circuitName={ws.viewCircuit.name}
					onAnalyze={analyze}
					onOpen={() => setAnalyzer({ tab: "inputs", notice: null })}
				/>

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
				</div>
				<input
					ref={fileRef}
					type="file"
					accept=".circ,application/xml,text/xml"
					multiple
					hidden
					onChange={onOpenFile}
				/>
			</header>

			<div
				className="relative flex min-h-0 flex-1 overflow-hidden"
				style={
					{
						"--left-width": `${Math.max(200, Math.min(420, leftWidth))}px`,
						"--right-width": `${Math.max(240, Math.min(420, rightWidth))}px`,
					} as React.CSSProperties
				}
			>
				{/* left: circuits + palette */}
				<aside
					aria-label="Componentes y circuitos"
					className={`sidebar sidebar-left ${leftOpen ? "mobile-open" : ""} ${leftVisible ? "desktop-open" : ""}`}
				>
					<div className="flex justify-end p-1">
						<IconButton
							label="Ocultar componentes y circuitos"
							onClick={() => (desktopLeft ? setLeftVisible(false) : setLeftOpen(false))}
						>
							<X className="size-4" />
						</IconButton>
					</div>
					<CircuitsPanel ws={ws} onCircuitMenu={openCircuitMenu} />
					<div className="mx-3 h-px bg-line" />
					<LibraryPanel ws={ws} onPick={() => setLeftOpen(false)}>
						<LogisimLibrariesSection ws={ws} onPick={() => setLeftOpen(false)} />
					</LibraryPanel>
					<div className="mx-3 h-px bg-line" />
					<section className="flex flex-col gap-1 p-3">
						<Disclosure id="examples" title="Ejemplos">
							{EXAMPLES.map((ex) => (
								<button
									key={ex.file}
									type="button"
									disabled={loadingExample}
									onClick={() => {
										loadExample(ex.file);
										setLeftOpen(false);
									}}
									className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 disabled:opacity-50"
								>
									{ex.label}
								</button>
							))}
							{loadingExample && (
								<p role="status" className="px-2 py-1 text-xs text-muted">
									Cargando ejemplo…
								</p>
							)}
						</Disclosure>
					</section>
				</aside>

				{leftVisible && <PanelResize side="left" width={leftWidth} onChange={setLeftWidth} />}
				<button
					type="button"
					aria-label="Cerrar paneles"
					data-open={leftOpen || rightOpen ? "" : undefined}
					onClick={() => {
						setLeftOpen(false);
						setRightOpen(false);
					}}
					className={`drawer-scrim absolute inset-0 z-10 bg-black/20 ${leftOpen ? "md:hidden" : "lg:hidden"}`}
				/>
				{/* canvas */}
				<main className="relative min-w-0 flex-1">
					{!libraryNoticeHidden && (
						<MissingLibrariesNotice ws={ws} onDismiss={() => setLibraryNoticeHidden(true)} />
					)}
					{ws.appearanceMode ? (
						<div className="absolute inset-0 pt-12">
							<AppearanceEditor key={ws.circuit.id} ws={ws} />
						</div>
					) : (
						<CircuitCanvas
							ref={canvasRef}
							ws={ws}
							version={version}
							onZoomChange={setZoom}
							onComponentMenu={openComponentMenu}
						/>
					)}

					<div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-line bg-panel/95 py-1 pl-1 pr-3 text-sm shadow-sm">
						{ws.viewStack.length > 1 ? (
							<IconButton label="Volver" onClick={() => ws.leaveSubcircuit()}>
								<ChevronLeft className="size-4" />
							</IconButton>
						) : (
							<LogisimIcon name="subcirc.gif" className="mx-2" />
						)}
						<span className={ws.viewStack.length > 1 ? "text-muted" : "font-medium"}>{ws.circuit.name}</span>
						{ws.viewStack.length === 1 && (
							<fieldset className="ml-2 flex rounded-md border border-line p-0.5 text-xs">
								<legend className="sr-only">Vista del circuito</legend>
								{[
									[false, "Diseño", "Editar los componentes y cables del circuito"],
									[true, "Apariencia", "Editar cómo se ve el circuito cuando se usa como subcircuito"],
								].map(([mode, label, title]) => (
									<button
										key={String(label)}
										type="button"
										title={String(title)}
										aria-pressed={ws.appearanceMode === mode}
										onClick={() => ws.setAppearanceMode(mode as boolean)}
										className={`rounded px-2 py-0.5 ${ws.appearanceMode === mode ? "bg-accent text-white" : "hover:bg-black/5"}`}
									>
										{label}
									</button>
								))}
							</fieldset>
						)}
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
				{rightVisible && <PanelResize side="right" width={rightWidth} onChange={setRightWidth} />}
				<aside
					aria-label="Atributos"
					className={`sidebar sidebar-right ${rightOpen ? "mobile-open" : ""} ${rightVisible ? "desktop-open" : ""}`}
				>
					<div className="flex items-center justify-between border-b border-line px-4 py-2">
						<span className="text-sm font-medium">Atributos</span>
						<IconButton
							label="Ocultar atributos"
							onClick={() => (desktopRight ? setRightVisible(false) : setRightOpen(false))}
						>
							<X className="size-4" />
						</IconButton>
					</div>
					<AttributesPanel ws={ws} />
				</aside>
			</div>
			<footer className="flex min-h-8 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[11px] text-muted">
				<span className="min-w-0 flex-1 truncate">
					{tool.kind === "add"
						? `Colocar ${componentName(tool)} · flechas: orientar · Esc: editar`
						: tool.kind === "text"
							? "Texto · clic para crear o editar · Enter: confirmar · Esc: cancelar"
							: tool.kind === "wiring"
								? "Cablear · clic para iniciar y terminar · Esc: cancelar"
								: tool.kind === "poke"
									? "Tocar · clic para cambiar valores y probar controles"
									: "Editar · arrastrá para seleccionar o mover · Shift: sumar selección"}
				</span>
				<span className="hidden shrink-0 sm:inline">
					{ws.simEnabled ? "Simulación activa" : "Simulación pausada"}
				</span>
				<span
					role="status"
					title="El autoguardado conserva una copia local. Usá Guardar (Ctrl/⌘+S) para descargar el archivo .circ."
					className="hidden shrink-0 md:inline"
				>
					{ws.autosaveStatus === "pending"
						? "Guardando en este navegador…"
						: ws.autosaveStatus === "saved"
							? "Guardado en este navegador"
							: ws.autosaveStatus === "error"
								? "Sin autoguardado · descargá tu .circ"
								: ws.dirty
									? "Cambios sin descargar"
									: "Sin cambios pendientes"}
				</span>
				<button
					type="button"
					onClick={() => setShortcutsOpen(true)}
					title="Atajos de teclado (?)"
					className="flex shrink-0 items-center gap-1 rounded px-2 py-1 hover:bg-black/5"
				>
					<Keyboard className="size-3.5" />
					Atajos
				</button>
			</footer>
			<Toaster
				containerAriaLabel="Notificaciones"
				position="bottom-right"
				closeButton
				visibleToasts={3}
				offset={44}
				mobileOffset={44}
				theme="light"
				toastOptions={{
					closeButtonAriaLabel: "Cerrar notificación",
					style: { fontFamily: "var(--font-geist-sans), sans-serif", borderColor: "var(--line)" },
				}}
			/>
			{shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
		</div>
	);
}
