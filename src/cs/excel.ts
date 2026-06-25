import * as XLSX from "xlsx";
import { JILIN_DEPT_GROUPS } from "./config";
import type { CsComputeOutput } from "./compute";
import type {
  CsColumn,
  CsEmployee,
  CsIndicatorDetail,
  CsPositionConfig,
  CsResult,
} from "./types";
import { MONTH_COUNT, MONTH_LABELS } from "./types";

const BOOL_TRUE = new Set<unknown>(["是", "true", "TRUE", "True", "y", "Y", "yes", "1", 1, true]);
const BOOL_FALSE = new Set<unknown>(["否", "false", "FALSE", "False", "n", "N", "no", "0", 0, false]);

// ---------- 模板 ----------
function exampleValue(c: CsColumn): unknown {
  if (c.example !== undefined && c.example !== "") return c.example;
  return "";
}

export function buildCsTemplate(cfg: CsPositionConfig): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const headerRow = cfg.columns.map((c) => c.label);
  const exampleRow = cfg.columns.map(exampleValue);
  exampleRow[0] = `示例 ↓（删除此行后开始填写） ${exampleRow[0] ?? ""}`.trim();
  const aoa: unknown[][] = [headerRow, exampleRow];
  for (let i = 0; i < 20; i++) aoa.push(cfg.columns.map(() => ""));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cfg.columns.map((c) => ({ wch: Math.max(12, c.label.length * 2 + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, "员工信息");

  // 填写说明
  const notes: unknown[][] = [
    [`${cfg.label} — 导入模板填写说明`],
    [],
    ["岗位说明"],
    ...cfg.notes.map((n) => [`· ${n}`]),
    [],
    ["字段说明"],
    ["列名", "是否必填", "类型/可选值", "单位", "说明", "示例"],
    ...cfg.columns.map((c) => [
      c.label,
      c.required ? "必填" : "可选",
      c.enum ? c.enum.join(" / ") : c.kind === "indicator" ? "数字" : c.kind === "expert_advance" || c.kind === "participate" ? "是 / 否" : "文本",
      c.unit ?? "",
      c.comment,
      String(c.example ?? ""),
    ]),
  ];

  if (cfg.hasDeptGroup) {
    notes.push([], ["部门 → 组别 对应关系（组别必须与部门匹配）"]);
    for (const [dept, groups] of Object.entries(JILIN_DEPT_GROUPS)) {
      notes.push([dept, groups.join(" ; ")]);
    }
    notes.push(
      [],
      ["各组考核指标（指标1 / 指标2）"],
      ["天猫·售前服务组（官旗/综合）", "转化率 / 响应时间"],
      ["天猫·物流速询/标准/专业/优+服务组", "客户满意度 / 响应时间"],
      ["抖音·客服一组-售前组", "转化率 / 响应时间"],
      ["抖音·客服一组-售后组、客服二组-售后组、综合组（快手）", "客户满意度 / 响应时间"],
      ["抖音·客服二组-综合组（京东）", "客户满意度 / 转化率（均正向，无响应时间）"],
      ["拼多多·客服二组（售后）、综合组（售前+售后）", "客服服务分 / 响应时间"],
      ["拼多多·客服一组-售前组", "转化率 / 响应时间"],
    );
  }

  notes.push(
    [],
    ["通用规则"],
    [`· 每个指标与接待量都已展开为 ${MONTH_LABELS.join(" / ")} 三列，必须分别填写三个月的数据。`],
    ["· 指标值按方案口径填写：满意度/转化率填百分数的数值（如 96、56），响应时间填秒，客服服务分填分值。"],
    ["· 每人只需填本组别对应的 2 个指标（各 3 列月1/月2/月3），其余指标列留空。"],
    ["· 系统按月计算完成率，单项指标超过 120% 一律按 120% 计；取 3 个月均值为季度完成率。"],
    ["· 接待量为必填；系统按三月均值与评级单元季度均值×80% 比较作为中级及以上门槛。"],
    ["· 综合完成率 < 80% 时直接按所在组别薪资区间低限定薪。"],
    ["· 「是否参与评级定薪」填「否」的员工：仅作为单元均值样本参与计算，不计入排名池/参评人数，也不产生本身的定级与薪资；留空/「是」为默认参评。"],
    ["· 上传后需在页面填写各部门「评级周期在职人数」，用于计算参评比例与排名档位（参评人数仅含「是」的员工）。"],
    ["· 第 1 行表头、第 2 行示例会被自动跳过；从第 3 行起填写真实数据。"],
  );

  const ws2 = XLSX.utils.aoa_to_sheet(notes);
  ws2["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 30 }, { wch: 8 }, { wch: 56 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "填写说明");

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

export function downloadCsTemplate(cfg: CsPositionConfig): void {
  const ab = buildCsTemplate(cfg);
  triggerDownload(ab, `${cfg.label}-员工信息导入模板.xlsx`);
}

// ---------- 解析 ----------
function looksLikeExampleRow(row: Record<string, unknown>): boolean {
  const first = Object.values(row)[0];
  return typeof first === "string" && first.startsWith("示例");
}
function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v === "" || v === null || v === undefined);
}

export interface CsParseResult {
  employees: CsEmployee[];
  fileErrors: string[];
}

export async function parseCsUpload(file: File, cfg: CsPositionConfig): Promise<CsParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n === "员工信息") ?? wb.SheetNames[0];
  if (!sheetName) return { employees: [], fileErrors: ["Excel 文件中未找到任何工作表"] };
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  if (rows.length === 0) return { employees: [], fileErrors: ["表格内没有任何数据行，请检查模板是否填写"] };

  const fileErrors: string[] = [];
  const headers = new Set(Object.keys(rows[0] ?? {}));
  for (const c of cfg.columns) {
    if (c.required && !headers.has(c.label)) fileErrors.push(`缺少必填列「${c.label}」，请使用最新模板`);
  }
  if (fileErrors.length > 0) return { employees: [], fileErrors };

  const employees: CsEmployee[] = [];
  let rowIdx = 1;
  for (const raw of rows) {
    rowIdx += 1;
    if (looksLikeExampleRow(raw)) continue;
    if (isEmptyRow(raw)) continue;

    const errors: string[] = [];
    const emp: CsEmployee = {
      values: {},
      reception: Array.from({ length: MONTH_COUNT }, () => undefined as number | undefined),
      participate: true,
      __rowIndex: rowIdx,
      __parseErrors: errors,
    };

    for (const c of cfg.columns) {
      const cell = raw[c.label];
      const blank = cell === "" || cell === null || cell === undefined;
      switch (c.kind) {
        case "name":
          if (!blank) emp.name = String(cell).trim();
          break;
        case "dept": {
          if (blank) break;
          const s = String(cell).trim();
          if (c.enum && !c.enum.includes(s)) {
            errors.push(`第 ${rowIdx} 行「${c.label}」必须为 ${c.enum.join("/")}，收到: ${JSON.stringify(cell)}`);
          } else emp.dept = s;
          break;
        }
        case "group": {
          if (blank) break;
          const s = String(cell).trim();
          if (c.enum && !c.enum.includes(s)) {
            errors.push(`第 ${rowIdx} 行「${c.label}」不在可选组别内，收到: ${JSON.stringify(cell)}`);
          } else emp.group = s;
          break;
        }
        case "indicator": {
          if (blank) break;
          const n = typeof cell === "number" ? cell : Number(String(cell).trim());
          if (!Number.isFinite(n) || n < 0) {
            errors.push(`第 ${rowIdx} 行「${c.label}」必须是非负数字，收到: ${JSON.stringify(cell)}`);
          } else {
            const base = c.baseLabel ?? c.label;
            const m = c.monthIndex ?? 0;
            const arr = (emp.values[base] ??= Array.from(
              { length: MONTH_COUNT },
              () => undefined as number | undefined,
            ));
            arr[m] = n;
          }
          break;
        }
        case "reception": {
          if (blank) break;
          const n = typeof cell === "number" ? cell : Number(String(cell).trim());
          if (!Number.isFinite(n) || n < 0) {
            errors.push(`第 ${rowIdx} 行「${c.label}」必须是非负数字，收到: ${JSON.stringify(cell)}`);
          } else {
            const m = c.monthIndex ?? 0;
            emp.reception[m] = n;
          }
          break;
        }
        case "expert_advance": {
          if (blank) break;
          if (BOOL_TRUE.has(cell)) emp.expertAdvance = true;
          else if (BOOL_FALSE.has(cell)) emp.expertAdvance = false;
          else errors.push(`第 ${rowIdx} 行「${c.label}」必须为 是/否，收到: ${JSON.stringify(cell)}`);
          break;
        }
        case "participate": {
          if (blank) break; // 默认参评
          if (BOOL_TRUE.has(cell)) emp.participate = true;
          else if (BOOL_FALSE.has(cell)) emp.participate = false;
          else errors.push(`第 ${rowIdx} 行「${c.label}」必须为 是/否，收到: ${JSON.stringify(cell)}`);
          break;
        }
      }
    }
    employees.push(emp);
  }
  return { employees, fileErrors };
}

