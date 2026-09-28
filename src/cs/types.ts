// 电商事业群客服接待岗——与销售运营岗完全不同的「队列评级」模型。
// 评级依赖：组别/部门均值、部门内排名分位、部门参评比例档位。
// 因此不能复用 calc/compute 的逐人独立计算，单独建模。

export type CsPositionKey = "ecomgroup_cs";

/** 4 个岗位级别（内部统一用英文 key，展示名按岗位不同） */
export type CsLevel = "junior" | "middle" | "senior" | "expert";

export const CS_LEVEL_ORDER: CsLevel[] = ["junior", "middle", "senior", "expert"];

/** 季度评级月份数量（按月导入指标/接待量，3 个月均值作为季度核算值） */
export const MONTH_COUNT = 3;
/** 月度显示标签（用于 Excel 列头与 UI 展示） */
export const MONTH_LABELS: readonly string[] = ["月1", "月2", "月3"];

export type IndicatorDirection = "positive" | "reverse";

/** 一个关键指标的定义：列名、权重、方向、单位 */
export interface CsIndicator {
  /** Excel 列头（也是 CsEmployee.values 的 key） */
  label: string;
  /** 权重（指标1/指标2 加权得到综合完成率），V2.0 各组均为 0.5/0.5 */
  weight: number;
  /** positive：越大越好，完成率=个人值/均值；reverse：越小越好，完成率=2-个人值/均值 */
  direction: IndicatorDirection;
  unit?: string;
}

/** 某一级别的薪资区间与（中级及以上的）基准线 */
export interface CsLevelSpec {
  salLo: number;
  salHi: number;
  /** 指标1 基准线；初级无基准线（undefined） */
  base1?: number;
  /** 指标2 基准线 */
  base2?: number;
}

/** 一个评级单元（部门内某组别） */
export interface CsGroupConfig {
  /** 部门名（天猫服务部/抖音服务部/京东服务部/拼多多服务部） */
  dept?: string;
  /** 组别名 */
  group?: string;
  ind1: CsIndicator;
  ind2: CsIndicator;
  junior: CsLevelSpec;
  middle: CsLevelSpec;
  senior: CsLevelSpec;
  expert: CsLevelSpec;
}

/** 导入列定义（驱动模板生成 + 解析）
 *  - indicator / reception 列：每个逻辑指标会被展开成 3 列（月1/月2/月3），
 *    展开列用 baseLabel 指向逻辑指标名、用 monthIndex 标识月份。
 */
export interface CsColumn {
  key: string;
  label: string;
  kind:
    | "name"
    | "dept"
    | "group"
    | "indicator"
    | "reception"
    | "attendance"
    | "leave_days"
    | "current_level"
    | "current_salary"
    | "expert_advance"
    | "participate";
  unit?: string;
  required: boolean;
  comment: string;
  example?: unknown;
  /** dept/group 列的可选值 */
  enum?: string[];
  /** indicator/reception 月度子列：所属逻辑指标名（与 emp.values 的 key 一致） */
  baseLabel?: string;
  /** indicator/reception 月度子列：所属月份索引（0/1/2） */
  monthIndex?: number;
}

export interface CsPositionConfig {
  key: CsPositionKey;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  /** 部门列表（天猫/抖音/京东/拼多多服务部） */
  depts: string[];
  /** 评级单元列表 */
  groups: CsGroupConfig[];
  /** 导入列 */
  columns: CsColumn[];
  /** 4 级别展示名（初级/中级/高级/专家级销售/产品顾问） */
  levelNames: Record<CsLevel, string>;
  /** 填写说明的通用说明（进阶要求、取值口径等） */
  notes: string[];
}

/** 解析后的一名员工 — 月度结构：values[label] / reception 均为长度 = MONTH_COUNT 的数组 */
export interface CsEmployee {
  name?: string;
  dept?: string;
  group?: string;
  /** 指标列值，key=指标列头, value=3 个月的数值数组（缺月为 undefined） */
  values: Record<string, (number | undefined)[]>;
  /** 3 个月接待量（缺月为 undefined） */
  reception: (number | undefined)[];
  /** 季度出勤天数（日均接待量分母，必填） */
  attendanceDays?: number;
  /** 季度事假天数（≥5 天取消正向评级；留空视为 0） */
  leaveDays?: number;
  /** 当前级别（事假封顶时必填） */
  currentLevel?: CsLevel;
  /** 当前月薪（事假封顶时必填） */
  currentSalary?: number;
  expertAdvance?: boolean;
  /** 是否参与评级定薪：true=参评（默认）；false=数据仅用于单元均值计算，不进入排名/定级/定薪 */
  participate?: boolean;
  __rowIndex: number;
  __parseErrors: string[];
}

