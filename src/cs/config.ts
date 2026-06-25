import type {
  CsColumn,
  CsGroupConfig,
  CsIndicator,
  CsLevel,
  CsLevelSpec,
  CsPositionConfig,
  CsPositionKey,
} from "./types";
import { MONTH_COUNT, MONTH_LABELS } from "./types";

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
 * 两套方案的档位与分位完全一致（已核对两份 PDF）。
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

// ====== 电商四部客服接待岗（单一评级单元） ======
const ECOM4_GROUP: CsGroupConfig = {
  ind1: sat(0.4),
  ind2: conv(0.6),
  junior: lvl(3400, 4200),
  middle: lvl(4200, 4600, 95, 55),
  senior: lvl(4600, 5000, 97, 58),
  expert: lvl(5000, 5500, 99, 62),
};

// ====== 吉林分部客服接待岗（部门 → 组别） ======
const TM = "天猫";
const DY = "抖音";
const PDD = "拼多多";

const JILIN_GROUPS: CsGroupConfig[] = [
  // ---- 天猫服务部 ----
  { dept: TM, group: "售前服务组（官旗）", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 44, 18), senior: lvl(4300, 4500, 48, 16), expert: lvl(4500, 5000, 54, 14) },
  { dept: TM, group: "售前服务组（综合）", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 41, 18), senior: lvl(4300, 4500, 45, 16), expert: lvl(4500, 5000, 52, 14) },
  { dept: TM, group: "物流速询组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 95, 18), senior: lvl(4300, 4500, 97, 16), expert: lvl(4500, 5000, 99, 14) },
  { dept: TM, group: "标准服务组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3200, 4000), middle: lvl(4000, 4500, 95, 18), senior: lvl(4500, 5000, 97, 16), expert: lvl(5000, 5500, 99, 14) },
  { dept: TM, group: "专业服务组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3800, 4300), middle: lvl(4300, 4500, 95, 20), senior: lvl(4500, 5000, 97, 18), expert: lvl(5000, 5500, 99, 16) },
  { dept: TM, group: "优+服务组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3800, 4300), middle: lvl(4300, 4500, 95, 20), senior: lvl(4500, 5000, 97, 18), expert: lvl(5000, 5500, 99, 16) },

  // ---- 抖音服务部 ----
  { dept: DY, group: "客服一组-售前组", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 46, 15), senior: lvl(4500, 5000, 50, 12), expert: lvl(5000, 5500, 54, 10) },
  { dept: DY, group: "客服一组-售后组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 15), senior: lvl(4500, 5000, 95, 12), expert: lvl(5000, 5500, 99, 10) },
  { dept: DY, group: "客服二组-售后组", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 15), senior: lvl(4500, 5000, 95, 12), expert: lvl(5000, 5500, 99, 10) },
  { dept: DY, group: "客服一组-综合组（快手）", ind1: sat(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 90, 18), senior: lvl(4500, 5000, 95, 15), expert: lvl(5000, 5500, 99, 12) },
  // 京东组：两个指标都是正向（无响应时间）
  { dept: DY, group: "客服二组-综合组（京东）", ind1: sat(0.5), ind2: conv(0.5),
    junior: lvl(3800, 4300), middle: lvl(4300, 4500, 90, 35), senior: lvl(4500, 5000, 95, 38), expert: lvl(5000, 5500, 99, 42) },

  // ---- 拼多多服务部 ----
  { dept: PDD, group: "客服二组（售后）", ind1: score(0.5), ind2: resp(0.5),
    junior: lvl(3000, 3800), middle: lvl(3800, 4300, 3, 18), senior: lvl(4300, 4500, 3.4, 15), expert: lvl(4500, 5000, 3.8, 12) },
  { dept: PDD, group: "客服一组-售前组", ind1: conv(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 32, 12), senior: lvl(4500, 5000, 36, 10), expert: lvl(5000, 5500, 42, 8) },
  { dept: PDD, group: "客服一组-综合组（售前+售后）", ind1: score(0.5), ind2: resp(0.5),
    junior: lvl(3000, 4000), middle: lvl(4000, 4500, 3, 24), senior: lvl(4500, 5000, 3.5, 20), expert: lvl(5000, 5500, 4, 16) },
];

// 吉林：各部门 → 组别名列表（用于 模板/校验 的下拉与配对校验）
export const JILIN_DEPT_GROUPS: Record<string, string[]> = {
  [TM]: JILIN_GROUPS.filter((g) => g.dept === TM).map((g) => g.group as string),
  [DY]: JILIN_GROUPS.filter((g) => g.dept === DY).map((g) => g.group as string),
  [PDD]: JILIN_GROUPS.filter((g) => g.dept === PDD).map((g) => g.group as string),
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

// ---- 导入列 ----
const NAME_COL: CsColumn = { key: "name", label: "姓名", kind: "name", required: true, comment: "员工姓名（必填）", example: "张三" };
const RECEPTION_COL: CsColumn = { key: "reception", label: "接待量", kind: "reception", required: true, comment: "分别填写月１/月２/月３ 的接待量（必填）。系统按 3 个月均值参与门槛与并列排名（中级及以上需 ≥ 单元季度均值×80%）", example: 1200 };
const EXPERT_COL: CsColumn = { key: "expert_advance", label: "专家进阶达成", kind: "expert_advance", required: false, comment: "是/否。满足专家级进阶要求填「是」；留空/「否」则最高评到高级", example: "否" };
const PARTICIPATE_COL: CsColumn = { key: "participate", label: "是否参与评级定薪", kind: "participate", required: false, enum: ["是", "否"], comment: "是/否。默认「是」；填「否」时该员工数据仅用于计算评级单元各项均值，不参与排名/定级/定薪", example: "是" };

const ECOM4_COLUMNS: CsColumn[] = buildColumns([
  NAME_COL,
  { key: "v_sat", label: "客户满意度", kind: "indicator", unit: "%", required: true, comment: "指标1（权重40%）。分别填写月１/月２/月３ 的百分数数值，如 96 表示 96%；按月计算完成率（≤120% 封顶）后取 3 月均值", example: 96 },
  { key: "v_conv", label: "转化率", kind: "indicator", unit: "%", required: true, comment: "指标2（权重60%）。分别填写月１/月２/月３ 的百分数数值，如 56 表示 56%；按月计算完成率（≤120% 封顶）后取 3 月均值", example: 56 },
  RECEPTION_COL,
  EXPERT_COL,
  PARTICIPATE_COL,
]);

const JILIN_COLUMNS: CsColumn[] = buildColumns([
  NAME_COL,
  { key: "dept", label: "部门", kind: "dept", required: true, enum: [TM, DY, PDD], comment: "必填：天猫 / 抖音 / 拼多多", example: TM },
  { key: "group", label: "组别", kind: "group", required: true,
    enum: Array.from(new Set(JILIN_GROUPS.map((g) => g.group as string))),
    comment: "必填：本部门下的组别（须与部门匹配，详见填写说明）", example: "售前服务组（官旗）" },
  // 指标列超集：每人按其组别只填对应的 2 列，每列再分月1/月2/月3 三列；其余留空
  { key: "v_conv", label: "转化率", kind: "indicator", unit: "%", required: false, comment: "正向指标。分别填写月1/月2/月3 的百分数数值（如 46 表示 46%）；按月计算后取 3 月均值", example: 46 },
  { key: "v_sat", label: "客户满意度", kind: "indicator", unit: "%", required: false, comment: "正向指标。分别填写月1/月2/月3 的百分数数值（如 96 表示 96%）；按月计算后取 3 月均值", example: "" },
  { key: "v_score", label: "客服服务分", kind: "indicator", unit: "分", required: false, comment: "正向指标。分别填写月1/月2/月3 的服务分（如 3.5）；按月计算后取 3 月均值", example: "" },
  { key: "v_resp", label: "响应时间", kind: "indicator", unit: "秒", required: false, comment: "逆向指标（越小越好）。分别填写月1/月2/月3 的响应秒数（如 15）；按月计算后取 3 月均值", example: 15 },
  RECEPTION_COL,
  EXPERT_COL,
  PARTICIPATE_COL,
]);

const ECOM4_LEVELS: Record<CsLevel, string> = {
  junior: "初级客服",
  middle: "中级客服",
  senior: "高级客服",
  expert: "专家级客服",
};

const JILIN_LEVELS: Record<CsLevel, string> = {
  junior: "初级销售/产品顾问",
  middle: "中级销售/产品顾问",
  senior: "高级销售/产品顾问",
  expert: "专家级销售/产品顾问",
};

const COMMON_NOTES: string[] = [
  "评定周期：季度评级定薪，以上季度结果作用于当季度岗位与薪资。",
  "导入数据结构：同一 Sheet 内每个指标与接待量分别按 月1 / 月2 / 月3 三列填写，姓名/部门/组别/专家进阶仍为单值。",
  "按月计算完成率（正向指标）= 当月个人值 ÷ 当月评级单元均值；（逆向指标）= 2 − 当月个人值 ÷ 当月评级单元均值。",
  "单项指标 120% 封顶：当月单项完成率超过 120% 一律按 120% 计；封顶在月度层面执行后，再取 3 个月平均得季度完成率。",
  "综合完成率（季度）= 指标1 季度完成率×权重1 + 指标2 季度完成率×权重2，用于排名与薪资插值。",
  "排名分位 p=(名次−1)÷人数；名次按季度综合完成率降序，并列时季度接待量均值高者靠前。",
  "确定上限：参评比例决定档位，档位+排名分位决定可达级别上限。",
  "匹配级别：中级及以上须 指标 3 月均值达基准线 且 接待量季度均值≥单元季度均值×80%；专家级另需「专家进阶达成=是」。不满足则逐级下调。",
  "薪资插值：综合完成率 ≥ 80% 时，标准 =（综合完成率−80%）×薪资区间差值 ÷ 40% + 薪资区间低限，结果四舍五入取百；综合完成率 < 80% 时直接取所在组别薪资区间低限。",
  "专家进阶要求：未因个人原因致店铺扣分/重大损失，且达成≥3 条（流程优化、SOP/培训、带教、重大客诉处理、客户公开好评）——由 HR 在「专家进阶达成」列判定。",
  "指标取值口径：天猫/抖音/拼多多取自赤兔名品，其他平台取店铺后台；多平台时取接待量占比≥80% 的平台。",
  "是否参与评级定薪：填「否」的员工仅作为单元均值的样本参与计算，不计入排名池/参评人数/参评比例，也不产生本身的定级与薪资；留空/「是」为默认参评。",
];

export const CS_CONFIGS: Record<CsPositionKey, CsPositionConfig> = {
  ecom4_cs: {
    key: "ecom4_cs",
    label: "电商四部客服接待岗",
    shortLabel: "四部客服",
    description: "队列评级：部门均值算完成率，部门内排名分位定级别上限，基准线/接待量/专家进阶逐级匹配。",
    color: "#08979c",
    hasDeptGroup: false,
    depts: ["电商四部"],
    groups: [ECOM4_GROUP],
    columns: ECOM4_COLUMNS,
    levelNames: ECOM4_LEVELS,
    notes: [
      "依据：人力行政中心《关于发布电商四部客服接待岗位薪资评级方案的通知》(260525)",
      "适用范围：电商四部转正客服接待岗。",
      "指标1=客户满意度（40%），指标2=转化率（60%），均为正向指标。",
      "完成率均值、接待量门槛、排名均以「整个部门」为口径（无分组）。",
      "本方案自 2026 年 5 月 1 日起生效（数据取值：2026 年 1-3 月），月度提成同步取消。",
      ...COMMON_NOTES,
    ],
  },
  jilin_cs: {
    key: "jilin_cs",
    label: "吉林分部客服接待岗",
    shortLabel: "吉林客服",
    description: "天猫/抖音/拼多多三部门多组别；组内均值算完成率、定基准线，部门内跨组排名定级别上限。",
    color: "#d48806",
    hasDeptGroup: true,
    depts: [TM, DY, PDD],
    groups: JILIN_GROUPS,
    columns: JILIN_COLUMNS,
    levelNames: JILIN_LEVELS,
    notes: [
      "依据：人力行政中心《关于发布吉林分部客服接待岗位薪资评级方案的通知》(260525)",
      "适用范围：吉林分部转正客服接待岗。",
      "结构：部门（天猫/抖音/拼多多）→ 组别；不同组别考核指标、基准线、薪资区间不同。",
      "完成率均值、接待量门槛以「所在组别」为口径；排名与参评比例以「所在部门」为口径（跨组排名）。",
      "各组指标权重均为 50% / 50%。",
      "组别须与部门匹配——天猫：售前服务组（官旗/综合）、物流速询组、标准/专业/优+服务组；抖音：客服一组-售前组、客服一组-售后组、客服二组-售后组、客服一组-综合组（快手）、客服二组-综合组（京东）；拼多多：客服二组（售后）、客服一组-售前组、客服一组-综合组（售前+售后）。",
      "京东组（客服二组-综合组）两个指标=客户满意度+转化率，均为正向，无响应时间。",
      "本方案自 2026 年 5 月 1 日起生效（数据取值：2026 年 1-3 月），月度提成同步取消。",
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

export const CS_CARD_LIST: CsCard[] = [CS_CONFIGS.ecom4_cs, CS_CONFIGS.jilin_cs].map((c) => ({
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
  if (!cfg.hasDeptGroup) return cfg.groups[0];
  return cfg.groups.find((g) => g.dept === dept && g.group === group);
}
