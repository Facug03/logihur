"use client";

import { useEffect, useRef } from "react";

export function DeleteProjectDialog({
	name,
	onClose,
	onConfirm,
}: {
	name: string;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const previous = document.activeElement;
		const dialog = ref.current;
		dialog?.showModal();
		cancelRef.current?.focus();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby="delete-project-title"
			aria-describedby="delete-project-description"
			onCancel={onClose}
			className="m-auto w-[min(440px,calc(100vw-24px))] rounded-xl border border-line bg-panel p-5 text-foreground shadow-xl backdrop:bg-black/30"
		>
			<h2 id="delete-project-title" className="text-lg font-semibold">
				Eliminar proyecto
			</h2>
			<p id="delete-project-description" className="mt-3 break-words text-sm">
				¿Querés eliminar <strong>{name}</strong>? Se borrará su copia de este navegador y no podrás
				recuperarla. Los archivos .circ descargados se conservan.
			</p>
			<div className="mt-5 flex justify-end gap-2">
				<button
					ref={cancelRef}
					type="button"
					onClick={onClose}
					className="rounded-md border border-line px-3 py-2 text-sm hover:bg-black/5"
				>
					Cancelar
				</button>
				<button
					type="button"
					onClick={onConfirm}
					className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
				>
					Eliminar proyecto
				</button>
			</div>
		</dialog>
	);
}
