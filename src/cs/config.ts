import type {
  CsColumn,
  CsGroupConfig,
  CsIndicator,
  CsLevel,
  CsLevelSpec,
  CsPositionConfig,
  CsPositionKey,
} from "./types";
import { CS_LEVEL_ORDER, MONTH_COUNT, MONTH_LABELS } from "./types";

// ---- 指标工厂 ----
const conv = (weight: number): CsIndicator => ({ label: "转化率", weight, direction: "positive", unit: "%" });
const sat = (weight: number): CsIndicator => ({ label: "客户满意度", weight, direction: "positive", unit: "%" });
const score = (weight: number): CsIndicator => ({ label: "客服服务分", weight, direction: "positive", unit: "分" });
const resp = (weight: number): CsIndicator => ({ label: "响应时间", weight, direction: "reverse", unit: "秒" });

// 级别 spec 简写：初级无基准线
const lvl = (salLo: number, salHi: number, base1?: number, base2?: number): CsLevelSpec => ({
  salLo,
  salHi,
  base1,
  base2,
});

/**
 * 参评比例档位 → 各级别「排名分位上限」。
 * 分位 p = (rank-1)/N（rank 从 1 开始，1=最好）。
 * 含义：p ≤ expert → 可达专家；≤ senior → 可达高级；≤ middle → 可达中级；否则初级。
 * V2.0 方案四档分位与旧方案一致（已核对 V2.0 通知附表）。
 */
export interface RankTier {
  label: string;
  test: (ratio: number) => boolean;
  expert: number;
  senior: number;
  middle: number;
}

export const RANK_TIERS: RankTier[] = [
  { label: "参评比例＞80%", test: (r) => r > 0.8, expert: 0.03, senior: 0.05, middle: 0.25 },
  { label: "80%≥参评比例＞60%", test: (r) => r > 0.6 && r <= 0.8, expert: 0.03, senior: 0.04, middle: 0.2 },
  { label: "60%≥参评比例＞40%", test: (r) => r > 0.4 && r <= 0.6, expert: 0.02, senior: 0.03, middle: 0.15 },
  { label: "参评比例≤40%", test: (r) => r <= 0.4, expert: 0.02, senior: 0.02, middle: 0.1 },
];

export function tierOf(ratio: number): RankTier {
  return RANK_TIERS.find((t) => t.test(ratio)) ?? RANK_TIERS[0];
}

/** 排名分位 → 可达级别上限 */
export function ceilingFromPercentile(p: number, tier: RankTier): CsLevel {
  if (p <= tier.expert) return "expert";
  if (p <= tier.senior) return "senior";
  if (p <= tier.middle) return "middle";
  return "junior";
}

// ====== 电商事业群客服接待岗 V2.0（部门 → 组别） ======
const TM = "天猫服务部";
const DY = "抖音服务部";
const JD = "京东服务部";
const PDD = "拼多多服务部";

