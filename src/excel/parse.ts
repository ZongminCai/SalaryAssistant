import * as XLSX from "xlsx";
import type { Employee } from "../calc/types";
import type { FieldDef, PositionConfig } from "../positions/registry";

const BOOL_TRUE = new Set(["是", "true", "TRUE", "True", "y", "Y", "yes", "1", 1, true]);
const BOOL_FALSE = new Set(["否", "false", "FALSE", "False", "n", "N", "no", "0", 0, false, "", null, undefined]);

function looksLikeExampleRow(row: Record<string, unknown>): boolean {
  const first = Object.values(row)[0];
  if (typeof first === "string" && first.startsWith("示例")) return true;
  return false;
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v === "" || v === null || v === undefined);
}

function parseField(
  raw: unknown,
  field: FieldDef,
  errors: string[],
  rowIndex: number,
): unknown {
  if (raw === "" || raw === null || raw === undefined) {
    return undefined;
  }
  const label = field.label;
  switch (field.type) {
    case "string":
      return String(raw).trim();
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) {
        errors.push(`第 ${rowIndex} 行「${label}」必须是数字，收到: ${JSON.stringify(raw)}`);
        return undefined;
      }
      if (n < 0) {
        errors.push(`第 ${rowIndex} 行「${label}」不能为负数: ${n}`);
        return undefined;
      }
      if (field.unit === "万元" && n > 50000) {
        errors.push(`第 ${rowIndex} 行「${label}」=${n} 异常偏大，请确认单位是「万元」而非「元」`);
      }
      return n;
    }
    case "boolean": {
      if (BOOL_TRUE.has(raw as never)) return true;
      if (BOOL_FALSE.has(raw as never)) return false;
      errors.push(`第 ${rowIndex} 行「${label}」必须为 是/否，收到: ${JSON.stringify(raw)}`);
      return undefined;
    }
    case "enum": {
      const s = String(raw).trim();
      if (!field.enum?.includes(s)) {
        errors.push(`第 ${rowIndex} 行「${label}」必须为 ${field.enum?.join("/")}，收到: ${JSON.stringify(raw)}`);
        return undefined;
      }
      return s;
    }
  }
}

export interface ParseResult {
  employees: Employee[];
  /** 文件级错误（如缺列），独立于行级错误 */
  fileErrors: string[];
}

export async function parseUpload(file: File, cfg: PositionConfig): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n === "员工信息") ?? wb.SheetNames[0];
  if (!sheetName) {
    return { employees: [], fileErrors: ["Excel 文件中未找到任何工作表"] };
  }
  const ws = wb.Sheets[sheetName];
  // 用表头作为 key
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });

  const fileErrors: string[] = [];
  // 检查必要表头
  if (rows.length === 0) {
    return { employees: [], fileErrors: ["表格内没有任何数据行，请检查模板是否填写"] };
  }
  const headers = new Set(Object.keys(rows[0] ?? {}));
  for (const f of cfg.fields) {
    if (f.required === "always" && !headers.has(f.label)) {
      fileErrors.push(`缺少必填列「${f.label}」，请使用最新模板`);
    }
  }
  if (fileErrors.length > 0) {
    return { employees: [], fileErrors };
  }

  const employees: Employee[] = [];
  let rowIdx = 1; // 表头是第 1 行；这里是数据行的"在 Excel 中的实际行号"
  for (const raw of rows) {
    rowIdx += 1;
    if (looksLikeExampleRow(raw)) continue;
    if (isEmptyRow(raw)) continue;

    const errors: string[] = [];
    const emp: Employee = {
      position: cfg.key,
      __rowIndex: rowIdx,
      __parseErrors: errors,
    };
    for (const f of cfg.fields) {
      const v = parseField(raw[f.label], f, errors, rowIdx);
      if (v !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (emp as any)[f.key] = v;
      }
    }
    employees.push(emp);
  }

  return { employees, fileErrors };
}
