import type { PositionKey } from "../calc/types";

export type FieldType = "string" | "number" | "boolean" | "enum";

export interface FieldDef {
  /** JSON 键（与 calc 引擎一致），如 perf_personal */
  key: string;
  /** Excel 列头中文名 */
  label: string;
  type: FieldType;
  /** 是否必填：always=始终必填；optional=不必填；when=条件必填（提示文本） */
  required: "always" | "optional" | { when: string };
  enum?: string[];
  unit?: string;
  /** 模板填写说明 */
  comment: string;
  /** 示例值 */
  example?: unknown;
}

export interface PositionConfig {
  key: PositionKey;
  label: string;
  shortLabel: string;
  description: string;
  /** AntD 图标颜色（首页卡片） */
  color: string;
  fields: FieldDef[];
  /** 额外的"填写说明"提示（Sheet 2 顶部） */
  extraNotes: string[];
}

const NAME_FIELD: FieldDef = {
  key: "name", label: "姓名", type: "string", required: "always",
  comment: "员工姓名（必填）", example: "张三",
};

const PERF_PERSONAL = (label: string, comment: string, example: number): FieldDef => ({
  key: "perf_personal", label, type: "number", required: "always",
  unit: "万元", comment, example,
});

const PROBATION_FIELD: FieldDef = {
  key: "probation", label: "是否试用期", type: "boolean", required: "optional",
  comment: "试用期填 是；正式期留空或填 否。试用期按转正后标准×80%取百。",
  example: "否",
};

const EDU_VALUES = ["普通本科", "211/985本科", "普通硕士", "211/985硕士"];

