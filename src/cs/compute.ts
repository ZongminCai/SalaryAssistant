import { round100 } from "../calc/engine";
import {
  ceilingFromPercentile,
  findGroupConfig,
  tierOf,
} from "./config";
import { CS_LEVEL_ORDER, MONTH_COUNT } from "./types";
import type {
  CsEmployee,
  CsGroupConfig,
  CsIndicator,
  CsIndicatorDetail,
  CsLevel,
  CsLevelSpec,
  CsMonthlyRate,
  CsPositionConfig,
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
/** 日均接待量门槛系数：个人日均 ≥ 组内日均×90% */
const RECEPTION_FACTOR = 0.9;
/** 组别可参评人数 ≤ 此值时，完成率目标值按月确定（团队均值 or 中级基准线） */
const SMALL_UNIT_SIZE = 3;
/** 季度事假天数 ≥ 此值时取消正向评级资格 */
const LEAVE_DAYS_LIMIT = 5;

export interface CsComputeOutput {
  results: CsResult[];
  participation: DeptParticipation[];
  /** 检测到的部门（驱动页面「在职人数」输入框） */
  depts: string[];
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b) / xs.length;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** 单月完成率：value ÷ target（按方向），再做 120% 封顶 */
function monthlyRateCapped(
  ind: CsIndicator,
  value: number,
  target: number,
): { rate: number; capped: boolean } {
  const ratio = value / target;
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

function levelIdx(level: CsLevel): number {
  return CS_LEVEL_ORDER.indexOf(level);
}

function newResult(emp: CsEmployee): CsResult {
  return {
    name: emp.name ?? "",
    dept: emp.dept,
    group: emp.group,
    unitLabel: `${emp.dept ?? "?"} / ${emp.group ?? "?"}`,
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
  /** 季度出勤天数（日均接待量分母） */
  attendanceDays: number;
  /** 三项数据（ind1/ind2/reception）均完整（3 个月齐全）→ 可参与完整评级 */
  complete: boolean;
}

/** 校验并返回月度数据；失败返回 null */
function validate(emp: CsEmployee, cfg: CsPositionConfig, r: CsResult): ValidEmp | null {
  if (!emp.dept) r.errors.push("缺少必填字段「部门」");
  if (!emp.group) r.errors.push("缺少必填字段「组别」");
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
  if (
    emp.attendanceDays === undefined ||
    !Number.isFinite(emp.attendanceDays) ||
    emp.attendanceDays <= 0
  ) {
    r.errors.push("「季度出勤天数」必须为正数（用于计算日均接待量）");
  }
  if (r.errors.length > 0) return null;
  const complete = isFullMonthly(v1!) && isFullMonthly(v2!);
  return { emp, gc, v1: v1!, v2: v2!, rec: rec!, attendanceDays: emp.attendanceDays!, complete };
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
    const r = newResult(emp);
    r.leaveDays = emp.leaveDays;
    r.currentLevel = emp.currentLevel;
    r.currentSalary = emp.currentSalary;
    const v = validate(emp, cfg, r);
    if (v) validByEmp.set(r, v);
    results.push(r);
  }

  // 2) 评级单元（组别）/ 排名池（部门）分组 key
  const unitKeyOf = (r: CsResult) => `${r.dept}||${r.group}`;
  const rankKeyOf = (r: CsResult) => r.dept as string;

  // 3) 各评级单元 × 月度的指标均值 + 组内日均接待量
  interface UnitAgg {
    gc: CsGroupConfig;
    members: { r: CsResult; v: ValidEmp }[];
    /** 长度 MONTH_COUNT */
    ind1Means: number[];
    ind2Means: number[];
    /** 组内日均接待量 = Σ组内季度接待量 ÷ Σ组内季度出勤天数 */
    unitDailyReception: number;
  }
  const units = new Map<string, UnitAgg>();
  for (const [r, v] of validByEmp) {
    const k = unitKeyOf(r);
    let u = units.get(k);
    if (!u) {
      u = { gc: v.gc, members: [], ind1Means: [], ind2Means: [], unitDailyReception: 0 };
      units.set(k, u);
    }
    u.members.push({ r, v });
  }
  for (const u of units.values()) {
    for (let m = 0; m < MONTH_COUNT; m++) {
      const v1Vals = u.members.map((x) => x.v.v1[m]).filter((v): v is number => v !== undefined && Number.isFinite(v));
      const v2Vals = u.members.map((x) => x.v.v2[m]).filter((v): v is number => v !== undefined && Number.isFinite(v));
      u.ind1Means.push(v1Vals.length > 0 ? avg(v1Vals) : 0);
      u.ind2Means.push(v2Vals.length > 0 ? avg(v2Vals) : 0);
    }
    const recTotal = sum(
      u.members.flatMap((x) => x.v.rec).filter((v): v is number => v !== undefined && Number.isFinite(v)),
    );
    const attTotal = sum(u.members.map((x) => x.v.attendanceDays));
    u.unitDailyReception = attTotal > 0 ? recTotal / attTotal : 0;
  }

  // 3.5) 组别可参评人数（complete && participate）→ 决定完成率目标值口径
  const evaluableCount = new Map<string, number>();
  for (const [key, u] of units) {
    evaluableCount.set(key, u.members.filter((x) => x.v.complete && x.r.participate).length);
  }
  const smallUnits = new Set<string>();
  for (const [key, n] of evaluableCount) {
    if (n <= SMALL_UNIT_SIZE) smallUnits.add(key);
  }

  // 4) 月度完成率（120% 封顶）→ 季度均值（仅对有数据月份求均值）
  for (const [r, v] of validByEmp) {
    const u = units.get(unitKeyOf(r)) as UnitAgg;
    // 计算有效月份数
    const vm = Math.min(validMonthCount(v.v1), validMonthCount(v.v2));
    r.validMonths = vm;

    // 可参评≤3人的组：按月确定目标值（当月有数据人数＞3 → 当月均值；否则 → 中级基准线）
    const smallUnit = smallUnits.has(unitKeyOf(r));

    // 当月目标值：均值口径下检查均值是否为 0（无法计算完成率）
    const monthlyTarget = (
      ind: CsIndicator,
      means: number[],
      base: number | undefined,
      m: number,
    ): { target: number; kind: "mean" | "baseline" } | null => {
      if (!smallUnit) {
        if (means[m] <= 0) return null;
        return { target: means[m], kind: "mean" };
      }
      const monthCount = u.members.filter(
        (x) => x.v[ind === v.gc.ind1 ? "v1" : "v2"][m] !== undefined,
      ).length;
      if (monthCount > SMALL_UNIT_SIZE) {
        if (means[m] <= 0) return null;
        return { target: means[m], kind: "mean" };
      }
      if (base === undefined || base <= 0) return null;
      return { target: base, kind: "baseline" };
    };

    const t1Bad = (() => {
      for (let m = 0; m < MONTH_COUNT; m++) {
        if (v.v1[m] !== undefined && monthlyTarget(v.gc.ind1, u.ind1Means, v.gc.middle.base1, m) === null) return true;
        if (v.v2[m] !== undefined && monthlyTarget(v.gc.ind2, u.ind2Means, v.gc.middle.base2, m) === null) return true;
      }
      return false;
    })();
    if (t1Bad) {
      r.errors.push("评级单元当月目标值无效（均值为 0 或缺少中级基准线），无法计算完成率");
      validByEmp.delete(r);
      continue;
    }

    const buildDetail = (
      ind: CsIndicator,
      values: (number | undefined)[],
      means: number[],
      base: number | undefined,
    ): CsIndicatorDetail => {
      const monthly: CsMonthlyRate[] = [];
      for (let m = 0; m < MONTH_COUNT; m++) {
        if (values[m] === undefined || !Number.isFinite(values[m])) continue;
        const t = monthlyTarget(ind, means, base, m)!;
        const { rate, capped } = monthlyRateCapped(ind, values[m] as number, t.target);
        monthly.push({ value: values[m] as number, mean: t.target, target: t.kind, rate, capped });
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

    r.ind1 = buildDetail(v.gc.ind1, v.v1, u.ind1Means, v.gc.middle.base1);
    r.ind2 = buildDetail(v.gc.ind2, v.v2, u.ind2Means, v.gc.middle.base2);
    r.ind1Avg = avg(v.v1.filter((x): x is number => x !== undefined));
    r.ind2Avg = avg(v.v2.filter((x): x is number => x !== undefined));
    r.combinedRate = r.ind1.rate * r.ind1.weight + r.ind2.rate * r.ind2.weight;

    // 日均接待量：个人日均 = 季度接待量之和 ÷ 季度出勤天数；门槛 = 组内日均×90%
    const recValues = v.rec.filter((x): x is number => x !== undefined && Number.isFinite(x));
    const receptionTotal = sum(recValues);
    const dailyReception = receptionTotal / v.attendanceDays;
    const threshold = u.unitDailyReception * RECEPTION_FACTOR;
    r.receptionMonthly = [...v.rec];
    r.reception = avg(recValues);
    r.receptionTotal = receptionTotal;
    r.attendanceDays = v.attendanceDays;
    r.dailyReception = dailyReception;
    r.unitDailyReception = u.unitDailyReception;
    r.receptionThreshold = threshold;
    r.receptionOk = dailyReception >= threshold;
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
        .map((mm, i) => `${i + 1}月${pct(mm.rate)}${mm.capped ? "(封顶)" : ""}${mm.target === "baseline" ? "(基准线)" : ""}`)
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
        if (!recvOk) why.push("日均接待量不足");
        if (r.expertAdvance !== true) why.push("专家进阶未达成");
        dropReasons.push(`${lvlName(cfg, "expert")}（${why.join("/")}）`);
        level = LEVEL_LOWER[level];
      } else {
        if (b1 && b2 && recvOk) break;
        const why: string[] = [];
        if (!(b1 && b2)) why.push("基准线未达标");
        if (!recvOk) why.push("日均接待量不足");
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
      `个人日均接待量${(r.dailyReception as number).toFixed(1)}${r.receptionOk ? "≥" : "<"}组内日均×90%(${(r.receptionThreshold as number).toFixed(1)})`;
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
    if (smallUnits.has(unitKeyOf(r))) {
      r.notes.push("组别可参评人数≤3，完成率目标值按月确定（当月人数＞3 用团队均值，否则用中级基准线）");
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
    const effectiveMinRate = minRate < 0.8 ? 0.8 : minRate;
    for (const { r, v } of members) {
      const spec = levelSpec(v.gc, r.finalLevel as CsLevel);
      r.salaryBand = { lo: spec.salLo, hi: spec.salHi };
      let raw: number;
      if ((r.combinedRate as number) < 0.8) {
        raw = spec.salLo;
      } else if (members.length === 1 || maxRate === effectiveMinRate) {
        raw = spec.salLo;
      } else if ((r.combinedRate as number) === maxRate) {
        raw = spec.salHi;
      } else {
        raw = spec.salLo + (spec.salHi - spec.salLo)
          * ((r.combinedRate as number) - effectiveMinRate) / (maxRate - effectiveMinRate);
      }
      r.rawSalary = raw;
      r.monthlySalary = round100(raw);
      // 补充 trace 中 salStr
      let salStr: string;
      if ((r.combinedRate as number) < 0.8) {
        salStr = `完成率<80%→固定${spec.salLo}→取百${r.monthlySalary}`;
      } else if (members.length === 1 || maxRate === effectiveMinRate) {
        salStr = `级别内仅${members.length}人(同完成率)→固定${spec.salLo}→取百${r.monthlySalary}`;
      } else {
        salStr = `级别内${members.length}人 完成率[${pct(effectiveMinRate)},${pct(maxRate)}] 薪资[${spec.salLo},${spec.salHi}]插值→${raw.toFixed(0)}→取百${r.monthlySalary}`;
      }
      r.trace += `；${salStr}`;
    }
  }

  // 9) 事假封顶：季度事假≥5天 → 评级与薪资只降不升（高于现状按现状执行）
  for (const [r, v] of validByEmp) {
    if (!r.participate || !v.complete || !r.finalLevel) continue;
    const leaveDays = r.leaveDays ?? 0;
    if (leaveDays < LEAVE_DAYS_LIMIT) continue;
    if (r.currentLevel === undefined || r.currentSalary === undefined) {
      r.errors.push(`季度事假${leaveDays}天（≥${LEAVE_DAYS_LIMIT}天）须填写「当前级别」与「当前月薪」以执行正向评级封顶`);
      continue;
    }
    const evaluatedLevel = r.finalLevel;
    const evaluatedSalary = r.monthlySalary as number;
    const higher =
      levelIdx(evaluatedLevel) > levelIdx(r.currentLevel) ||
      (evaluatedLevel === r.currentLevel && evaluatedSalary > (r.currentSalary as number));
    if (!higher) continue; // 评定结果不高于现状 → 正常按评定结果执行（含下调）
    r.leaveCapped = true;
    r.evaluatedLevel = evaluatedLevel;
    r.evaluatedSalary = evaluatedSalary;
    r.finalLevel = r.currentLevel;
    r.grade = lvlName(cfg, r.currentLevel);
    r.monthlySalary = r.currentSalary as number;
    r.rawSalary = r.currentSalary as number;
    const spec = levelSpec(v.gc, r.currentLevel);
    r.salaryBand = { lo: spec.salLo, hi: spec.salHi };
    r.notes.push(
      `季度事假${leaveDays}天≥${LEAVE_DAYS_LIMIT}天，取消正向评级：评定${lvlName(cfg, evaluatedLevel)}/${evaluatedSalary}元 高于现状 → 按现状${r.grade}/${r.currentSalary}元执行`,
    );
    r.trace += `；事假${leaveDays}天≥${LEAVE_DAYS_LIMIT}天封顶→现状${r.grade}/${r.currentSalary}元`;
  }

  return { results, participation, depts: cfg.depts };
}
