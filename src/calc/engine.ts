import type { Bracket } from "./types";

/** 四舍五入到最近的 100（round half up）。Python: round100 */
export function round100(x: number | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  return Math.floor(x / 100 + 0.5) * 100;
}

/** v 是否落在区间 b 内。lo/hi 为 null 表示 -inf/+inf。默认左闭右开 [lo, hi)。 */
export function inBracket(v: number, b: Bracket): boolean {
  const { lo, hi } = b;
  const loInc = b.lo_inc ?? true;
  const hiInc = b.hi_inc ?? false;
  if (lo !== null && lo !== undefined) {
    if (v < lo || (v === lo && !loInc)) return false;
  }
  if (hi !== null && hi !== undefined) {
    if (v > hi || (v === hi && !hiInc)) return false;
  }
  return true;
}

export function findBracket(table: Bracket[], v: number): Bracket | null {
  for (const b of table) {
    if (inBracket(v, b)) return b;
  }
  return null;
}

/** 线性插值：(v-lo)×(sal_hi-sal_lo)/(hi-lo)+sal_lo */
export function interp(v: number, b: Bracket): number {
  const lo = b.lo as number;
  const hi = b.hi as number;
  return ((v - lo) * ((b.sal_hi as number) - (b.sal_lo as number))) / (hi - lo) + (b.sal_lo as number);
}

/** 按区间公式计算薪资（未取整）。v 单位：万元。 */
export function salaryFromBracket(b: Bracket, v: number): number {
  const f = b.formula ?? "interp";
  if (f === "fixed") return b.fixed as number;
  if (f === "pct") return v * 10000 * (b.rate as number);
  return interp(v, b);
}

/** 将命中的区间格式化为可读字符串，如 "[10, 25)" / "(200, 500]" / "[600, +∞)" */
export function formatBracket(b: Pick<Bracket, "lo" | "hi" | "lo_inc" | "hi_inc">): string {
  const loInc = b.lo_inc ?? true;
  const hiInc = b.hi_inc ?? false;
  const left = b.lo === null || b.lo === undefined ? "(-∞" : `${loInc ? "[" : "("}${b.lo}`;
  const right = b.hi === null || b.hi === undefined ? "+∞)" : `${b.hi}${hiInc ? "]" : ")"}`;
  return `${left}, ${right}`;
}

/** 学历→月薪 映射（管培生用） */
export const EDU_MAP: Record<string, number> = {
  "普通本科": 6000,
  "211/985本科": 7000,
  "985/211本科": 7000,
  "普通硕士": 8000,
  "211/985硕士": 9000,
  "985/211硕士": 9000,
};
