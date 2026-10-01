// Port of analyze.gui.ExpressionView: the expression as students write it on
// paper, with a bar over negated terms instead of "~".

import type { ReactNode } from "react";
import { BINARY_OPS, type Expression, precedence } from "@/analyze/expression";
import { t } from "@/i18n/i18n";

function render(e: Expression, key = "e"): ReactNode {
	switch (e.kind) {
		case "var":
			return e.name;
		case "const":
			return e.value.toString(16);
		case "not":
			return (
				<span key={key} className="inline-block border-t-[1.5px] border-current pt-[3px] leading-none">
					{render(e.a, `${key}n`)}
				</span>
			);
		default: {
			const level = precedence(e);
			const side = (s: Expression, k: string) =>
				precedence(s) < level ? <span key={k}>({render(s, k)})</span> : <span key={k}>{render(s, k)}</span>;
			return (
				<span key={key}>
					{side(e.a, `${key}a`)}
					{BINARY_OPS[e.kind] === " " ? " " : BINARY_OPS[e.kind]}
					{side(e.b, `${key}b`)}
				</span>
			);
		}
	}
}

export function ExpressionView({ expr, label }: { expr: Expression | null; label: string }) {
	return (
		<output
			aria-label={label}
			className="block min-h-12 whitespace-pre-wrap break-words rounded-md border border-line bg-background px-3 py-3 text-center font-serif text-lg leading-8"
		>
			{expr === null ? <span className="text-muted">{t("analyze.expressionEmpty")}</span> : render(expr)}
		</output>
	);
}
