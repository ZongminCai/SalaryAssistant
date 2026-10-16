import * as XLSX from "xlsx";
import type { FieldDef } from "../positions/registry";

/** Sheet2 附加章节：表格（header+rows）或纯文本行（lines） */
export interface TemplateSection {
  title: string;
  header?: string[];
  rows?: unknown[][];
  lines?: string[];
}

/**
 * 模板规格：PositionConfig 结构上满足本接口（旧调用 downloadTemplate(cfg) 不变），
 * 统一入口传 src/positions/unified.ts 派生的 UNIFIED_TEMPLATE_SPEC。
 */
export interface TemplateSpec {
  label: string;
  fields: FieldDef[];
  extraNotes: string[];
  /** 多行示例（每行首格以「示例」开头，解析时自动跳过）；缺省为单行示例 */
  exampleRows?: unknown[][];
  extraSections?: TemplateSection[];
}

function requirementLabel(req: FieldDef["required"]): string {
  if (req === "always") return "必填";
  if (req === "optional") return "可选";
  return `条件必填（${req.when}）`;
}

function exampleValue(f: FieldDef): unknown {
  if (f.example !== undefined) return f.example;
  if (f.type === "boolean") return "否";
  return "";
}

export function buildTemplate(spec: TemplateSpec): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: 员工信息
  const headerRow = spec.fields.map((f) => f.label);
  const exampleRows: unknown[][] =
    spec.exampleRows ??
    (() => {
      const row = spec.fields.map(exampleValue);
      // 把"示例"标记放在第一格，方便解析器识别并跳过
      row[0] = `示例 ↓（删除此行后开始填写） ${row[0] ?? ""}`.trim();
      return [row];
    })();
  const aoa: unknown[][] = [headerRow, ...exampleRows];
  // 留若干空行
  for (let i = 0; i < 20; i++) aoa.push(spec.fields.map(() => ""));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 列宽自适应
  ws["!cols"] = spec.fields.map((f) => ({ wch: Math.max(12, f.label.length * 2 + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, "员工信息");

  // Sheet 2: 填写说明
  const notes: unknown[][] = [
    [`${spec.label} — 导入模板填写说明`],
    [],
    ["岗位说明"],
    ...spec.extraNotes.map((n) => [`· ${n}`]),
  ];
  for (const sec of spec.extraSections ?? []) {
    notes.push([], [sec.title]);
    if (sec.header) notes.push(sec.header);
    if (sec.rows) notes.push(...sec.rows);
    if (sec.lines) notes.push(...sec.lines.map((l) => [l]));
  }
  notes.push(
    [],
    ["字段说明"],
    ["字段名", "是否必填", "类型/可选值", "单位", "说明", "示例"],
    ...spec.fields.map((f) => [
      f.label,
      requirementLabel(f.required),
      f.type === "enum" ? (f.enum ?? []).join(" / ") : f.type,
      f.unit ?? "",
      f.comment,
      String(f.example ?? ""),
    ]),
    [],
    ["通用规则"],
    ["· 业绩单位统一为「万元」。若给的是「元」需先 ÷10000。"],
    ["· 上传时第 1 行表头与示例行（姓名以「示例」开头）会被自动跳过；从示例行之后开始填写真实员工数据。"],
    ["· 若某行缺关键字段或填写不规范，结果表会用红色标出并给出具体原因。"],
  );
  const ws2 = XLSX.utils.aoa_to_sheet(notes);
  ws2["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 50 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "填写说明");

  const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return ab;
}

export function downloadTemplate(spec: TemplateSpec): void {
  const ab = buildTemplate(spec);
  const blob = new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${spec.label}-员工信息导入模板.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
