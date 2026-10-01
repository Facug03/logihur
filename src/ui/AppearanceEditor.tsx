"use client";

// Port of gui.appear.AppearanceView: edits how the viewed circuit looks when
// used as a subcircuit. Shapes are drawn as SVG over a 10 px grid; ports (blue)
// and the anchor (green) can be moved but not deleted, like in Logisim.

import {
	ArrowDownToLine,
	ArrowUpToLine,
	Circle,
	Minus,
	MousePointer2,
	Pentagon,
	RotateCcw,
	Spline,
	Square,
	Squircle,
	Trash2,
	Type,
	Waypoints,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	createDragged,
	createPoly,
	createText,
	DEFAULT_TOOL_STYLE,
	type DrawTool,
	handles,
	isRemovable,
	moveHandle,
	type PaintType,
	shapesBounds,
	snap,
	type ToolStyle,
	translate,
} from "@/editor/appearance-edit";
import type { AppearanceShape } from "@/engine/appearance";
import type { Direction } from "@/engine/geom";
import { locX, locY } from "@/engine/geom";
import type { Workspace } from "./workspace";

const TOOLS: { id: DrawTool; label: string; icon: React.ReactNode }[] = [
	{ id: "select", label: "Seleccionar", icon: <MousePointer2 className="size-[18px]" /> },
	{ id: "text", label: "Texto", icon: <Type className="size-[18px]" /> },
	{ id: "line", label: "Línea", icon: <Minus className="size-[18px] -rotate-45" /> },
	{ id: "curve", label: "Curva", icon: <Spline className="size-[18px]" /> },
	{
		id: "polyline",
		label: "Polilínea (doble clic para terminar)",
		icon: <Waypoints className="size-[18px]" />,
	},
	{ id: "rect", label: "Rectángulo", icon: <Square className="size-[18px]" /> },
	{ id: "roundrect", label: "Rectángulo redondeado", icon: <Squircle className="size-[18px]" /> },
	{ id: "oval", label: "Óvalo", icon: <Circle className="size-[18px]" /> },
	{ id: "polygon", label: "Polígono (doble clic para cerrar)", icon: <Pentagon className="size-[18px]" /> },
];

type StyledShape = Extract<AppearanceShape, { paint: PaintType }>;

const PORT_COLOR = "#0000ff";
const ANCHOR_COLOR = "rgb(0,128,0)";
const FONT_FAMILIES: Record<string, string> = {
	SansSerif: "sans-serif",
	Serif: "serif",
	Monospaced: "monospace",
	Dialog: "sans-serif",
};

type Gesture =
	| { mode: "move"; x: number; y: number; dx: number; dy: number }
	| { mode: "handle"; index: number; handle: number }
	| { mode: "draw"; x0: number; y0: number; x1: number; y1: number }
	| { mode: "pan"; sx: number; sy: number; ox: number; oy: number };

function style(s: { paint: PaintType; strokeWidth: number; stroke: string; fill: string }) {
	return {
		fill: s.paint === "stroke" ? "none" : s.fill,
		stroke: s.paint === "fill" ? "none" : s.stroke,
		strokeWidth: s.strokeWidth,
	};
}

