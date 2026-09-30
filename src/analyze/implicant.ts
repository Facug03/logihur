// Port of com.cburch.logisim.analyze.model.Implicant (Quine-McCluskey with
// essential primes, then a greedy cover).
//
// The greedy step breaks ties by the iteration order of Java's HashMap, so
// the maps here reproduce it (bucket = spread hash & (capacity - 1), then
// insertion order within a bucket) to pick the same cover as Logisim.

import { DONT_CARE, type Entry, ONE, ZERO } from "./entry";
import { and, constant, type Expression, not, or, variable } from "./expression";

export const FORMAT_SUM_OF_PRODUCTS = 0;
export const FORMAT_PRODUCT_OF_SUMS = 1;

export class Implicant {
	static readonly MINIMAL = new Implicant(0, -1);

	constructor(
		readonly unknowns: number,
		readonly values: number,
	) {}

	/** Implicant.hashCode */
	get hash(): number {
		return (this.unknowns << 16) | this.values;
	}

	equals(o: Implicant): boolean {
		return this.unknowns === o.unknowns && this.values === o.values;
	}

	compareTo(o: Implicant): number {
		if (this.values !== o.values) return this.values < o.values ? -1 : 1;
		if (this.unknowns !== o.unknowns) return this.unknowns < o.unknowns ? -1 : 1;
		return 0;
	}

	getUnknownCount(): number {
		let ret = 0;
		for (let n = this.unknowns; n !== 0; n &= n - 1) ret++;
		return ret;
	}

	/** The rows (single-term implicants) covered, in TermIterator order. */
	*getTerms(): Generator<Implicant> {
		let currentMask = 0;
		while (currentMask >= 0) {
			const ret = currentMask | this.values;
			const diffs = currentMask ^ this.unknowns;
			const diff = diffs ^ ((diffs - 1) & diffs);
			currentMask = diff === 0 ? -1 : (currentMask & ~(diff - 1)) | diff;
			yield new Implicant(0, ret);
		}
	}

	getRow(): number {
		return this.unknowns !== 0 ? -1 : this.values;
	}

	private literals(inputs: readonly string[], negateWhen: 0 | 1, join: typeof and): Expression {
		let term: Expression | null = null;
		const cols = inputs.length;
		for (let i = cols - 1; i >= 0; i--) {
			if ((this.unknowns & (1 << i)) === 0) {
				let literal: Expression | null = variable(inputs[cols - 1 - i]);
				if (((this.values >> i) & 1) === negateWhen) literal = not(literal);
				term = join(term, literal);
			}
		}
		return term ?? constant(1);
	}

	toProduct(inputs: readonly string[]): Expression {
		return this.literals(inputs, 0, and);
	}

	toSum(inputs: readonly string[]): Expression {
		return this.literals(inputs, 1, or);
	}
}

/** java.util.HashMap iteration order for Implicant keys (Java 8+). */
class JavaHashMap<V> {
	private readonly entries = new Map<number, { key: Implicant; value: V; seq: number }>();
	private capacity = 16;
	private seq = 0;

	get size(): number {
		return this.entries.size;
	}

	get(key: Implicant): V | undefined {
		return this.entries.get(key.hash)?.value;
	}

	has(key: Implicant): boolean {
		return this.entries.has(key.hash);
	}

	put(key: Implicant, value: V): void {
		const e = this.entries.get(key.hash);
		if (e) {
			e.value = value;
			return;
		}
		this.entries.set(key.hash, { key, value, seq: this.seq++ });
		if (this.entries.size > this.capacity * 0.75) this.capacity *= 2;
	}

	delete(key: Implicant): void {
		this.entries.delete(key.hash);
	}

	/** Snapshot in Java's order, so removals while iterating are safe. */
	ordered(): [Implicant, V][] {
		const bucket = (h: number) => (h ^ (h >>> 16)) & (this.capacity - 1);
		return Array.from(this.entries.values())
			.sort((a, b) => bucket(a.key.hash) - bucket(b.key.hash) || a.seq - b.seq)
			.map((e) => [e.key, e.value]);
	}

	keys(): Implicant[] {
		return this.ordered().map(([k]) => k);
	}
}

/**
 * Implicant.computeMinimal. `column` holds the output entries of each row.
 * Returns null when no row has a known value.
 */
