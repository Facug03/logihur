"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Once a tooltip has been seen, neighbours open without delay or animation.
const WARM_MS = 400;
let lastHidden = 0;

export function Tooltip({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: (id: string | undefined) => React.ReactNode;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const id = useId();
	const [position, setPosition] = useState<{ left: number; top: number; instant: boolean } | null>(null);
	const hide = () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		if (position) lastHidden = Date.now();
		setPosition(null);
	};
	const show = (delay: number) => {
		if (timer.current) clearTimeout(timer.current);
		const instant = Date.now() - lastHidden < WARM_MS;
		timer.current = setTimeout(
			() => {
				const bounds = ref.current?.getBoundingClientRect();
				if (bounds)
					setPosition({
						left: Math.max(8, Math.min(bounds.left, window.innerWidth - 288)),
						top: bounds.bottom + 8,
						instant,
					});
			},
			instant ? 0 : delay,
		);
	};
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	useEffect(() => {
		if (!position) return;
		const close = () => setPosition(null);
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				close();
			}
		};
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		window.addEventListener("keydown", key, true);
		return () => {
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", close, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [position]);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: wrapper shows help for disabled buttons too; the child button handles actions and focus.
		<span
			ref={ref}
			className="inline-flex shrink-0"
			onMouseEnter={() => show(300)}
			onMouseLeave={hide}
			onFocus={() => show(0)}
			onBlur={hide}
			onPointerDown={hide}
		>
			{children(position ? id : undefined)}
			{position &&
				createPortal(
					<div
						id={id}
						role="tooltip"
						data-instant={position.instant ? "" : undefined}
						className="tooltip-motion pointer-events-none fixed z-50 max-w-[280px] rounded-md border border-line bg-panel px-3 py-2 text-xs text-foreground shadow-md"
						style={{ left: position.left, top: position.top }}
					>
						<div className="font-medium">{label}</div>
						{description && <p className="mt-1 leading-relaxed text-muted">{description}</p>}
					</div>,
					document.body,
				)}
		</span>
	);
}
