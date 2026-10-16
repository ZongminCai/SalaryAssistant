// 统一入口配置派生层：所有规则一律从 registry.ts 的 POSITION_CONFIGS 派生，本文件不写业务阈值。
// 统一模板列、字段×岗位矩阵、岗位别名、规则速览、模板 spec 均在此集中定义，供模板/解析/导出/页面共用。

import type { PositionKey } from "../calc/types";
import type { FieldDef } from "./registry";
import { POSITION_CONFIGS, POSITION_LIST } from "./registry";
import type { TemplateSpec } from "../excel/template";

/** 统一模板中「员工岗位」列的表头 */
export const POSITION_COLUMN_LABEL = "员工岗位";

/** 统一入口名称（首页卡片 / 工作台 / 导出文件名） */
export const UNIFIED_ENTRY_LABEL = "销售/运营统一评级";

export const UNIFIED_ENTRY_DESCRIPTION =
  "一份模板兼容全部销售/运营岗位：每行通过「员工岗位」列定岗，按对应岗位规则评级定薪；原 9 个岗位规则均保留，仅合并导入入口。";

/** 统一列头覆盖：perf_personal 在各岗位表头不一（累计/月均、销售额/净销售额），统一为中性名，口径见 Sheet2 */
const UNIFIED_FIELD_OVERRIDES: Partial<Record<string, Pick<FieldDef, "label" | "comment">>> = {
  perf_personal: {
    label: "个人业绩(万元)",
    comment:
      "个人业绩，单位：万元。各岗位口径不同（季度累计/月均、销售额/净销售额），见 Sheet2「个人业绩口径（按岗位）」",
  },
};

/** 统一模板 13 列的固定顺序（key 与 calc 引擎一致；"position" 为新增岗位列） */
const UNIFIED_COLUMN_KEYS = [
  "name",
  "position",
  "level",
  "region",
  "dept",
  "account_type",
  "education",
  "perf_personal",
  "perf_team",
  "span_of_control",
  "per_capita_value",
  "monthly_net_sales",
  "probation",
] as const;

function registryField(key: string): FieldDef {
  for (const cfg of POSITION_LIST) {
    const f = cfg.fields.find((x) => x.key === key);
    if (f) return f;
  }
  throw new Error(`registry 中不存在字段: ${key}`);
}

/** 「员工岗位」列定义（导出/模板/解析共用） */
export const POSITION_FIELD_DEF: FieldDef = {
  key: "position",
  label: POSITION_COLUMN_LABEL,
  type: "string",
  required: "always",
  comment: `必填：${POSITION_LIST.map((c) => c.label).join(" / ")}；也接受简称与常见别名（见 Sheet2 别名表）`,
  example: POSITION_CONFIGS.cross_border_ops.label,
};

/** 统一模板 13 列字段定义（label 用统一表头；类型/枚举/示例沿用 registry） */
export const UNIFIED_FIELDS: FieldDef[] = UNIFIED_COLUMN_KEYS.map((key) => {
  if (key === "position") return POSITION_FIELD_DEF;
  const base = registryField(key);
  const ov = UNIFIED_FIELD_OVERRIDES[key];
  return ov ? { ...base, ...ov } : base;
});

/** 除岗位列外的常见别名（label 与 shortLabel 自动收录，无需在此重复） */
const EXTRA_ALIASES: Record<PositionKey, string[]> = {
  livestream_ops: ["直播运营/主播组长", "直播运营岗", "主播组长岗"],
  video_ops: ["视频运营岗"],
  cross_border_ops: ["跨境", "跨境运营岗"],
  mall_ops: ["商城", "抖音商城运营岗", "快手商城运营岗", "抖音/快手商城运营"],
  product_ops: ["天猫", "拼多多", "天猫拼多多", "天猫/拼多多运营"],
  jd_product_ops: ["京东", "京东运营", "京东产品运营"],
  business_bd: ["商务岗"],
  video_content: ["视频内容岗"],
  livestream_host: ["主播岗"],
};

/** 岗位列取值 → PositionKey：label + shortLabel + 常见别名 */
export const POSITION_ALIASES: Record<string, PositionKey> = (() => {
  const map: Record<string, PositionKey> = {};
  for (const cfg of POSITION_LIST) {
    map[cfg.label] = cfg.key;
    map[cfg.shortLabel] = cfg.key;
    for (const a of EXTRA_ALIASES[cfg.key]) map[a] = cfg.key;
  }
  return map;
})();

export function aliasesOf(key: PositionKey): string[] {
  return Object.entries(POSITION_ALIASES)
    .filter(([, k]) => k === key)
    .map(([s]) => s);
}

export type ResolveResult = { key: PositionKey } | { error: string };

/** 归一化仅 trim；未知值报错并列出全部合法 label */
export function resolvePosition(raw: unknown): ResolveResult {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { error: `缺少「${POSITION_COLUMN_LABEL}」` };
  }
  const s = String(raw).trim();
  const key = POSITION_ALIASES[s];
  if (key) return { key };
  return {
    error: `无法识别的「${POSITION_COLUMN_LABEL}」: ${JSON.stringify(raw)}（可选: ${POSITION_LIST.map((c) => c.label).join(" / ")}）`,
  };
}

function requirementText(f: FieldDef): string {
  if (f.required === "always") return "必填";
  if (f.required === "optional") return "可选";
  return `条件必填(${f.required.when})`;
}

