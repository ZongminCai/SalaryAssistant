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

const RATE_LO = 0.8;
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

/**
 * 线性插值薪资：
 * - 综合完成率 ≥ 80% 时，按 (rate-80%) × 区间差 / 40% + salLo 计算（120% 封顶）。
 * - 综合完成率 < 80% 时，直接取所在组别薪资区间低限（floored=true）。
 */
function salaryOf(
  spec: CsLevelSpec,
  rate: number,
): { raw: number; clamped: number; floored: boolean } {
  const floored = rate < RATE_LO;
  const clamped = Math.min(RATE_HI, Math.max(RATE_LO, rate));
  const raw = ((clamped - RATE_LO) * (spec.salHi - spec.salLo)) / (RATE_HI - RATE_LO) + spec.salLo;
  return { raw, clamped, floored };
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

/** 把月度数组校验为「长度为 MONTH_COUNT 且每月均为有限非负数」 */
function fullMonthlyArr(arr: (number | undefined)[] | undefined): number[] | null {
  if (!arr || arr.length !== MONTH_COUNT) return null;
  const out: number[] = [];
  for (const v of arr) {
    if (v === undefined || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

interface ValidEmp {
  emp: CsEmployee;
  gc: CsGroupConfig;
  v1: number[]; // ind1 月度值，长度 MONTH_COUNT
  v2: number[]; // ind2 月度值，长度 MONTH_COUNT
  rec: number[]; // 接待量月度值，长度 MONTH_COUNT
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
  const v1 = fullMonthlyArr(emp.values[gc.ind1.label]);
  const v2 = fullMonthlyArr(emp.values[gc.ind2.label]);
  const rec = fullMonthlyArr(emp.reception);
  if (!v1) r.errors.push(`指标「${gc.ind1.label}」需分别填写 月1 / 月2 / 月3 三个月数据`);
  if (!v2) r.errors.push(`指标「${gc.ind2.label}」需分别填写 月1 / 月2 / 月3 三个月数据`);
  if (!rec) r.errors.push("「接待量」需分别填写 月1 / 月2 / 月3 三个月数据");
  if (r.errors.length > 0) return null;
  return { emp, gc, v1: v1 as number[], v2: v2 as number[], rec: rec as number[] };
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
      u.ind1Means.push(avg(u.members.map((x) => x.v.v1[m])));
      u.ind2Means.push(avg(u.members.map((x) => x.v.v2[m])));
      u.receptionMeans.push(avg(u.members.map((x) => x.v.rec[m])));
    }
  }

  // 4) 月度完成率（120% 封顶）→ 季度均值
  for (const [r, v] of validByEmp) {
    const u = units.get(unitKeyOf(r)) as UnitAgg;
    if (u.ind1Means.some((m) => m <= 0) || u.ind2Means.some((m) => m <= 0)) {
      r.errors.push("评级单元月度指标均值为 0，无法计算完成率");
      validByEmp.delete(r);
      continue;
    }

    const buildDetail = (
      ind: CsIndicator,
      values: number[],
      means: number[],
    ): CsIndicatorDetail => {
      const monthly: CsMonthlyRate[] = [];
      for (let m = 0; m < MONTH_COUNT; m++) {
        const { rate, capped } = monthlyRateCapped(ind, values[m], means[m]);
        monthly.push({ value: values[m], mean: means[m], rate, capped });
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
    r.combinedRate = r.ind1.rate * r.ind1.weight + r.ind2.rate * r.ind2.weight;

    // 接待量：月度明细 + 季度均值口径
    const receptionMonthly: CsReceptionMonthly[] = [];
    for (let m = 0; m < MONTH_COUNT; m++) {
      const value = v.rec[m];
      const mean = u.receptionMeans[m];
      const threshold = mean * RECEPTION_FACTOR;
      receptionMonthly.push({ value, mean, threshold, ok: value >= threshold });
    }
    const receptionAvg = avg(v.rec);
    const receptionMeanAvg = avg(u.receptionMeans);
    r.receptionMonthly = receptionMonthly;
    r.reception = receptionAvg;
    r.receptionMean = receptionMeanAvg;
    r.receptionThreshold = receptionMeanAvg * RECEPTION_FACTOR;
    r.receptionOk = receptionAvg >= r.receptionThreshold;
  }

  // 5) 参评比例（按 rankKey/部门）——仅 participate=true 计入排名池
  const rankPools = new Map<string, CsResult[]>();
  for (const [r] of validByEmp) {
    if (!r.participate) continue;
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

  // 7) 定级 + 定薪（仅 participate=true；participate=false 仅输出明细，不定级不定薪）
  for (const [r, v] of validByEmp) {
    if (!r.participate) {
      r.notes.push("本人不参与评级定薪，仅作为单元均值样本");
      const monthlyDesc = (d: CsIndicatorDetail) =>
        d.monthly
          .map((mm, i) => `${i + 1}月${pct(mm.rate)}${mm.capped ? "(封顶)" : ""}`)
          .join("/");
      const d1 = r.ind1 as CsIndicatorDetail;
      const d2 = r.ind2 as CsIndicatorDetail;
      r.trace =
        `完成率: ${d1.label}[${monthlyDesc(d1)}]→季度${pct(d1.rate)}×${d1.weight}` +
        ` + ${d2.label}[${monthlyDesc(d2)}]→季度${pct(d2.rate)}×${d2.weight}` +
        ` → 综合${pct(r.combinedRate as number)}；参评定薪=否，不入排名池`;
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
    // 基准线口径：3 个月均值
    const v1Avg = avg(v.v1);
    const v2Avg = avg(v.v2);
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

    const spec = levelSpec(v.gc, level);
    const { raw, clamped, floored } = salaryOf(spec, r.combinedRate as number);
    r.salaryBand = { lo: spec.salLo, hi: spec.salHi };
    r.rawSalary = raw;
    r.monthlySalary = round100(raw);

    // trace
    const monthlyDesc = (d: CsIndicatorDetail) =>
      d.monthly
        .map((mm, i) => `${i + 1}月${pct(mm.rate)}${mm.capped ? "(封顶)" : ""}`)
        .join("/");
    const rateStr =
      `完成率: ${d1.label}[${monthlyDesc(d1)}]→季度${pct(d1.rate)}×${d1.weight}` +
      ` + ${d2.label}[${monthlyDesc(d2)}]→季度${pct(d2.rate)}×${d2.weight}` +
      ` → 综合${pct(r.combinedRate as number)}`;
    const rankStr =
      `排名 ${r.rank}/${r.poolSize}（分位${pct(p)}）, 参评比例${pct(ratio)}（${tier.label}）→ 上限${lvlName(cfg, ceiling)}`;
    const recvStr =
      `接待量季度均值${(r.reception as number).toFixed(1)}${r.receptionOk ? "≥" : "<"}单元季度均值×80%(${(r.receptionThreshold as number).toFixed(1)})`;
    const salStr = floored
      ? `综合完成率<80% → 取所在组别薪资区间低限 ${spec.salLo}→取百${r.monthlySalary}`
      : `薪资[${spec.salLo},${spec.salHi}) 插值: (${pct(clamped)}-80%)×${spec.salHi - spec.salLo}/40%+${spec.salLo}=${raw.toFixed(2)}→取百${r.monthlySalary}`;
    r.trace = [rateStr, rankStr, recvStr, salStr].join("；");

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
    if (floored) {
      r.notes.push("综合完成率<80%，按薪资区间低限定薪");
    }
  }

  return { results, participation, depts: cfg.depts };
}
