import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { PositionKey } from "../calc/types";
import { POSITION_CONFIGS, POSITION_LIST } from "../positions/registry";
import {
  POSITION_COLUMN_LABEL,
  resolvePosition,
  UNIFIED_FIELDS,
  UNIFIED_TEMPLATE_SPEC,
} from "../positions/unified";
import { buildTemplate } from "./template";
import { parseUnifiedUpload, parseUpload } from "./parse";
import { computeOne } from "../calc/compute";
import { buildUnifiedWorkbook } from "./export";

function makeFileFromArrayBuffer(ab: ArrayBuffer, name: string): File {
  return new File([ab], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function cellType(v: unknown): string {
  if (typeof v === "number") return "n";
  if (typeof v === "boolean") return "b";
  return "s";
}

/** 往 sheet 的指定行（0 基）按表头顺序写值 */
function writeRow(ws: XLSX.WorkSheet, headers: string[], values: unknown[], r: number): void {
  for (let c = 0; c < headers.length; c++) {
    ws[XLSX.utils.encode_cell({ r, c })] = { v: values[c], t: cellType(values[c]) };
  }
}

/** 9 岗位各一行有效数据（key → 值），统一/旧管道共用 */
const CASES: { key: PositionKey; values: Record<string, unknown> }[] = [
  { key: "livestream_ops", values: { level: "直播运营专员", perf_personal: 150, per_capita_value: 30 } },
  { key: "video_ops", values: { level: "视频运营专员", perf_personal: 250, per_capita_value: 50 } },
  { key: "cross_border_ops", values: { region: "西安", level: "专员", perf_personal: 320, probation: "否" } },
  { key: "mall_ops", values: { level: "组长", perf_personal: 600, perf_team: 1200, span_of_control: 5 } },
  { key: "product_ops", values: { dept: "其他部门", level: "专员", perf_personal: 300, probation: "是" } },
  { key: "jd_product_ops", values: { level: "管培生", education: "普通硕士" } },
  { key: "business_bd", values: { level: "主管", perf_personal: 250 } },
  { key: "video_content", values: { perf_personal: 500 } },
  { key: "livestream_host", values: { account_type: "官旗", perf_personal: 350, monthly_net_sales: 55 } },
];

const UNIFIED_HEADERS = UNIFIED_FIELDS.map((f) => f.label);

/** 统一模板 + 若干数据行（写在 9 行示例之后） */
async function unifiedFileWithRows(rows: Record<string, unknown>[]): Promise<File> {
  const ab = buildTemplate(UNIFIED_TEMPLATE_SPEC);
  const wb = XLSX.read(ab, { type: "array" });
  const ws = wb.Sheets["员工信息"];
  const exampleCount = UNIFIED_TEMPLATE_SPEC.exampleRows?.length ?? 0;
  rows.forEach((row, i) => {
    const values = UNIFIED_HEADERS.map((_, c) => {
      const key = UNIFIED_FIELDS[c].key;
      if (key === "name") return row.name;
      if (key === "position") return row.position;
      return row[key] ?? "";
    });
    writeRow(ws, UNIFIED_HEADERS, values, 1 + exampleCount + i);
  });
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return makeFileFromArrayBuffer(out, "unified.xlsx");
}

/** 旧岗位模板 + 一行数据（第 3 行） */
async function legacyFileWithRow(key: PositionKey, values: Record<string, unknown>, name: string): Promise<File> {
  const cfg = POSITION_CONFIGS[key];
  const ab = buildTemplate(cfg);
  const wb = XLSX.read(ab, { type: "array" });
  const ws = wb.Sheets["员工信息"];
  const headers = cfg.fields.map((f) => f.label);
  const row = cfg.fields.map((f) => (f.key === "name" ? name : (values[f.key] ?? "")));
  writeRow(ws, headers, row, 2);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return makeFileFromArrayBuffer(out, "legacy.xlsx");
}

describe("统一模板结构", () => {
  it("Sheet1 为 13 列统一表头 + 9 行分岗位示例", () => {
    const ab = buildTemplate(UNIFIED_TEMPLATE_SPEC);
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets["员工信息"];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    expect(Object.keys(rows[0] ?? {})).toEqual(UNIFIED_HEADERS);
    expect(UNIFIED_HEADERS).toHaveLength(13);
    expect(UNIFIED_HEADERS[1]).toBe(POSITION_COLUMN_LABEL);
    const exampleRows = rows.slice(0, 9);
    expect(exampleRows).toHaveLength(9);
    for (const r of exampleRows) {
      expect(String(r["姓名"])).toMatch(/^示例/);
    }
    // 9 行示例覆盖全部岗位
    const covered = new Set(exampleRows.map((r) => String(r[POSITION_COLUMN_LABEL])));
    expect(covered.size).toBe(9);
  });

  it("Sheet2 含 字段×岗位矩阵 / 个人业绩口径 / 别名表", () => {
    const ab = buildTemplate(UNIFIED_TEMPLATE_SPEC);
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets["填写说明"];
    const text = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })
      .map((r) => r.join("|"))
      .join("\n");
    expect(text).toContain("字段 × 岗位 适用矩阵");
    expect(text).toContain("个人业绩口径（按岗位）");
    expect(text).toContain("员工岗位 别名表");
  });
});

