"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SubcircuitFactory } from "@/components/subcircuit";
import { wirePath } from "@/editor/wires";
import type { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import { Bounds, type Loc, loc, locX, locY } from "@/engine/geom";
import { prefs } from "@/engine/prefs";
import { WIRE_WIDTH, type Wire } from "@/engine/wire";
import { CanvasGraphics, cssFont } from "@/render/canvas-graphics";
import { drawCircuit, drawGrid, type Viewport } from "@/render/circuit-renderer";
import { CanvasInstancePainter } from "@/render/painter";
import { textEditorGeometry } from "./text-editing";
import type { Workspace } from "./workspace";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const GHOST_COLOR = "#8a8a8a";

export interface CircuitCanvasHandle {
	fit(): void;
	zoomBy(factor: number): void;
}

interface Props {
	ws: Workspace;
	version: number;
	onZoomChange?: (zoom: number) => void;
	/** Menu Tool: right click, Ctrl+click or a long press on a component. */
	onComponentMenu?: (inst: Instance, clientX: number, clientY: number) => void;
}

const LONG_PRESS_MS = 500;

const snap = (v: number) => Math.round(v / 10) * 10;

function circuitBounds(circuit: Circuit): Bounds {
	let b = Bounds.EMPTY;
	for (const c of circuit.components) b = b.add(c.bounds);
	for (const w of circuit.wires.values()) b = b.add(w.bounds);
	return b;
}

/** Topmost component under a point (later components are drawn on top). */
function hitComponent(circuit: Circuit, x: number, y: number): Instance | null {
	const comps = Array.from(circuit.components);
	for (let i = comps.length - 1; i >= 0; i--) {
		if (comps[i].contains(Math.round(x), Math.round(y))) return comps[i];
	}
	return null;
}

function hitWire(circuit: Circuit, x: number, y: number, tol: number): Wire | null {
	for (const w of circuit.wires.values()) if (w.contains(x, y, tol)) return w;
	return null;
}

/** Whether a grid point is somewhere a wire can start (port, wire end or wire). */
function isConnectable(circuit: Circuit, p: Loc): boolean {
	if (circuit.getNetlist().points.map.has(p)) return true;
	for (const w of circuit.wires.values()) if (w.containsInterior(p)) return true;
	return false;
}

function isPort(inst: Instance, p: Loc): boolean {
	return inst.ends.some((e) => e.loc === p);
}

type Gesture =
	| { mode: "none" }
	| { mode: "pan" }
	| { mode: "pinch"; dist: number; mid: { x: number; y: number } }
	| { mode: "poke" }
	| { mode: "wire"; start: Loc; end: Loc; horizontalFirst: boolean | null }
	| { mode: "move"; startX: number; startY: number; dx: number; dy: number }
	| { mode: "rect"; x0: number; y0: number; x1: number; y1: number }
	| { mode: "place" };

export const CircuitCanvas = forwardRef<CircuitCanvasHandle, Props>(function CircuitCanvas(
	{ ws, version, onZoomChange, onComponentMenu },
	ref,
) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const textInputRef = useRef<HTMLInputElement>(null);
	const viewsRef = useRef(new Map<object, Viewport>());
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [hovered, setHovered] = useState<Instance | null>(null);
	const [hoverPoint, setHoverPoint] = useState<Loc | null>(null);
	const [cursor, setCursor] = useState("default");
	const [, forceRender] = useState(0);
	const redraw = useCallback(() => forceRender((n) => n + 1), []);

	const viewKey = ws.viewState;
	const circuit = ws.viewCircuit;

	const getView = useCallback((): Viewport => {
		let v = viewsRef.current.get(viewKey);
		if (!v) {
			v = { zoom: 1, originX: 0, originY: 0 };
			viewsRef.current.set(viewKey, v);
			if (size.w > 0) fitInto(v, circuit, size.w, size.h);
		}
		return v;
	}, [viewKey, circuit, size.w, size.h]);

	useImperativeHandle(
		ref,
		() => ({
			fit() {
				fitInto(getView(), circuit, size.w, size.h);
				onZoomChange?.(getView().zoom);
				redraw();
			},
			zoomBy(factor: number) {
				zoomAround(getView(), factor, size.w / 2, size.h / 2);
				onZoomChange?.(getView().zoom);
				redraw();
			},
		}),
		[getView, circuit, size, onZoomChange, redraw],
	);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		// React's wheel listener is passive. The canvas handles both axes and
		// pinch itself, so cancel browser scrolling, history swipes and zoom here.
		const preventBrowserGesture = (event: WheelEvent) => event.preventDefault();
		const preventSafariZoom = (event: Event) => event.preventDefault();
		canvas.addEventListener("wheel", preventBrowserGesture, { passive: false });
		canvas.addEventListener("gesturestart", preventSafariZoom, { passive: false });
		canvas.addEventListener("gesturechange", preventSafariZoom, { passive: false });
		return () => {
			canvas.removeEventListener("wheel", preventBrowserGesture);
			canvas.removeEventListener("gesturestart", preventSafariZoom);
			canvas.removeEventListener("gesturechange", preventSafariZoom);
		};
	}, []);

	const editingInstance = ws.textEditing?.instance;
	useEffect(() => {
		if (editingInstance) {
			textInputRef.current?.focus();
			textInputRef.current?.select();
		}
	}, [editingInstance]);

	const gesture = useRef<Gesture>({ mode: "none" });
	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const down = useRef({
		sx: 0,
		sy: 0,
		moved: false,
		target: null as Instance | null,
		wire: null as Wire | null,
	});
	const lastTap = useRef<{ t: number; inst: Instance | null }>({ t: 0, inst: null });
	const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cancelLongPress = () => {
		if (longPress.current) clearTimeout(longPress.current);
		longPress.current = null;
	};

	const drawOverlay = (g: CanvasGraphics) => {
		const gs = gesture.current;
		const painter = new CanvasInstancePainter({
			g,
			circuit,
			state: null,
			showState: false,
			printView: false,
			gateShape: prefs.gateShape,
		});
		const ghost = (inst: { factory: Instance["factory"]; attrs: Instance["attrs"] }, at: Loc) => {
			g.save();
			g.setColor(GHOST_COLOR);
			g.setLineWidth(1);
			painter.setGhost(inst.factory, inst.attrs, at);
			try {
				inst.factory.paintGhost(painter);
			} catch {
				// ignore painting errors in previews
			}
			g.restore();
		};

		g.save();
		g.setColor("#0000ff");
		g.setLineWidth(2);
		for (const point of ws.stepPoints.get(ws.viewState) ?? [])
			g.drawOval(locX(point) - 4, locY(point) - 4, 8, 8);
		for (const component of circuit.components) {
			if (!(component.factory instanceof SubcircuitFactory)) continue;
			const child = component.factory.getSubstate(ws.viewState, component);
			if (
				Array.from(ws.stepPoints.keys()).some((state) => {
					for (let current: typeof state | null = state; current; current = current.parentState)
						if (current === child) return true;
					return false;
				})
			) {
				const b = component.bounds;
				g.drawRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
			}
		}
		g.restore();

		const caret = ws.pokeCaret;
		if (caret?.poker.paint) {
			const caretPainter = new CanvasInstancePainter({
				g,
				circuit,
				state: ws.viewState,
				showState: true,
				printView: false,
				gateShape: prefs.gateShape,
			});
			caretPainter.setInstance(caret.state.instance);
			g.save();
			caret.poker.paint(caretPainter);
			g.restore();
		}

		if (ws.tool.kind === "add" && hoverPoint !== null && gs.mode !== "pan" && gs.mode !== "pinch") {
			ghost(ws.tool, hoverPoint);
		}

		if (gs.mode === "wire") {
			const wires = wirePath(gs.start, gs.end, gs.horizontalFirst ?? true);
			g.save();
			g.setColor("#1f2937");
			g.setLineWidth(WIRE_WIDTH);
			for (const w of wires) g.drawLine(locX(w.e0), locY(w.e0), locX(w.e1), locY(w.e1));
			g.fillOval(locX(gs.start) - 4, locY(gs.start) - 4, 8, 8);
			g.restore();
		}

		if (gs.mode === "move" && (gs.dx !== 0 || gs.dy !== 0)) {
			for (const comp of ws.selection) ghost(comp, loc(comp.x + gs.dx, comp.y + gs.dy));
			g.save();
			g.setColor(GHOST_COLOR);
			g.setLineWidth(WIRE_WIDTH);
			for (const w of ws.selectedWires) {
				g.drawLine(locX(w.e0) + gs.dx, locY(w.e0) + gs.dy, locX(w.e1) + gs.dx, locY(w.e1) + gs.dy);
			}
			g.restore();
		}

		if (gs.mode === "rect") {
			const x = Math.min(gs.x0, gs.x1);
			const y = Math.min(gs.y0, gs.y1);
			const w = Math.abs(gs.x1 - gs.x0);
			const h = Math.abs(gs.y1 - gs.y0);
			g.save();
			g.setColor("rgba(37, 99, 235, 0.08)");
			g.fillRect(x, y, w, h);
			g.setColor("#2563eb");
			g.setLineWidth(1 / getView().zoom);
			g.drawRect(x, y, w, h);
			g.restore();
		}

		if ((ws.tool.kind === "edit" || ws.tool.kind === "wiring") && hoverPoint !== null && gs.mode === "none") {
			if (ws.tool.kind === "wiring" || isConnectable(circuit, hoverPoint)) {
				g.save();
				g.setColor("rgba(37, 99, 235, 0.9)");
				g.setLineWidth(1.5);
				g.drawOval(locX(hoverPoint) - 5, locY(hoverPoint) - 5, 10, 10);
				g.restore();
			}
		}
	};

	// paint
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || size.w === 0) return;
		const frame = requestAnimationFrame(() => {
			const dpr = window.devicePixelRatio || 1;
			if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
				canvas.width = Math.round(size.w * dpr);
				canvas.height = Math.round(size.h * dpr);
			}
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const view = getView();
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, size.w, size.h);
			drawGrid(ctx, view, size.w, size.h);
			ctx.setTransform(
				dpr * view.zoom,
				0,
				0,
				dpr * view.zoom,
				-view.originX * view.zoom * dpr,
				-view.originY * view.zoom * dpr,
			);
			const g = new CanvasGraphics(ctx);
			drawCircuit(g, circuit, ws.viewState, {
				showGrid: true,
				gateShape: prefs.gateShape,
				selected: ws.selection,
				selectedWires: ws.selectedWires,
				hovered: ws.tool.kind === "add" ? null : hovered,
			});
			drawOverlay(g);
		});
		return () => cancelAnimationFrame(frame);
	});

	// --- pointer handling --------------------------------------------------

	const toCircuit = (clientX: number, clientY: number) => {
		const rect = canvasRef.current?.getBoundingClientRect();
		const v = getView();
		const sx = clientX - (rect?.left ?? 0);
		const sy = clientY - (rect?.top ?? 0);
		return { sx, sy, x: v.originX + sx / v.zoom, y: v.originY + sy / v.zoom };
	};

	const onPointerDown = (e: React.PointerEvent) => {
		(e.target as Element).setPointerCapture(e.pointerId);
		const p = toCircuit(e.clientX, e.clientY);
		pointers.current.set(e.pointerId, { x: p.sx, y: p.sy });
		if (pointers.current.size === 2) {
			cancelLongPress();
			const [a, b] = Array.from(pointers.current.values());
			gesture.current = {
				mode: "pinch",
				dist: Math.hypot(a.x - b.x, a.y - b.y),
				mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
			};
			redraw();
			return;
		}
		if (pointers.current.size > 2) return;
		const touch = e.pointerType !== "mouse";
		const d = down.current;
		d.sx = p.sx;
		d.sy = p.sy;
		d.moved = false;
		d.target = null;
		d.wire = null;
		const gp = loc(snap(p.x), snap(p.y));
		if (!touch) setHoverPoint(gp);

		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			gesture.current = { mode: "pan" };
			return;
		}
		const tool = ws.tool;
		const target = hitComponent(circuit, p.x, p.y);
		// Logisim maps Button3 and Ctrl+Button1 to the Menu Tool
		if (e.button === 2 || (e.button === 0 && e.ctrlKey && !e.metaKey)) {
			gesture.current = { mode: "none" };
			if (target && tool.kind !== "text") onComponentMenu?.(target, e.clientX, e.clientY);
			return;
		}
		d.target = target;
		cancelLongPress();
		if (touch && target && (tool.kind === "edit" || tool.kind === "wiring") && onComponentMenu) {
			const { clientX, clientY } = e;
			longPress.current = setTimeout(() => {
				longPress.current = null;
				if (down.current.moved || pointers.current.size !== 1) return;
				gesture.current = { mode: "none" };
				onComponentMenu(target, clientX, clientY);
				redraw();
			}, LONG_PRESS_MS);
		}

		switch (tool.kind) {
			case "text":
				e.preventDefault();
				ws.beginTextEditing(Math.round(p.x), Math.round(p.y));
				gesture.current = { mode: "none" };
				return;
			case "poke":
				gesture.current =
					target && ws.pokePress(target, Math.round(p.x), Math.round(p.y))
						? { mode: "poke" }
						: { mode: "pan" };
				return;
			case "add":
				setHoverPoint(gp);
				gesture.current = { mode: "place" };
				return;
			case "wiring":
				gesture.current = { mode: "wire", start: gp, end: gp, horizontalFirst: null };
				return;
			case "edit": {
				const tol = Math.max(3, 6 / getView().zoom);
				const nearPoint = Math.hypot(p.x - locX(gp), p.y - locY(gp)) <= tol + 2;
				const onSelectedBody = target !== null && ws.selection.has(target) && !isPort(target, gp);
				if (nearPoint && isConnectable(circuit, gp) && !onSelectedBody) {
					gesture.current = { mode: "wire", start: gp, end: gp, horizontalFirst: null };
					return;
				}
				if (target) {
					if (!ws.selection.has(target)) ws.select(target, e.shiftKey);
					gesture.current = { mode: "move", startX: p.x, startY: p.y, dx: 0, dy: 0 };
					return;
				}
				const w = hitWire(circuit, p.x, p.y, tol);
				if (w) {
					d.wire = w;
					if (!ws.selectedWires.has(w)) ws.selectWire(w, e.shiftKey);
					gesture.current = { mode: "move", startX: p.x, startY: p.y, dx: 0, dy: 0 };
					return;
				}
				gesture.current = touch ? { mode: "pan" } : { mode: "rect", x0: p.x, y0: p.y, x1: p.x, y1: p.y };
				return;
			}
		}
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const p = toCircuit(e.clientX, e.clientY);
		const gs = gesture.current;
		const gp = loc(snap(p.x), snap(p.y));
		if (!pointers.current.has(e.pointerId)) {
			if (e.pointerType === "mouse") {
				const h = hitComponent(circuit, p.x, p.y);
				if (h !== hovered) setHovered(h);
				if (gp !== hoverPoint) setHoverPoint(gp);
				if (ws.tool.kind === "poke") setCursor(h?.factory.createPoker(h) ? "pointer" : "default");
				else if (ws.tool.kind === "text") setCursor("text");
				else if (ws.tool.kind === "add" || ws.tool.kind === "wiring") setCursor("crosshair");
				else setCursor(isConnectable(circuit, gp) ? "crosshair" : h ? "move" : "default");
			}
			return;
		}
		const prev = pointers.current.get(e.pointerId) as { x: number; y: number };
		pointers.current.set(e.pointerId, { x: p.sx, y: p.sy });
		const v = getView();
		const d = down.current;
		if (Math.hypot(p.sx - d.sx, p.sy - d.sy) > 4) {
			d.moved = true;
			cancelLongPress();
		}

		switch (gs.mode) {
			case "pinch": {
				if (pointers.current.size < 2) return;
				const [a, b] = Array.from(pointers.current.values());
				const dist = Math.hypot(a.x - b.x, a.y - b.y);
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				v.originX -= (mid.x - gs.mid.x) / v.zoom;
				v.originY -= (mid.y - gs.mid.y) / v.zoom;
				if (gs.dist > 0) zoomAround(v, dist / gs.dist, mid.x, mid.y);
				gs.dist = dist;
				gs.mid = mid;
				onZoomChange?.(v.zoom);
				redraw();
				return;
			}
			case "poke":
				ws.pokeDrag(Math.round(p.x), Math.round(p.y));
				return;
			case "pan":
				if (d.moved) {
					v.originX -= (p.sx - prev.x) / v.zoom;
					v.originY -= (p.sy - prev.y) / v.zoom;
					setCursor("grabbing");
					redraw();
				}
				return;
			case "wire":
				if (gs.horizontalFirst === null && gp !== gs.start) {
					gs.horizontalFirst = Math.abs(p.x - locX(gs.start)) >= Math.abs(p.y - locY(gs.start));
				}
				gs.end = gp;
				redraw();
				return;
			case "move":
				gs.dx = snap(p.x - gs.startX);
				gs.dy = snap(p.y - gs.startY);
				redraw();
				return;
			case "rect":
				gs.x1 = p.x;
				gs.y1 = p.y;
				redraw();
				return;
			case "place":
				setHoverPoint(gp);
				return;
		}
	};

	const onPointerUp = (e: React.PointerEvent) => {
		const p = toCircuit(e.clientX, e.clientY);
		pointers.current.delete(e.pointerId);
		cancelLongPress();
		const gs = gesture.current;
		const d = down.current;
		if (gs.mode === "pinch") {
			if (pointers.current.size === 0) gesture.current = { mode: "none" };
			return;
		}
		gesture.current = { mode: "none" };
		setCursor("default");
		if (e.pointerType !== "mouse") setHoverPoint(null);

		switch (gs.mode) {
			case "poke":
				ws.pokeRelease(Math.round(p.x), Math.round(p.y));
				break;
			case "place":
				ws.placeComponent(loc(snap(p.x), snap(p.y)));
				return;
			case "wire":
				if (gs.end !== gs.start) {
					ws.addWires(wirePath(gs.start, gs.end, gs.horizontalFirst ?? true));
					return;
				}
				if (d.target) ws.select(d.target, e.shiftKey);
				else {
					const w = hitWire(circuit, p.x, p.y, 4);
					if (w) ws.selectWire(w, e.shiftKey);
					else ws.select(null);
				}
				break;
			case "move":
				if (gs.dx !== 0 || gs.dy !== 0) {
					ws.moveSelection(gs.dx, gs.dy);
					return;
				}
				if (!d.moved) {
					if (d.target) ws.select(d.target, e.shiftKey);
					else if (d.wire) ws.selectWire(d.wire, e.shiftKey);
				}
				break;
			case "rect":
				if (d.moved) {
					ws.selectRect(gs.x0, gs.y0, gs.x1, gs.y1, e.shiftKey);
					return;
				}
				ws.select(null);
				break;
			case "pan":
				if (!d.moved && ws.tool.kind === "edit") ws.select(null);
				break;
		}

		// double click / double tap on a subcircuit: look inside
		if (!d.moved) {
			const now = performance.now();
			const target = d.target;
			if (target && lastTap.current.inst === target && now - lastTap.current.t < 350) {
				if (target.factory instanceof SubcircuitFactory) ws.enterSubcircuit(target);
				lastTap.current = { t: 0, inst: null };
			} else {
				lastTap.current = { t: now, inst: target };
				if (ws.tool.kind === "poke" && target) ws.select(target);
			}
		}
		redraw();
	};

	const onWheel = (e: React.WheelEvent) => {
		const v = getView();
		const p = toCircuit(e.clientX, e.clientY);
		if (e.ctrlKey || e.metaKey) {
			zoomAround(v, Math.exp(-e.deltaY * 0.01), p.sx, p.sy);
			onZoomChange?.(v.zoom);
		} else {
			v.originX += e.deltaX / v.zoom;
			v.originY += e.deltaY / v.zoom;
		}
		redraw();
	};

	const textEditing = ws.textEditing;
	const textGeometry = textEditing ? textEditorGeometry(textEditing) : null;
	const view = getView();

	void version;

	return (
		<div ref={wrapRef} className="absolute inset-0 overflow-hidden overscroll-contain">
			<canvas
				ref={canvasRef}
				style={{ width: size.w, height: size.h, cursor }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onPointerLeave={() => {
					setHovered(null);
					if (gesture.current.mode === "none") setHoverPoint(null);
				}}
				onWheel={onWheel}
				onContextMenu={(e) => e.preventDefault()}
			/>
			{textEditing && textGeometry && (
				<input
					ref={textInputRef}
					aria-label="Editar texto en el circuito"
					value={textEditing.draft}
					className="absolute rounded-sm border border-accent bg-white px-1 text-black outline-none"
					style={{
						left: (textGeometry.bounds.x - view.originX) * view.zoom - 5,
						top: (textGeometry.bounds.y - view.originY) * view.zoom - 3,
						width: Math.max(96, textGeometry.bounds.width * view.zoom + 14),
						height: Math.max(24, textGeometry.bounds.height * view.zoom + 6),
						font: cssFont({ ...textGeometry.font, size: textGeometry.font.size * view.zoom }),
					}}
					onChange={(e) => ws.updateTextDraft(e.target.value)}
					onBlur={() => ws.finishTextEditing()}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") {
							e.preventDefault();
							ws.finishTextEditing();
						} else if (e.key === "Escape") {
							e.preventDefault();
							ws.finishTextEditing(false);
						}
					}}
				/>
			)}
		</div>
	);
});

function zoomAround(v: Viewport, factor: number, sx: number, sy: number): void {
	const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
	const cx = v.originX + sx / v.zoom;
	const cy = v.originY + sy / v.zoom;
	v.zoom = newZoom;
	v.originX = cx - sx / newZoom;
	v.originY = cy - sy / newZoom;
}

function fitInto(v: Viewport, circuit: Circuit, w: number, h: number): void {
	const b = circuitBounds(circuit);
	if (b.isEmpty() || w === 0) {
		v.zoom = w < 600 ? 1.5 : 1;
		v.originX = 0;
		v.originY = 0;
		return;
	}
	const margin = 40;
	const zoom = Math.min(
		2,
		Math.max(MIN_ZOOM, Math.min((w - 2 * margin) / b.width, (h - 2 * margin) / b.height)),
	);
	v.zoom = zoom;
	v.originX = b.x + b.width / 2 - w / (2 * zoom);
	v.originY = b.y + b.height / 2 - h / (2 * zoom);
}
