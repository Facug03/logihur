"use client";

// Entry points of the analyzer, as in Logisim: Proyecto > Analizar Circuito
// (recomputes from the viewed circuit) and Ventana > Análisis Combinacional
// (reopens the window as it was left).

import { AppWindow, ChevronDown, Sigma, Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "@/i18n/i18n";
import { Tooltip } from "../Tooltip";

export function AnalyzeMenu({
	circuitName,
	onAnalyze,
	onOpen,
}: {
	circuitName: string;
	onAnalyze: () => void;
	onOpen: () => void;
}) {
	const id = useId();
	const ref = useRef<HTMLElement>(null);
	const [position, setPosition] = useState({ left: 8, top: 52 });
	useEffect(() => {
		const hide = () => ref.current?.hidePopover();
		window.addEventListener("resize", hide);
		return () => window.removeEventListener("resize", hide);
	}, []);
	const item = "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-black/5";
	return (
		<>
			<Tooltip
				label={t("analyze.windowTitle")}
				description={t(
					"Tabla de verdad, expresiones, mapa de Karnaugh y construcción de circuitos combinacionales.",
				)}
			>
				{(tooltipId) => (
					<button
						type="button"
						popoverTarget={id}
						aria-describedby={tooltipId}
						aria-label={t("analyze.windowTitle")}
						onClick={(e) => {
							const bounds = e.currentTarget.getBoundingClientRect();
							setPosition({
								left: Math.max(8, Math.min(bounds.left, window.innerWidth - 296)),
								top: bounds.bottom + 6,
							});
						}}
						className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-md px-1.5 press hover:bg-black/5"
					>
						<Sigma className="size-[18px]" />
						<ChevronDown className="size-3 text-muted" />
					</button>
				)}
			</Tooltip>
			<section
				ref={ref}
				id={id}
				popover="auto"
				aria-label={t("analyze.windowTitle")}
				style={position}
				className="popover-motion fixed inset-auto m-0 w-72 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-panel p-2 text-foreground shadow-lg"
			>
				<button
					type="button"
					className={item}
					onClick={() => {
						ref.current?.hidePopover();
						onAnalyze();
					}}
				>
					<Table2 className="mt-0.5 size-4 shrink-0" />
					<span>
						{t("analyze.projectAnalyzeCircuitItem")}
						<span className="block truncate text-xs text-muted">
							{t("Calcula la tabla y las expresiones de «{0}»", [circuitName])}
						</span>
					</span>
				</button>
				<button
					type="button"
					className={item}
					onClick={() => {
						ref.current?.hidePopover();
						onOpen();
					}}
				>
					<AppWindow className="mt-0.5 size-4 shrink-0" />
					<span>
						{t("analyze.windowTitle")}
						<span className="block text-xs text-muted">
							{t("Abre la ventana como la dejaste, para editar la tabla a mano")}
						</span>
					</span>
				</button>
			</section>
		</>
	);
}
