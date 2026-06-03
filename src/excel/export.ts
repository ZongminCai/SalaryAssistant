import * as XLSX from "xlsx";
import type { PositionResult } from "../calc/types";
import type { PositionConfig } from "../positions/registry";
import { formatBracket } from "../calc/engine";

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function exportResults(results: PositionResult[], cfg: PositionConfig): void {
  // 通用输入列：在 perf_personal 之后插入"个人月均业绩(万元)"
  const baseInputCols = cfg.fields.map((f) => ({ key: f.key, label: f.label }));
  const perfIdx = cfg.fields.findIndex((f) => f.key === "perf_personal");
  const monthlyPerfCol = { key: "monthly_perf", label: "个人月均业绩(万元)" };
  const inputCols =
    perfIdx >= 0
      ? [...baseInputCols.slice(0, perfIdx + 1), monthlyPerfCol, ...baseInputCols.slice(perfIdx + 1)]
      : baseInputCols;

  // 评级结果列：monthly_salary 之后、trace 之前插入 7 个明细列
  const resultCols = [
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

  const header = ["行号", ...inputCols.map((c) => c.label), ...resultCols.map((c) => c.label)];
  const rows: unknown[][] = [header];

  // 主播岗才显示激励列；其余隐藏
  const showIncentive = cfg.key === "livestream_host";

  for (const r of results) {
    const row: unknown[] = [r.__rowIndex ?? ""];
    for (const c of inputCols) {
      if (c.key === "monthly_perf") {
        row.push(r.monthly_perf !== undefined && r.monthly_perf !== null ? Number(r.monthly_perf.toFixed(2)) : "");
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (r as any)[c.key];
      if (typeof v === "boolean") row.push(v ? "是" : "否");
      else if (v === undefined || v === null) row.push("");
      else row.push(v);
    }
    row.push(r.grade ?? "");
    row.push(r.monthly_salary ?? "");
    row.push(r.std_salary ?? "");
    row.push(showIncentive ? (r.incentive ?? "") : "");
    // 7 个新明细列
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

  const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cfg.label}-${fmtDate(new Date())}-评级结果.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
