"use client";

// The appearance editor's attributes, shown in the Attributes panel like
// Logisim's attribute table: those of the selected shapes, or of the current
// drawing tool for the shapes it will create.

import type { PaintType, ToolStyle } from "@/editor/appearance-edit";
import type { AppearanceShape } from "@/engine/appearance";
import type { Direction } from "@/engine/geom";
import { msg, t } from "@/i18n/i18n";
import { APPEARANCE_TOOLS, shapeLabel } from "./AppearanceEditor";
import type { Workspace } from "./workspace";

type StyledShape = Extract<AppearanceShape, { paint: PaintType }>;

function Title({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<div className="border-b border-line px-4 py-3">
			<div className="truncate text-sm font-semibold">{title}</div>
			<div className="truncate text-[11px] text-muted">{subtitle}</div>
		</div>
	);
}

export function AppearanceAttributes({ ws }: { ws: Workspace }) {
	const shapes = ws.appearanceSelected;
	const single = shapes.length === 1 ? shapes[0] : null;
	const styled = shapes.some((s) => "paint" in s);
	const tool = ws.appearanceTool;
	const toolStyle = ws.appearanceStyle;
	const onToolStyle = (s: ToolStyle) => ws.setAppearanceStyle(s);
	const onChange = (label: string, fn: (s: AppearanceShape) => AppearanceShape) =>
		ws.updateAppearanceSelected(label, fn);
	const editingTool = shapes.length === 0;
	const toolLabel = APPEARANCE_TOOLS.find((x) => x.id === tool)?.label;
	const toolName = toolLabel ? t(toolLabel).replace(/ \(.*\)$/, "") : "";
	if (editingTool && tool === "select") {
		return (
			<div className="flex flex-col">
				<Title
					title={t("Apariencia de {0}", [ws.circuit.name])}
					subtitle={t("Cómo se ve al usarlo como subcircuito")}
				/>
				<p className="p-4 text-xs leading-relaxed text-muted">
					{t(
						"Elegí una figura para ver sus atributos, o una herramienta de dibujo para elegir los de las figuras nuevas. Los puertos (azul) y el ancla (verde) se mueven pero no se borran; arrastrar mueve en la grilla (Alt: libre) y las manijas cambian la forma.",
					)}
				</p>
			</div>
		);
	}
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
	const field =
		"grid grid-cols-[1fr_1.2fr] items-center gap-2 border-b border-line/60 px-4 py-1.5 text-[12px] leading-tight text-muted";
	const input = "w-full rounded border border-line bg-white px-1.5 py-1 text-xs text-foreground";
	return (
		<div className="flex flex-col">
			<Title
				title={
					editingTool
						? `Herramienta: ${toolName}`
						: shapes.length === 1
							? shapeLabel(shapes[0])
							: `${shapes.length} objetos`
				}
				subtitle={
					editingTool ? t("Atributos de las figuras nuevas") : t("Apariencia de {0}", [ws.circuit.name])
				}
			/>
			{single?.kind === "anchor" && (
				<label className={field}>
					{t("Orientación")}
					<select
						className={input}
						value={single.facing}
						onChange={(e) =>
							onChange(msg("Orientación"), (s) =>
								s.kind === "anchor" ? { ...s, facing: e.target.value as Direction } : s,
							)
						}
					>
						<option value="east">{t("Este")}</option>
						<option value="west">{t("Oeste")}</option>
						<option value="north">{t("Norte")}</option>
						<option value="south">{t("Sur")}</option>
					</select>
				</label>
			)}
			{(styled || (editingTool && tool !== "text")) && current && "paint" in current && (
				<>
					{(editingTool || !(first?.kind === "line" || (first?.kind === "poly" && !first.closed))) && (
						<label className={field}>
							{t("Tipo de pintura")}
							<select
								className={input}
								value={current.paint}
								onChange={(e) => set(msg("Tipo de pintura"), { paint: e.target.value })}
							>
								<option value="stroke">{t("Sólo borde")}</option>
								<option value="fill">{t("Sólo relleno")}</option>
								<option value="both">{t("Borde y relleno")}</option>
							</select>
						</label>
					)}
					<label className={field}>
						{t("Ancho del lápiz")}
						<input
							type="number"
							min={1}
							max={8}
							className={input}
							value={current.strokeWidth}
							onChange={(e) => {
								const v = Number(e.target.value);
								if (v >= 1 && v <= 8) set(msg("Ancho del lápiz"), { strokeWidth: v });
							}}
						/>
					</label>
					<label className={field}>
						{t("Color del lápiz")}
						<input
							className="h-7 w-full"
							type="color"
							value={current.stroke.slice(0, 7)}
							onChange={(e) => set(msg("Color del lápiz"), { stroke: e.target.value })}
						/>
					</label>
					<label className={field}>
						{t("Color de relleno")}
						<input
							className="h-7 w-full"
							type="color"
							value={current.fill.slice(0, 7)}
							onChange={(e) => set(msg("Color de relleno"), { fill: e.target.value })}
						/>
					</label>
				</>
			)}
			{single?.kind === "rect" && single.rx > 0 && (
				<label className={field}>
					{t("Radio de esquina")}
					<input
						type="number"
						min={1}
						max={1000}
						className={input}
						value={single.rx}
						onChange={(e) => {
							const v = Number(e.target.value);
							if (v >= 1 && v <= 1000)
								onChange(msg("Radio de esquina"), (s) => (s.kind === "rect" ? { ...s, rx: v } : s));
						}}
					/>
				</label>
			)}
			{text && (
				<>
					{single?.kind === "text" && (
						<label className={field}>
							{t("Texto")}
							<input
								className={input}
								value={single.text}
								onChange={(e) =>
									onChange(msg("Editar texto"), (s) =>
										s.kind === "text" ? { ...s, text: e.target.value } : s,
									)
								}
							/>
						</label>
					)}
					<label className={field}>
						{t("Fuente")}
						<select
							className={input}
							value={text.font.family}
							onChange={(e) => set(msg("Fuente"), { font: { ...text.font, family: e.target.value } })}
						>
							{["SansSerif", "Serif", "Monospaced"].map((f) => (
								<option key={f}>{f}</option>
							))}
						</select>
					</label>
					<label className={field}>
						{t("Tamaño")}
						<input
							type="number"
							min={4}
							max={72}
							className={input}
							value={text.font.size}
							onChange={(e) => {
								const v = Number(e.target.value);
								if (v >= 4 && v <= 72) set(msg("Fuente"), { font: { ...text.font, size: v } });
							}}
						/>
					</label>
					<label className={field}>
						{t("Estilo")}
						<select
							className={input}
							value={text.font.style}
							onChange={(e) => set(msg("Fuente"), { font: { ...text.font, style: e.target.value } })}
						>
							<option value="plain">{t("Normal")}</option>
							<option value="bold">{t("Negrita")}</option>
							<option value="italic">{t("Cursiva")}</option>
							<option value="bolditalic">{t("Negrita cursiva")}</option>
						</select>
					</label>
					<label className={field}>
						{t("Alineación")}
						<select
							className={input}
							value={text.align}
							onChange={(e) => set(msg("Alineación"), { align: e.target.value })}
						>
							<option value="start">{t("Izquierda")}</option>
							<option value="middle">{t("Centro")}</option>
							<option value="end">{t("Derecha")}</option>
						</select>
					</label>
					<label className={field}>
						{t("Color")}
						<input
							className="h-7 w-full"
							type="color"
							value={("textFill" in text ? text.textFill : text.fill).slice(0, 7)}
							onChange={(e) =>
								set(msg("Color"), editingTool ? { textFill: e.target.value } : { fill: e.target.value })
							}
						/>
					</label>
				</>
			)}
		</div>
	);
}
