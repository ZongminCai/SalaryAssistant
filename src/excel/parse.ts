import * as XLSX from "xlsx";
import type { Employee } from "../calc/types";
import type { FieldDef, PositionConfig } from "../positions/registry";
import { POSITION_CONFIGS } from "../positions/registry";
import {
  isRequiredExempt,
  POSITION_COLUMN_LABEL,
  resolvePosition,
  UNIFIED_ENTRY_LABEL,
  UNIFIED_FIELDS,
} from "../positions/unified";
import { BOOL_FALSE, BOOL_TRUE, isEmptyRow, looksLikeExampleRow } from "./shared";

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

function isBlank(raw: unknown): boolean {
  return raw === undefined || raw === null || String(raw).trim() === "";
}

/**
 * 统一入口解析：每行通过「员工岗位」列定岗，按该岗位的字段定义做类型/枚举/必填校验。
 * - 文件级：缺「姓名」或「员工岗位」列直接报错并指引模板来源
 * - 行级：岗位无法识别 / 本岗位必填列留空 / 枚举越界 / 条件必填缺失，均带行号报错
 * - 枚举校验使用该行岗位的子集（如跨境岗职级不认「主管」），而非全岗位并集
 */
export async function parseUnifiedUpload(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n === "员工信息") ?? wb.SheetNames[0];
  if (!sheetName) {
    return { employees: [], fileErrors: ["Excel 文件中未找到任何工作表"] };
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });

  const fileErrors: string[] = [];
  if (rows.length === 0) {
    return { employees: [], fileErrors: ["表格内没有任何数据行，请检查模板是否填写"] };
  }
  const headers = new Set(Object.keys(rows[0] ?? {}));
  for (const col of ["姓名", POSITION_COLUMN_LABEL]) {
    if (!headers.has(col)) {
      fileErrors.push(
        `缺少必填列「${col}」，请下载「${UNIFIED_ENTRY_LABEL}」统一模板；若手里是旧岗位模板，请从首页对应旧版入口上传`,
      );
    }
  }
  if (fileErrors.length > 0) {
    return { employees: [], fileErrors };
  }

  const employees: Employee[] = [];
  let rowIdx = 1; // 表头是第 1 行；rowIdx 为数据行在 Excel 中的实际行号
  for (const raw of rows) {
    rowIdx += 1;
    if (looksLikeExampleRow(raw)) continue;
    if (isEmptyRow(raw)) continue;

    const errors: string[] = [];
    const resolved = resolvePosition(raw[POSITION_COLUMN_LABEL]);
    if ("error" in resolved) {
      errors.push(`第 ${rowIdx} 行 ${resolved.error}`);
      employees.push({
        name: typeof raw["姓名"] === "string" ? raw["姓名"].trim() : undefined,
        __rowIndex: rowIdx,
        __parseErrors: errors,
      });
      continue;
    }
    const cfg = POSITION_CONFIGS[resolved.key];
    const emp: Employee = {
      position: resolved.key,
      __rowIndex: rowIdx,
      __parseErrors: errors,
    };

    for (const f of UNIFIED_FIELDS) {
      if (f.key === "position") continue; // 岗位列已单独处理
      const pf = cfg.fields.find((x) => x.key === f.key);
      const cell = raw[f.label];
      if (!pf) continue; // 该岗位不适用此列：填了也忽略（宽表稀疏填写）
      const v = parseField(cell, pf, errors, rowIdx);
      if (v !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (emp as any)[f.key] = v;
      }
      // D6 行级必填：本岗位 required=always 的列留空即报错（管培生/助理业绩豁免除外）
      if (pf.required === "always" && isBlank(cell) && !isRequiredExempt(f.key, emp.level)) {
        errors.push(`第 ${rowIdx} 行「${pf.label}」为${cfg.label}必填字段，不能留空`);
      }
    }

    // 条件必填预检（带行号，比 compute 的兜底报错更清晰；compute 原有校验保留）
    const level = emp.level;
    if (level === "组长") {
      for (const key of ["perf_team", "span_of_control"] as const) {
        if (emp[key] === undefined && cfg.fields.some((x) => x.key === key)) {
          const label = cfg.fields.find((x) => x.key === key)?.label ?? key;
          errors.push(`第 ${rowIdx} 行 职级=组长 时「${label}」必填`);
        }
      }
    }
    if (level === "管培生" && emp.education === undefined && cfg.fields.some((x) => x.key === "education")) {
      errors.push(`第 ${rowIdx} 行 职级=管培生 时「学历」必填`);
    }
    if (
      cfg.key === "livestream_host" &&
      emp.perf_personal === undefined &&
      emp.monthly_net_sales === undefined
    ) {
      errors.push(`第 ${rowIdx} 行 主播岗需至少填「个人业绩(万元)」或「月度净销售额(万元)」其一`);
    }

    employees.push(emp);
  }

  return { employees, fileErrors };
}