export const POSITION_CONFIGS: Record<PositionKey, PositionConfig> = {
  video_content: {
    key: "video_content",
    label: "视频内容岗",
    shortLabel: "视频内容",
    description: "按季度累计实际成交金额评级。区间插值，专家档位 18000 元固定。",
    color: "#fa541c",
    fields: [
      NAME_FIELD,
      PERF_PERSONAL("个人季度业绩(万元)", "季度累计实际成交金额，单位：万元", 500),
    ],
    extraNotes: [
      "依据：品牌〔2025〕2号《视频内容岗薪资评级方案》",
      "业绩 < 10 万：不在评级区间，需谈薪/人工处理",
      "≥ 600 万：专家视频内容专员，固定 18000 元（不参与四舍五入取百）",
    ],
  },

  cross_border_ops: {
    key: "cross_border_ops",
    label: "跨境运营岗",
    shortLabel: "跨境运营",
    description: "西安/深圳两套区间；组长在管理幅度≥4人时叠加管理薪资；管培生按学历定薪。",
    color: "#1677ff",
    fields: [
      NAME_FIELD,
      { key: "region", label: "地域", type: "enum", required: "always", enum: ["西安", "深圳"],
        comment: "必填：西安 或 深圳，两地薪资区间不同", example: "西安" },
      { key: "level", label: "职级", type: "enum", required: "always",
        enum: ["专员", "组长", "管培生", "助理"],
        comment: "必填：专员/组长/管培生/助理；组长须同时填团队业绩和管理幅度", example: "专员" },
      PERF_PERSONAL("个人季度业绩(万元)", "个人季度月均销售额，单位：万元。管培生/助理可留空", 320),
      { key: "perf_team", label: "团队季度月均销售额(万元)", type: "number",
        required: { when: "职级=组长 时必填" }, unit: "万元",
        comment: "仅组长填写：团队季度月均销售额，单位：万元", example: 1600 },
      { key: "span_of_control", label: "管理幅度(人数)", type: "number",
        required: { when: "职级=组长 时必填" },
        comment: "仅组长填写：所辖人数；< 4 人不享有管理薪资", example: 6 },
      { key: "education", label: "学历", type: "enum",
        required: { when: "职级=管培生 时必填" }, enum: EDU_VALUES,
        comment: "仅管培生填写：普通本科/211/985本科/普通硕士/211/985硕士",
        example: "211/985硕士" },
      PROBATION_FIELD,
    ],
    extraNotes: [
      "依据：总裁办〔2025〕46号",
      "组长管理薪资门槛：管理幅度 ≥ 4 人才叠加；不足只发个人部分",
      "管培生按学历定薪：本科 6000/7000，硕士 8000/9000",
      "助理：谈薪制，系统不评定",
      "试用期：转正后标准 × 80%（取百）",
    ],
  },

  business_bd: {
    key: "business_bd",
    label: "商务岗",
    shortLabel: "商务",
    description: "专员/主管两套区间；专家档位 18000/18900 元固定。",
    color: "#52c41a",
    fields: [
      NAME_FIELD,
      { key: "level", label: "职级", type: "enum", required: "always",
        enum: ["专员", "主管"],
        comment: "必填：专员 或 主管，区间略有差异", example: "专员" },
      PERF_PERSONAL("个人季度业绩(万元)", "季度月均销售额，单位：万元", 250),
    ],
    extraNotes: [
      "依据：总裁办〔2025〕43号",
      "业绩 < 10 万：不在评级区间，需谈薪/人工处理",
    ],
  },

  mall_ops: {
    key: "mall_ops",
    label: "抖音/快手商城运营岗",
    shortLabel: "商城运营",
    description: "个人评级；组长在管理幅度≥5人时叠加管理薪资；专家档位 45000 元固定。",
    color: "#722ed1",
    fields: [
      NAME_FIELD,
      { key: "level", label: "职级", type: "enum", required: "always",
        enum: ["专员", "组长"],
        comment: "必填：专员 或 组长", example: "专员" },
      PERF_PERSONAL("个人季度业绩(万元)", "个人季度月均销售额，单位：万元", 600),
      { key: "perf_team", label: "团队季度月均销售额(万元)", type: "number",
        required: { when: "职级=组长 时必填" }, unit: "万元",
        comment: "仅组长填写", example: 1200 },
      { key: "span_of_control", label: "管理幅度(人数)", type: "number",
        required: { when: "职级=组长 时必填" },
        comment: "仅组长填写；< 5 人不享有管理薪资", example: 5 },
    ],
    extraNotes: [
      "依据：总裁办〔2026〕3号",
      "组长管理薪资门槛：管理幅度 ≥ 5 人（与跨境岗的 4 人不同）",
      "业绩 < 20 万：不在评级区间，需谈薪/人工处理",
    ],
  },

  livestream_host: {
    key: "livestream_host",
    label: "主播岗",
    shortLabel: "主播",
    description: "官旗/其他账号阈值不同；季度评级 + 月度激励两套并行结果。",
    color: "#eb2f96",
    fields: [
      NAME_FIELD,
      { key: "account_type", label: "账号类型", type: "enum", required: "always",
        enum: ["官旗", "其他"],
        comment: "必填：官旗 或 其他；做季度评级时必填", example: "官旗" },
      { key: "perf_personal", label: "季度累计净销售额(万元)", type: "number",
        required: { when: "做季度评级时必填（可与月度激励并存）" }, unit: "万元",
        comment: "季度评级用；只算月度激励可留空", example: 350 },
      { key: "monthly_net_sales", label: "月度净销售额(万元)", type: "number",
        required: { when: "做月度激励时必填" }, unit: "万元",
        comment: "月度激励用；只做季度评级可留空", example: 55 },
    ],
    extraNotes: [
      "依据：总裁办〔2026〕4号",
      "季度评级与月度激励是并行两套结果，可只做其一",
      "专家主播固定 20000 元（不取百）；其他评级取百",
      "月度激励 = 月度净销售额(元) × 区间费率（与账号类型无关）",
    ],
  },

  product_ops: {
    key: "product_ops",
    label: "天猫/拼多多运营岗",
    shortLabel: "天猫拼多多",
    description: "电商三部/其他部门两套区间；高级/中级按比例；区间左开右闭。",
    color: "#13c2c2",
    fields: [
      NAME_FIELD,
      { key: "dept", label: "部门", type: "enum", required: "always",
        enum: ["电商三部", "其他部门"],
        comment: "必填：电商三部 或 其他部门，阈值不同", example: "其他部门" },
      { key: "level", label: "职级", type: "enum", required: "always",
        enum: ["专员", "管培生", "助理"],
        comment: "必填：专员/管培生/助理", example: "专员" },
      PERF_PERSONAL("个人季度业绩(万元)", "季度月均销售额，单位：万元。管培生/助理可留空", 300),
      { key: "education", label: "学历", type: "enum",
        required: { when: "职级=管培生 时必填" }, enum: EDU_VALUES,
        comment: "仅管培生填写", example: "普通本科" },
      PROBATION_FIELD,
    ],
    extraNotes: [
      "依据：总裁办〔2025〕23号 V2.0",
      "区间为 左开右闭 (低, 高]，边界值归属可能与直觉不同",
      "高级 = 销售额(元) × 0.6%；中级 = 销售额(元) × 0.5%",
      "专家固定 88888 元（不取百）；试用期 × 80%（取百）",
      "助理：谈薪制，系统不评定",
    ],
  },

  livestream_ops: {
    key: "livestream_ops",
    label: "直播运营/主播组长岗",
    shortLabel: "直播运营",
    description: "个人薪资按季度月均净销售额评定；填了人均净产值再叠加管理薪资；官旗账号 ×80% 折算。",
    color: "#ff7a45",
    fields: [
      NAME_FIELD,
      { key: "level", label: "职级", type: "enum", required: "always",
        enum: ["直播运营", "主播组长"],
        comment: "必填：直播运营 或 主播组长（两者共用同一评级表）", example: "直播运营" },
      { key: "account_type", label: "账号类型", type: "enum", required: "always",
        enum: ["抖音官旗", "非官旗"],
        comment: "必填：抖音官旗 / 非官旗；官旗会自动 ×0.8 折算后再做区间匹配",
        example: "非官旗" },
      { key: "perf_personal", label: "季度月均净销售额(万元)", type: "number",
        required: "always", unit: "万元",
        comment: "个人季度月均净销售额，单位：万元。填原始值（官旗折算由系统完成）", example: 150 },
      { key: "per_capita_value", label: "人均净产值(万元)", type: "number",
        required: { when: "对人均净产值负责才需填" }, unit: "万元",
        comment: "可选：填了就叠加管理薪资（不区分职级）；不对人均净产值负责的人员可留空",
        example: 30 },
    ],
    extraNotes: [
      "依据：总裁办〔2026〕9号",
      "薪资 = 个人薪资 + 管理薪资 两部分叠加后四舍五入取百",
      "个人薪资按 季度月均净销售额 匹配；专家档 (≥500万) 固定 35000 元",
      "管理薪资按 人均净产值 匹配（不区分职级），≥50 万固定 4000 元",
      "抖音官旗账号：系统会把季度月均净销售额 ×0.8 后再做区间匹配（用户填原始值）",
      "管理薪资字段为可选；填了就评，未填代表无需对人均净产值负责",
      "人均净产值 < 3 万：管理薪资=0，主薪资照发",
      "主播组长「个人上播净销售额 × 1%」月度激励 不在本系统计算，请线下手算",
    ],
  },

  video_ops: {
    key: "video_ops",
    label: "视频运营岗",
    shortLabel: "视频运营",
    description: "个人薪资按季度月均净销售额评定；填了人均净产值再叠加管理薪资；官旗账号 ×80% 折算。",
    color: "#9254de",
    fields: [
      NAME_FIELD,
      { key: "account_type", label: "账号类型", type: "enum", required: "always",
        enum: ["抖音官旗", "非官旗"],
        comment: "必填：抖音官旗 / 非官旗；官旗会自动 ×0.8 折算后再做区间匹配",
        example: "非官旗" },
      { key: "perf_personal", label: "季度月均净销售额(万元)", type: "number",
        required: "always", unit: "万元",
        comment: "个人季度月均净销售额，单位：万元。填原始值（官旗折算由系统完成）", example: 250 },
      { key: "per_capita_value", label: "人均净产值(万元)", type: "number",
        required: { when: "对人均净产值负责才需填" }, unit: "万元",
        comment: "可选：填了就叠加管理薪资（不区分职级）；不对人均净产值负责的人员可留空",
        example: 50 },
    ],
    extraNotes: [
      "依据：总裁办〔2026〕9号",
      "薪资 = 个人薪资 + 管理薪资 两部分叠加后四舍五入取百",
      "个人薪资按 季度月均净销售额 匹配；专家档 (≥500万) 固定 35000 元",
      "管理薪资按 人均净产值 匹配（不区分职级），≥100 万固定 4000 元",
      "抖音官旗账号：系统会把季度月均净销售额 ×0.8 后再做区间匹配（用户填原始值）",
      "管理薪资字段为可选；填了就评，未填代表无需对人均净产值负责",
      "人均净产值 < 10 万：管理薪资=0，主薪资照发",
    ],
  },
};

export const POSITION_LIST: PositionConfig[] = [
  POSITION_CONFIGS.livestream_ops,
  POSITION_CONFIGS.video_ops,
  POSITION_CONFIGS.cross_border_ops,
  POSITION_CONFIGS.mall_ops,
  POSITION_CONFIGS.product_ops,
  POSITION_CONFIGS.business_bd,
  POSITION_CONFIGS.video_content,
  POSITION_CONFIGS.livestream_host,
];
