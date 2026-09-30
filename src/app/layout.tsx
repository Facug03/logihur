import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "LogiHUR",
	description: "Simulador de circuitos lógicos compatible con Logisim, para estudiantes de la UNAHUR.",
	applicationName: "LogiHUR",
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
			<body className="h-full overflow-hidden">{children}</body>
		</html>
	);
}
