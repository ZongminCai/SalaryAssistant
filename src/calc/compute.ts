import {
  EDU_MAP,
  findBracket,
  interp,
  round100,
  salaryFromBracket,
} from "./engine";
import {
  BUSINESS,
  CROSS_BORDER,
  LIVESTREAM,
  LIVESTREAM_INCENTIVE,
  MALL_OPS,
  POSITIONS,
  PRODUCT_OPS,
  VIDEO_CONTENT,
} from "./tables";
import type { Bracket, Employee, PositionKey, PositionResult } from "./types";

/** 把命中 bracket 的元信息写入 result，便于结果表展示。 */
function captureBracket(r: PositionResult, b: Bracket): void {
  r.perf_bracket = {
    lo: b.lo,
    hi: b.hi,
    lo_inc: b.lo_inc ?? true,
    hi_inc: b.hi_inc ?? false,
  };
  if ((b.formula ?? "interp") === "interp" && b.sal_lo !== undefined && b.sal_hi !== undefined) {
    r.salary_bracket = { sal_lo: b.sal_lo, sal_hi: b.sal_hi };
  } else {
    r.salary_bracket = null;
  }
}

function need<T extends keyof Employee>(
  emp: Employee,
  key: T,
  errors: string[],
  label: string,
): Employee[T] | undefined {
  const v = emp[key];
  if (v === undefined || v === null) {
    errors.push(`缺少必填字段: ${String(key)}(${label})`);
    return undefined;
  }
  return v;
}

function money(x: number | null): string {
  if (x === null || x === undefined) return "—";
  return `${round100(x)}元`;
}

function traceOf(b: Bracket, v: number): string {
  if (b.formula === "fixed") return `专家/特殊待遇: 固定${b.fixed}元`;
  const { lo, hi } = b;
  return `插值: (${v}-${lo})×(${b.sal_hi}-${b.sal_lo})/(${hi}-${lo})+${b.sal_lo}=${money(interp(v, b))}`;
}

/** 处理"特殊固定薪资(不取百)"与"计算薪资(取百)"，试用期 ×80% */
function finalize(r: PositionResult, emp: Employee, personal: number | null, pFixed: boolean, mgmt: number = 0): void {
  if (personal === null || personal === undefined) {
    r.monthly_salary = null;
    return;
  }
  const std = pFixed ? (personal + (round100(mgmt) ?? 0)) : (round100(personal + mgmt) ?? 0);
  if (emp.probation) {
    const prob = round100(std * 0.8) ?? 0;
    r.notes.push(`试用期=转正后(${std})×80%=${prob}`);
    r.std_salary = std;
    r.monthly_salary = prob;
  } else {
    r.monthly_salary = std;
  }
}

function computeVideo(emp: Employee, r: PositionResult): void {
  const errors = r.errors;
  const v = need(emp, "perf_personal", errors, "季度累计实际成交金额万元") as number | undefined;
  if (v === undefined) return;
  const b = findBracket(VIDEO_CONTENT, v);
  if (!b) {
    errors.push(`业绩 ${v} 万元 低于最低评级区间[10万)，需谈薪/人工处理`);
    return;
  }
  r.grade = b.grade ?? null;
  r.trace = traceOf(b, v);
  captureBracket(r, b);
  const raw = salaryFromBracket(b, v);
  r.raw_salary = raw;
  finalize(r, emp, raw, b.formula === "fixed");
}

