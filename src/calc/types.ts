export type PositionKey =
  | "video_content"
  | "cross_border_ops"
  | "business_bd"
  | "mall_ops"
  | "livestream_host"
  | "product_ops";

export interface Employee {
  name?: string;
  position?: PositionKey;
  level?: string;
  region?: string;
  dept?: string;
  account_type?: string;
  education?: string;
  perf_personal?: number;
  perf_team?: number;
  span_of_control?: number;
  monthly_net_sales?: number;
  probation?: boolean;
  /** 表格里的行号（从 1 开始），用于错误定位 */
  __rowIndex?: number;
  /** 解析期已经发现的错误，会与计算期错误合并 */
  __parseErrors?: string[];
}

export interface Bracket {
  lo: number | null;
  hi: number | null;
  lo_inc?: boolean;
  hi_inc?: boolean;
  formula?: "interp" | "fixed" | "pct";
  fixed?: number;
  rate?: number;
  sal_lo?: number;
  sal_hi?: number;
  grade?: string;
}

export interface PositionResult {
  name: string;
  position?: PositionKey;
  position_label: string;
  level?: string;
  region?: string;
  dept?: string;
  account_type?: string;
  perf_personal?: number;
  perf_team?: number;
  span_of_control?: number;
  monthly_net_sales?: number;
  probation?: boolean;
  grade: string | null;
  monthly_salary: number | null;
  std_salary?: number | null;
  incentive: number | null;
  incentive_rate?: number;
  trace: string;
  notes: string[];
  errors: string[];
  __rowIndex?: number;
  /** perf_personal / 3，仅用于展示；缺 perf_personal 时为 null */
  monthly_perf?: number | null;
  /** 命中的业绩核算区间（评级 bracket） */
  perf_bracket?: {
    lo: number | null;
    hi: number | null;
    lo_inc: boolean;
    hi_inc: boolean;
  } | null;
  /** 仅 interp 公式才有薪资区间；fixed/pct/管培生 = null */
  salary_bracket?: { sal_lo: number; sal_hi: number } | null;
  /** 计算薪资具体值，未做 round100；组长 = 个人原值 + 管理原值 */
  raw_salary?: number | null;
}