export function computeMinimal(format: number, column: readonly Entry[]): Implicant[] | null {
	const desired = format === FORMAT_SUM_OF_PRODUCTS ? ONE : ZERO;
	const undesired = desired === ONE ? ZERO : ONE;

	// determine the first-cut implicants, and the rows we need to cover
	const base = new JavaHashMap<Entry>();
	const toCover = new JavaHashMap<true>();
	let knownFound = false;
	for (let i = 0; i < column.length; i++) {
		const entry = column[i];
		if (entry === undesired) {
			knownFound = true;
		} else if (entry === desired) {
			knownFound = true;
			const imp = new Implicant(0, i);
			base.put(imp, entry);
			toCover.put(imp, true);
		} else {
			base.put(new Implicant(0, i), entry);
		}
	}
	if (!knownFound) return null;

	// work up to more general implicants, discovering prime implicants
	const primes = new JavaHashMap<true>();
	let current = base;
	while (current.size > 1) {
		const toRemove = new Set<number>();
		const next = new JavaHashMap<Entry>();
		for (const [imp, detEntry] of current.ordered()) {
			for (let j = 1; j <= imp.values; j *= 2) {
				if ((imp.values & j) !== 0) {
					const opp = new Implicant(imp.unknowns, imp.values ^ j);
					const oppEntry = current.get(opp);
					if (oppEntry !== undefined) {
						toRemove.add(imp.hash);
						toRemove.add(opp.hash);
						const e = oppEntry === DONT_CARE && detEntry === DONT_CARE ? DONT_CARE : desired;
						next.put(new Implicant(opp.unknowns | j, opp.values), e);
					}
				}
			}
		}
		for (const [det, entry] of current.ordered()) {
			if (!toRemove.has(det.hash) && entry === desired) primes.put(det, true);
		}
		current = next;
	}

	// we won't have more than one implicant left, but it is probably prime
	for (const [imp, entry] of current.ordered()) {
		if (entry === desired) primes.put(imp, true);
	}

	// determine the essential prime implicants
	const retSet = new JavaHashMap<true>();
	const covered = new JavaHashMap<true>();
	for (const required of toCover.keys()) {
		if (covered.has(required)) continue;
		const row = required.getRow();
		let essential: Implicant | null = null;
		for (const imp of primes.keys()) {
			if ((row & ~imp.unknowns) === imp.values) {
				if (essential === null) essential = imp;
				else {
					essential = null;
					break;
				}
			}
		}
		if (essential !== null) {
			retSet.put(essential, true);
			primes.delete(essential);
			for (const imp of essential.getTerms()) covered.put(imp, true);
		}
	}
	for (const imp of covered.keys()) toCover.delete(imp);

	// the essential primes may not cover everything: greedily add the prime
	// implicants covering the most uncovered rows
	while (toCover.size > 0) {
		let max: Implicant | null = null;
		let maxCount = 0;
		let maxUnknowns = Number.MAX_SAFE_INTEGER;
		for (const imp of primes.keys()) {
			let count = 0;
			for (const term of imp.getTerms()) if (toCover.has(term)) ++count;
			if (count === 0) {
				primes.delete(imp);
			} else if (count > maxCount) {
				max = imp;
				maxCount = count;
				maxUnknowns = imp.getUnknownCount();
			} else if (count === maxCount) {
				const unk = imp.getUnknownCount();
				if (unk > maxUnknowns) {
					max = imp;
					maxUnknowns = unk;
				}
			}
		}
		// every desired row lies in some prime; Java would loop forever here
		if (max === null) break;
		retSet.put(max, true);
		primes.delete(max);
		for (const term of max.getTerms()) toCover.delete(term);
	}

	return retSet.keys().sort((a, b) => a.compareTo(b));
}

/** Implicant.toExpression */
export function implicantsToExpression(
	format: number,
	inputs: readonly string[],
	implicants: readonly Implicant[] | null,
): Expression | null {
	if (implicants === null) return null;
	let ret: Expression | null = null;
	if (format === FORMAT_PRODUCT_OF_SUMS) {
		for (const imp of implicants) ret = and(ret, imp.toSum(inputs));
		return ret ?? constant(1);
	}
	for (const imp of implicants) ret = or(ret, imp.toProduct(inputs));
	return ret ?? constant(0);
}
