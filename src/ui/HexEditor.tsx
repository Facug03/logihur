"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexFormatError, loadImage, type MemContents, saveImage } from "@/components/memory/mem-contents";
import { localized, type Message, renderMessage, t } from "@/i18n/i18n";

const COLUMNS = 16;
const ROW_HEIGHT = 28;
const VIEW_HEIGHT = 336;
const buttonClass = "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-black/5";

export function downloadMemory(contents: MemContents, name = "memoria.hex"): void {
	const url = URL.createObjectURL(new Blob([saveImage(contents)], { type: "text/plain" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function memoryImageError(error: unknown): string {
	return error instanceof HexFormatError ? t(error.message) : t("No se pudo leer la imagen de memoria.");
}

/** Edits an isolated snapshot; only Accept commits it to the workspace. */
export function HexEditor({
	contents,
	onAccept,
	onClose,
}: {
	contents: MemContents;
	onAccept: (contents: MemContents) => void;
	onClose: () => void;
}) {
	const [memory, setMemory] = useState(() => contents.clone());
	const [revision, setRevision] = useState(0);
	const [scrollTop, setScrollTop] = useState(0);
	const [address, setAddress] = useState(0);
	const [draft, setDraft] = useState<string | null>(null);
	const [error, setError] = useState<Message | null>(null);
	const [jump, setJump] = useState("");
	const dialogRef = useRef<HTMLDialogElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef<HTMLInputElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const digits = Math.ceil(memory.dataWidth / 4);
	const addressDigits = Math.ceil(memory.logLength / 4);
	const rows = Math.ceil((memory.lastOffset + 1) / COLUMNS);
	const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
	const lastRow = Math.min(rows, firstRow + Math.ceil(VIEW_HEIGHT / ROW_HEIGHT) + 5);
	const hex = (value: number, width: number) => (value >>> 0).toString(16).toUpperCase().padStart(width, "0");

	useEffect(() => {
		const previous = document.activeElement;
		dialogRef.current?.showModal();
		activeRef.current?.focus();
		return () => {
			dialogRef.current?.close();
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, []);

	function commit(): boolean {
		if (draft === null) return true;
		if (!/^[0-9a-fA-F]+$/.test(draft) || Number.parseInt(draft, 16) >= 2 ** memory.dataWidth) {
			setError(() =>
				localized("Ingresá un valor hexadecimal entre 0 y {0}.", [hex(2 ** memory.dataWidth - 1, digits)]),
			);
			return false;
		}
		memory.set(address, Number.parseInt(draft, 16));
		setRevision((v) => v + 1);
		setDraft(null);
		setError(null);
		return true;
	}

	function navigate(next: number): void {
		if (!commit()) return;
		const target = Math.max(0, Math.min(memory.lastOffset, next));
		setAddress(target);
		const viewport = viewportRef.current;
		if (viewport) {
			const top = Math.floor(target / COLUMNS) * ROW_HEIGHT;
			if (top < viewport.scrollTop) viewport.scrollTop = top;
			else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight) {
				viewport.scrollTop = top + ROW_HEIGHT - viewport.clientHeight;
			}
			setScrollTop(viewport.scrollTop);
		}
		requestAnimationFrame(() => {
			activeRef.current?.focus();
			activeRef.current?.select();
		});
	}

	return createPortal(
		<dialog
			ref={dialogRef}
			aria-labelledby="hex-title"
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}
			onKeyDown={(e) => e.stopPropagation()}
			className="modal-motion fixed inset-0 m-auto max-h-[96dvh] w-[min(960px,96vw)] overflow-auto rounded-xl border border-line bg-white p-4 shadow-xl backdrop:bg-black/40"
		>
			<h2 id="hex-title" className="text-lg font-semibold">
				{t("Editar contenidos de memoria")}
			</h2>
			<p className="mb-3 text-sm text-muted">
				{t("{0} direcciones · {1} bits · valores hexadecimales", [memory.lastOffset + 1, memory.dataWidth])}
			</p>
			<div className="mb-3 flex flex-wrap gap-2">
				<button type="button" className={buttonClass} onClick={() => fileRef.current?.click()}>
					{t("Cargar imagen")}
				</button>
				<button
					type="button"
					className={buttonClass}
					onClick={() => {
						if (commit()) downloadMemory(memory);
					}}
				>
					{t("Guardar imagen")}
				</button>
				<button
					type="button"
					className={buttonClass}
					onClick={() => {
						memory.clear();
						setDraft(null);
						setError(null);
						setRevision((v) => v + 1);
					}}
				>
					{t("hex.clear")}
				</button>
				<input
					ref={fileRef}
					type="file"
					accept=".hex,.txt"
					className="hidden"
					aria-label={t("Cargar imagen de memoria")}
					onChange={async (e) => {
						const file = e.target.files?.[0];
						e.target.value = "";
						if (!file) return;
						try {
							const next = memory.clone();
							loadImage(next, await file.text());
							setMemory(next);
							setDraft(null);
							setError(null);
						} catch (err) {
							setError(() => () => memoryImageError(err));
						}
					}}
				/>
				<form
					className="flex items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (!/^[0-9a-fA-F]+$/.test(jump) || Number.parseInt(jump, 16) > memory.lastOffset) {
							setError(() => localized("La dirección hexadecimal está fuera de la memoria."));
							return;
						}
						navigate(Number.parseInt(jump, 16));
					}}
				>
					<label htmlFor="hex-jump" className="text-sm">
						{t("Dirección")}
					</label>
					<input
						id="hex-jump"
						value={jump}
						onChange={(e) => setJump(e.target.value)}
						className="w-20 rounded border border-line px-2 py-1 font-mono"
					/>
					<button type="submit" className={buttonClass}>
						{t("Ir")}
					</button>
				</form>
			</div>
			<div className="overflow-x-auto rounded border border-line">
				<div style={{ minWidth: Math.max(880, 80 + COLUMNS * (digits * 8 + 12)) }}>
					<div className="grid grid-cols-[80px_repeat(16,minmax(0,1fr))] bg-panel text-center font-mono text-xs leading-7">
						<span>{t("Dirección")}</span>
						{Array.from({ length: COLUMNS }, (_, i) => hex(i, 1)).map((column) => (
							<span key={column}>{column}</span>
						))}
					</div>
					<div
						ref={viewportRef}
						onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
						style={{ height: `min(${VIEW_HEIGHT}px, 45dvh)` }}
						className="overflow-y-auto"
					>
						<div style={{ height: rows * ROW_HEIGHT, position: "relative" }} data-revision={revision}>
							{Array.from({ length: lastRow - firstRow }, (_, i) => firstRow + i).map((row) => (
								<div
									key={row}
									style={{ position: "absolute", top: row * ROW_HEIGHT, height: ROW_HEIGHT, width: "100%" }}
									className="grid grid-cols-[80px_repeat(16,minmax(0,1fr))] items-center font-mono text-xs"
								>
									<span className="text-center text-muted">{hex(row * COLUMNS, addressDigits)}</span>
									{Array.from(
										{ length: Math.min(COLUMNS, memory.lastOffset + 1 - row * COLUMNS) },
										(_, col) => {
											const addr = row * COLUMNS + col;
											return (
												<input
													key={addr}
													ref={addr === address ? activeRef : undefined}
													aria-label={t("Dirección {0}", [hex(addr, addressDigits)])}
													spellCheck={false}
													value={addr === address && draft !== null ? draft : hex(memory.get(addr), digits)}
													className="min-w-0 border border-transparent px-0.5 py-1 text-center outline-none focus:border-accent focus:bg-accent/10"
													onFocus={(e) => {
														if (addr !== address) setDraft(null);
														setAddress(addr);
														e.target.select();
													}}
													onChange={(e) => setDraft(e.target.value)}
													onBlur={() => {
														commit();
													}}
													onKeyDown={(e) => {
														const delta: Record<string, number> = {
															ArrowLeft: -1,
															ArrowRight: 1,
															ArrowUp: -COLUMNS,
															ArrowDown: COLUMNS,
															Enter: 1,
															Tab: e.shiftKey ? -1 : 1,
														};
														if (
															delta[e.key] !== undefined &&
															!(
																e.key === "Tab" &&
																(addr + delta[e.key] < 0 || addr + delta[e.key] > memory.lastOffset)
															)
														) {
															e.preventDefault();
															navigate(addr + delta[e.key]);
														}
													}}
												/>
											);
										},
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			{error && (
				<p role="alert" className="mt-2 text-sm text-red-600">
					{error && renderMessage(error)}
				</p>
			)}
			<p className="mt-2 text-xs text-muted">
				{t("Flechas para navegar · Enter o Tab para avanzar · Cancelar descarta los cambios.")}
			</p>
			<div className="mt-4 flex justify-end gap-2">
				<button type="button" className={buttonClass} onClick={onClose}>
					{t("Cancelar")}
				</button>
				<button
					type="button"
					className={`${buttonClass} bg-accent text-white`}
					onClick={() => {
						if (commit()) onAccept(memory.clone());
					}}
				>
					{t("Aceptar")}
				</button>
			</div>
		</dialog>,
		document.body,
	);
}