function ShapeSvg({ s }: { s: AppearanceShape }) {
	switch (s.kind) {
		case "rect":
			return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} ry={s.rx} {...style(s)} />;
		case "oval":
			return <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...style(s)} />;
		case "line":
			return <line x1={s.x0} y1={s.y0} x2={s.x1} y2={s.y1} stroke={s.stroke} strokeWidth={s.strokeWidth} />;
		case "curve":
			return <path d={`M${s.x0},${s.y0} Q${s.cx},${s.cy} ${s.x1},${s.y1}`} {...style(s)} />;
		case "poly": {
			const points = s.xs.map((x, i) => `${x},${s.ys[i]}`).join(" ");
			return s.closed ? (
				<polygon points={points} {...style(s)} />
			) : (
				<polyline points={points} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} />
			);
		}
		case "text":
			return (
				<text
					x={s.x}
					y={s.y}
					fill={s.fill}
					fontFamily={FONT_FAMILIES[s.font.family] ?? s.font.family}
					fontSize={s.font.size}
					fontWeight={s.font.style.includes("bold") ? "bold" : "normal"}
					fontStyle={s.font.style.includes("italic") ? "italic" : "normal"}
					textAnchor={s.align}
				>
					{s.text}
				</text>
			);
		case "port": {
			const x = locX(s.loc);
			const y = locY(s.loc);
			const input = s.pin.attrs.getByName("output") !== true;
			return (
				<g stroke={PORT_COLOR} fill="none">
					{input ? <rect x={x - 4} y={y - 4} width={8} height={8} /> : <circle cx={x} cy={y} r={5} />}
					<circle cx={x} cy={y} r={2} fill={PORT_COLOR} stroke="none" />
				</g>
			);
		}
		case "anchor": {
			const x = locX(s.loc);
			const y = locY(s.loc);
			const [dx, dy] = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }[s.facing];
			return (
				<g stroke={ANCHOR_COLOR} fill="none">
					<circle cx={x} cy={y} r={3} />
					<line x1={x + 3 * dx} y1={y + 3 * dy} x2={x + 11 * dx} y2={y + 11 * dy} />
				</g>
			);
		}
	}
}

/** A wide invisible copy of the shape that receives the pointer. */
function HitArea({ s }: { s: AppearanceShape }) {
	const common = { stroke: "transparent", strokeWidth: 8, pointerEvents: "all" as const };
	const filled = "paint" in s && s.paint !== "stroke" ? "transparent" : "none";
	switch (s.kind) {
		case "rect":
			return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} {...common} fill={filled} />;
		case "oval":
			return (
				<ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...common} fill={filled} />
			);
		case "line":
			return <line x1={s.x0} y1={s.y0} x2={s.x1} y2={s.y1} {...common} />;
		case "curve":
			return <path d={`M${s.x0},${s.y0} Q${s.cx},${s.cy} ${s.x1},${s.y1}`} {...common} fill={filled} />;
		case "poly":
			return <polyline points={s.xs.map((x, i) => `${x},${s.ys[i]}`).join(" ")} {...common} fill={filled} />;
		case "text": {
			const w = s.text.length * s.font.size * 0.6;
			const x = s.align === "start" ? s.x : s.align === "end" ? s.x - w : s.x - w / 2;
			return <rect x={x} y={s.y - s.font.size} width={w} height={s.font.size * 1.3} fill="transparent" />;
		}
		default:
			return <circle cx={locX(s.loc)} cy={locY(s.loc)} r={7} fill="transparent" />;
	}
}

const LABELS: Record<string, string> = {
	rect: "Rectángulo",
	oval: "Óvalo",
	line: "Línea",
	curve: "Curva",
	poly: "Polígono",
	text: "Texto",
	port: "Puerto",
	anchor: "Ancla",
};

function shapeLabel(s: AppearanceShape): string {
	if (s.kind === "rect" && s.rx > 0) return "Rectángulo redondeado";
	if (s.kind === "poly" && !s.closed) return "Polilínea";
	if (s.kind === "port") return `Puerto de ${s.pin.attrs.getByName("label") || "pin"}`;
	return LABELS[s.kind];
}

