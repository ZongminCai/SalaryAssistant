import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { CS_CONFIGS } from "./config";
import { buildCsTemplate, parseCsUpload } from "./excel";
import { computeCs } from "./compute";

const CFG = CS_CONFIGS.ecomgroup_cs;

function fileFromAb(ab: ArrayBuffer, name: string): File {
  return new File([ab], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** 把若干数据行（按列顺序）写入模板的「员工信息」sheet，从第 3 行起 */
function writeRows(rows: unknown[][]): ArrayBuffer {
  const ab = buildCsTemplate(CFG);
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

/**
 * 模板列顺序（24 列）：
 * 0 姓名, 1 部门, 2 组别,
 * 3-5 转化率-月1/2/3, 6-8 客户满意度-月1/2/3, 9-11 客服服务分-月1/2/3, 12-14 响应时间-月1/2/3,
 * 15-17 接待量-月1/2/3,
 * 18 季度出勤天数, 19 季度事假天数, 20 当前级别, 21 当前月薪,
 * 22 专家进阶达成, 23 是否参与评级定薪
 */

describe("电商事业群客服接待岗 — 模板结构", () => {
  it("仅 1 个客服配置，模板含「员工信息」「填写说明」两个 sheet 与全部列", () => {
    expect(Object.keys(CS_CONFIGS)).toEqual(["ecomgroup_cs"]);
    for (const cfg of Object.values(CS_CONFIGS)) {
      const wb = XLSX.read(buildCsTemplate(cfg), { type: "array" });
      expect(wb.SheetNames).toContain("员工信息");
      expect(wb.SheetNames).toContain("填写说明");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["员工信息"], { defval: "" });
      const headerKeys = Object.keys(rows[0] ?? {});
      for (const c of cfg.columns) expect(headerKeys, `缺列 ${c.label}`).toContain(c.label);
    }
  });

  it("列头顺序与 V2.0 模板一致（月度列展开 + 新增单值列）", () => {
    const wb = XLSX.read(buildCsTemplate(CFG), { type: "array" });
    const ws = wb.Sheets["员工信息"];
    const header = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0]) as string[];
    expect(header).toEqual([
      "姓名", "部门", "组别",
      "转化率-月1", "转化率-月2", "转化率-月3",
      "客户满意度-月1", "客户满意度-月2", "客户满意度-月3",
      "客服服务分-月1", "客服服务分-月2", "客服服务分-月3",
      "响应时间-月1", "响应时间-月2", "响应时间-月3",
      "接待量-月1", "接待量-月2", "接待量-月3",
      "季度出勤天数", "季度事假天数", "当前级别", "当前月薪",
      "专家进阶达成", "是否参与评级定薪",
    ]);
  });

  it("填写说明 sheet 覆盖 4 部门组别映射与 V2.0 关键规则", () => {
    const wb = XLSX.read(buildCsTemplate(CFG), { type: "array" });
    const text = XLSX.utils.sheet_to_csv(wb.Sheets["填写说明"]);
    for (const dept of CFG.depts) expect(text).toContain(dept);
    expect(text).toContain("京东-京东组");
    expect(text).toContain("抖音-综合组");
    expect(text).toContain("×90%");
    expect(text).toContain("季度事假天数");
    expect(text).toContain("中级基准线");
  });
});