/** 字段 × 岗位 适用矩阵（Sheet2 与规则速览共用） */
export const FIELD_POSITION_MATRIX: { field: FieldDef; cells: Record<PositionKey, string> }[] =
  UNIFIED_FIELDS.map((field) => {
    const cells = {} as Record<PositionKey, string>;
    for (const cfg of POSITION_LIST) {
      if (field.key === "position") {
        cells[cfg.key] = "必填";
        continue;
      }
      const pf = cfg.fields.find((f) => f.key === field.key);
      cells[cfg.key] = pf ? requirementText(pf) : "—";
    }
    return { field, cells };
  });

/** 个人业绩口径（按岗位），取自各岗位原字段表头+说明 */
export const PERF_CALIBER_BY_POSITION: { key: PositionKey; label: string; caliber: string }[] =
  POSITION_LIST.map((cfg) => {
    const f = cfg.fields.find((x) => x.key === "perf_personal");
    return { key: cfg.key, label: cfg.label, caliber: f ? `${f.label} —— ${f.comment}` : "—" };
  });

export interface PositionRuleSummary {
  key: PositionKey;
  label: string;
  description: string;
  extraNotes: string[];
  requiredFields: string;
  conditionalFields: string;
}

/** 工作台「各岗位规则速览」数据 */
export const PER_POSITION_RULES: PositionRuleSummary[] = POSITION_LIST.map((cfg) => ({
  key: cfg.key,
  label: cfg.label,
  description: cfg.description,
  extraNotes: cfg.extraNotes,
  requiredFields: cfg.fields
    .filter((f) => f.required === "always")
    .map((f) => f.label)
    .join("、"),
  conditionalFields:
    cfg.fields
      .filter((f) => typeof f.required === "object")
      .map((f) => `${f.label}（${(f.required as { when: string }).when}）`)
      .join("；") || "无",
}));

/**
 * 行级必填豁免：registry 注释明确「管培生/助理可留空」的字段，
 * 在职级命中时允许留空（与 compute 的 eduOrAssistant 短路口径一致）。
 */
export function isRequiredExempt(fieldKey: string, level: string | undefined): boolean {
  return fieldKey === "perf_personal" && (level === "管培生" || level === "助理");
}

/** 9 行分岗位示例（姓名以「示例」开头，解析时自动跳过） */
const EXAMPLE_VALUES: Record<PositionKey, Record<string, unknown>> = {
  livestream_ops: { level: "直播运营专员", perf_personal: 150, per_capita_value: 30 },
  video_ops: { level: "视频运营专员", perf_personal: 250, per_capita_value: 50 },
  cross_border_ops: { region: "西安", level: "专员", perf_personal: 320, probation: "否" },
  mall_ops: { level: "专员", perf_personal: 600 },
  product_ops: { dept: "其他部门", level: "专员", perf_personal: 300, probation: "否" },
  jd_product_ops: { level: "专员", perf_personal: 300, probation: "否" },
  business_bd: { level: "专员", perf_personal: 250 },
  video_content: { perf_personal: 500 },
  livestream_host: { account_type: "官旗", perf_personal: 350, monthly_net_sales: 55 },
};

function buildExampleRows(): unknown[][] {
  return POSITION_LIST.map((cfg) => {
    const values = EXAMPLE_VALUES[cfg.key];
    return UNIFIED_FIELDS.map((f) => {
      if (f.key === "name") return `示例↓${cfg.label}`;
      if (f.key === "position") return cfg.label;
      return values[f.key] ?? "";
    });
  });
}

export const UNIFIED_EXTRA_NOTES: string[] = [
  "本模板兼容全部 9 个销售/运营岗位；每行通过「员工岗位」列定岗，按该岗位规则评级定薪。",
  "「个人业绩(万元)」各岗位口径不同（季度累计/月均、销售额/净销售额），填写前先看下方「个人业绩口径（按岗位）」。",
  "与本人岗位无关的列留空即可；但本岗位必填列留空会在上传时按行报错。",
  "上传时第 1 行表头与示例行（姓名以「示例」开头）会被自动跳过。",
];

/** 统一模板 spec：Sheet1 = 13 列 + 9 示例行；Sheet2 = 说明 + 矩阵 + 口径 + 别名表 */
export const UNIFIED_TEMPLATE_SPEC: TemplateSpec = {
  label: UNIFIED_ENTRY_LABEL,
  fields: UNIFIED_FIELDS,
  extraNotes: UNIFIED_EXTRA_NOTES,
  exampleRows: buildExampleRows(),
  extraSections: [
    {
      title: "字段 × 岗位 适用矩阵",
      header: ["字段", ...POSITION_LIST.map((c) => c.shortLabel)],
      rows: FIELD_POSITION_MATRIX.map((m) => [
        m.field.label,
        ...POSITION_LIST.map((c) => m.cells[c.key]),
      ]),
    },
    {
      title: "个人业绩口径（按岗位）",
      lines: PERF_CALIBER_BY_POSITION.map((p) => `· ${p.label}：${p.caliber}`),
    },
    {
      title: "员工岗位 别名表",
      header: ["岗位（标准值）", "也可填写"],
      rows: POSITION_LIST.map((c) => [
        c.label,
        aliasesOf(c.key)
          .filter((s) => s !== c.label)
          .join("、"),
      ]),
    },
  ],
};