export function AppearanceEditor({ ws }: { ws: Workspace }) {
	const circuit = ws.circuit;
	const committed = circuit.appearance.getShapes();
	const [draft, setDraft] = useState<AppearanceShape[] | null>(null);
	const shapes = draft ?? committed;
	const [selected, setSelected] = useState<number[]>([]);
	const [tool, setTool] = useState<DrawTool>("select");
	const [toolStyle, setToolStyle] = useState<ToolStyle>(DEFAULT_TOOL_STYLE);
	const [poly, setPoly] = useState<[number, number][] | null>(null);
	const [hover, setHover] = useState<[number, number] | null>(null);
	const [textAt, setTextAt] = useState<{ x: number; y: number; value: string } | null>(null);
	const [view, setView] = useState({ zoom: 2, ox: 0, oy: 0 });
	const [size, setSize] = useState({ w: 0, h: 0 });
	const gesture = useRef<Gesture | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const fitted = useRef<number | null>(null);

	// selection indices refer to the committed list; drop the ones that vanished (undo)
	const sel = selected.filter((i) => i < shapes.length);

	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		if (size.w === 0 || fitted.current === circuit.id) return;
		fitted.current = circuit.id;
		const b = shapesBounds(committed);
		const zoom = Math.max(0.5, Math.min(4, Math.min(size.w / (b.w + 80), size.h / (b.h + 80))));
		setView({ zoom, ox: b.x + b.w / 2 - size.w / zoom / 2, oy: b.y + b.h / 2 - size.h / zoom / 2 });
	}, [size, circuit.id, committed]);

	const toModel = (clientX: number, clientY: number) => {
		const r = svgRef.current?.getBoundingClientRect();
		return {
			x: view.ox + (clientX - (r?.left ?? 0)) / view.zoom,
			y: view.oy + (clientY - (r?.top ?? 0)) / view.zoom,
		};
	};

	const commit = (label: string, next: AppearanceShape[]) => {
		setDraft(null);
		ws.editAppearance(label, next);
	};

	const updateSelected = (label: string, fn: (s: AppearanceShape) => AppearanceShape) => {
		commit(
			label,
			shapes.map((s, i) => (sel.includes(i) ? fn(s) : s)),
		);
	};

	const finishPoly = () => {
		if (poly) {
			const shape = createPoly(tool === "polygon", toolStyle, poly);
			if (shape) {
				commit(tool === "polygon" ? "Agregar polígono" : "Agregar polilínea", [...shapes, shape]);
				setSelected([shapes.length]);
			}
		}
		setPoly(null);
	};

	const onBackgroundDown = (e: React.PointerEvent) => {
		(e.target as Element).setPointerCapture(e.pointerId);
		const p = toModel(e.clientX, e.clientY);
		const x = snap(p.x);
		const y = snap(p.y);
		if (tool === "select") {
			if (!e.shiftKey) setSelected([]);
			gesture.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
		} else if (tool === "text") {
			// keep the focus on the new text field instead of the drawing
			e.preventDefault();
			setTextAt({ x: Math.round(p.x), y: Math.round(p.y), value: "" });
		} else if (tool === "polyline" || tool === "polygon") {
			setPoly([...(poly ?? []), [x, y]]);
		} else {
			gesture.current = { mode: "draw", x0: x, y0: y, x1: x, y1: y };
		}
	};

	const onShapeDown = (e: React.PointerEvent, index: number) => {
		if (tool !== "select") return;
		e.stopPropagation();
		(e.target as Element).setPointerCapture(e.pointerId);
		const p = toModel(e.clientX, e.clientY);
		if (!sel.includes(index)) setSelected(e.shiftKey ? [...sel, index] : [index]);
		gesture.current = { mode: "move", x: p.x, y: p.y, dx: 0, dy: 0 };
	};

	const onHandleDown = (e: React.PointerEvent, index: number, handle: number) => {
		e.stopPropagation();
		(e.target as Element).setPointerCapture(e.pointerId);
		gesture.current = { mode: "handle", index, handle };
	};

	const onMove = (e: React.PointerEvent) => {
		const p = toModel(e.clientX, e.clientY);
		setHover([snap(p.x), snap(p.y)]);
		const g = gesture.current;
		if (!g) return;
		if (g.mode === "pan") {
			setView((v) => ({
				...v,
				ox: g.ox - (e.clientX - g.sx) / v.zoom,
				oy: g.oy - (e.clientY - g.sy) / v.zoom,
			}));
		} else if (g.mode === "move") {
			// shapes move on the 10 px grid unless Alt is held
			g.dx = e.altKey ? Math.round(p.x - g.x) : snap(p.x - g.x);
			g.dy = e.altKey ? Math.round(p.y - g.y) : snap(p.y - g.y);
			setDraft(committed.map((s, i) => (sel.includes(i) ? translate(s, g.dx, g.dy) : s)));
		} else if (g.mode === "handle") {
			const x = e.altKey ? Math.round(p.x) : snap(p.x);
			const y = e.altKey ? Math.round(p.y) : snap(p.y);
			setDraft(committed.map((s, i) => (i === g.index ? moveHandle(s, g.handle, x, y) : s)));
		} else if (g.mode === "draw") {
			g.x1 = snap(p.x);
			g.y1 = snap(p.y);
			const preview = createDragged(tool, toolStyle, g.x0, g.y0, g.x1, g.y1);
			setDraft(preview ? [...committed, preview] : null);
		}
	};

	const onUp = () => {
		const g = gesture.current;
		gesture.current = null;
		if (!g) return;
		if (g.mode === "move") {
			if ((g.dx !== 0 || g.dy !== 0) && draft) commit("Mover", draft);
			else setDraft(null);
		} else if (g.mode === "handle") {
			if (draft) commit("Cambiar forma", draft);
		} else if (g.mode === "draw") {
			const shape = createDragged(tool, toolStyle, g.x0, g.y0, g.x1, g.y1);
			if (shape) {
				commit(`Agregar ${LABELS[shape.kind].toLowerCase()}`, [...committed, shape]);
				setSelected([committed.length]);
			} else setDraft(null);
		}
	};

	const remove = () => {
		const removable = sel.filter((i) => isRemovable(shapes[i]));
		if (removable.length === 0) return;
		commit(
			"Borrar",
			shapes.filter((_, i) => !removable.includes(i)),
		);
		setSelected([]);
	};

	const reorder = (toTop: boolean) => {
		const moved = sel.map((i) => shapes[i]);
		const rest = shapes.filter((_, i) => !sel.includes(i));
		const next = toTop ? [...rest, ...moved] : [...moved, ...rest];
		commit(toTop ? "Traer al frente" : "Enviar al fondo", next);
		setSelected(moved.map((s) => next.indexOf(s)));
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT")
			return;
		e.stopPropagation();
		if (e.key === "Delete" || e.key === "Backspace") remove();
		else if (e.key === "Escape") {
			if (poly) setPoly(null);
			else setSelected([]);
		} else if (e.key === "Enter" && poly) finishPoly();
		else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
			if (e.shiftKey) ws.redo();
			else ws.undo();
		} else return;
		e.preventDefault();
	};

	const single = sel.length === 1 ? shapes[sel[0]] : null;
	const styled = sel.map((i) => shapes[i]).filter((s) => "paint" in s);
	const grid = view.zoom >= 1 ? 10 : 20;
	const vb = `${view.ox} ${view.oy} ${size.w / view.zoom} ${size.h / view.zoom}`;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keyboard shortcuts of the editor area
		<div className="flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-panel px-2 py-1">
				{TOOLS.map((t) => (
					<button
						key={t.id}
						type="button"
						title={t.label}
						aria-label={t.label}
						aria-pressed={tool === t.id}
						onClick={() => {
							finishPoly();
							setTool(t.id);
						}}
						className={`inline-flex size-8 items-center justify-center rounded-md ${tool === t.id ? "bg-accent/15 ring-1 ring-accent/40" : "hover:bg-black/5"}`}
					>
						{t.icon}
					</button>
				))}
				<div className="mx-1 h-6 w-px bg-line" />
				<button
					type="button"
					title="Borrar (Supr)"
					aria-label="Borrar"
					disabled={!sel.some((i) => isRemovable(shapes[i]))}
					onClick={remove}
					className="inline-flex size-8 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-35"
				>
					<Trash2 className="size-[18px]" />
				</button>
				<button
					type="button"
					title="Traer al frente"
					aria-label="Traer al frente"
					disabled={sel.length === 0}
					onClick={() => reorder(true)}
					className="inline-flex size-8 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-35"
				>
					<ArrowUpToLine className="size-[18px]" />
				</button>
				<button
					type="button"
					title="Enviar al fondo"
					aria-label="Enviar al fondo"
					disabled={sel.length === 0}
					onClick={() => reorder(false)}
					className="inline-flex size-8 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-35"
				>
					<ArrowDownToLine className="size-[18px]" />
				</button>
				<button
					type="button"
					title="Revertir a la apariencia por defecto"
					disabled={circuit.appearance.isDefault()}
					onClick={() => {
						setSelected([]);
						ws.editAppearance("Revertir apariencia", null);
					}}
					className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-black/5 disabled:opacity-35"
				>
					<RotateCcw className="size-4" />
					Revertir apariencia
				</button>
			</div>
			<div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
				<svg
					ref={svgRef}
					role="application"
					aria-label={`Apariencia de ${circuit.name}`}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: the drawing takes focus for its keyboard shortcuts
					tabIndex={0}
					width={size.w}
					height={size.h}
					viewBox={vb}
					className={`block touch-none outline-none ${tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
					onPointerDown={onBackgroundDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
					onDoubleClick={() => (poly ? finishPoly() : undefined)}
					onWheel={(e) => {
						const p = toModel(e.clientX, e.clientY);
						if (e.ctrlKey || e.metaKey) {
							const zoom = Math.max(0.25, Math.min(8, view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
							setView({
								zoom,
								ox: p.x - (p.x - view.ox) * (view.zoom / zoom),
								oy: p.y - (p.y - view.oy) * (view.zoom / zoom),
							});
						} else {
							setView({ ...view, ox: view.ox + e.deltaX / view.zoom, oy: view.oy + e.deltaY / view.zoom });
						}
					}}
				>
					<defs>
						<pattern id="appear-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
							<rect width={1 / view.zoom} height={1 / view.zoom} fill="#c0c0c0" />
						</pattern>
					</defs>
					<rect
						x={view.ox}
						y={view.oy}
						width={size.w / view.zoom}
						height={size.h / view.zoom}
						fill="url(#appear-grid)"
					/>
					{shapes.map((s, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: z-order position identifies shapes
						<g key={i} onPointerDown={(e) => onShapeDown(e, i)}>
							<ShapeSvg s={s} />
							{tool === "select" && <HitArea s={s} />}
						</g>
					))}
					{sel.map((i) => {
						const s = shapes[i];
						if (!s) return null;
						const hs = handles(s);
						if (hs.length === 0) {
							const b = shapesBounds([s]);
							return (
								<rect
									key={`b${i}`}
									x={b.x - 4}
									y={b.y - 4}
									width={b.w + 8}
									height={b.h + 8}
									fill="none"
									stroke="#2563eb"
									strokeDasharray="3 2"
									strokeWidth={1 / view.zoom}
									pointerEvents="none"
								/>
							);
						}
						return hs.map(([x, y], h) => (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: handles are positional
								key={`h${i}-${h}`}
								x={x - 4 / view.zoom}
								y={y - 4 / view.zoom}
								width={8 / view.zoom}
								height={8 / view.zoom}
								fill="white"
								stroke="#2563eb"
								strokeWidth={1.5 / view.zoom}
								className="cursor-move"
								onPointerDown={(e) => onHandleDown(e, i, h)}
							/>
						));
					})}
					{poly && (
						<polyline
							points={[...poly, ...(hover ? [hover] : [])].map(([x, y]) => `${x},${y}`).join(" ")}
							fill="none"
							stroke="#2563eb"
							strokeDasharray="4 3"
							strokeWidth={1 / view.zoom}
							pointerEvents="none"
						/>
					)}
				</svg>
				{textAt && (
					<input
						// biome-ignore lint/a11y/noAutofocus: inline text entry where the user clicked
						autoFocus
						aria-label="Texto"
						value={textAt.value}
						onChange={(e) => setTextAt({ ...textAt, value: e.target.value })}
						onBlur={() => {
							const shape = createText(toolStyle, textAt.x, textAt.y, textAt.value);
							if (shape) commit("Agregar texto", [...shapes, shape]);
							setTextAt(null);
						}}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") (e.target as HTMLInputElement).blur();
							else if (e.key === "Escape") setTextAt(null);
						}}
						style={{
							left: (textAt.x - view.ox) * view.zoom - 60,
							top: (textAt.y - view.oy) * view.zoom - toolStyle.font.size * view.zoom,
						}}
						className="absolute w-40 rounded border border-accent bg-white px-1 py-0.5 text-sm outline-none"
					/>
				)}
				<AttributesBox
					shapes={sel.map((i) => shapes[i]).filter(Boolean)}
					single={single}
					styled={styled.length > 0}
					toolStyle={toolStyle}
					tool={tool}
					onToolStyle={setToolStyle}
					onChange={updateSelected}
				/>
				<p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-muted">
					Puertos en azul, ancla en verde. Arrastrar mueve en la grilla (Alt: libre); las manijas cambian la
					forma.
				</p>
			</div>
		</div>
	);
}

function AttributesBox({
	shapes,
	single,
	styled,
	toolStyle,
	tool,
	onToolStyle,
	onChange,
}: {
	shapes: AppearanceShape[];
	single: AppearanceShape | null;
	styled: boolean;
	toolStyle: ToolStyle;
	tool: DrawTool;
	onToolStyle: (s: ToolStyle) => void;
	onChange: (label: string, fn: (s: AppearanceShape) => AppearanceShape) => void;
}) {
	const editingTool = shapes.length === 0;
	if (editingTool && tool === "select") return null;
	const first = shapes.find((s): s is StyledShape => "paint" in s);
	const current = editingTool ? toolStyle : first;
	const text = editingTool ? (tool === "text" ? toolStyle : null) : single?.kind === "text" ? single : null;
	/** Style attributes apply to drawn shapes; font, alignment and color to texts. */
	const set = (label: string, patch: Record<string, unknown>) => {
		if (editingTool) {
			onToolStyle({ ...toolStyle, ...patch });
			return;
		}
		const forText = "font" in patch || "align" in patch || label === "Color";
		onChange(label, (s) =>
			(forText ? s.kind === "text" : "paint" in s) ? ({ ...s, ...patch } as AppearanceShape) : s,
		);
	};
	const field = "flex items-center justify-between gap-2 text-xs";
	const input = "rounded border border-line bg-white px-1.5 py-1 text-xs";
	return (
		<div className="absolute top-2 right-2 flex w-56 flex-col gap-2 rounded-lg border border-line bg-panel/95 p-3 text-sm shadow-md">
			<p className="text-xs font-semibold text-muted">
				{editingTool
					? "Herramienta"
					: shapes.length === 1
						? shapeLabel(shapes[0])
						: `${shapes.length} objetos`}
			</p>
			{single?.kind === "anchor" && (
				<label className={field}>
					Orientación
					<select
						className={input}
						value={single.facing}
						onChange={(e) =>
							onChange("Orientación", (s) =>
								s.kind === "anchor" ? { ...s, facing: e.target.value as Direction } : s,
							)
						}
					>
						<option value="east">Este</option>
						<option value="west">Oeste</option>
						<option value="north">Norte</option>
						<option value="south">Sur</option>
					</select>
				</label>
			)}
			{(styled || (editingTool && tool !== "text")) && current && "paint" in current && (
				<>
					{(editingTool || !(first?.kind === "line" || (first?.kind === "poly" && !first.closed))) && (
						<label className={field}>
							Tipo de pintura
							<select
								className={input}
								value={current.paint}
								onChange={(e) => set("Tipo de pintura", { paint: e.target.value })}
							>
								<option value="stroke">Sólo borde</option>
								<option value="fill">Sólo relleno</option>
								<option value="both">Borde y relleno</option>
							</select>
						</label>
					)}
					<label className={field}>
						Ancho del lápiz
						<input
							type="number"
							min={1}
							max={8}
							className={`${input} w-14`}
							value={current.strokeWidth}
							onChange={(e) => {
								const v = Number(e.target.value);
								if (v >= 1 && v <= 8) set("Ancho del lápiz", { strokeWidth: v });
							}}
						/>
					</label>
					<label className={field}>
						Color del lápiz
						<input
							type="color"
							value={current.stroke.slice(0, 7)}
							onChange={(e) => set("Color del lápiz", { stroke: e.target.value })}
						/>
					</label>
					<label className={field}>
						Color de relleno
						<input
							type="color"
							value={current.fill.slice(0, 7)}
							onChange={(e) => set("Color de relleno", { fill: e.target.value })}
						/>
					</label>
				</>
			)}
			{single?.kind === "rect" && single.rx > 0 && (
				<label className={field}>
					Radio de esquina
					<input
						type="number"
						min={1}
						max={1000}
						className={`${input} w-16`}
						value={single.rx}
						onChange={(e) => {
							const v = Number(e.target.value);
							if (v >= 1 && v <= 1000)
								onChange("Radio de esquina", (s) => (s.kind === "rect" ? { ...s, rx: v } : s));
						}}
					/>
				</label>
			)}
			{text && (
				<>
					{single?.kind === "text" && (
						<label className={field}>
							Texto
							<input
								className={`${input} w-32`}
								value={single.text}
								onChange={(e) =>
									onChange("Editar texto", (s) => (s.kind === "text" ? { ...s, text: e.target.value } : s))
								}
							/>
						</label>
					)}
					<label className={field}>
						Fuente
						<select
							className={input}
							value={text.font.family}
							onChange={(e) => set("Fuente", { font: { ...text.font, family: e.target.value } })}
						>
							{["SansSerif", "Serif", "Monospaced"].map((f) => (
								<option key={f}>{f}</option>
							))}
						</select>
					</label>
					<label className={field}>
						Tamaño
						<input
							type="number"
							min={4}
							max={72}
							className={`${input} w-14`}
							value={text.font.size}
							onChange={(e) => {
								const v = Number(e.target.value);
								if (v >= 4 && v <= 72) set("Fuente", { font: { ...text.font, size: v } });
							}}
						/>
					</label>
					<label className={field}>
						Estilo
						<select
							className={input}
							value={text.font.style}
							onChange={(e) => set("Fuente", { font: { ...text.font, style: e.target.value } })}
						>
							<option value="plain">Normal</option>
							<option value="bold">Negrita</option>
							<option value="italic">Cursiva</option>
							<option value="bolditalic">Negrita cursiva</option>
						</select>
					</label>
					<label className={field}>
						Alineación
						<select
							className={input}
							value={text.align}
							onChange={(e) => set("Alineación", { align: e.target.value })}
						>
							<option value="start">Izquierda</option>
							<option value="middle">Centro</option>
							<option value="end">Derecha</option>
						</select>
					</label>
					<label className={field}>
						Color
						<input
							type="color"
							value={("textFill" in text ? text.textFill : text.fill).slice(0, 7)}
							onChange={(e) =>
								set("Color", editingTool ? { textFill: e.target.value } : { fill: e.target.value })
							}
						/>
					</label>
				</>
			)}
		</div>
	);
}
