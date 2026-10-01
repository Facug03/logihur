"use client";

import { useSyncExternalStore } from "react";
import { getLocale, subscribeLocale } from "@/i18n/i18n";

/** Notifications render outside the editor's tree and subscribe independently. */
export function LocalizedText({ render }: { render: () => string }) {
	useSyncExternalStore(subscribeLocale, getLocale, () => "es");
	return render();
}