// ---------- 导出 ----------
function joinMonthlyValues(d: CsIndicatorDetail | undefined): string {
  if (!d) return "";
  return d.monthly.map((m) => m.value).join(" / ");
}
function joinMonthlyMeans(d: CsIndicatorDetail | undefined): string {
  if (!d) return "";
  return d.monthly.map((m) => Number(m.mean.toFixed(2))).join(" / ");
}
function joinMonthlyRates(d: CsIndicatorDetail | undefined): string {
  if (!d) return "";
  return d.monthly
    .map((m) => `${(m.rate * 100).toFixed(1)}%${m.capped ? "(封顶)" : ""}`)
    .join(" / ");
}

function csResultRow(r: CsResult, hasDeptGroup: boolean): unknown[] {
  const row: unknown[] = [r.__rowIndex, r.name];
  if (hasDeptGroup) row.push(r.dept ?? "", r.group ?? "");
  const recMonthly = r.receptionMonthly ? r.receptionMonthly.map((m) => m.value).join(" / ") : "";
  row.push(
    r.participate ? "是" : "否",
    r.validMonths !== undefined ? `${r.validMonths}/${MONTH_COUNT}` : "",
    r.ind1 ? r.ind1.label : "",
    joinMonthlyValues(r.ind1),
    joinMonthlyMeans(r.ind1),
    joinMonthlyRates(r.ind1),
    r.ind1 ? `${(r.ind1.rate * 100).toFixed(1)}%` : "",
    r.ind2 ? r.ind2.label : "",
    joinMonthlyValues(r.ind2),
    joinMonthlyMeans(r.ind2),
    joinMonthlyRates(r.ind2),
    r.ind2 ? `${(r.ind2.rate * 100).toFixed(1)}%` : "",
    r.combinedRate !== null ? `${(r.combinedRate * 100).toFixed(1)}%` : "",
    recMonthly,
    r.reception !== undefined ? Number(r.reception.toFixed(1)) : "",
    r.receptionMean !== undefined ? Number(r.receptionMean.toFixed(2)) : "",
    r.receptionThreshold !== undefined ? Number(r.receptionThreshold.toFixed(1)) : "",
    r.receptionOk === undefined ? "" : r.receptionOk ? "达标" : "不足",
    r.rank ?? "",
    r.poolSize ?? "",
    r.percentile !== undefined ? `${(r.percentile * 100).toFixed(1)}%` : "",
    r.participationRatio !== undefined ? `${(r.participationRatio * 100).toFixed(1)}%` : "",
    r.tierLabel ?? "",
    r.grade ?? "",
    r.monthlySalary ?? "",
    r.rawSalary !== null && r.rawSalary !== undefined ? Number(r.rawSalary.toFixed(2)) : "",
    r.salaryBand ? `[${r.salaryBand.lo}, ${r.salaryBand.hi})` : "",
    r.trace,
    r.notes.join(" ; "),
    r.errors.join(" ; "),
  );
  return row;
}

