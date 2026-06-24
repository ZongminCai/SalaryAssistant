import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { CS_CONFIGS } from "./config";
import { buildCsTemplate, parseCsUpload } from "./excel";
import { computeCs } from "./compute";

function fileFromAb(ab: ArrayBuffer, name: string): File {
  return new File([ab], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** 把若干数据行（按列顺序）写入模板的「员工信息」sheet，从第 3 行起 */
function writeRows(cfg: (typeof CS_CONFIGS)[keyof typeof CS_CONFIGS], rows: unknown[][]): ArrayBuffer {
  const ab = buildCsTemplate(cfg);
  const wb = XLSX.read(ab, { type: "array" });
  const ws = wb.Sheets["员工信息"];
  rows.forEach((row, ri) => {
    row.forEach((val, ci) => {
      const ref = XLSX.utils.encode_cell({ r: 2 + ri, c: ci });
      ws[ref] = { v: val as never, t: typeof val === "number" ? "n" : "s" };
    });
  });
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("客服 Excel 模板 → 解析 → 计算 圆环", () => {
  it("两个岗位模板都含「员工信息」「填写说明」两个 sheet 与全部列", () => {
    for (const cfg of Object.values(CS_CONFIGS)) {
      const wb = XLSX.read(buildCsTemplate(cfg), { type: "array" });
      expect(wb.SheetNames).toContain("员工信息");
      expect(wb.SheetNames).toContain("填写说明");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["员工信息"], { defval: "" });
      const headerKeys = Object.keys(rows[0] ?? {});
      for (const c of cfg.columns) expect(headerKeys, `${cfg.label} 缺列 ${c.label}`).toContain(c.label);
    }
  });

  it("电商四部：填 2 行真实数据（3 个月）→ 解析并计算出级别", async () => {
    const cfg = CS_CONFIGS.ecom4_cs;
    // 列顺序：姓名, 客户满意度-月1/2/3, 转化率-月1/2/3, 接待量-月1/2/3, 专家进阶达成
    const ab = writeRows(cfg, [
      ["甲", 96, 96, 96, 56, 56, 56, 1000, 1000, 1000, "否"],
      ["乙", 94, 94, 94, 52, 52, 52, 1000, 1000, 1000, "否"],
    ]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "ecom4.xlsx"), cfg);
    expect(fileErrors).toEqual([]);
    expect(employees.length).toBe(2);
    expect(employees[0].values["客户满意度"]).toEqual([96, 96, 96]);
    expect(employees[0].values["转化率"]).toEqual([56, 56, 56]);
    expect(employees[0].reception).toEqual([1000, 1000, 1000]);
    const out = computeCs(employees, cfg, { 电商四部: 2 });
    expect(out.results.every((r) => r.errors.length === 0)).toBe(true);
    expect(out.results.every((r) => r.monthlySalary !== null)).toBe(true);
  });

  it("吉林：抖音售前组一行 → 只填转化率/响应时间两列（3 个月）也能正确解析与计算", async () => {
    const cfg = CS_CONFIGS.jilin_cs;
    // 列顺序：姓名, 部门, 组别, 转化率×3, 客户满意度×3, 客服服务分×3, 响应时间×3, 接待量×3, 专家进阶达成
    const ab = writeRows(cfg, [[
      "丙", "抖音", "客服一组-售前组",
      50, 50, 50,
      "", "", "",
      "", "", "",
      12, 12, 12,
      1000, 1000, 1000,
      "是",
    ]]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "jilin.xlsx"), cfg);
    expect(fileErrors).toEqual([]);
    expect(employees.length).toBe(1);
    expect(employees[0].dept).toBe("抖音");
    expect(employees[0].values["转化率"]).toEqual([50, 50, 50]);
    expect(employees[0].values["响应时间"]).toEqual([12, 12, 12]);
    expect(employees[0].values["客户满意度"]).toBeUndefined();
    expect(employees[0].reception).toEqual([1000, 1000, 1000]);
    const out = computeCs(employees, cfg, { 抖音: 1 });
    const r = out.results[0];
    expect(r.errors).toEqual([]);
    // 单人 → 月度完成率100%、季度100%、分位0 → 专家上限；进阶达成=是、转化率基准(54)未达 → 高级
    expect(r.ind2?.label).toBe("响应时间");
    expect(r.grade).toBe("高级销售/产品顾问");
  });

  it("电商四部：月2 接待量留空 → parseCsUpload 能读出部分月份；computeCs 报接待量需填三个月", async () => {
    const cfg = CS_CONFIGS.ecom4_cs;
    const ab = writeRows(cfg, [
      ["丁", 96, 96, 96, 56, 56, 56, 1000, "", 1000, "否"],
    ]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "ecom4-miss.xlsx"), cfg);
    expect(fileErrors).toEqual([]);
    expect(employees[0].reception).toEqual([1000, undefined, 1000]);
    const out = computeCs(employees, cfg, { 电商四部: 1 });
    expect(out.results[0].errors.join(" ")).toMatch(/接待量.*月1.*月2.*月3/);
    expect(out.results[0].grade).toBeNull();
  });

  it("电商四部：「是否参与评级定薪=否」的行被解析为 participate=false，不入排名池", async () => {
    const cfg = CS_CONFIGS.ecom4_cs;
    // 列序：姓名, 客户满意度-月1/2/3, 转化率-月1/2/3, 接待量-月1/2/3, 专家进阶达成, 是否参与评级定薪
    const ab = writeRows(cfg, [
      ["甲", 96, 96, 96, 56, 56, 56, 1000, 1000, 1000, "否", "是"],
      ["乙", 94, 94, 94, 54, 54, 54, 1000, 1000, 1000, "否", "否"],
    ]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "ecom4-np.xlsx"), cfg);
    expect(fileErrors).toEqual([]);
    expect(employees[0].participate).toBe(true);
    expect(employees[1].participate).toBe(false);
    const out = computeCs(employees, cfg, { 电商四部: 1 });
    const a = out.results.find((r) => r.name === "甲")!;
    const b = out.results.find((r) => r.name === "乙")!;
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(b.participate).toBe(false);
    expect(b.monthlySalary).toBeNull();
    expect(b.grade).toBeNull();
    expect(a.poolSize).toBe(1);
    expect(out.participation[0].participants).toBe(1);
  });
});