/** 单月完成率明细 */
export interface CsMonthlyRate {
  /** 当月个人值 */
  value: number;
  /** 当月目标值（组内当月均值，或组别可参评≤3人且当月人数≤3 时的中级基准线） */
  mean: number;
  /** 目标值口径：mean=当月团队均值；baseline=组别中级基准线 */
  target: "mean" | "baseline";
  /** 当月完成率（已封顶 120%） */
  rate: number;
  /** 当月是否触发了 120% 封顶 */
  capped: boolean;
}

/** 单指标的完成率明细：3 个月明细 + 季度均值（封顶后再均值） */
export interface CsIndicatorDetail {
  label: string;
  direction: IndicatorDirection;
  weight: number;
  /** 长度 = MONTH_COUNT 的月度明细 */
  monthly: CsMonthlyRate[];
  /** 季度完成率 = 3 个月月度完成率（已封顶）的均值 */
  rate: number;
  /** 任一月份触发了 120% 封顶 */
  anyCapped: boolean;
}

export interface CsResult {
  name: string;
  dept?: string;
  group?: string;
  /** 该评级单元（用于显示/分组） */
  unitLabel: string;

  ind1?: CsIndicatorDetail;
  ind2?: CsIndicatorDetail;
  /** 指标1 原始值季度均值（有数据月份算术平均） */
  ind1Avg?: number;
  /** 指标2 原始值季度均值（有数据月份算术平均） */
  ind2Avg?: number;
  /** 综合完成率（加权） */
  combinedRate: number | null;

  /** 个人季度均值接待量（3 个月平均） */
  reception?: number;
  /** 季度接待量之和 */
  receptionTotal?: number;
  /** 季度出勤天数 */
  attendanceDays?: number;
  /** 个人日均接待量 = 季度接待量之和 ÷ 季度出勤天数 */
  dailyReception?: number;
  /** 组内日均接待量 = Σ组内季度接待量 ÷ Σ组内出勤天数 */
  unitDailyReception?: number;
  /** 日均接待量门槛 = 组内日均×90% */
  receptionThreshold?: number;
  /** 是否满足日均接待量门槛 */
  receptionOk?: boolean;
  /** 长度 = MONTH_COUNT 的月度接待量原始值（缺月为 undefined，仅展示用） */
  receptionMonthly?: (number | undefined)[];

  /** 部门内排名（1=最好） */
  rank?: number;
  /** 排名池规模 */
  poolSize?: number;
  /** 排名分位 p=(rank-1)/N */
  percentile?: number;

  /** 部门参评比例 */
  participationRatio?: number;
  /** 参评比例档位标签 */
  tierLabel?: string;

  /** 排名可达级别上限 */
  ceilingLevel?: CsLevel;
  /** 最终级别（事假封顶后） */
  finalLevel?: CsLevel;
  /** 岗位评定展示名（事假封顶后） */
  grade: string | null;

  /** 季度事假天数 */
  leaveDays?: number;
  /** 当前级别（导入值） */
  currentLevel?: CsLevel;
  /** 当前月薪（导入值） */
  currentSalary?: number;
  /** 事假≥5天且评定结果高于现状 → 已按现状封顶 */
  leaveCapped?: boolean;
  /** 封顶前的评定级别（仅 leaveCapped 时有值，导出对照用） */
  evaluatedLevel?: CsLevel;
  /** 封顶前的评定月薪（仅 leaveCapped 时有值，导出对照用） */
  evaluatedSalary?: number;

  expertAdvance?: boolean;
  /** 是否参与评级定薪（true=参评，false=仅用于单元均值） */
  participate: boolean;
  /** 有效月份数（1~3；3 表示数据完整，可参与完整评级流程） */
  validMonths?: number;

  /** 最终级别对应薪资区间 */
  salaryBand?: { lo: number; hi: number } | null;
  /** 取百前薪资 */
  rawSalary?: number | null;
  /** 月度薪资标准（取百） */
  monthlySalary: number | null;

  trace: string;
  notes: string[];
  errors: string[];
  __rowIndex: number;
}

/** 每个部门的参评/在职人数与参评比例 */
export interface DeptParticipation {
  dept: string;
  /** 实际参评人数（有效行数） */
  participants: number;
  /** 评级周期在职人数（页面输入） */
  headcount: number;
  ratio: number;
  tierLabel: string;
}