const V2_GROUPS: CsGroupConfig[] = [
  // ---- 天猫服务部（V2.0 取消优+服务组、物流速询组） ----
  { dept: TM, group: "售前服务组（官旗）", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 44, 18), senior: lvl(4300, 4500, 48, 16), expert: lvl(4500, 5000, 54, 14) },
  { dept: TM, group: "售前服务组（综合）", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 41, 18), senior: lvl(4300, 4500, 45, 16), expert: lvl(4500, 5000, 52, 14) },
  { dept: TM, group: "标准服务组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3200, 4000), middle: lvl(4000, 4500, 95, 18), senior: lvl(4500, 5000, 97, 16), expert: lvl(5000, 5500, 99, 14) },
  { dept: TM, group: "专业服务组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3800, 4300), middle: lvl(4300, 4500, 95, 20), senior: lvl(4500, 5000, 97, 18), expert: lvl(5000, 5500, 99, 16) },

  // ---- 抖音服务部（V2.0 新增综合组，指标同售后一/二组） ----
  { dept: DY, group: "抖音-售前组", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 46, 15), senior: lvl(4500, 5000, 50, 12), expert: lvl(5000, 5500, 54, 10) },
  { dept: DY, group: "抖音-售后一组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 15), senior: lvl(4500, 5000, 95, 12), expert: lvl(5000, 5500, 99, 10) },
  { dept: DY, group: "抖音-售后二组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 15), senior: lvl(4500, 5000, 95, 12), expert: lvl(5000, 5500, 99, 10) },
  { dept: DY, group: "抖音-综合组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 15), senior: lvl(4500, 5000, 95, 12), expert: lvl(5000, 5500, 99, 10) },

  // ---- 京东服务部（V2.0 新成立，部门内独立绩效排序；指标/基准线/薪资区间沿用原快手/京东综合组） ----
  { dept: JD, group: "京东-综合组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 18), senior: lvl(4500, 5000, 95, 15), expert: lvl(5000, 5500, 99, 12) },
  // 京东组：两个指标都是正向（无响应时间）
  { dept: JD, group: "京东-京东组", ind1: sat(0.5), ind2: conv(0.5),
    junior: lvl(3800, 4300), middle: lvl(4300, 4500, 90, 35), senior: lvl(4500, 5000, 95, 38), expert: lvl(5000, 5500, 99, 42) },

  // ---- 拼多多服务部 ----
  { dept: PDD, group: "拼多多-售后组", ind1: score(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 3, 18), senior: lvl(4300, 4500, 3.4, 15), expert: lvl(4500, 5000, 3.8, 12) },
  { dept: PDD, group: "拼多多-售前组", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 32, 12), senior: lvl(4500, 5000, 36, 10), expert: lvl(5000, 5500, 42, 8) },
  { dept: PDD, group: "拼多多-综合组", ind1: score(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 3, 24), senior: lvl(4500, 5000, 3.5, 20), expert: lvl(5000, 5500, 4, 16) },
];

// 各部门 → 组别名列表（用于 模板/校验 的下拉与配对校验）
export const DEPT_GROUPS: Record<string, string[]> = {
  [TM]: V2_GROUPS.filter((g) => g.dept === TM).map((g) => g.group as string),
  [DY]: V2_GROUPS.filter((g) => g.dept === DY).map((g) => g.group as string),
  [JD]: V2_GROUPS.filter((g) => g.dept === JD).map((g) => g.group as string),
  [PDD]: V2_GROUPS.filter((g) => g.dept === PDD).map((g) => g.group as string),
};

// ---- 列工厂：把一个逻辑 indicator / reception 列展开成 MONTH_COUNT 个月度列 ----
// 逻辑名用作 emp.values 的 key（与 gc.indX.label 对齐），Excel 列头为 "<逻辑名>-<月份>"。
function expandMonthlyColumns(base: CsColumn): CsColumn[] {
  if (base.kind !== "indicator" && base.kind !== "reception") return [base];
  const exampleArr = Array.isArray(base.example) ? base.example : null;
  return Array.from({ length: MONTH_COUNT }, (_, m) => ({
    ...base,
    key: `${base.key}_m${m + 1}`,
    label: `${base.label}-${MONTH_LABELS[m]}`,
    baseLabel: base.label,
    monthIndex: m,
    // 示例值：若原示例为数组则按月取，否则月1 使用原示例、其余月份留空
    example: exampleArr ? exampleArr[m] ?? "" : (m === 0 ? base.example : ""),
  }));
}

function buildColumns(base: CsColumn[]): CsColumn[] {
  return base.flatMap(expandMonthlyColumns);
}

const LEVEL_NAMES: Record<CsLevel, string> = {
  junior: "初级销售/产品顾问",
  middle: "中级销售/产品顾问",
  senior: "高级销售/产品顾问",
  expert: "专家级销售/产品顾问",
};

// ---- 导入列 ----
const NAME_COL: CsColumn = { key: "name", label: "姓名", kind: "name", required: true, comment: "员工姓名（必填）", example: "张三" };
const RECEPTION_COL: CsColumn = { key: "reception", label: "接待量", kind: "reception", required: true, comment: "分别填写月１/月２/月３ 的接待量（列头必须存在，月份可按实际情况留空）。中级及以上门槛：个人日均接待量（季度接待量之和÷季度出勤天数）≥ 组内日均接待量×90%", example: 1200 };
const ATTENDANCE_COL: CsColumn = { key: "attendance_days", label: "季度出勤天数", kind: "attendance", required: true, comment: "必填：本评级周期（季度）个人出勤天数合计，用于计算日均接待量", example: 60 };
const LEAVE_DAYS_COL: CsColumn = { key: "leave_days", label: "季度事假天数", kind: "leave_days", required: false, comment: "可选：本评级周期累计事假天数（含后补事假），留空视为 0。≥5 天取消当季度岗位及薪资正向评级资格（评级/薪资只降不升，须同时填写「当前级别」「当前月薪」）", example: 0 };
const CURRENT_LEVEL_COL: CsColumn = { key: "current_level", label: "当前级别", kind: "current_level", required: false, enum: CS_LEVEL_ORDER.map((l) => LEVEL_NAMES[l]), comment: "可选：员工当前岗位级别（初级/中级/高级/专家级销售/产品顾问）。「季度事假天数」≥5 时必填，用于正向评级封顶", example: "" };
const CURRENT_SALARY_COL: CsColumn = { key: "current_salary", label: "当前月薪", kind: "current_salary", required: false, comment: "可选：员工当前月度薪资标准（元）。「季度事假天数」≥5 时必填，用于正向评级封顶", example: "" };
const EXPERT_COL: CsColumn = { key: "expert_advance", label: "专家进阶达成", kind: "expert_advance", required: false, comment: "是/否。满足专家级进阶要求填「是」；留空/「否」则最高评到高级", example: "否" };
const PARTICIPATE_COL: CsColumn = { key: "participate", label: "是否参与评级定薪", kind: "participate", required: false, enum: ["是", "否"], comment: "是/否。默认「是」；填「否」时该员工数据仅用于计算评级单元各项均值与组内日均接待量，不参与排名/定级/定薪", example: "是" };

const COLUMNS: CsColumn[] = buildColumns([
  NAME_COL,
  { key: "dept", label: "部门", kind: "dept", required: true, enum: [TM, DY, JD, PDD], comment: "必填：天猫服务部 / 抖音服务部 / 京东服务部 / 拼多多服务部", example: TM },
  { key: "group", label: "组别", kind: "group", required: true,
    enum: Array.from(new Set(V2_GROUPS.map((g) => g.group as string))),
    comment: "必填：本部门下的组别（须与部门匹配，详见填写说明）", example: "售前服务组（官旗）" },
  // 指标列超集：每人按其组别只填对应的 2 列，每列再分月1/月2/月3 三列；其余留空
  { key: "v_conv", label: "转化率", kind: "indicator", unit: "%", required: false, comment: "正向指标。分别填写月1/月2/月3 的小数（如 0.46 表示 46%）；系统自动×100 后按月计算再取 3 月均值", example: 0.46 },
  { key: "v_sat", label: "客户满意度", kind: "indicator", unit: "%", required: false, comment: "正向指标。分别填写月1/月2/月3 的小数（如 0.96 表示 96%）；系统自动×100 后按月计算再取 3 月均值", example: "" },
  { key: "v_score", label: "客服服务分", kind: "indicator", unit: "分", required: false, comment: "正向指标。分别填写月1/月2/月3 的服务分（如 3.5）；按月计算后取 3 月均值", example: "" },
  { key: "v_resp", label: "响应时间", kind: "indicator", unit: "秒", required: false, comment: "逆向指标（越小越好）。分别填写月1/月2/月3 的响应秒数（如 15）；按月计算后取 3 月均值", example: 15 },
  RECEPTION_COL,
  ATTENDANCE_COL,
  LEAVE_DAYS_COL,
  CURRENT_LEVEL_COL,
  CURRENT_SALARY_COL,
  EXPERT_COL,
  PARTICIPATE_COL,
]);

const COMMON_NOTES: string[] = [
  "评定周期：季度评级定薪，以上季度结果作用于当季度岗位与薪资。",
  "导入数据结构：同一 Sheet 内每个指标与接待量分别按 月1 / 月2 / 月3 三列填写，姓名/部门/组别/季度出勤天数/季度事假天数/当前级别/当前月薪/专家进阶为单值列。",
  "按月计算完成率（正向指标）= 当月个人值 ÷ 当月目标值；（逆向指标）= 2 − 当月个人值 ÷ 当月目标值。目标值默认为当月评级单元均值；组别可参评人数≤3 人时按月确定——当月有数据人数＞3 用当月团队均值，否则用组别中级基准线。",
  "单项指标 120% 封顶：当月单项完成率超过 120% 一律按 120% 计；封顶在月度层面执行后，再取 3 个月平均得季度完成率。",
  "综合完成率（季度）= 指标1 季度完成率×权重1 + 指标2 季度完成率×权重2，用于排名与薪资插值。",
  "排名分位 p=(名次−1)÷人数；名次按季度综合完成率降序，并列时季度接待量均值高者靠前。",
  "确定上限：部门参评比例决定档位，档位+部门内排名分位决定可达级别上限（京东服务部在部门内独立绩效排序）。",
  "匹配级别：中级及以上须 指标 3 月均值达基准线 且 个人日均接待量≥组内日均接待量×90%（日均=季度接待量之和÷季度出勤天数）；专家级另需「专家进阶达成=是」。不满足则逐级下调。",
  "薪资插值：综合完成率 ≥ 80% 时，标准 =（综合完成率−80%）×薪资区间差值 ÷ 40% + 薪资区间低限，结果四舍五入取百；综合完成率 < 80% 时直接取所在组别薪资区间低限。",
  "事假封顶：评级周期内累计事假≥5 天（含后补事假），取消当季度岗位及薪资正向评级资格——评定结果高于现状时按现状（当前级别+当前月薪）执行，低于现状时正常按评定结果执行。",
  "专家进阶要求：未因个人原因致店铺扣分/重大损失，且达成≥3 条（流程优化、SOP/培训、带教、重大客诉处理、客户公开好评）——由 HR 在「专家进阶达成」列判定。",
  "指标取值口径：天猫/抖音/拼多多取自赤兔名品，其他平台取店铺后台；多平台时取接待量占比≥80% 的平台。",
  "是否参与评级定薪：填「否」的员工仅作为单元均值/组内日均接待量的样本参与计算，不计入排名池/参评人数/参评比例，也不产生本身的定级与薪资；留空/「是」为默认参评。",
  "数据口径：导入行均视为转正员工（非整月转正、15 日及之前离职人员请由 HR 在导入前剔除或标记「否」）。",
];

export const CS_CONFIGS: Record<CsPositionKey, CsPositionConfig> = {
  ecomgroup_cs: {
    key: "ecomgroup_cs",
    label: "电商事业群客服接待岗",
    shortLabel: "事业群客服",
    description: "天猫/抖音/京东/拼多多四部门多组别；组内均值算完成率、定基准线，部门内跨组排名定级别上限。",
    color: "#d48806",
    depts: [TM, DY, JD, PDD],
    groups: V2_GROUPS,
    columns: COLUMNS,
    levelNames: LEVEL_NAMES,
    notes: [
      "依据：人力行政中心《关于发布电商事业群客服接待岗位薪资评级方案的通知V2.0》（2026-09-22 签发，自发布之日起生效）。",
      "适用范围：客户运营部客服接待岗（转正）。",
      "V2.0 组织调整：新成立京东服务部（原抖音客服二组-综合组（京东）→ 京东-京东组、原客服一组-综合组（快手）→ 京东-综合组，指标/基准线/薪资区间不变，部门内独立排序）；抖音服务部新增综合组；天猫服务部取消优+服务组、物流速询组；《电商四部客服接待岗位薪资评级方案》废止。",
      "结构：部门（天猫/抖音/京东/拼多多服务部）→ 组别；不同组别考核指标、基准线、薪资区间不同。",
      "完成率均值、基准线、日均接待量门槛以「所在组别」为口径；排名与参评比例以「所在部门」为口径（跨组排名）。",
      "各组指标权重均为 50% / 50%。",
      "组别须与部门匹配——天猫服务部：售前服务组（官旗/综合）、标准服务组、专业服务组；抖音服务部：抖音-售前组、抖音-售后一组、抖音-售后二组、抖音-综合组；京东服务部：京东-综合组、京东-京东组；拼多多服务部：拼多多-售后组、拼多多-售前组、拼多多-综合组。",
      "京东-京东组两个指标=客户满意度+转化率，均为正向，无响应时间。",
      ...COMMON_NOTES,
    ],
  },
};

/** 首页卡片信息（与销售运营岗卡片共用一种展示形态） */
export interface CsCard {
  key: CsPositionKey;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}

export const CS_CARD_LIST: CsCard[] = [CS_CONFIGS.ecomgroup_cs].map((c) => ({
  key: c.key,
  label: c.label,
  shortLabel: c.shortLabel,
  description: c.description,
  color: c.color,
}));

/** 查找某员工对应的评级单元配置 */
export function findGroupConfig(
  cfg: CsPositionConfig,
  dept: string | undefined,
  group: string | undefined,
): CsGroupConfig | undefined {
  return cfg.groups.find((g) => g.dept === dept && g.group === group);
}
