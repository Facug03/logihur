"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const GROUPS = [
	{
		title: "Archivo y edición",
		entries: [
			["Ctrl/⌘ + O", "Abrir .circ"],
			["Ctrl/⌘ + S", "Descargar .circ"],
			["Ctrl/⌘ + Z", "Deshacer"],
			["Ctrl/⌘ + Y / Shift + Z", "Rehacer"],
			["Ctrl/⌘ + C / X / V", "Copiar / cortar / pegar"],
			["Ctrl/⌘ + D", "Duplicar"],
			["Ctrl/⌘ + A", "Seleccionar todo"],
			["Supr / Retroceso", "Borrar selección"],
		],
	},
	{
		title: "Lienzo y componentes",
		entries: [
			["Esc", "Volver a edición / cancelar"],
			["Texto: Enter / Esc", "Confirmar / cancelar edición de texto"],
			["Flechas", "Orientar el componente"],
			["2–9", "Cambiar entradas de una puerta"],
			["Shift + clic / arrastre", "Sumar a la selección"],
			["Alt + arrastre / botón central", "Desplazar el lienzo"],
			["Ctrl/⌘ + rueda / pellizco", "Zoom sobre el puntero"],
			["Rueda", "Desplazar el lienzo"],
		],
	},
	{
		title: "Simulación",
		entries: [
			["Ctrl/⌘ + E", "Pausar / reanudar simulación"],
			["Ctrl/⌘ + I", "Un paso de propagación"],
			["Ctrl/⌘ + T", "Conmutar reloj una vez"],
			["Ctrl/⌘ + K", "Activar / detener ticks"],
			["Ctrl/⌘ + R", "Reiniciar simulación"],
			["Tocar + clic", "Cambiar pines, relojes y controles"],
			["Tocar + teclas", "Editar registros, memorias o teclado"],
			["Ctrl + L (en Teclado)", "Enviar borrado de pantalla al TTY"],
		],
	},
	{
		title: "Paneles y ayuda",
		entries: [
			["?", "Consultar estos atajos"],
			["Flechas (en separador)", "Ajustar ancho del panel"],
			["Doble clic en separador", "Restaurar ancho original"],
		],
	},
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const previous = document.activeElement;
		const dialog = ref.current;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby="shortcuts-title"
			onCancel={onClose}
			className="m-auto max-h-[85dvh] w-[min(640px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-line bg-panel p-5 text-foreground shadow-xl backdrop:bg-black/30"
		>
			<div className="flex items-center justify-between gap-3">
				<h2 id="shortcuts-title" className="text-lg font-semibold">
					Atajos de teclado
				</h2>
				<button
					type="button"
					aria-label="Cerrar atajos"
					onClick={onClose}
					className="rounded-md p-2 hover:bg-black/5"
				>
					<X className="size-5" />
				</button>
			</div>
			<p className="mt-1 text-xs text-muted">
				Usá Ctrl en Windows/Linux o ⌘ en Mac. Mientras escribís en un campo, los atajos del editor quedan
				suspendidos.
			</p>
			{GROUPS.map((group) => (
				<section key={group.title} className="mt-5">
					<h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
					<dl className="divide-y divide-line text-xs">
						{group.entries.map(([keys, action]) => (
							<div key={keys} className="grid grid-cols-2 gap-3 py-2">
								<dt>
									<kbd className="font-mono text-muted">{keys}</kbd>
								</dt>
								<dd>{action}</dd>
							</div>
						))}
					</dl>
				</section>
			))}
		</dialog>
	);
}
