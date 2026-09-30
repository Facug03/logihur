"use client";

// A popup menu at a screen point (Logisim's Menu Tool popups). Closes on a
// press outside, Escape, blur or resize; arrow keys move between items.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuEntry =
	| { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean; hint?: string }
	| "separator";

export interface MenuRequest {
	x: number;
	y: number;
	title?: string;
	items: MenuEntry[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuRequest; onClose: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left: menu.x, top: menu.y });

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.showPopover();
		// keep the menu on screen, opening upwards/leftwards near the edges
		const { width, height } = el.getBoundingClientRect();
		setPosition({
			left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
			top: menu.y + height > window.innerHeight - 8 ? Math.max(8, menu.y - height) : menu.y,
		});
		el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
	}, [menu]);

	// A manual popover: the press (or long press) that opened the menu is still
	// in progress, and "auto" light dismiss would close it on release.
	useEffect(() => {
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		const onBlur = () => onClose();
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("keydown", onKey, true);
		window.addEventListener("blur", onBlur);
		window.addEventListener("resize", onBlur);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKey, true);
			window.removeEventListener("blur", onBlur);
			window.removeEventListener("resize", onBlur);
		};
	}, [onClose]);

	const move = (delta: number) => {
		const buttons = Array.from(
			ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
		);
		const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
		buttons[(i + delta + buttons.length) % buttons.length]?.focus();
	};

	return (
		<div
			ref={ref}
			popover="manual"
			role="menu"
			aria-label={menu.title ?? "Menú"}
			style={position}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "ArrowDown") move(1);
				else if (e.key === "ArrowUp") move(-1);
				else return;
				e.preventDefault();
			}}
			onContextMenu={(e) => e.preventDefault()}
			className="popover-motion fixed inset-auto m-0 min-w-52 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-panel p-1 text-foreground shadow-lg"
		>
			{menu.title && (
				<p className="truncate px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted">{menu.title}</p>
			)}
			{menu.items.map((item, i) =>
				item === "separator" ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: separators have no identity
					<hr key={`sep-${i}`} className="my-1 border-line" />
				) : (
					<button
						key={item.label}
						type="button"
						role="menuitem"
						disabled={item.disabled}
						title={item.hint}
						onClick={() => {
							onClose();
							item.onSelect();
						}}
						className={`flex w-full rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-black/5 focus-visible:bg-accent/10 disabled:opacity-40 disabled:hover:bg-transparent ${
							item.danger ? "text-red-600" : ""
						}`}
					>
						{item.label}
					</button>
				),
			)}
		</div>
	);
}