export function exportCsResults(out: CsComputeOutput, cfg: CsPositionConfig): void {
  const hasDeptGroup = cfg.hasDeptGroup;
  const monthsTag = MONTH_LABELS.join("/");
  const header: string[] = ["行号", "姓名"];
  if (hasDeptGroup) header.push("部门", "组别");
  header.push(
    "参评定薪",
    "有效月份",
    "指标1",
    `指标1值(${monthsTag})`,
    `指标1均值(${monthsTag})`,
    `指标1月度完成率(${monthsTag})`,
    "指标1季度完成率",
    "指标2",
    `指标2值(${monthsTag})`,
    `指标2均值(${monthsTag})`,
    `指标2月度完成率(${monthsTag})`,
    "指标2季度完成率",
    "综合完成率(季度)",
    `接待量(${monthsTag})`,
    "接待量季度均值",
    "单元接待量季度均值",
    "接待量门槛(×80%)",
    "接待量是否达标",
    "排名", "排名人数", "排名分位", "参评比例", "参评档位",
    "岗位评定", "次季度月薪(元)", "取百前薪资", "对应薪资区间",
    "计算依据", "提示", "错误",
  );
  const rows: unknown[][] = [header, ...out.results.map((r) => csResultRow(r, hasDeptGroup))];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(10, h.length * 2 + 2) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "评级结果");

  // 参评比例汇总
  const partRows: unknown[][] = [["部门", "参评人数", "在职人数", "参评比例", "档位"]];
  for (const p of out.participation) {
    partRows.push([p.dept, p.participants, p.headcount, `${(p.ratio * 100).toFixed(1)}%`, p.tierLabel]);
  }
  const wsPart = XLSX.utils.aoa_to_sheet(partRows);
  wsPart["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsPart, "参评比例");

  // 错误行
  const errRows = rows.filter((row, i) => i === 0 || (row[row.length - 1] as string) !== "");
  if (errRows.length > 1) {
    const wsErr = XLSX.utils.aoa_to_sheet(errRows);
    wsErr["!cols"] = ws["!cols"];
    XLSX.utils.book_append_sheet(wb, wsErr, "错误行");
  }

  const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  triggerDownload(ab, `${cfg.label}-${fmtDate(new Date())}-评级结果.xlsx`);
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function triggerDownload(ab: ArrayBuffer, filename: string): void {
  const blob = new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