function opsWithMgmt(
  emp: Employee,
  r: PositionResult,
  personalTable: Bracket[],
  mgmtTable: Bracket[],
  minSpan: number,
  belowMsg: (v: number) => string,
): void {
  const { notes, errors } = r;
  const level = emp.level ?? "专员";
  const v = need(emp, "perf_personal", errors, "个人季度月均销售额万元") as number | undefined;
  if (v === undefined) return;
  const b = findBracket(personalTable, v);
  if (!b) {
    errors.push(belowMsg(v));
    return;
  }
  r.grade = b.grade ?? null;
  const pFixed = b.formula === "fixed";
  const personal = salaryFromBracket(b, v);
  captureBracket(r, b);
  let trace = traceOf(b, v);
  let mgmt = 0;
  if (level === "组长") {
    const span = emp.span_of_control;
    const team = emp.perf_team;
    if (span === undefined || span === null || team === undefined || team === null) {
      errors.push("组长需提供 span_of_control(管理幅度) 与 perf_team(团队季度月均销售额万元)");
      return;
    }
    if (span >= minSpan) {
      const mb = findBracket(mgmtTable, team);
      if (!mb) {
        errors.push(`团队业绩 ${team} 万元 未匹配到管理薪资区间`);
        return;
      }
      mgmt = salaryFromBracket(mb, team);
      trace += ` ; 管理部分(团队${team}万,幅度${span}人)=${money(mgmt)}`;
    } else {
      notes.push(`管理幅度${span}人 < ${minSpan}人，不享有管理薪资`);
    }
  }
  r.trace = trace;
  r.raw_salary = personal + mgmt;
  finalize(r, emp, personal, pFixed, mgmt);
}

/** 处理 管培生(按学历) 与 助理(谈薪制)。返回 true 表示已处理 */
function eduOrAssistant(emp: Employee, r: PositionResult): boolean {
  const level = emp.level;
  if (level === "管培生") {
    const edu = emp.education;
    if (!edu || !(edu in EDU_MAP)) {
      r.errors.push(`运营管培生需提供有效 education: ${Object.keys(EDU_MAP).sort().join("/")}`);
    } else {
      r.grade = "运营管培生";
      r.trace = `学历定薪: ${edu}`;
      r.raw_salary = EDU_MAP[edu];
      finalize(r, emp, EDU_MAP[edu], true);
    }
    return true;
  }
  if (level === "助理") {
    r.grade = "运营助理";
    r.monthly_salary = null;
    r.notes.push("运营助理采用谈薪制，不参与评级定薪");
    return true;
  }
  return false;
}

function computeCrossBorder(emp: Employee, r: PositionResult): void {
  const region = emp.region;
  if (!region || !(region in CROSS_BORDER)) {
    r.errors.push(`跨境运营岗必须指定 region: 西安/深圳（收到: ${JSON.stringify(region)}）`);
    return;
  }
  if (eduOrAssistant(emp, r)) return;
  const cfg = CROSS_BORDER[region];
  opsWithMgmt(
    emp,
    r,
    cfg.personal,
    cfg.mgmt,
    cfg.mgmt_min_span,
    (v) => `个人业绩 ${v} 万元 低于最低评级区间，需谈薪/人工处理`,
  );
}

function computeMall(emp: Employee, r: PositionResult): void {
  if (eduOrAssistant(emp, r)) return;
  opsWithMgmt(
    emp,
    r,
    MALL_OPS.personal,
    MALL_OPS.mgmt,
    MALL_OPS.mgmt_min_span,
    (v) => `个人业绩 ${v} 万元 低于最低评级区间[20万)，需谈薪/人工处理`,
  );
}

function computeBusiness(emp: Employee, r: PositionResult): void {
  const errors = r.errors;
  const level = emp.level ?? "专员";
  if (!(level in BUSINESS)) {
    errors.push(`商务岗 level 必须为 专员/主管（收到: ${JSON.stringify(level)}）`);
    return;
  }
  const v = need(emp, "perf_personal", errors, "季度月均销售额万元") as number | undefined;
  if (v === undefined) return;
  const b = findBracket(BUSINESS[level], v);
  if (!b) {
    errors.push(`业绩 ${v} 万元 低于最低评级区间[10万)，需谈薪/人工处理`);
    return;
  }
  r.grade = b.grade ?? null;
  r.trace = traceOf(b, v);
  captureBracket(r, b);
  const raw = salaryFromBracket(b, v);
  r.raw_salary = raw;
  finalize(r, emp, raw, b.formula === "fixed");
}