describe("电商事业群客服接待岗 — 解析与计算圆环", () => {
  it("抖音-售前组一行：转化率/响应时间两指标（3 个月）→ 解析并计算（≤3人用基准线目标值）", async () => {
    const ab = writeRows([[
      "丙", "抖音服务部", "抖音-售前组",
      0.50, 0.50, 0.50,
      "", "", "",
      "", "", "",
      12, 12, 12,
      1000, 1000, 1000,
      60, "", "", "",
      "是", "",
    ]]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "dy.xlsx"), CFG);
    expect(fileErrors).toEqual([]);
    expect(employees.length).toBe(1);
    const e = employees[0];
    expect(e.__parseErrors).toEqual([]);
    expect(e.dept).toBe("抖音服务部");
    expect(e.group).toBe("抖音-售前组");
    expect(e.values["转化率"]).toEqual([50, 50, 50]);
    expect(e.values["响应时间"]).toEqual([12, 12, 12]);
    expect(e.values["客户满意度"]).toBeUndefined();
    expect(e.reception).toEqual([1000, 1000, 1000]);
    expect(e.attendanceDays).toBe(60);
    expect(e.leaveDays).toBeUndefined();
    expect(e.currentLevel).toBeUndefined();
    expect(e.currentSalary).toBeUndefined();
    expect(e.expertAdvance).toBe(true);
    expect(e.participate).toBe(true);

    const out = computeCs(employees, CFG, { 抖音服务部: 1 });
    const r = out.results[0];
    expect(r.errors).toEqual([]);
    // 单人组 → 可参评≤3 且当月人数≤3 → 目标值取中级基准线（46 / 15）
    expect(r.ind1?.label).toBe("转化率");
    expect(r.ind1?.monthly[0].target).toBe("baseline");
    expect(r.ind1?.monthly[0].mean).toBeCloseTo(46, 6);
    expect(r.ind2?.label).toBe("响应时间");
    expect(r.ind2?.monthly[0].mean).toBeCloseTo(15, 6);
    // 日均门槛：个人 3000/60=50 ≥ 组内 50×90%=45 → 达标
    expect(r.dailyReception).toBeCloseTo(50, 6);
    expect(r.receptionThreshold).toBeCloseTo(45, 6);
    expect(r.receptionOk).toBe(true);
    // 单人 → 分位0 → 专家上限；专家基准线(54,10)未达 → 高级基准线(50,12)：conv 50≥50、resp 12≤12 → 高级
    expect(r.grade).toBe("高级销售/产品顾问");
    expect(r.monthlySalary).not.toBeNull();
  });

  it("京东-京东组：客户满意度+转化率（均正向、无响应时间）→ 独立部门解析计算", async () => {
    const ab = writeRows([[
      "丁", "京东服务部", "京东-京东组",
      0.99, 0.99, 0.99,
      0.99, 0.99, 0.99,
      "", "", "",
      "", "", "",
      1200, 1200, 1200,
      60, 0, "", "",
      "否", "",
    ]]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "jd.xlsx"), CFG);
    expect(fileErrors).toEqual([]);
    expect(employees[0].__parseErrors).toEqual([]);
    expect(employees[0].values["客户满意度"]).toEqual([99, 99, 99]);
    expect(employees[0].values["转化率"]).toEqual([99, 99, 99]);
    expect(employees[0].values["响应时间"]).toBeUndefined();
    expect(employees[0].leaveDays).toBe(0);

    const out = computeCs(employees, CFG, { 京东服务部: 1 });
    const r = out.results[0];
    expect(r.errors).toEqual([]);
    expect(r.ind1?.label).toBe("客户满意度");
    expect(r.ind2?.label).toBe("转化率");
    // 单人 → 基准线目标值（90 / 35）；conv 99/35>1.2 → 月度封顶
    expect(r.ind1?.monthly[0].target).toBe("baseline");
    expect(r.ind2?.monthly[0].capped).toBe(true);
    // 专家基准线(99,42)达标但 进阶=否 → 高级(95,38)
    expect(r.grade).toBe("高级销售/产品顾问");
  });

  it("接待量月2留空 → ind1/ind2 完整故 validMonths=3，正常参与评级", async () => {
    const ab = writeRows([[
      "戊", "天猫服务部", "标准服务组",
      "", "", "",
      0.96, 0.96, 0.96,
      "", "", "",
      15, 15, 15,
      1000, "", 1000,
      60, "", "", "",
      "否", "",
    ]]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "tm-miss.xlsx"), CFG);
    expect(fileErrors).toEqual([]);
    expect(employees[0].reception).toEqual([1000, undefined, 1000]);
    const out = computeCs(employees, CFG, { 天猫服务部: 1 });
    expect(out.results[0].errors).toEqual([]);
    expect(out.results[0].validMonths).toBe(3);
    expect(out.results[0].grade).not.toBeNull();
    expect(out.results[0].monthlySalary).not.toBeNull();
    // 日均口径：季度合计 2000 ÷ 出勤 60
    expect(out.results[0].receptionTotal).toBe(2000);
    expect(out.results[0].dailyReception).toBeCloseTo(2000 / 60, 6);
  });

  it("「季度出勤天数」缺失 → 行级解析错误，计算也报错", async () => {
    const ab = writeRows([[
      "己", "天猫服务部", "标准服务组",
      "", "", "",
      0.96, 0.96, 0.96,
      "", "", "",
      15, 15, 15,
      1000, 1000, 1000,
      "", "", "", "",
      "否", "",
    ]]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "no-att.xlsx"), CFG);
    expect(fileErrors).toEqual([]);
    expect(employees[0].attendanceDays).toBeUndefined();
    expect(employees[0].__parseErrors.join(" ")).toMatch(/季度出勤天数/);
    const out = computeCs(employees, CFG, { 天猫服务部: 1 });
    expect(out.results[0].errors.join(" ")).toMatch(/出勤天数/);
    expect(out.results[0].grade).toBeNull();
  });

  it("「当前级别」「当前月薪」「季度事假天数」合法值解析；非法值报行级错误", async () => {
    const ab = writeRows([
      // 合法：事假 6 天 + 当前级别（中级）+ 当前月薪
      [
        "庚", "天猫服务部", "标准服务组",
        "", "", "",
        0.96, 0.96, 0.96,
        "", "", "",
        15, 15, 15,
        1000, 1000, 1000,
        60, 6, "中级销售/产品顾问", 4200,
        "否", "",
      ],
      // 非法：当前级别不在枚举内、当前月薪为负
      [
        "辛", "天猫服务部", "标准服务组",
        "", "", "",
        0.96, 0.96, 0.96,
        "", "", "",
        15, 15, 15,
        1000, 1000, 1000,
        60, 1, "超级顾问", -100,
        "否", "",
      ],
    ]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "cur.xlsx"), CFG);
    expect(fileErrors).toEqual([]);
    const ok = employees[0];
    expect(ok.__parseErrors).toEqual([]);
    expect(ok.leaveDays).toBe(6);
    expect(ok.currentLevel).toBe("middle");
    expect(ok.currentSalary).toBe(4200);
    const bad = employees[1];
    expect(bad.__parseErrors.join(" ")).toMatch(/当前级别/);
    expect(bad.__parseErrors.join(" ")).toMatch(/当前月薪/);
    expect(bad.currentLevel).toBeUndefined();
    expect(bad.currentSalary).toBeUndefined();
  });

  it("「是否参与评级定薪=否」的行解析为 participate=false，不入排名池", async () => {
    const ab = writeRows([
      [
        "甲", "天猫服务部", "标准服务组",
        "", "", "",
        0.96, 0.96, 0.96,
        "", "", "",
        15, 15, 15,
        1000, 1000, 1000,
        60, "", "", "",
        "否", "是",
      ],
      [
        "乙", "天猫服务部", "标准服务组",
        "", "", "",
        0.94, 0.94, 0.94,
        "", "", "",
        16, 16, 16,
        1000, 1000, 1000,
        60, "", "", "",
        "否", "否",
      ],
    ]);
    const { employees, fileErrors } = await parseCsUpload(fileFromAb(ab, "np.xlsx"), CFG);
    expect(fileErrors).toEqual([]);
    expect(employees[0].participate).toBe(true);
    expect(employees[1].participate).toBe(false);
    const out = computeCs(employees, CFG, { 天猫服务部: 1 });
    const a = out.results.find((r) => r.name === "甲")!;
    const b = out.results.find((r) => r.name === "乙")!;
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(b.participate).toBe(false);
    expect(b.monthlySalary).toBeNull();
    expect(b.grade).toBeNull();
    expect(a.poolSize).toBe(1);
    expect(out.participation.find((p) => p.dept === "天猫服务部")!.participants).toBe(1);
  });
});
