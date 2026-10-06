"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { msg, t } from "@/i18n/i18n";

const GROUPS = [
	{
		title: msg("Archivo y edición"),
		entries: [
			[msg("Ctrl/⌘ + O"), msg("Abrir .circ")],
			[msg("Ctrl/⌘ + S"), msg("Descargar .circ")],
			[msg("Ctrl/⌘ + Z"), msg("Deshacer")],
			[msg("Ctrl/⌘ + Y / Shift + Z"), msg("Rehacer")],
			[msg("Ctrl/⌘ + C / X / V"), msg("Copiar / cortar / pegar")],
			[msg("Ctrl/⌘ + D / Insert"), msg("Duplicar")],
			[msg("Ctrl/⌘ + A"), msg("Seleccionar todo")],
			[msg("Supr / Retroceso"), msg("Borrar selección")],
			[msg("Retroceso (sin selección)"), msg("Quitar el componente o cable recién agregado")],
		],
	},
	{
		title: msg("Herramientas"),
		entries: [
			[msg("Ctrl/⌘ + 1 … 4"), msg("Tocar, Editar, Cablear, Texto")],
			[msg("Ctrl/⌘ + 5 … 9"), msg("Pin de entrada, pin de salida, NOT, AND, OR")],
			[msg("Esc"), msg("Volver a edición / cancelar")],
		],
	},
	{
		title: msg("Lienzo y componentes"),
		entries: [
			[msg("Texto: Enter / Esc"), msg("Confirmar / cancelar edición de texto")],
			[msg("Flechas"), msg("Orientar el componente")],
			[msg("Alt + 0–9"), msg("Ancho de bits (se pueden teclear varias cifras)")],
			[
				msg("0–9"),
				msg("Entradas de puertas, bits de selección, dirección de memorias, salidas del splitter…"),
			],
			[msg("0–9, A–F (en Constante)"), msg("Valor de la constante")],
			[msg("Alt + flechas (en Pin)"), msg("Posición de la etiqueta")],
			[msg("Shift + clic / arrastre"), msg("Sumar a la selección")],
			[msg("Alt + arrastre / botón central"), msg("Desplazar el lienzo")],
			[msg("Ctrl/⌘ + rueda / pellizco"), msg("Zoom sobre el puntero")],
			[msg("Rueda"), msg("Desplazar el lienzo")],
		],
	},
	{
		title: msg("Simulación"),
		entries: [
			[msg("Ctrl/⌘ + E"), msg("Pausar / reanudar simulación")],
			[msg("Ctrl/⌘ + I"), msg("Un paso de propagación")],
			[msg("Ctrl/⌘ + T"), msg("Conmutar reloj una vez")],
			[msg("Ctrl/⌘ + K"), msg("Activar / detener ticks")],
			[msg("Ctrl/⌘ + R"), msg("Reiniciar simulación")],
			[msg("Tocar + clic"), msg("Cambiar pines, relojes y controles")],
			[msg("Tocar + teclas"), msg("Editar registros, memorias o teclado")],
			[msg("Ctrl + L (en Teclado)"), msg("Enviar borrado de pantalla al TTY")],
		],
	},
	{
		title: msg("Paneles y ayuda"),
		entries: [
			[msg("?"), msg("Consultar estos atajos")],
			[msg("Flechas (en separador)"), msg("Ajustar ancho del panel")],
			[msg("Doble clic en separador"), msg("Restaurar ancho original")],
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
					{t("Atajos de teclado")}
				</h2>
				<button
					type="button"
					aria-label={t("Cerrar atajos")}
					onClick={onClose}
					className="rounded-md p-2 hover:bg-black/5"
				>
					<X className="size-5" />
				</button>
			</div>
			<p className="mt-1 text-xs text-muted">
				{t(
					"Usá Ctrl en Windows/Linux o ⌘ en Mac. Mientras escribís en un campo, los atajos del editor quedan suspendidos.",
				)}
			</p>
			{GROUPS.map((group) => (
				<section key={t(group.title)} className="mt-5">
					<h3 className="mb-2 text-sm font-semibold">{t(group.title)}</h3>
					<dl className="divide-y divide-line text-xs">
						{group.entries.map(([keys, action]) => (
							<div key={keys} className="grid grid-cols-2 gap-3 py-2">
								<dt>
									<kbd className="font-mono text-muted">{t(keys)}</kbd>
								</dt>
								<dd>{t(action)}</dd>
							</div>
						))}
					</dl>
				</section>
			))}
		</dialog>
	);
}
