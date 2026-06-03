import * as XLSX from "xlsx";
import type { FieldDef, PositionConfig } from "../positions/registry";

function requirementLabel(req: FieldDef["required"]): string {
  if (req === "always") return "必填";
  if (req === "optional") return "可选";
  return `条件必填（${req.when}）`;
}

function exampleValue(f: FieldDef): unknown {
  if (f.example !== undefined) return f.example;
  if (f.type === "boolean") return "否";
  if (f.type === "number") return "";
  return "";
}

export function buildTemplate(cfg: PositionConfig): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: 员工信息
  const headerRow = cfg.fields.map((f) => f.label);
  const exampleRow = cfg.fields.map(exampleValue);
  const labelCell = "示例 ↓（删除此行后开始填写）";
  // 把"示例"标记放在第二行第一格，方便解析器识别并跳过
  exampleRow[0] = `${labelCell} ${exampleRow[0] ?? ""}`.trim();
  const aoa: unknown[][] = [headerRow, exampleRow];
  // 留若干空行
  for (let i = 0; i < 20; i++) aoa.push(cfg.fields.map(() => ""));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 列宽自适应
  ws["!cols"] = cfg.fields.map((f) => ({ wch: Math.max(12, f.label.length * 2 + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, "员工信息");

  // Sheet 2: 填写说明
  const notes: unknown[][] = [
    [`${cfg.label} — 导入模板填写说明`],
    [],
    ["岗位说明"],
    ...cfg.extraNotes.map((n) => [`· ${n}`]),
    [],
    ["字段说明"],
    ["字段名", "是否必填", "类型/可选值", "单位", "说明", "示例"],
    ...cfg.fields.map((f) => [
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
    ["· 上传时第 1 行表头与第 2 行示例会被自动跳过；从第 3 行起填写真实员工数据。"],
    ["· 若某行缺关键字段或填写不规范，结果表会用红色标出并给出具体原因。"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(notes);
  ws2["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 50 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "填写说明");

  const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return ab;
}

export function downloadTemplate(cfg: PositionConfig): void {
  const ab = buildTemplate(cfg);
  const blob = new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cfg.label}-员工信息导入模板.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