describe("统一解析 → 计算", () => {
  it("9 岗位混排：示例行跳过、逐行定岗正确", async () => {
    const rows = CASES.map((c, i) => ({
      name: `员工${i}`,
      position: POSITION_CONFIGS[c.key].label,
      ...c.values,
    }));
    const file = await unifiedFileWithRows(rows);
    const { employees, fileErrors } = await parseUnifiedUpload(file);
    expect(fileErrors).toEqual([]);
    expect(employees).toHaveLength(9);
    employees.forEach((e, i) => {
      expect(e.position).toBe(CASES[i].key);
    });
    const results = employees.map(computeOne);
    results.forEach((r, i) => {
      expect(r.position_label).toBe(POSITION_CONFIGS[CASES[i].key].label);
    });
  });

  it("等价性：统一管道与旧管道逐岗位结果一致", async () => {
    for (let i = 0; i < CASES.length; i++) {
      const { key, values } = CASES[i];
      const name = `等价${i}`;
      const unifiedFile = await unifiedFileWithRows([{ name, position: POSITION_CONFIGS[key].label, ...values }]);
      const { employees: eu, fileErrors: feu } = await parseUnifiedUpload(unifiedFile);
      expect(feu, `${key} 统一解析文件级错误`).toEqual([]);
      expect(eu, `${key} 统一解析行数`).toHaveLength(1);
      const ru = computeOne(eu[0]);

      const legacyFile = await legacyFileWithRow(key, values, name);
      const { employees: el, fileErrors: fel } = await parseUpload(legacyFile, POSITION_CONFIGS[key]);
      expect(fel, `${key} 旧解析文件级错误`).toEqual([]);
      expect(el, `${key} 旧解析行数`).toHaveLength(1);
      const rl = computeOne(el[0]);

      expect(ru.errors, `${key} 统一管道错误`).toEqual(rl.errors);
      expect(ru.grade, `${key} 评定`).toBe(rl.grade);
      expect(ru.monthly_salary, `${key} 月薪`).toBe(rl.monthly_salary);
      expect(ru.incentive, `${key} 激励`).toBe(rl.incentive);
    }
  });

  it("岗位列无法识别：行级报错并列出合法值", async () => {
    const file = await unifiedFileWithRows([{ name: "张三", position: "神秘岗", perf_personal: 100 }]);
    const { employees } = await parseUnifiedUpload(file);
    expect(employees).toHaveLength(1);
    const r = computeOne(employees[0]);
    const msg = r.errors.join(" ");
    expect(msg).toContain(POSITION_COLUMN_LABEL);
    expect(msg).toContain("跨境运营岗");
  });

  it("跨境缺地域：行级必填报错", async () => {
    const file = await unifiedFileWithRows([
      { name: "李四", position: "跨境运营岗", level: "专员", perf_personal: 320 },
    ]);
    const { employees } = await parseUnifiedUpload(file);
    const r = computeOne(employees[0]);
    expect(r.errors.join(" ")).toMatch(/地域/);
  });

  it("跨境缺职级：行级报错且不得静默按专员出薪", async () => {
    const file = await unifiedFileWithRows([
      { name: "王五", position: "跨境运营岗", region: "西安", perf_personal: 320 },
    ]);
    const { employees } = await parseUnifiedUpload(file);
    const r = computeOne(employees[0]);
    expect(r.errors.join(" ")).toMatch(/职级/);
    expect(r.monthly_salary).toBeNull();
  });

  it("商城组长缺团队业绩：条件必填行级报错", async () => {
    const file = await unifiedFileWithRows([
      { name: "赵六", position: "抖音/快手商城运营岗", level: "组长", perf_personal: 600, span_of_control: 5 },
    ]);
    const { employees } = await parseUnifiedUpload(file);
    const r = computeOne(employees[0]);
    expect(r.errors.join(" ")).toMatch(/团队季度月均销售额/);
  });

  it("枚举按岗位子集校验：跨境填主管报错", async () => {
    const file = await unifiedFileWithRows([
      { name: "孙七", position: "跨境运营岗", region: "西安", level: "主管", perf_personal: 320 },
    ]);
    const { employees } = await parseUnifiedUpload(file);
    const r = computeOne(employees[0]);
    expect(r.errors.join(" ")).toMatch(/职级」必须为/);
  });

  it("管培生业绩豁免：perf_personal 留空不报必填", async () => {
    const file = await unifiedFileWithRows([
      { name: "周八", position: "京东产品运营岗", level: "管培生", education: "普通硕士" },
    ]);
    const { employees } = await parseUnifiedUpload(file);
    const r = computeOne(employees[0]);
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("运营管培生");
    expect(r.monthly_salary).toBe(8000);
  });

  it("主播岗两项业绩全空：行级报错", async () => {
    const file = await unifiedFileWithRows([{ name: "吴九", position: "主播岗", account_type: "官旗" }]);
    const { employees } = await parseUnifiedUpload(file);
    const r = computeOne(employees[0]);
    expect(r.errors.join(" ")).toMatch(/主播岗需至少填/);
  });

  it("旧岗位模板误传统一入口：文件级指引", async () => {
    const file = await legacyFileWithRow("cross_border_ops", { region: "西安", level: "专员", perf_personal: 320 }, "张三");
    const { employees, fileErrors } = await parseUnifiedUpload(file);
    expect(employees).toEqual([]);
    expect(fileErrors.join(" ")).toContain(POSITION_COLUMN_LABEL);
  });
});