function computeLivestream(emp: Employee, r: PositionResult): void {
  const { notes, errors } = r;
  const acc = emp.account_type;
  const q = emp.perf_personal;
  if (q !== undefined && q !== null) {
    if (!acc || !(acc in LIVESTREAM)) {
      errors.push(`主播岗季度评级需指定 account_type: 官旗/其他（收到: ${JSON.stringify(acc)}）`);
    } else {
      const b = findBracket(LIVESTREAM[acc], q);
      if (!b) {
        errors.push(`季度累计净销售额 ${q} 万元 低于最低评级区间，需谈薪/人工处理`);
      } else {
        r.grade = b.grade ?? null;
        r.trace = traceOf(b, q);
        captureBracket(r, b);
        const raw = salaryFromBracket(b, q);
        r.raw_salary = raw;
        finalize(r, emp, raw, b.formula === "fixed");
      }
    }
  }
  const mm = emp.monthly_net_sales;
  if (mm !== undefined && mm !== null) {
    const ib = findBracket(LIVESTREAM_INCENTIVE, mm);
    if (ib) {
      r.incentive = Math.round(mm * 10000 * (ib.rate as number));
      r.incentive_rate = ib.rate;
      notes.push(`月度激励=月度净销售额${mm}万×${((ib.rate as number) * 100).toFixed(1)}%=${r.incentive}元`);
    }
  }
  if ((q === undefined || q === null) && (mm === undefined || mm === null)) {
    errors.push("主播岗需至少提供 perf_personal(季度累计净销售额) 或 monthly_net_sales(月度净销售额)");
  }
}

function computeProduct(emp: Employee, r: PositionResult): void {
  const errors = r.errors;
  if (eduOrAssistant(emp, r)) return;
  const dept = emp.dept;
  if (!dept || !(dept in PRODUCT_OPS)) {
    errors.push(`产品运营岗必须指定 dept: 电商三部/其他部门（收到: ${JSON.stringify(dept)}）`);
    return;
  }
  const v = need(emp, "perf_personal", errors, "季度月均销售额万元") as number | undefined;
  if (v === undefined) return;
  const b = findBracket(PRODUCT_OPS[dept], v);
  if (!b) {
    errors.push(`业绩 ${v} 万元 低于最低评级区间，需谈薪/人工处理`);
    return;
  }
  r.grade = b.grade ?? null;
  captureBracket(r, b);
  const sal = salaryFromBracket(b, v);
  r.raw_salary = sal;
  if (b.formula === "pct") {
    r.trace = `${b.grade}: 上季度月均销售额${v}万×${((b.rate as number) * 100).toFixed(1)}%=${money(sal)}`;
  } else if (b.formula === "fixed") {
    r.trace = `${b.grade}: 固定${b.fixed}元`;
  } else {
    r.trace = traceOf(b, v);
  }
  finalize(r, emp, sal, b.formula === "fixed");
}

const DISPATCH: Record<PositionKey, (emp: Employee, r: PositionResult) => void> = {
  video_content: computeVideo,
  cross_border_ops: computeCrossBorder,
  business_bd: computeBusiness,
  mall_ops: computeMall,
  livestream_host: computeLivestream,
  product_ops: computeProduct,
};

export function computeOne(emp: Employee): PositionResult {
  const r: PositionResult = {
    name: emp.name ?? "",
    position: emp.position,
    position_label: emp.position ? POSITIONS[emp.position] ?? emp.position : "",
    level: emp.level,
    region: emp.region,
    dept: emp.dept,
    account_type: emp.account_type,
    perf_personal: emp.perf_personal,
    perf_team: emp.perf_team,
    span_of_control: emp.span_of_control,
    monthly_net_sales: emp.monthly_net_sales,
    probation: emp.probation,
    grade: null,
    monthly_salary: null,
    std_salary: null,
    incentive: null,
    trace: "",
    notes: [],
    errors: [...(emp.__parseErrors ?? [])],
    __rowIndex: emp.__rowIndex,
    monthly_perf: emp.perf_personal !== undefined && emp.perf_personal !== null
      ? emp.perf_personal / 3
      : null,
    perf_bracket: null,
    salary_bracket: null,
    raw_salary: null,
  };
  if (!emp.position || !(emp.position in DISPATCH)) {
    r.errors.push(`未知 position: ${JSON.stringify(emp.position)}（可选: ${Object.keys(POSITIONS).join("/")}）`);
    return r;
  }
  try {
    DISPATCH[emp.position](emp, r);
  } catch (e) {
    r.errors.push(`计算异常: ${(e as Error).message}`);
  }
  return r;
}

export function computeAll(employees: Employee[]): PositionResult[] {
  return employees.map(computeOne);
}
