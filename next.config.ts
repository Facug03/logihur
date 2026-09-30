import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Fully static: no backend needed, deployable to any static host.
	output: "export",
};

export default nextConfig;
