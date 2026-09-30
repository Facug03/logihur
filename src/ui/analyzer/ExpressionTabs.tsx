// Ports of analyze.gui.{ExpressionTab, MinimizedTab, OutputSelector}.

import { useRef, useState } from "react";
import { FORMAT_PRODUCT_OF_SUMS, FORMAT_SUM_OF_PRODUCTS } from "@/analyze/implicant";
import type { AnalyzerModel } from "@/analyze/model";
import { ParserError, parseExpression } from "@/analyze/parser";
import { t } from "@/i18n/es";
import { ExpressionView } from "./ExpressionView";
import { KarnaughMap } from "./KarnaughMap";
import { buttonClass, primaryButtonClass } from "./VariablesTab";

const selectClass = "rounded-md border border-line bg-panel px-2 py-1.5 font-mono text-sm";

export function OutputSelector({
	model,
	output,
	onChange,
}: {
	model: AnalyzerModel;
	output: string | null;
	onChange: (output: string) => void;
}) {
	return (
		<label className="flex items-center gap-2 text-sm">
			{t("analyze.outputSelectLabel")}
			<select
				value={output ?? ""}
				disabled={output === null}
				onChange={(e) => onChange(e.target.value)}
				className={`${selectClass} min-w-20`}
			>
				{model.outputs.getAll().map((name) => (
					<option key={name} value={name}>
						{name}
					</option>
				))}
			</select>
		</label>
	);
}

export function ExpressionTab({
	model,
	output,
	onOutputChange,
}: {
	model: AnalyzerModel;
	output: string | null;
	onOutputChange: (output: string) => void;
}) {
	const exprs = model.outputExpressions;
	const current = exprs.getExpressionString(output);
	// null while the field shows the current expression unedited
	const [draft, setDraft] = useState<{ output: string | null; text: string } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	const text = draft !== null && draft.output === output ? draft.text : current;
	const edited = text !== current;

	const enter = () => {
		if (!edited || output === null) return;
		try {
			const expr = parseExpression(text, model.inputs.getAll());
			setError(null);
			exprs.setExpression(output, expr, text);
			setDraft(null);
		} catch (e) {
			if (!(e instanceof ParserError)) throw e;
			setError(e.message);
			fieldRef.current?.setSelectionRange(e.offset, e.endOffset);
		}
		fieldRef.current?.focus();
	};

	return (
		<div className="flex flex-col gap-3">
			<OutputSelector
				model={model}
				output={output}
				onChange={(o) => {
					setDraft(null);
					setError(null);
					onOutputChange(o);
				}}
			/>
			<ExpressionView expr={exprs.getExpression(output)} label={`Expresión de ${output ?? ""}`} />
			<textarea
				ref={fieldRef}
				aria-label="Editar expresión"
				rows={4}
				value={text}
				disabled={output === null}
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				onChange={(e) => setDraft({ output, text: e.target.value })}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						enter();
					}
				}}
				className="resize-y rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm"
			/>
			<div className="flex flex-wrap items-center justify-end gap-2">
				<p role="alert" className="mr-auto min-h-5 text-sm text-red-600">
					{error}
				</p>
				<button
					type="button"
					className={buttonClass}
					disabled={text.length === 0}
					onClick={() => {
						setError(null);
						setDraft({ output, text: "" });
						fieldRef.current?.focus();
					}}
				>
					{t("analyze.exprClearButton")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={!edited || output === null}
					onClick={() => {
						setError(null);
						setDraft(null);
						fieldRef.current?.focus();
					}}
				>
					{t("analyze.exprRevertButton")}
				</button>
				<button
					type="button"
					className={primaryButtonClass}
					disabled={!edited || output === null}
					onClick={enter}
				>
					{t("analyze.exprEnterButton")}
				</button>
			</div>
			<p className="text-xs text-muted">
				Operadores: NOT <code>~a</code>, <code>!a</code> o <code>a'</code> · AND <code>a b</code>,{" "}
				<code>a &amp; b</code> · XOR <code>a ^ b</code> · OR <code>a + b</code> o <code>a | b</code>. Enter
				aplica la expresión.
			</p>
		</div>
	);
}

export function MinimizedTab({
	model,
	output,
	onOutputChange,
}: {
	model: AnalyzerModel;
	output: string | null;
	onOutputChange: (output: string) => void;
}) {
	const exprs = model.outputExpressions;
	const format = exprs.getMinimizedFormat(output);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
				<OutputSelector model={model} output={output} onChange={onOutputChange} />
				<label className="flex items-center gap-2 text-sm">
					{t("analyze.minimizedFormat")}
					<select
						value={format}
						disabled={output === null}
						onChange={(e) => output !== null && exprs.setMinimizedFormat(output, Number(e.target.value))}
						className={selectClass}
					>
						<option value={FORMAT_SUM_OF_PRODUCTS}>{t("analyze.minimizedSumOfProducts")}</option>
						<option value={FORMAT_PRODUCT_OF_SUMS}>{t("analyze.minimizedProductOfSums")}</option>
					</select>
				</label>
			</div>
			<KarnaughMap model={model} output={output} />
			<ExpressionView
				expr={exprs.getMinimalExpression(output)}
				label={`Expresión minimizada de ${output ?? ""}`}
			/>
			<button
				type="button"
				className={`${buttonClass} self-center`}
				disabled={output === null || exprs.isExpressionMinimal(output)}
				onClick={() => output !== null && exprs.setExpression(output, exprs.getMinimalExpression(output))}
			>
				{t("analyze.minimizedSetButton")}
			</button>
		</div>
	);
}
