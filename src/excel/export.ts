import * as XLSX from "xlsx";
import type { PositionResult } from "../calc/types";
import type { PositionConfig } from "../positions/registry";
import { UNIFIED_ENTRY_LABEL, UNIFIED_FIELDS } from "../positions/unified";
import { formatBracket } from "../calc/engine";
import { fmtDate, triggerDownload } from "./shared";

interface InputCol {
  key: string;
  label: string;
}

/** 评级结果列：monthly_salary 之后、trace 之前插入 7 个明细列 */
const RESULT_COLS: InputCol[] = [
  { key: "grade", label: "岗位评定" },
  { key: "monthly_salary", label: "次季度月薪(元)" },
  { key: "std_salary", label: "转正后标准(元)" },
  { key: "incentive", label: "月度激励(元)" },
  { key: "perf_bracket_text", label: "业绩对应核算区间" },
  { key: "perf_lo", label: "业绩区间下限" },
  { key: "perf_diff", label: "业绩区间差值" },
  { key: "salary_bracket_text", label: "对应薪资区间" },
  { key: "sal_lo", label: "薪资区间下限" },
  { key: "sal_diff", label: "薪资区间差值" },
  { key: "raw_salary", label: "计算薪资具体值" },
  { key: "trace", label: "计算依据" },
  { key: "notes", label: "提示" },
  { key: "errors", label: "错误" },
];

function inputValue(r: PositionResult, key: string): unknown {
  if (key === "position") return r.position_label ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (r as any)[key];
  if (typeof v === "boolean") return v ? "是" : "否";
  if (v === undefined || v === null) return "";
  return v;
}

function buildRows(results: PositionResult[], inputCols: InputCol[], showIncentive: boolean): unknown[][] {
  const header = ["行号", ...inputCols.map((c) => c.label), ...RESULT_COLS.map((c) => c.label)];
  const rows: unknown[][] = [header];
  for (const r of results) {
    const row: unknown[] = [r.__rowIndex ?? ""];
    for (const c of inputCols) row.push(inputValue(r, c.key));
    row.push(r.grade ?? "");
    row.push(r.monthly_salary ?? "");
    row.push(r.std_salary ?? "");
    row.push(showIncentive ? (r.incentive ?? "") : "");
    // 7 个明细列
    row.push(r.perf_bracket ? formatBracket(r.perf_bracket) : "");
    row.push(r.perf_bracket && r.perf_bracket.lo !== null ? r.perf_bracket.lo : "");
    row.push(
      r.perf_bracket && r.perf_bracket.lo !== null && r.perf_bracket.hi !== null
        ? r.perf_bracket.hi - r.perf_bracket.lo
        : "",
    );
    row.push(r.salary_bracket ? `[${r.salary_bracket.sal_lo}, ${r.salary_bracket.sal_hi})` : "");
    row.push(r.salary_bracket ? r.salary_bracket.sal_lo : "");
    row.push(r.salary_bracket ? r.salary_bracket.sal_hi - r.salary_bracket.sal_lo : "");
    row.push(r.raw_salary !== undefined && r.raw_salary !== null ? Number(r.raw_salary.toFixed(2)) : "");
    row.push(r.trace);
    row.push(r.notes.join(" ; "));
    row.push(r.errors.join(" ; "));
    rows.push(row);
  }
  return rows;
}

function buildWorkbook(rows: unknown[][]): XLSX.WorkBook {
  const header = rows[0] as string[];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(10, h.length * 2 + 2) }));

  // 错误行单元格仅靠列内容呈现，不写条件格式（xlsx 社区版有限制）
  // 单独再写一个"仅错误行"sheet 方便筛查
  const errorRows = rows.filter((row, i) => i === 0 || (row[row.length - 1] as string) !== "");
  const wsErr = XLSX.utils.aoa_to_sheet(errorRows);
  wsErr["!cols"] = ws["!cols"];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "评级结果");
  if (errorRows.length > 1) {
    XLSX.utils.book_append_sheet(wb, wsErr, "错误行");
  }
  return wb;
}

function writeAndDownload(wb: XLSX.WorkBook, filename: string): void {
  const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  triggerDownload(ab, filename);
}

export function exportResults(results: PositionResult[], cfg: PositionConfig): void {
  const inputCols = cfg.fields.map((f) => ({ key: f.key, label: f.label }));
  // 主播岗才显示激励列；其余隐藏
  const showIncentive = cfg.key === "livestream_host";
  const wb = buildWorkbook(buildRows(results, inputCols, showIncentive));
  writeAndDownload(wb, `${cfg.label}-${fmtDate(new Date())}-评级结果.xlsx`);
}

/** 统一导出输入列：13 列统一字段（第 2 列员工岗位取 position_label） */
const UNIFIED_INPUT_COLS: InputCol[] = UNIFIED_FIELDS.map((f) => ({ key: f.key, label: f.label }));

/** 纯函数：供测试断言 sheet 结构与表头 */
export function buildUnifiedWorkbook(results: PositionResult[]): XLSX.WorkBook {
  // 混排单 sheet；月度激励列恒显示（仅主播岗行有值）
  return buildWorkbook(buildRows(results, UNIFIED_INPUT_COLS, true));
}

export function exportUnifiedResults(results: PositionResult[]): void {
  const wb = buildUnifiedWorkbook(results);
  writeAndDownload(wb, `${UNIFIED_ENTRY_LABEL}-${fmtDate(new Date())}-评级结果.xlsx`);
}
