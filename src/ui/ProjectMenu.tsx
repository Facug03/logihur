"use client";

import { Check, ChevronDown, Download, Files, Share, Trash2, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "@/i18n/i18n";
import type { PwaState } from "./pwa";
import type { Workspace } from "./workspace";

export function ProjectMenu({
	ws,
	onSelect,
	onDelete,
	pwa,
	onInstall,
}: {
	ws: Workspace;
	onSelect: () => void;
	onDelete: (project: { id: number; name: string }) => void;
	pwa: PwaState;
	onInstall: () => void;
}) {
	const id = useId();
	const ref = useRef<HTMLElement>(null);
	const [position, setPosition] = useState({ left: 8, top: 52 });
	const close = () => ref.current?.hidePopover();
	useEffect(() => {
		const hide = () => ref.current?.hidePopover();
		window.addEventListener("resize", hide);
		return () => window.removeEventListener("resize", hide);
	}, []);
	return (
		<>
			<button
				type="button"
				popoverTarget={id}
				aria-label={t("Proyectos: {0}", [ws.fileName])}
				onClick={(e) => {
					const bounds = e.currentTarget.getBoundingClientRect();
					setPosition({
						left: Math.max(8, Math.min(bounds.left, window.innerWidth - 296)),
						top: bounds.bottom + 6,
					});
				}}
				className="mr-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 hover:bg-black/5"
			>
				<Files className="size-[18px] md:hidden" />
				<span className="hidden flex-col text-left leading-tight md:flex">
					<span className="text-sm font-semibold tracking-tight">{t("LogiHUR")}</span>
					<span className="max-w-32 truncate font-mono text-[10px] text-muted">
						{ws.fileName}
						{ws.dirty ? " •" : ""}
					</span>
				</span>
				<ChevronDown className="size-3 text-muted" />
			</button>
			<section
				ref={ref}
				id={id}
				popover="auto"
				aria-label={t("Proyectos")}
				style={position}
				className="popover-motion fixed inset-auto m-0 w-72 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-panel p-2 text-foreground shadow-lg"
			>
				<p className="px-2 py-1 text-xs font-semibold text-muted">{t("Proyectos")}</p>
				{ws.canReturnToProject && (
					<button
						type="button"
						onClick={() => {
							close();
							ws.returnToProject();
							onSelect();
						}}
						className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-black/5"
					>
						<Undo2 className="size-4 shrink-0" />
						{ws.returnToProjectLabel}
					</button>
				)}
				<div className="max-h-[60dvh] overflow-y-auto">
					{ws.projects.map((project) => (
						<div key={project.id} className="flex items-center gap-1">
							<button
								type="button"
								aria-current={project.active ? "true" : undefined}
								onClick={() => {
									close();
									ws.switchProject(project.id);
									onSelect();
								}}
								className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-black/5 ${project.active ? "bg-accent/10" : ""}`}
							>
								<span className="size-4 shrink-0">{project.active && <Check className="size-4" />}</span>
								<span className="truncate">{project.name}</span>
							</button>
							<button
								type="button"
								aria-label={t("Eliminar {0}", [project.name])}
								title={t("Eliminar {0}", [project.name])}
								onClick={() => {
									close();
									onDelete(project);
								}}
								className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-red-600/10 hover:text-red-600"
							>
								<Trash2 className="size-4" />
							</button>
						</div>
					))}
				</div>
				{pwa.canInstall && (
					<button
						type="button"
						onClick={() => {
							close();
							onInstall();
						}}
						className="mt-1 flex w-full items-center gap-2 border-t border-line px-2 pt-3 pb-2 text-left text-sm hover:bg-black/5"
					>
						<Download className="size-4 shrink-0" />
						<span>
							{t("Instalar LogiHUR")}
							<span className="block text-xs text-muted">
								{t("Funciona sin conexión y abre archivos .circ")}
							</span>
						</span>
					</button>
				)}
				{pwa.iosHint && (
					<p className="mt-1 flex gap-2 border-t border-line px-2 pt-3 pb-1 text-xs text-muted">
						<Share className="size-4 shrink-0" />
						{t("Para instalarla: Compartir → Agregar a inicio. Después funciona sin conexión.")}
					</p>
				)}
			</section>
		</>
	);
}
