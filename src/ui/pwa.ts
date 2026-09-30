// Installable, offline app: service worker registration, the "new version"
// signal and the browser's install prompt, exposed as a tiny store.

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
	/** A new version is installed and waiting for a reload. */
	updateReady: boolean;
	/** The browser offered to install the app (Chromium). */
	canInstall: boolean;
	/** iOS Safari: installable only through Share > Add to Home Screen. */
	iosHint: boolean;
	installed: boolean;
}

let state: PwaState = { updateReady: false, canInstall: false, iosHint: false, installed: false };
const listeners = new Set<() => void>();
let installEvent: BeforeInstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;
let started = false;

function set(patch: Partial<PwaState>): void {
	state = { ...state, ...patch };
	for (const l of Array.from(listeners)) l();
}

export const pwa = {
	subscribe(l: () => void): () => void {
		listeners.add(l);
		return () => listeners.delete(l);
	},
	getState: (): PwaState => state,

	start(): void {
		if (started || typeof window === "undefined") return;
		started = true;
		const standalone =
			window.matchMedia("(display-mode: standalone)").matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
		set({ installed: standalone, iosHint: ios && !standalone });

		window.addEventListener("beforeinstallprompt", (e) => {
			e.preventDefault();
			installEvent = e as BeforeInstallPromptEvent;
			set({ canInstall: true });
		});
		window.addEventListener("appinstalled", () => {
			installEvent = null;
			set({ canInstall: false, installed: true });
		});

		if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
		navigator.serviceWorker
			.register("./sw.js", { updateViaCache: "none" })
			.then((reg) => {
				const track = (worker: ServiceWorker | null) => {
					worker?.addEventListener("statechange", () => {
						if (worker.state === "installed" && navigator.serviceWorker.controller) {
							waiting = worker;
							set({ updateReady: true });
						}
					});
				};
				if (reg.waiting && navigator.serviceWorker.controller) {
					waiting = reg.waiting;
					set({ updateReady: true });
				}
				track(reg.installing);
				reg.addEventListener("updatefound", () => track(reg.installing));
				// look for a new deploy whenever the app comes back to the foreground
				document.addEventListener("visibilitychange", () => {
					if (document.visibilityState === "visible") reg.update().catch(() => {});
				});
			})
			.catch((err) => console.warn("service worker registration failed", err));
	},

	async install(): Promise<void> {
		if (!installEvent) return;
		await installEvent.prompt();
		await installEvent.userChoice;
		installEvent = null;
		set({ canInstall: false });
	},

	/** Activate the waiting version and reload into it. */
	applyUpdate(beforeReload: () => void): void {
		if (!waiting) return;
		navigator.serviceWorker.addEventListener("controllerchange", () => {
			beforeReload();
			window.location.reload();
		});
		waiting.postMessage("skipWaiting");
	},
};

interface LaunchParams {
	files: { getFile(): Promise<File> }[];
}

/** File Handling API: .circ files opened from the system with the installed app. */
export function onLaunchFiles(open: (file: File) => void): void {
	const queue = (window as Window & { launchQueue?: { setConsumer(c: (p: LaunchParams) => void): void } })
		.launchQueue;
	queue?.setConsumer(async (params) => {
		const handle = params.files[0];
		if (handle) open(await handle.getFile());
	});
}
