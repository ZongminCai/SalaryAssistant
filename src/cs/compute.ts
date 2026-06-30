import { round100 } from "../calc/engine";
import {
  ceilingFromPercentile,
  findGroupConfig,
  tierOf,
} from "./config";
import { MONTH_COUNT } from "./types";
import type {
  CsEmployee,
  CsGroupConfig,
  CsIndicator,
  CsIndicatorDetail,
  CsLevel,
  CsLevelSpec,
  CsMonthlyRate,
  CsPositionConfig,
  CsReceptionMonthly,
  CsResult,
  DeptParticipation,
} from "./types";

const LEVEL_LOWER: Record<CsLevel, CsLevel> = {
  expert: "senior",
  senior: "middle",
  middle: "junior",
  junior: "junior",
};

const RATE_HI = 1.2;
const RECEPTION_FACTOR = 0.8;

export interface CsComputeOutput {
  results: CsResult[];
  participation: DeptParticipation[];
  /** 检测到的部门（驱动页面「在职人数」输入框） */
  depts: string[];
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** 单月完成率：先按方向计算，再做 120% 封顶 */
function monthlyRateCapped(
  ind: CsIndicator,
  value: number,
  mean: number,
): { rate: number; capped: boolean } {
  const ratio = value / mean;
  const raw = ind.direction === "positive" ? ratio : 2 - ratio;
  if (raw > RATE_HI) return { rate: RATE_HI, capped: true };
  return { rate: raw, capped: false };
}

/** 基准线是否达标（口径：3 个月均值） */
function baselineOk(ind: CsIndicator, valueAvg: number, base: number | undefined): boolean {
  if (base === undefined) return true;
  return ind.direction === "positive" ? valueAvg >= base : valueAvg <= base;
}

function levelSpec(gc: CsGroupConfig, level: CsLevel): CsLevelSpec {
  return gc[level];
}

function newResult(emp: CsEmployee, cfg: CsPositionConfig): CsResult {
  const unitLabel = cfg.hasDeptGroup
    ? `${emp.dept ?? "?"} / ${emp.group ?? "?"}`
    : cfg.depts[0];
  return {
    name: emp.name ?? "",
    dept: cfg.hasDeptGroup ? emp.dept : cfg.depts[0],
    group: emp.group,
    unitLabel,
    combinedRate: null,
    expertAdvance: emp.expertAdvance,
    participate: emp.participate !== false,
    grade: null,
    salaryBand: null,
    rawSalary: null,
    monthlySalary: null,
    trace: "",
    notes: [],
    errors: [...emp.__parseErrors],
    __rowIndex: emp.__rowIndex,
  };
}

/** 返回月度数组（保留 undefined 表示缺月）；若数组长度不对或完全无数据返回 null */
function partialMonthlyArr(arr: (number | undefined)[] | undefined): (number | undefined)[] | null {
  if (!arr || arr.length !== MONTH_COUNT) return null;
  if (arr.every((v) => v === undefined || !Number.isFinite(v))) return null;
  return arr;
}

/** 检查月度数组是否完整（每月均有有效值） */
function isFullMonthly(arr: (number | undefined)[]): arr is number[] {
  return arr.every((v) => v !== undefined && Number.isFinite(v));
}

/** 有效月份数 */
function validMonthCount(arr: (number | undefined)[]): number {
  return arr.filter((v) => v !== undefined && Number.isFinite(v)).length;
}

interface ValidEmp {
  emp: CsEmployee;
  gc: CsGroupConfig;
  v1: (number | undefined)[]; // ind1 月度值，长度 MONTH_COUNT（缺月为 undefined）
  v2: (number | undefined)[]; // ind2 月度值
  rec: (number | undefined)[]; // 接待量月度值
  /** 三项数据（ind1/ind2/reception）均完整（3 个月齐全）→ 可参与完整评级 */
  complete: boolean;
}

/** 校验并返回月度数据；失败返回 null */
function validate(emp: CsEmployee, cfg: CsPositionConfig, r: CsResult): ValidEmp | null {
  if (cfg.hasDeptGroup) {
    if (!emp.dept) r.errors.push("缺少必填字段「部门」");
    if (!emp.group) r.errors.push("缺少必填字段「组别」");
  }
  const gc = findGroupConfig(cfg, emp.dept, emp.group);
  if (!gc) {
    if (emp.dept || emp.group) {
      r.errors.push(`部门「${emp.dept ?? ""}」与组别「${emp.group ?? ""}」不匹配，请核对填写说明`);
    }
    return null;
  }
  // 允许部分缺月：只要有至少 1 个月的数据就通过，完全无数据才报错
  const v1 = partialMonthlyArr(emp.values[gc.ind1.label]);
  const v2 = partialMonthlyArr(emp.values[gc.ind2.label]);
  const rec = partialMonthlyArr(emp.reception);
  if (!v1) r.errors.push(`指标「${gc.ind1.label}」至少需要 1 个月的有效数据`);
  if (!v2) r.errors.push(`指标「${gc.ind2.label}」至少需要 1 个月的有效数据`);
  if (!rec) r.errors.push("「接待量」至少需要 1 个月的有效数据");
  if (r.errors.length > 0) return null;
  const complete = isFullMonthly(v1!) && isFullMonthly(v2!);
  return { emp, gc, v1: v1!, v2: v2!, rec: rec!, complete };
}

function lvlName(cfg: CsPositionConfig, level: CsLevel): string {
  return cfg.levelNames[level];
}

export function computeCs(
  employees: CsEmployee[],
  cfg: CsPositionConfig,
  headcounts: Record<string, number>,
): CsComputeOutput {
  // 1) 初始化 + 校验
  const results: CsResult[] = [];
  const validByEmp = new Map<CsResult, ValidEmp>();
  for (const emp of employees) {
    const r = newResult(emp, cfg);
    const v = validate(emp, cfg, r);
    if (v) validByEmp.set(r, v);
    results.push(r);
  }

  // 2) 评级单元 / 排名池 分组 key
  const unitKeyOf = (r: CsResult) =>
    cfg.hasDeptGroup ? `${r.dept}||${r.group}` : cfg.depts[0];
  const rankKeyOf = (r: CsResult) => (cfg.hasDeptGroup ? (r.dept as string) : cfg.depts[0]);

  // 3) 各评级单元 × 月度的指标/接待量均值
  interface UnitAgg {
    gc: CsGroupConfig;
    members: { r: CsResult; v: ValidEmp }[];
    /** 长度 MONTH_COUNT */
    ind1Means: number[];
    ind2Means: number[];
    receptionMeans: number[];
  }
  const units = new Map<string, UnitAgg>();
  for (const [r, v] of validByEmp) {
    const k = unitKeyOf(r);
    let u = units.get(k);
    if (!u) {
      u = { gc: v.gc, members: [], ind1Means: [], ind2Means: [], receptionMeans: [] };
      units.set(k, u);
    }
    u.members.push({ r, v });
  }
  for (const u of units.values()) {
    for (let m = 0; m < MONTH_COUNT; m++) {
      const v1Vals = u.members.map((x) => x.v.v1[m]).filter((v): v is number => v !== undefined && Number.isFinite(v));
      const v2Vals = u.members.map((x) => x.v.v2[m]).filter((v): v is number => v !== undefined && Number.isFinite(v));
      const recVals = u.members.map((x) => x.v.rec[m]).filter((v): v is number => v !== undefined && Number.isFinite(v));
      u.ind1Means.push(v1Vals.length > 0 ? avg(v1Vals) : 0);
      u.ind2Means.push(v2Vals.length > 0 ? avg(v2Vals) : 0);
      u.receptionMeans.push(recVals.length > 0 ? avg(recVals) : 0);
    }
  }

  // 4) 月度完成率（120% 封顶）→ 季度均值（仅对有数据月份求均值）
  for (const [r, v] of validByEmp) {
    const u = units.get(unitKeyOf(r)) as UnitAgg;
    // 计算有效月份数
    const vm = Math.min(validMonthCount(v.v1), validMonthCount(v.v2));
    r.validMonths = vm;

    // 检查有数据月份的均值是否为 0（无法计算完成率）
    const hasZeroMean = (() => {
      for (let m = 0; m < MONTH_COUNT; m++) {
        if (v.v1[m] !== undefined && u.ind1Means[m] <= 0) return true;
        if (v.v2[m] !== undefined && u.ind2Means[m] <= 0) return true;
      }
      return false;
    })();
    if (hasZeroMean) {
      r.errors.push("评级单元月度指标均值为 0，无法计算完成率");
      validByEmp.delete(r);
      continue;
    }

    const buildDetail = (
      ind: CsIndicator,
      values: (number | undefined)[],
      means: number[],
    ): CsIndicatorDetail => {
      const monthly: CsMonthlyRate[] = [];
      for (let m = 0; m < MONTH_COUNT; m++) {
        if (values[m] === undefined || !Number.isFinite(values[m])) continue;
        const { rate, capped } = monthlyRateCapped(ind, values[m] as number, means[m]);
        monthly.push({ value: values[m] as number, mean: means[m], rate, capped });
      }
      return {
        label: ind.label,
        direction: ind.direction,
        weight: ind.weight,
        monthly,
        rate: avg(monthly.map((mm) => mm.rate)),
        anyCapped: monthly.some((mm) => mm.capped),
      };
    };

    r.ind1 = buildDetail(v.gc.ind1, v.v1, u.ind1Means);
    r.ind2 = buildDetail(v.gc.ind2, v.v2, u.ind2Means);
    r.ind1Avg = avg(v.v1.filter((x): x is number => x !== undefined));
    r.ind2Avg = avg(v.v2.filter((x): x is number => x !== undefined));
    r.combinedRate = r.ind1.rate * r.ind1.weight + r.ind2.rate * r.ind2.weight;

    // 接待量：仅对有数据月份计算
    const receptionMonthly: CsReceptionMonthly[] = [];
    for (let m = 0; m < MONTH_COUNT; m++) {
      if (v.rec[m] === undefined || !Number.isFinite(v.rec[m])) continue;
      const value = v.rec[m] as number;
      const mean = u.receptionMeans[m];
      const threshold = mean * RECEPTION_FACTOR;
      receptionMonthly.push({ value, mean, threshold, ok: value >= threshold });
    }
    const recValues = v.rec.filter((x): x is number => x !== undefined && Number.isFinite(x));
    const receptionAvg = avg(recValues);
    const recMeanValues = receptionMonthly.map((rm) => rm.mean);
    const receptionMeanAvg = avg(recMeanValues);
    r.receptionMonthly = receptionMonthly;
    r.reception = receptionAvg;
    r.receptionMean = receptionMeanAvg;
    r.receptionThreshold = receptionMeanAvg * RECEPTION_FACTOR;
    r.receptionOk = receptionAvg >= r.receptionThreshold;
  }

  // 5) 参评比例（按 rankKey/部门）——仅 complete=true && participate=true 计入排名池
  const rankPools = new Map<string, CsResult[]>();
  for (const [r, v] of validByEmp) {
    if (!r.participate) continue;
    if (!v.complete) continue;
    const key = rankKeyOf(r);
    const arr = rankPools.get(key) ?? [];
    arr.push(r);
    rankPools.set(key, arr);
  }
  const participation: DeptParticipation[] = [];
  const tierByDept = new Map<string, ReturnType<typeof tierOf>>();
  const ratioByDept = new Map<string, number>();
  for (const dept of cfg.depts) {
    const pool = rankPools.get(dept) ?? [];
    const participants = pool.length;
    let headcount = headcounts[dept];
    if (
      headcount === undefined ||
      headcount === null ||
      !Number.isFinite(headcount) ||
      headcount <= 0
    ) {
      headcount = participants; // 缺省：视为全员参评
    }
    const ratio = headcount > 0 ? participants / headcount : 1;
    const tier = tierOf(ratio);
    tierByDept.set(dept, tier);
    ratioByDept.set(dept, ratio);
    participation.push({ dept, participants, headcount, ratio, tierLabel: tier.label });
  }

  // 6) 排名分位（tie：综合完成率→接待量季度均值；仍并列则取并列组最差名次）
  for (const [, pool] of rankPools) {
    const sorted = [...pool].sort((a, b) => {
      const ra = a.combinedRate as number;
      const rb = b.combinedRate as number;
      if (rb !== ra) return rb - ra;
      return (b.reception ?? 0) - (a.reception ?? 0);
    });
    const N = sorted.length;
    let i = 0;
    while (i < N) {
      let j = i;
      while (
        j + 1 < N &&
        (sorted[j + 1].combinedRate as number) === (sorted[i].combinedRate as number) &&
        (sorted[j + 1].reception ?? 0) === (sorted[i].reception ?? 0)
      ) {
        j++;
      }
      const worstRank = j + 1; // 1-based
      for (let k = i; k <= j; k++) {
        sorted[k].rank = worstRank;
        sorted[k].poolSize = N;
        sorted[k].percentile = (worstRank - 1) / N;
      }
      i = j + 1;
    }
  }

  // 7) 定级（仅 complete=true && participate=true 才完整评级）
  for (const [r, v] of validByEmp) {
    const monthlyDesc = (d: CsIndicatorDetail) =>
      d.monthly
        .map((mm, i) => `${i + 1}月${pct(mm.rate)}${mm.capped ? "(封顶)" : ""}`)
        .join("/");

    if (!r.participate) {
      r.notes.push("本人不参与评级定薪，仅作为单元均值样本");
      const d1 = r.ind1 as CsIndicatorDetail;
      const d2 = r.ind2 as CsIndicatorDetail;
      r.trace =
        `完成率: ${d1.label}[${monthlyDesc(d1)}]→季度${pct(d1.rate)}×${d1.weight}` +
        ` + ${d2.label}[${monthlyDesc(d2)}]→季度${pct(d2.rate)}×${d2.weight}` +
        ` → 综合${pct(r.combinedRate as number)}；参评定薪=否，不入排名池`;
      continue;
    }
    if (!v.complete) {
      r.notes.push(`本人数据不完整（仅有${r.validMonths}个月），仅作为单元均值样本，不参与排名/定级/定薪`);
      const d1 = r.ind1 as CsIndicatorDetail;
      const d2 = r.ind2 as CsIndicatorDetail;
      r.trace =
        `完成率: ${d1.label}[${monthlyDesc(d1)}]→季度${pct(d1.rate)}×${d1.weight}` +
        ` + ${d2.label}[${monthlyDesc(d2)}]→季度${pct(d2.rate)}×${d2.weight}` +
        ` → 综合${pct(r.combinedRate as number)}；数据不完整(${r.validMonths}/3月)，不入排名池`;
      continue;
    }
    const dept = rankKeyOf(r);
    const tier = tierByDept.get(dept)!;
    const ratio = ratioByDept.get(dept)!;
    r.participationRatio = ratio;
    r.tierLabel = tier.label;
    const p = r.percentile as number;
    const ceiling = ceilingFromPercentile(p, tier);
    r.ceilingLevel = ceiling;

    const d1 = r.ind1 as CsIndicatorDetail;
    const d2 = r.ind2 as CsIndicatorDetail;
    // 基准线口径：有效月份均值（complete=true 时即 3 个月均值）
    const v1Avg = r.ind1Avg as number;
    const v2Avg = r.ind2Avg as number;
    const dropReasons: string[] = [];

    let level: CsLevel = ceiling;
    while (level !== "junior") {
      const spec = levelSpec(v.gc, level);
      const b1 = baselineOk(v.gc.ind1, v1Avg, spec.base1);
      const b2 = baselineOk(v.gc.ind2, v2Avg, spec.base2);
      const recvOk = r.receptionOk === true;
      if (level === "expert") {
        if (b1 && b2 && recvOk && r.expertAdvance === true) break;
        const why: string[] = [];
        if (!(b1 && b2)) why.push("基准线未达标");
        if (!recvOk) why.push("接待量不足");
        if (r.expertAdvance !== true) why.push("专家进阶未达成");
        dropReasons.push(`${lvlName(cfg, "expert")}（${why.join("/")}）`);
        level = LEVEL_LOWER[level];
      } else {
        if (b1 && b2 && recvOk) break;
        const why: string[] = [];
        if (!(b1 && b2)) why.push("基准线未达标");
        if (!recvOk) why.push("接待量不足");
        dropReasons.push(`${lvlName(cfg, level)}（${why.join("/")}）`);
        level = LEVEL_LOWER[level];
      }
    }
    r.finalLevel = level;
    r.grade = lvlName(cfg, level);

    // trace（不含 salStr，定薪阶段追加）
    const rateStr =
      `完成率: ${d1.label}[${monthlyDesc(d1)}]→季度${pct(d1.rate)}×${d1.weight}` +
      ` + ${d2.label}[${monthlyDesc(d2)}]→季度${pct(d2.rate)}×${d2.weight}` +
      ` → 综合${pct(r.combinedRate as number)}`;
    const rankStr =
      `排名 ${r.rank}/${r.poolSize}（分位${pct(p)}）, 参评比例${pct(ratio)}（${tier.label}）→ 上限${lvlName(cfg, ceiling)}`;
    const recvStr =
      `接待量季度均值${(r.reception as number).toFixed(1)}${r.receptionOk ? "≥" : "<"}单元季度均值×80%(${(r.receptionThreshold as number).toFixed(1)})`;
    r.trace = [rateStr, rankStr, recvStr].join("；");

    if (ceiling !== level && dropReasons.length > 0) {
      r.notes.push(`排名上限${lvlName(cfg, ceiling)}，逐级下调：${dropReasons.join("→")}→最终${r.grade}`);
    }
    if (level === "expert") {
      r.notes.push("专家进阶达成=是（已计入）");
    }
    if (d1.anyCapped || d2.anyCapped) {
      const which = [d1.anyCapped ? d1.label : null, d2.anyCapped ? d2.label : null]
        .filter(Boolean)
        .join("/");
      r.notes.push(`月度完成率封顶 120%（${which}）`);
    }
  }

  // 8) 分组定薪：按 dept × finalLevel 分组
  const salaryGroups = new Map<string, { r: CsResult; v: ValidEmp; rate: number }[]>();
  for (const [r, v] of validByEmp) {
    if (!r.participate || !v.complete || !r.finalLevel) continue;
    const key = `${rankKeyOf(r)}||${r.finalLevel}`;
    const arr = salaryGroups.get(key) ?? [];
    arr.push({ r, v, rate: r.combinedRate as number });
    salaryGroups.set(key, arr);
  }
  for (const [, members] of salaryGroups) {
    const rates = members.map((m) => m.rate);
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    for (const { r, v } of members) {
      const spec = levelSpec(v.gc, r.finalLevel as CsLevel);
      r.salaryBand = { lo: spec.salLo, hi: spec.salHi };
      let raw: number;
      if (members.length === 1 || maxRate === minRate) {
        raw = spec.salLo;
      } else if ((r.combinedRate as number) === minRate) {
        raw = spec.salLo;
      } else if ((r.combinedRate as number) === maxRate) {
        raw = spec.salHi;
      } else {
        raw = spec.salLo + (spec.salHi - spec.salLo) * ((r.combinedRate as number) - minRate) / (maxRate - minRate);
      }
      r.rawSalary = raw;
      r.monthlySalary = round100(raw);
      // 补充 trace 中 salStr
      const salStr = members.length === 1 || maxRate === minRate
        ? `级别内仅${members.length}人(同完成率)→固定${spec.salLo}→取百${r.monthlySalary}`
        : `级别内${members.length}人 完成率[${pct(minRate)},${pct(maxRate)}] 薪资[${spec.salLo},${spec.salHi}]插值→${raw.toFixed(0)}→取百${r.monthlySalary}`;
      r.trace += `；${salStr}`;
    }
  }

  return { results, participation, depts: cfg.depts };
}
