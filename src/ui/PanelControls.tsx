"use client";

import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { usePreference } from "./preferences";

export function Disclosure({
	id,
	title,
	children,
	defaultOpen = true,
}: {
	id: string;
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = usePreference(`section.${id}`, defaultOpen);
	return (
		<details
			open={open}
			onToggle={(e) => setOpen(e.currentTarget.open)}
			className="disclosure-motion group/disclosure"
		>
			<summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:bg-black/5">
				<ChevronRight className="size-3.5 transition-transform group-open/disclosure:rotate-90" />
				{title}
			</summary>
			{children}
		</details>
	);
}

export function PanelResize({
	side,
	width,
	onChange,
}: {
	side: "left" | "right";
	width: number;
	onChange: (width: number) => void;
}) {
	const start = useRef<{ x: number; width: number } | null>(null);
	const minimum = side === "left" ? 200 : 240;
	const maximum = 420;
	const clamp = (value: number) => Math.max(minimum, Math.min(maximum, value));
	return (
		<hr
			aria-orientation="vertical"
			aria-label={side === "left" ? "Ancho de componentes y circuitos" : "Ancho de atributos"}
			aria-valuemin={minimum}
			aria-valuemax={maximum}
			aria-valuenow={clamp(width)}
			tabIndex={0}
			className={`panel-resize panel-resize-${side} h-full w-1.5 shrink-0 border-0 cursor-col-resize touch-none bg-line/50 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none`}
			title="Arrastrá para ajustar · flechas para cambiar el ancho · doble clic para restaurar"
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				start.current = { x: e.clientX, width: clamp(width) };
				e.currentTarget.setPointerCapture(e.pointerId);
				e.preventDefault();
			}}
			onPointerMove={(e) => {
				if (start.current)
					onChange(clamp(start.current.width + (e.clientX - start.current.x) * (side === "left" ? 1 : -1)));
			}}
			onPointerUp={() => {
				start.current = null;
			}}
			onPointerCancel={() => {
				start.current = null;
			}}
			onLostPointerCapture={() => {
				start.current = null;
			}}
			onDoubleClick={() => onChange(side === "left" ? 256 : 288)}
			onKeyDown={(e) => {
				if (e.key === "Home") onChange(minimum);
				else if (e.key === "End") onChange(maximum);
				else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
					onChange(clamp(width + (e.key === "ArrowRight" ? 10 : -10) * (side === "left" ? 1 : -1)));
				else return;
				e.preventDefault();
				e.stopPropagation();
			}}
		/>
	);
}
