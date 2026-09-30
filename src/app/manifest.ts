import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
	return {
		id: "./",
		name: "LogiHUR — simulador de circuitos lógicos",
		short_name: "LogiHUR",
		description:
			"Simulador de circuitos lógicos compatible con Logisim 2.7.1, para estudiantes de la UNAHUR.",
		lang: "es",
		start_url: "./",
		scope: "./",
		display: "standalone",
		background_color: "#f6f6f4",
		theme_color: "#ffffff",
		categories: ["education", "productivity"],
		icons: [
			{ src: "pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			{ src: "pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
		// installed on a desktop, double-clicking a .circ opens it here
		file_handlers: [{ action: "./", accept: { "application/x-logisim-circuit": [".circ"] } }],
	} as MetadataRoute.Manifest;
}
