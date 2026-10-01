"use client";

// Logisim libraries loaded from other .circ files (`file#` descriptors):
// the notice for missing files and the palette section of loaded ones.

import { ChevronRight, FileWarning, Plus, X } from "lucide-react";
import { useRef } from "react";
import { LibraryDisclosure, LogisimIcon } from "./panels";
import type { Workspace } from "./workspace";

export async function readFiles(files: FileList | File[]): Promise<Map<string, string>> {
	const entries = await Promise.all(Array.from(files).map(async (f) => [f.name, await f.text()] as const));
	return new Map(entries);
}

/**
 * Several files opened at once: the main project is the one no other file
 * references as a library; the rest become its library sources.
 */
export function pickMainFile(files: ReadonlyMap<string, string>): string {
	const names = Array.from(files.keys());
	const referenced = new Set<string>();
	for (const text of files.values()) {
		for (const m of text.matchAll(/desc="file#([^"]*)"/g)) referenced.add(m[1].split(/[\\/]/).pop() ?? "");
	}
	return names.find((n) => !referenced.has(n)) ?? names[0];
}

export function MissingLibrariesNotice({ ws, onDismiss }: { ws: Workspace; onDismiss: () => void }) {
	const fileRef = useRef<HTMLInputElement>(null);
	const missing = ws.project.missingLibraries;
	if (missing.length === 0) return null;
	return (
		<div
			role="alert"
			className="absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm shadow-md"
		>
			<FileWarning className="mt-0.5 size-5 shrink-0 text-amber-700" />
			<div className="min-w-0 flex-1">
				<p>
					Este proyecto usa {missing.length === 1 ? "la librería" : "las librerías"}{" "}
					<strong className="break-all">{missing.join(", ")}</strong>. Sus componentes se muestran como cajas
					hasta que elijas {missing.length === 1 ? "el archivo" : "los archivos"}.
				</p>
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 font-medium hover:bg-amber-100"
				>
					Elegir {missing.length === 1 ? "archivo" : "archivos"}…
				</button>
			</div>
			<button
				type="button"
				aria-label="Ocultar aviso"
				onClick={onDismiss}
				className="rounded p-1 hover:bg-black/5"
			>
				<X className="size-4" />
			</button>
			<input
				ref={fileRef}
				type="file"
				accept=".circ"
				multiple
				hidden
				onChange={async (e) => {
					const files = e.target.files;
					if (!files || files.length === 0) return;
					const sources = await readFiles(files);
					e.target.value = "";
					ws.provideLibraries(sources);
					const still = ws.project.missingLibraries;
					ws.notify(still.length > 0 ? `Todavía faltan: ${still.join(", ")}.` : "Librerías cargadas.");
				}}
			/>
		</div>
	);
}

export function LogisimLibrariesSection({ ws, onPick }: { ws: Workspace; onPick?: () => void }) {
	const fileRef = useRef<HTMLInputElement>(null);
	const tool = ws.tool;
	const libraries = Array.from(ws.project.loadedLibraries.values());
	return (
		<div className="mt-1">
			{libraries.map((lib) => (
				<LibraryDisclosure key={lib.desc} id={lib.desc}>
					<summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-black/5">
						<ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
						<span className="min-w-0 flex-1 truncate" title={lib.desc}>
							{lib.fileName}
						</span>
						<button
							type="button"
							title={`Quitar ${lib.fileName}`}
							aria-label={`Quitar ${lib.fileName}`}
							onClick={(e) => {
								e.preventDefault();
								ws.unloadLibrary(lib.desc);
							}}
							className="rounded p-0.5 text-muted hover:text-red-600"
						>
							<X className="size-3.5" />
						</button>
					</summary>
					<ul className="ml-3 border-l border-line pl-1">
						{lib.circuits.map((c) => {
							const factory = lib.getFactory(c);
							const active = tool.kind === "add" && tool.factory === factory;
							return (
								<li key={c.id}>
									<button
										type="button"
										title={`Agregar ${c.name} (${lib.fileName})`}
										onClick={() => {
											ws.selectAddTool(factory, `${lib.desc}:${c.name}`);
											onPick?.();
										}}
										className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm ${
											active ? "bg-accent/15 text-accent" : "hover:bg-black/5"
										}`}
									>
										<LogisimIcon name="subcirc.gif" />
										<span className="truncate">{c.name}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</LibraryDisclosure>
			))}
			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				className="mt-1 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm text-muted hover:bg-black/5 hover:text-foreground"
			>
				<Plus className="size-3.5" />
				Cargar librería .circ…
			</button>
			<input
				ref={fileRef}
				type="file"
				accept=".circ"
				multiple
				hidden
				onChange={async (e) => {
					const files = e.target.files;
					if (!files || files.length === 0) return;
					const sources = await readFiles(files);
					e.target.value = "";
					// the chosen files may depend on each other: provide all, then add each
					for (const [name, text] of sources) ws.project.librarySources.set(name, text);
					for (const [name, text] of sources) ws.loadLibrary(name, text);
				}}
			/>
		</div>
	);
}
