// LogisimVersion.compareTo for dotted version strings ("2.6.3.220").

export function compareVersion(a: string, b: string): number {
	const pa = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
	const pb = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}
