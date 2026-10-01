"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { setLocale, t } from "@/i18n/i18n";
import { loadLocale } from "./preferences";

function Loading() {
	const [text, setText] = useState<string | null>(null);
	useEffect(() => {
		setLocale(loadLocale());
		setText(t("Cargando LogiHUR…"));
	}, []);
	return <div className="flex h-full items-center justify-center text-sm text-muted">{text}</div>;
}

// The editor uses canvas and browser APIs only; skip prerendering.
const App = dynamic(() => import("./App"), {
	ssr: false,
	loading: Loading,
});

export default function ClientApp() {
	return <App />;
}
