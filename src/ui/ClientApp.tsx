"use client";

import dynamic from "next/dynamic";

// The editor uses canvas and browser APIs only; skip prerendering.
const App = dynamic(() => import("./App"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center text-sm text-muted">Cargando LogiHUR…</div>
	),
});

export default function ClientApp() {
	return <App />;
}
