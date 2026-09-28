import * as XLSX from "xlsx";
import { DEPT_GROUPS } from "./config";
import type { CsComputeOutput } from "./compute";
import type {
  CsColumn,
  CsEmployee,
  CsIndicatorDetail,
  CsLevel,
  CsPositionConfig,
  CsResult,
} from "./types";
import { MONTH_COUNT, MONTH_LABELS } from "./types";
import { fmtDate, isEmptyRow, looksLikeExampleRow, parseBool, triggerDownload } from "../excel/shared";

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
      c.enum ? c.enum.join(" / ") : c.kind === "indicator" || c.kind === "attendance" || c.kind === "leave_days" || c.kind === "current_salary" ? "数字" : c.kind === "expert_advance" || c.kind === "participate" ? "是 / 否" : "文本",
      c.unit ?? "",
      c.comment,
      String(c.example ?? ""),
    ]),
  ];

  notes.push([], ["部门 → 组别 对应关系（组别必须与部门匹配）"]);
  for (const [dept, groups] of Object.entries(DEPT_GROUPS)) {
    notes.push([dept, groups.join(" ; ")]);
  }
  notes.push(
    [],
    ["各组考核指标（指标1 / 指标2）"],
    ["天猫服务部·售前服务组（官旗/综合）", "转化率 / 响应时间"],
    ["天猫服务部·标准服务组、专业服务组", "客户满意度 / 响应时间"],
    ["抖音服务部·抖音-售前组", "转化率 / 响应时间"],
    ["抖音服务部·抖音-售后一组、售后二组、综合组", "客户满意度 / 响应时间"],
    ["京东服务部·京东-综合组", "客户满意度 / 响应时间"],
    ["京东服务部·京东-京东组", "客户满意度 / 转化率（均正向，无响应时间）"],
    ["拼多多服务部·拼多多-售后组、综合组", "客服服务分 / 响应时间"],
    ["拼多多服务部·拼多多-售前组", "转化率 / 响应时间"],
  );

  notes.push(
    [],
    ["通用规则"],
    [`· 每个指标与接待量都已展开为 ${MONTH_LABELS.join(" / ")} 三列，必须分别填写三个月的数据。`],
    ["· 指标值按方案口径填写：满意度/转化率填小数（如 0.96 表示 96%、0.56 表示 56%，系统自动×100），响应时间填秒，客服服务分填分值。"],
    ["· 每人只需填本组别对应的 2 个指标（各 3 列月1/月2/月3），其余指标列留空。"],
    ["· 系统按月计算完成率，单项指标超过 120% 一律按 120% 计；取 3 个月均值为季度完成率。组别可参评人数≤3 人时，目标值按月确定：当月有数据人数＞3 用当月团队均值，否则用组别中级基准线。"],
    ["· 接待量与「季度出勤天数」为必填；中级及以上门槛：个人日均接待量（季度接待量之和÷季度出勤天数）≥ 组内日均接待量×90%。"],
    ["· 综合完成率 < 80% 时直接按所在组别薪资区间低限定薪。"],
    ["· 「季度事假天数」≥5 天（含后补事假）取消当季度正向评级资格：评定级别/薪资高于现状时按现状执行（须填写「当前级别」「当前月薪」），低于现状时正常按评定结果执行。"],
    ["· 「是否参与评级定薪」填「否」的员工：仅作为单元均值与组内日均接待量样本参与计算，不计入排名池/参评人数，也不产生本身的定级与薪资；留空/「是」为默认参评。"],
    ["· 上传后需在页面填写各部门「评级周期在职人数」，用于计算参评比例与排名档位（参评人数仅含「是」的员工）。"],
    ["· 导入行均视为转正员工：非整月转正、15 日及之前离职人员请在导入前剔除或标记「否」。"],
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
export interface CsParseResult {
  employees: CsEmployee[];
  fileErrors: string[];
}

/** 单元格 → 非负数字；非法时写入 errors 并返回 undefined */
function parseNumber(
  cell: unknown,
  label: string,
  rowIdx: number,
  errors: string[],
  opts: { allowZero?: boolean } = {},
): number | undefined {
  const n = typeof cell === "number" ? cell : Number(String(cell).trim());
  if (!Number.isFinite(n) || n < 0 || (!opts.allowZero && n === 0)) {
    errors.push(`第 ${rowIdx} 行「${label}」必须是${opts.allowZero ? "非负" : "正"}数字，收到: ${JSON.stringify(cell)}`);
    return undefined;
  }
  return n;
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

  // 级别展示名 → CsLevel 反查表
  const levelByName = new Map<string, CsLevel>(
    (Object.entries(cfg.levelNames) as [CsLevel, string][]).map(([k, v]) => [v, k]),
  );

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
          const n = parseNumber(cell, c.label, rowIdx, errors, { allowZero: true });
          if (n !== undefined) {
            const base = c.baseLabel ?? c.label;
            const m = c.monthIndex ?? 0;
            const arr = (emp.values[base] ??= Array.from(
              { length: MONTH_COUNT },
              () => undefined as number | undefined,
            ));
            arr[m] = c.unit === "%" ? +(n * 100).toFixed(10) : n;
          }
          break;
        }
        case "reception": {
          if (blank) break;
          const n = parseNumber(cell, c.label, rowIdx, errors, { allowZero: true });
          if (n !== undefined) emp.reception[c.monthIndex ?? 0] = n;
          break;
        }
        case "attendance": {
          if (blank) {
            errors.push(`第 ${rowIdx} 行「${c.label}」为必填（日均接待量分母）`);
            break;
          }
          const n = parseNumber(cell, c.label, rowIdx, errors);
          if (n !== undefined) emp.attendanceDays = n;
          break;
        }
        case "leave_days": {
          if (blank) break; // 留空视为 0
          const n = parseNumber(cell, c.label, rowIdx, errors, { allowZero: true });
          if (n !== undefined) emp.leaveDays = n;
          break;
        }
        case "current_level": {
          if (blank) break;
          const s = String(cell).trim();
          const lvl = levelByName.get(s);
          if (lvl === undefined) {
            errors.push(`第 ${rowIdx} 行「${c.label}」必须为 ${[...levelByName.keys()].join("/")}，收到: ${JSON.stringify(cell)}`);
          } else emp.currentLevel = lvl;
          break;
        }
        case "current_salary": {
          if (blank) break;
          const n = parseNumber(cell, c.label, rowIdx, errors);
          if (n !== undefined) emp.currentSalary = n;
          break;
        }
        case "expert_advance": {
          if (blank) break;
          const b = parseBool(cell);
          if (b === undefined) errors.push(`第 ${rowIdx} 行「${c.label}」必须为 是/否，收到: ${JSON.stringify(cell)}`);
          else emp.expertAdvance = b;
          break;
        }
        case "participate": {
          if (blank) break; // 默认参评
          const b = parseBool(cell);
          if (b === undefined) errors.push(`第 ${rowIdx} 行「${c.label}」必须为 是/否，收到: ${JSON.stringify(cell)}`);
          else emp.participate = b;
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
function joinMonthlyTargets(d: CsIndicatorDetail | undefined): string {
  if (!d) return "";
  return d.monthly.map((m) => Number(m.mean.toFixed(2))).join(" / ");
}
function joinMonthlyRates(d: CsIndicatorDetail | undefined): string {
  if (!d) return "";
  return d.monthly
    .map((m) => `${(m.rate * 100).toFixed(1)}%${m.capped ? "(封顶)" : ""}${m.target === "baseline" ? "(基准线)" : ""}`)
    .join(" / ");
}
function joinMonthly(arr: (number | undefined)[] | undefined): string {
  if (!arr) return "";
  return arr.map((v) => (v === undefined ? "" : v)).join(" / ");
}

function csResultRow(r: CsResult, cfg: CsPositionConfig): unknown[] {
  return [
    r.__rowIndex,
    r.name,
    r.dept ?? "",
    r.group ?? "",
    r.participate ? "是" : "否",
    r.validMonths !== undefined ? `${r.validMonths}/${MONTH_COUNT}` : "",
    r.ind1 ? r.ind1.label : "",
    joinMonthlyValues(r.ind1),
    joinMonthlyTargets(r.ind1),
    joinMonthlyRates(r.ind1),
    r.ind1 ? `${(r.ind1.rate * 100).toFixed(1)}%` : "",
    r.ind1Avg !== undefined ? Number(r.ind1Avg.toFixed(2)) : "",
    r.ind2 ? r.ind2.label : "",
    joinMonthlyValues(r.ind2),
    joinMonthlyTargets(r.ind2),
    joinMonthlyRates(r.ind2),
    r.ind2 ? `${(r.ind2.rate * 100).toFixed(1)}%` : "",
    r.ind2Avg !== undefined ? Number(r.ind2Avg.toFixed(2)) : "",
    r.combinedRate !== null ? `${(r.combinedRate * 100).toFixed(1)}%` : "",
    joinMonthly(r.receptionMonthly),
    r.receptionTotal !== undefined ? Number(r.receptionTotal.toFixed(1)) : "",
    r.attendanceDays ?? "",
    r.dailyReception !== undefined ? Number(r.dailyReception.toFixed(2)) : "",
    r.unitDailyReception !== undefined ? Number(r.unitDailyReception.toFixed(2)) : "",
    r.receptionThreshold !== undefined ? Number(r.receptionThreshold.toFixed(2)) : "",
    r.receptionOk === undefined ? "" : r.receptionOk ? "达标" : "不足",
    r.rank ?? "",
    r.poolSize ?? "",
    r.percentile !== undefined ? `${(r.percentile * 100).toFixed(1)}%` : "",
    r.participationRatio !== undefined ? `${(r.participationRatio * 100).toFixed(1)}%` : "",
    r.tierLabel ?? "",
    r.leaveDays ?? "",
    r.currentLevel !== undefined ? cfg.levelNames[r.currentLevel] : "",
    r.currentSalary ?? "",
    r.leaveCapped ? "是" : "",
    r.evaluatedLevel !== undefined ? cfg.levelNames[r.evaluatedLevel] : "",
    r.evaluatedSalary ?? "",
    r.grade ?? "",
    r.monthlySalary ?? "",
    r.rawSalary !== null && r.rawSalary !== undefined ? Number(r.rawSalary.toFixed(2)) : "",
    r.salaryBand ? `[${r.salaryBand.lo}, ${r.salaryBand.hi})` : "",
    r.trace,
    r.notes.join(" ; "),
    r.errors.join(" ; "),
  ];
}

export function exportCsResults(out: CsComputeOutput, cfg: CsPositionConfig): void {
  const monthsTag = MONTH_LABELS.join("/");
  const header: string[] = [
    "行号", "姓名", "部门", "组别",
    "参评定薪",
    "有效月份",
    "指标1",
    `指标1值(${monthsTag})`,
    `指标1目标值(${monthsTag})`,
    `指标1月度完成率(${monthsTag})`,
    "指标1季度完成率",
    "指标1季度均值",
    "指标2",
    `指标2值(${monthsTag})`,
    `指标2目标值(${monthsTag})`,
    `指标2月度完成率(${monthsTag})`,
    "指标2季度完成率",
    "指标2季度均值",
    "综合完成率(季度)",
    `接待量(${monthsTag})`,
    "接待量季度合计",
    "季度出勤天数",
    "个人日均接待量",
    "组内日均接待量",
    "日均门槛(×90%)",
    "日均是否达标",
    "排名", "排名人数", "排名分位", "参评比例", "参评档位",
    "季度事假天数", "当前级别", "当前月薪", "事假封顶",
    "评定级别(封顶前)", "评定月薪(封顶前)",
    "岗位评定", "次季度月薪(元)", "取百前薪资", "对应薪资区间",
    "计算依据", "提示", "错误",
  ];
  const rows: unknown[][] = [header, ...out.results.map((r) => csResultRow(r, cfg))];
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
