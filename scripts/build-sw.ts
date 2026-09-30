// After `next build`: write out/sw.js with every exported file precached,
// under a cache named after the content hash, so the app works offline from
// the first visit and each deploy replaces the previous cache.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "out");

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const file = path.join(dir, name);
		return statSync(file).isDirectory() ? walk(file) : [file];
	});
}

const skip = /(^|\/)(sw\.js|404\.html|_not-found.*|.*\.txt)$/;
const files = walk(out)
	.map((f) => path.relative(out, f).split(path.sep).join("/"))
	.filter((f) => !skip.test(f) && !f.startsWith("_not-found/"))
	.sort();
const hash = createHash("sha256");
for (const f of files) hash.update(f).update(readFileSync(path.join(out, f)));
const version = hash.digest("hex").slice(0, 12);

const template = readFileSync(path.join(root, "src/pwa/sw.template.js"), "utf8");
writeFileSync(
	path.join(out, "sw.js"),
	template
		.replace("__VERSION__", version)
		.replace("__FILES__", JSON.stringify(["./", ...files.filter((f) => f !== "index.html")])),
);
console.log(`sw.js: ${files.length} files precached (version ${version})`);