describe("岗位别名", () => {
  it("label / shortLabel / 别名 / 带空格 均可定岗", () => {
    expect(resolvePosition("跨境运营岗")).toEqual({ key: "cross_border_ops" });
    expect(resolvePosition("跨境运营")).toEqual({ key: "cross_border_ops" });
    expect(resolvePosition("京东")).toEqual({ key: "jd_product_ops" });
    expect(resolvePosition("  商务岗  ")).toEqual({ key: "business_bd" });
    expect(resolvePosition("天猫拼多多")).toEqual({ key: "product_ops" });
  });

  it("空值与未知值报错", () => {
    expect("error" in resolvePosition("")).toBe(true);
    expect("error" in resolvePosition(undefined)).toBe(true);
    const r = resolvePosition("不存在岗");
    expect("error" in r).toBe(true);
  });
});

describe("统一导出工作簿", () => {
  it("混排单 sheet：第 2 列员工岗位、含月度激励列、无错误时不生成错误行 sheet", async () => {
    const rows = CASES.map((c, i) => ({
      name: `员工${i}`,
      position: POSITION_CONFIGS[c.key].label,
      ...c.values,
    }));
    const file = await unifiedFileWithRows(rows);
    const { employees } = await parseUnifiedUpload(file);
    const results = employees.map(computeOne);
    const wb = buildUnifiedWorkbook(results);
    expect(wb.SheetNames).toEqual(["评级结果"]);
    const ws = wb.Sheets["评级结果"];
    const out = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const header = Object.keys(out[0] ?? {});
    expect(header[0]).toBe("行号");
    expect(header[1]).toBe("姓名");
    expect(header[2]).toBe(POSITION_COLUMN_LABEL);
    expect(header).toContain("月度激励(元)");
    expect(out).toHaveLength(9);
    // 岗位列回显 position_label
    expect(String(out[0]?.[POSITION_COLUMN_LABEL])).toBe(POSITION_CONFIGS[CASES[0].key].label);
    // 月度激励仅主播岗行有值
    const incentives = out.map((r) => r["月度激励(元)"]);
    expect(incentives.filter((v) => v !== "")).toHaveLength(1);
  });

  it("有错误行时生成「错误行」sheet", async () => {
    const file = await unifiedFileWithRows([
      { name: "张三", position: "神秘岗" },
      { name: "李四", position: "商务岗", level: "专员", perf_personal: 250 },
    ]);
    const { employees } = await parseUnifiedUpload(file);
    const results = employees.map(computeOne);
    const wb = buildUnifiedWorkbook(results);
    expect(wb.SheetNames).toContain("错误行");
    const err = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["错误行"], { defval: "" });
    expect(err).toHaveLength(1); // sheet_to_json 不含表头：1 个错误行
  });
});

describe("统一字段并集完整性", () => {
  it("每个岗位的每个字段都能在统一列中找到", () => {
    for (const cfg of POSITION_LIST) {
      for (const f of cfg.fields) {
        expect(
          UNIFIED_FIELDS.some((u) => u.key === f.key),
          `${cfg.label} 字段 ${f.key} 未纳入统一列`,
        ).toBe(true);
      }
    }
  });
});
