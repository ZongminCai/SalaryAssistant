import { describe, expect, it } from "vitest";
import { computeCs } from "./compute";
import { CS_CONFIGS } from "./config";
import { MONTH_COUNT } from "./types";
import type { CsEmployee, CsLevel } from "./types";

/** 把单值复制成 3 个月数组（用于「全季度同值」的简化测试输入） */
function rep(v: number): number[] {
  return Array.from({ length: MONTH_COUNT }, () => v);
}

let __row = 0;
function nextRow(): number {
  return ++__row;
}

interface EmpInput {
  name: string;
  dept: string;
  group: string;
  values: Record<string, (number | undefined)[]>;
  rec: (number | undefined)[];
  /** 季度出勤天数，默认 60；显式传 undefined 模拟缺失 */
  att?: number;
  leave?: number;
  currentLevel?: CsLevel;
  currentSalary?: number;
  expert?: boolean;
  participate?: boolean;
}
function emp(e: EmpInput): CsEmployee {
  const values: Record<string, (number | undefined)[]> = {};
  for (const [k, v] of Object.entries(e.values)) values[k] = [...v];
  return {
    name: e.name,
    dept: e.dept,
    group: e.group,
    values,
    reception: [...e.rec],
    attendanceDays: "att" in e ? e.att : 60,
    leaveDays: e.leave,
    currentLevel: e.currentLevel,
    currentSalary: e.currentSalary,
    expertAdvance: e.expert,
    participate: e.participate,
    __rowIndex: nextRow(),
    __parseErrors: [],
  };
}

const CFG = CS_CONFIGS.ecomgroup_cs;
const TM = "天猫服务部";
const DY = "抖音服务部";
const JD = "京东服务部";

/** 天猫服务部·标准服务组（客户满意度/响应时间）的常用构造 */
function tmEmp(name: string, sat: number, resp: number, extra: Partial<EmpInput> = {}): CsEmployee {
  return emp({
    name,
    dept: TM,
    group: "标准服务组",
    values: { 客户满意度: rep(sat), 响应时间: rep(resp) },
    rec: rep(1500),
    ...extra,
  });
}

describe("电商事业群客服接待岗 — 基础流程", () => {
  it("多人完整核算：综合完成率/排名/参评档位/最终级别与薪资区间", () => {
    // 标准服务组 4 人：均值 sat=94.75，resp=12.5
    const employees = [
      tmEmp("A", 99, 10, { expert: true }),
      tmEmp("B", 96, 12),
      tmEmp("C", 94, 13),
      tmEmp("D", 90, 15),
    ];
    const out = computeCs(employees, CFG, { [TM]: 4 });
    expect(out.results).toHaveLength(4);
    out.results.forEach((r) => expect(r.errors).toEqual([]));

    const a = out.results.find((r) => r.name === "A")!;
    expect(a.ind1?.label).toBe("客户满意度");
    expect(a.ind1?.rate).toBeCloseTo(99 / 94.75, 6);
    // 响应时间为逆向：rate = 2 - 10/12.5 = 1.2（恰好等于上限，不封顶）
    expect(a.ind2?.rate).toBeCloseTo(1.2, 6);
    expect(a.ind2?.monthly[0].capped).toBe(false);
    expect(a.combinedRate).toBeCloseTo((99 / 94.75) * 0.5 + 1.2 * 0.5, 6);
    expect(a.rank).toBe(1);

    // 参评 4/4=100%，tier1，expert 上限分位=0.03 → A(p=0)可达专家
    expect(a.tierLabel).toContain("＞80%");
    expect(a.ceilingLevel).toBe("expert");
    // A 满足专家基准线（sat≥99、resp≤14）+ 日均接待量达标 + 进阶=是 → 专家
    expect(a.finalLevel).toBe("expert");
    expect(a.salaryBand).toEqual({ lo: 5000, hi: 5500 });

    // 末位 D：分位=0.75 > middle(0.25) → junior 上限
    const d = out.results.find((r) => r.name === "D")!;
    expect(d.ceilingLevel).toBe("junior");
    expect(d.finalLevel).toBe("junior");
    expect(d.salaryBand).toEqual({ lo: 3200, hi: 4000 });
  });

  it("部门与组别不匹配 → 报错（含已取消的优+服务组）", () => {
    const employees = [
      emp({
        name: "X",
        dept: TM,
        group: "优+服务组", // V2.0 已取消
        values: { 客户满意度: rep(96), 响应时间: rep(15) },
        rec: rep(1500),
      }),
      emp({
        name: "Y",
        dept: TM,
        group: "京东-京东组", // 京东服务部 才有的组
        values: { 客户满意度: rep(96), 转化率: rep(40) },
        rec: rep(1500),
      }),
      emp({
        name: "Z",
        dept: TM,
        group: "物流速询组", // V2.0 已取消
        values: { 客户满意度: rep(96), 响应时间: rep(15) },
        rec: rep(1500),
      }),
    ];
    const out = computeCs(employees, CFG, { [TM]: 3 });
    for (const r of out.results) {
      expect(r.errors.join(" ")).toMatch(/不匹配/);
      expect(r.grade).toBeNull();
    }
  });

  it("京东服务部在部门内独立排名，不与抖音服务部混池；京东-京东组双正向指标", () => {
    const employees = [
      emp({
        name: "J1", dept: JD, group: "京东-京东组",
        values: { 客户满意度: rep(96), 转化率: rep(40) }, rec: rep(1500),
      }),
      emp({
        name: "J2", dept: JD, group: "京东-京东组",
        values: { 客户满意度: rep(92), 转化率: rep(38) }, rec: rep(1500),
      }),
      emp({
        name: "D1", dept: DY, group: "抖音-售前组",
        values: { 转化率: rep(50), 响应时间: rep(13) }, rec: rep(1500),
      }),
      emp({
        name: "D2", dept: DY, group: "抖音-售前组",
        values: { 转化率: rep(46), 响应时间: rep(15) }, rec: rep(1500),
      }),
    ];
    const out = computeCs(employees, CFG, { [JD]: 2, [DY]: 2 });
    const j1 = out.results.find((r) => r.name === "J1")!;
    const j2 = out.results.find((r) => r.name === "J2")!;
    const d1 = out.results.find((r) => r.name === "D1")!;
    expect(j1.errors).toEqual([]);
    // 京东池仅 2 人（不含抖音）
    expect(j1.poolSize).toBe(2);
    expect(j2.poolSize).toBe(2);
    expect(d1.poolSize).toBe(2);
    expect(out.participation.find((p) => p.dept === JD)!.participants).toBe(2);
    // J1: 均值 sat=94、conv=39 → rate 96/94、40/39；p=0 → 专家上限；
    // 专家基准线（99/42）不达 → 高级（95/38：sat 96≥95、conv 40≥38）达标
    expect(j1.rank).toBe(1);
    expect(j1.ceilingLevel).toBe("expert");
    expect(j1.finalLevel).toBe("senior");
    // J2: p=0.5 → junior 上限
    expect(j2.finalLevel).toBe("junior");
  });

  it("抖音-综合组与抖音-售后一组的关键指标/基准线/薪资区间一致", () => {
    const zh = CFG.groups.find((g) => g.group === "抖音-综合组")!;
    const sh1 = CFG.groups.find((g) => g.group === "抖音-售后一组")!;
    expect(zh.ind1).toEqual(sh1.ind1);
    expect(zh.ind2).toEqual(sh1.ind2);
    expect(zh.junior).toEqual(sh1.junior);
    expect(zh.middle).toEqual(sh1.middle);
    expect(zh.senior).toEqual(sh1.senior);
    expect(zh.expert).toEqual(sh1.expert);
  });
});

describe("日均接待量 90% 门槛", () => {
  it("个人日均 < 组内日均×90% → 中级及以上下调并写 notes", () => {
    // 抖音-售后一组 4 人；B 指标好但接待量极低
    const mk = (name: string, sat: number, resp: number, rec: number): CsEmployee =>
      emp({
        name, dept: DY, group: "抖音-售后一组",
        values: { 客户满意度: rep(sat), 响应时间: rep(resp) }, rec: rep(rec),
      });
    const employees = [
      mk("A", 99, 10, 1500),
      mk("B", 96, 11, 600),
      mk("C", 92, 13, 1500),
      mk("D", 88, 16, 1500),
    ];
    const out = computeCs(employees, CFG, { [DY]: 4 });
    const b = out.results.find((r) => r.name === "B")!;
    expect(b.errors).toEqual([]);
    // 组内日均 = (4500+1800+4500+4500)/(60×4) = 63.75；门槛 = 57.375；B 日均 = 1800/60 = 30
    expect(b.unitDailyReception).toBeCloseTo(63.75, 6);
    expect(b.receptionThreshold).toBeCloseTo(57.375, 6);
    expect(b.dailyReception).toBeCloseTo(30, 6);
    expect(b.receptionOk).toBe(false);
    // B 综合完成率排第 2，p=0.25 → 中级上限；基准线达标但日均不足 → 降为初级
    expect(b.ceilingLevel).toBe("middle");
    expect(b.finalLevel).toBe("junior");
    expect(b.notes.join(" ")).toMatch(/日均接待量不足/);
    // A 日均 75 ≥ 57.375 → 达标
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.receptionOk).toBe(true);
  });

  it("季度出勤天数缺失或≤0 → 行级报错", () => {
    const employees = [
      tmEmp("A", 96, 12, { att: undefined }),
      tmEmp("B", 95, 13, { att: 0 }),
    ];
    const out = computeCs(employees, CFG, { [TM]: 2 });
    expect(out.results[0].errors.join(" ")).toMatch(/季度出勤天数/);
    expect(out.results[1].errors.join(" ")).toMatch(/季度出勤天数/);
    expect(out.results[0].grade).toBeNull();
  });
});

describe("事假≥5天取消正向评级（只封上调、下调放行）", () => {
  // 基准场景：A 单人评出 专家级/5000 元（级别内仅自己 → salLo）
  function solo(extra: Partial<EmpInput>): ReturnType<typeof computeCs> {
    return computeCs([tmEmp("A", 99, 10, { expert: true, ...extra })], CFG, { [TM]: 1 });
  }

  it("示例①③：评定级别高于现状 → 按现状级别+现状薪资执行", () => {
    const out = solo({ leave: 5, currentLevel: "junior", currentSalary: 3800 });
    const a = out.results[0];
    expect(a.errors).toEqual([]);
    expect(a.leaveCapped).toBe(true);
    expect(a.evaluatedLevel).toBe("expert");
    expect(a.evaluatedSalary).toBe(5000);
    expect(a.finalLevel).toBe("junior");
    expect(a.grade).toBe("初级销售/产品顾问");
    expect(a.monthlySalary).toBe(3800);
    expect(a.salaryBand).toEqual({ lo: 3200, hi: 4000 });
    expect(a.notes.join(" ")).toMatch(/取消正向评级/);
  });

  it("示例②④：评定结果低于现状 → 正常按评定结果执行（下调放行）", () => {
    const out = solo({ leave: 5, currentLevel: "expert", currentSalary: 5500 });
    const a = out.results[0];
    expect(a.errors).toEqual([]);
    expect(a.leaveCapped).toBeUndefined();
    expect(a.finalLevel).toBe("expert");
    expect(a.monthlySalary).toBe(5000);
  });

  it("示例⑤：级别相同但评定薪资更高 → 按现状薪资执行", () => {
    const out = solo({ leave: 5, currentLevel: "expert", currentSalary: 4800 });
    const a = out.results[0];
    expect(a.leaveCapped).toBe(true);
    expect(a.evaluatedSalary).toBe(5000);
    expect(a.finalLevel).toBe("expert");
    expect(a.monthlySalary).toBe(4800);
  });

  it("事假≥5天但缺「当前级别/当前月薪」→ 报错提示补填", () => {
    const out = solo({ leave: 6 });
    const a = out.results[0];
    expect(a.errors.join(" ")).toMatch(/当前级别/);
    expect(a.errors.join(" ")).toMatch(/当前月薪/);
  });

  it("事假 4 天 → 不封顶，正常按评定结果", () => {
    const out = solo({ leave: 4, currentLevel: "junior", currentSalary: 3800 });
    const a = out.results[0];
    expect(a.leaveCapped).toBeUndefined();
    expect(a.finalLevel).toBe("expert");
    expect(a.monthlySalary).toBe(5000);
  });

  it("事假留空视为 0 → 不封顶", () => {
    const out = solo({});
    const a = out.results[0];
    expect(a.leaveDays).toBeUndefined();
    expect(a.leaveCapped).toBeUndefined();
    expect(a.finalLevel).toBe("expert");
  });
});

describe("小组（可参评≤3人）完成率目标值", () => {
  it("2 人组：目标值 = 组别中级基准线，monthly.target=baseline", () => {
    const employees = [tmEmp("A", 99, 10), tmEmp("B", 91, 14)];
    const out = computeCs(employees, CFG, { [TM]: 2 });
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.errors).toEqual([]);
    // 标准服务组中级基准线：sat 95、resp 18
    expect(a.ind1!.monthly[0].target).toBe("baseline");
    expect(a.ind1!.monthly[0].mean).toBe(95);
    expect(a.ind1!.rate).toBeCloseTo(99 / 95, 6);
    expect(a.ind2!.monthly[0].mean).toBe(18);
    // 2 - 10/18 = 1.444 → 基准线目标值同样 120% 封顶
    expect(a.ind2!.monthly[0].capped).toBe(true);
    expect(a.ind2!.rate).toBeCloseTo(1.2, 6);
    expect(a.notes.join(" ")).toMatch(/可参评人数≤3/);
  });

  it("可参评≤3 但当月有数据人数＞3 → 当月用团队均值", () => {
    // 5 人均仅有月1数据（全部 complete=false → 可参评=0）→ 月1 目标值=当月均值
    const sats = [90, 92, 94, 96, 98];
    const employees = sats.map((s, i) =>
      emp({
        name: `P${i}`, dept: DY, group: "抖音-售后一组",
        values: { 客户满意度: [s, undefined, undefined], 响应时间: [15, undefined, undefined] },
        rec: [1000, undefined, undefined],
      }),
    );
    const out = computeCs(employees, CFG, { [DY]: 5 });
    const p0 = out.results.find((r) => r.name === "P0")!;
    expect(p0.errors).toEqual([]);
    expect(p0.ind1!.monthly).toHaveLength(1);
    expect(p0.ind1!.monthly[0].target).toBe("mean");
    expect(p0.ind1!.monthly[0].mean).toBeCloseTo(94, 6);
    expect(p0.ind1!.monthly[0].rate).toBeCloseTo(90 / 94, 6);
  });

  it("可参评＞3 的组：目标值=当月均值，缺月员工数据参与对应月份均值", () => {
    // 5 人（4 人完整可参评 → 非小组）；A 缺月2
    const employees = [
      tmEmp("A", 96, 18, { values: { 客户满意度: [96, undefined, 96], 响应时间: rep(18) } }),
      tmEmp("B", 94, 18),
      tmEmp("C", 92, 18),
      tmEmp("D", 90, 18),
      tmEmp("E", 88, 18),
    ];
    const out = computeCs(employees, CFG, { [TM]: 5 });
    const a = out.results.find((r) => r.name === "A")!;
    const c = out.results.find((r) => r.name === "C")!;
    expect(a.ind1!.monthly).toHaveLength(2);
    expect(a.ind1!.monthly[0].target).toBe("mean");
    // 月1 均值 = (96+94+92+90+88)/5 = 92；月2 均值 = (94+92+90+88)/4 = 91
    expect(a.ind1!.monthly[0].mean).toBeCloseTo(92, 6);
    expect(c.ind1!.monthly[1].mean).toBeCloseTo(91, 6);
    expect(a.notes.join(" ")).not.toMatch(/可参评人数≤3/);
  });
});

describe("缺月数据支持", () => {
  it("指标缺月不参与评级；接待量缺月不影响 complete", () => {
    const employees = [
      emp({
        name: "A", dept: TM, group: "标准服务组",
        values: { 客户满意度: [96, undefined, 96], 响应时间: rep(12) },
        rec: rep(1000),
      }),
      emp({
        name: "B", dept: TM, group: "标准服务组",
        values: { 客户满意度: rep(94), 响应时间: rep(12) },
        rec: [1000, 1000, undefined],
      }),
      emp({
        name: "C", dept: TM, group: "标准服务组",
        values: { 客户满意度: rep(95), 响应时间: rep(12) },
        rec: rep(1000),
      }),
    ];
    const out = computeCs(employees, CFG, { [TM]: 3 });
    const a = out.results.find((r) => r.name === "A")!;
    const b = out.results.find((r) => r.name === "B")!;
    const c = out.results.find((r) => r.name === "C")!;
    // A 指标缺月 → complete=false，不参与排名/定级/定薪
    expect(a.errors).toEqual([]);
    expect(a.combinedRate).not.toBeNull();
    expect(a.validMonths).toBe(2);
    expect(a.rank).toBeUndefined();
    expect(a.grade).toBeNull();
    expect(a.monthlySalary).toBeNull();
    expect(a.notes.join(" ")).toMatch(/数据不完整/);
    // B 接待量缺月但指标完整 → complete=true，正常参与评级
    expect(b.errors).toEqual([]);
    expect(b.validMonths).toBe(3);
    expect(b.rank).toBeDefined();
    expect(b.grade).not.toBeNull();
    expect(b.monthlySalary).not.toBeNull();
    expect(c.grade).not.toBeNull();
  });

  it("指标全部月份为空 → 报错", () => {
    const employees = [
      emp({
        name: "A", dept: TM, group: "标准服务组",
        values: { 客户满意度: [undefined, undefined, undefined], 响应时间: rep(12) },
        rec: rep(1000),
      }),
    ];
    const out = computeCs(employees, CFG, { [TM]: 1 });
    expect(out.results[0].errors.join(" ")).toMatch(/客户满意度/);
    expect(out.results[0].combinedRate).toBeNull();
  });
});

describe("单项指标 120% 封顶", () => {
  it("月度封顶在月层执行，再做 3 月均值", () => {
    // 4 人 → 均值口径：sat 均值=100，resp 均值=19
    const employees = [
      tmEmp("A", 150, 10, { expert: true }),
      tmEmp("B", 50, 30),
      tmEmp("C", 100, 18),
      tmEmp("D", 100, 18),
    ];
    const out = computeCs(employees, CFG, { [TM]: 4 });
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.errors).toEqual([]);
    // sat: 150/100=1.5 → 封顶 1.2
    expect(a.ind1!.monthly.every((m) => m.rate === 1.2 && m.capped)).toBe(true);
    expect(a.ind1!.rate).toBeCloseTo(1.2, 6);
    expect(a.ind1!.anyCapped).toBe(true);
    // resp: 2-10/19≈1.47 → 封顶
    expect(a.ind2!.monthly[0].capped).toBe(true);
    expect(a.ind2!.rate).toBeCloseTo(1.2, 6);
    // combined = 1.2*0.5 + 1.2*0.5 = 1.2
    expect(a.combinedRate).toBeCloseTo(1.2, 6);
    expect(a.notes.join(" ")).toMatch(/封顶/);
    // B 未封顶
    const b = out.results.find((r) => r.name === "B")!;
    expect(b.ind1!.anyCapped).toBe(false);
  });

  it("部分月封顶：季度均值 = 各月 capped rate 的算术均值", () => {
    // 4 人；sat 月度均值：月1=110、月2=100、月3=100
    const employees = [
      tmEmp("A", 0, 18, { values: { 客户满意度: [150, 90, 90], 响应时间: rep(18) } }),
      tmEmp("B", 0, 18, { values: { 客户满意度: [90, 110, 110], 响应时间: rep(18) } }),
      tmEmp("C", 100, 18),
      tmEmp("D", 100, 18),
    ];
    const out = computeCs(employees, CFG, { [TM]: 4 });
    const a = out.results.find((r) => r.name === "A")!;
    // A sat 月度: 150/110=1.36→封 1.2; 90/100=0.9; 90/100=0.9
    expect(a.ind1!.monthly[0].capped).toBe(true);
    expect(a.ind1!.monthly[0].rate).toBeCloseTo(1.2, 6);
    expect(a.ind1!.monthly[1].capped).toBe(false);
    expect(a.ind1!.monthly[1].rate).toBeCloseTo(0.9, 6);
    expect(a.ind1!.monthly[2].rate).toBeCloseTo(0.9, 6);
    expect(a.ind1!.rate).toBeCloseTo((1.2 + 0.9 + 0.9) / 3, 6);
    expect(a.ind1!.anyCapped).toBe(true);
  });
});

describe("级别内分组定薪", () => {
  it("全员 junior：完成率<80% 取 salLo，最高取 salHi，中间按 [80%,max] 插值", () => {
    // 标准服务组 4 人，基准线（sat≥95/resp≤18）全员不达 → junior
    const employees = [
      tmEmp("A", 60, 30),
      tmEmp("B", 85, 20),
      tmEmp("C", 92, 19),
      tmEmp("D", 94, 19),
    ];
    const out = computeCs(employees, CFG, { [TM]: 4 });
    const [a, b, c, d] = ["A", "B", "C", "D"].map(
      (n) => out.results.find((r) => r.name === n)!,
    );
    for (const r of [a, b, c, d]) {
      expect(r.errors).toEqual([]);
      expect(r.finalLevel).toBe("junior");
    }
    // A 完成率 <80% → salLo=3200
    expect(a.combinedRate as number).toBeLessThan(0.8);
    expect(a.monthlySalary).toBe(3200);
    // D 最高 → salHi=4000
    expect(d.monthlySalary).toBe(4000);
    // B/C ≥80% → (3200, 4000) 之间插值，且 C > B
    expect(b.combinedRate as number).toBeGreaterThanOrEqual(0.8);
    expect(c.combinedRate as number).toBeGreaterThanOrEqual(0.8);
    expect(b.monthlySalary as number).toBeGreaterThan(3200);
    expect(b.monthlySalary as number).toBeLessThan(4000);
    expect(c.monthlySalary as number).toBeGreaterThan(b.monthlySalary as number);
  });

  it("同部门不同组别同级别 → 同分组，各自按本组薪资区间取最低/最高", () => {
    // 标准服务组 junior=3200~4000；售前服务组（官旗）junior=3000~3800
    const employees = [
      emp({ name: "A1", dept: TM, group: "标准服务组",
        values: { 客户满意度: rep(99), 响应时间: rep(10) }, rec: rep(1500) }),
      emp({ name: "A2", dept: TM, group: "标准服务组",
        values: { 客户满意度: rep(80), 响应时间: rep(12) }, rec: rep(1500) }),
      emp({ name: "B1", dept: TM, group: "售前服务组（官旗）",
        values: { 转化率: rep(60), 响应时间: rep(10) }, rec: rep(1500) }),
      emp({ name: "B2", dept: TM, group: "售前服务组（官旗）",
        values: { 转化率: rep(35), 响应时间: rep(12) }, rec: rep(1500) }),
    ];
    const out = computeCs(employees, CFG, { [TM]: 4 });
    const a2 = out.results.find((r) => r.name === "A2")!;
    const b2 = out.results.find((r) => r.name === "B2")!;
    expect(a2.errors).toEqual([]);
    expect(b2.errors).toEqual([]);
    expect(a2.finalLevel).toBe("junior");
    expect(b2.finalLevel).toBe("junior");
    // junior 分组内 A2 完成率更高（小组基准线口径）→ A2 取本组 salHi、B2 取本组 salLo
    expect(a2.salaryBand).toEqual({ lo: 3200, hi: 4000 });
    expect(b2.salaryBand).toEqual({ lo: 3000, hi: 3800 });
    expect((a2.combinedRate as number) > (b2.combinedRate as number)).toBe(true);
    expect(a2.monthlySalary).toBe(4000);
    expect(b2.monthlySalary).toBe(3000);
  });

  it("级别内仅 1 人 → 取薪资区间低限", () => {
    const employees = [
      tmEmp("A", 200, 5, { expert: true }),
      tmEmp("B", 95, 18),
      tmEmp("C", 95, 18),
    ];
    const out = computeCs(employees, CFG, { [TM]: 3 });
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.errors).toEqual([]);
    // 小组基准线口径：sat 200/95→封顶、resp 2-5/18→封顶 → combined=1.2
    expect(a.combinedRate).toBeCloseTo(1.2, 6);
    expect(a.rank).toBe(1);
    expect(a.finalLevel).toBe("expert");
    // expert 级别内仅 A → salLo=5000
    expect(a.monthlySalary).toBe(5000);
  });
});

describe("是否参与评级定薪", () => {
  it("participate=false：参与单元均值与组内日均接待量，但不入排名池/不定级/不定薪", () => {
    const employees = [
      tmEmp("A", 96, 12, { rec: rep(1500) }),
      tmEmp("B", 94, 12, { rec: rep(1500) }),
      tmEmp("C", 92, 13, { rec: rep(1500) }),
      tmEmp("D", 90, 14, { rec: rep(1500) }),
      tmEmp("NP", 120, 8, { rec: rep(500), participate: false }),
    ];
    const out = computeCs(employees, CFG, { [TM]: 4 });
    const a = out.results.find((r) => r.name === "A")!;
    const b = out.results.find((r) => r.name === "B")!;
    const np = out.results.find((r) => r.name === "NP")!;

    expect(np.errors).toEqual([]);
    expect(np.participate).toBe(false);
    expect(np.combinedRate).not.toBeNull();
    expect(np.rank).toBeUndefined();
    expect(np.finalLevel).toBeUndefined();
    expect(np.grade).toBeNull();
    expect(np.monthlySalary).toBeNull();
    expect(np.notes.join(" ")).toMatch(/不参与评级定薪/);

    // 可参评 4 人（＞3）→ 目标值=当月团队均值，且 NP 拉高单元均值：sat=(96+94+92+90+120)/5
    const satMean = (96 + 94 + 92 + 90 + 120) / 5;
    expect(a.ind1!.monthly[0].target).toBe("mean");
    expect(a.ind1!.monthly[0].mean).toBeCloseTo(satMean, 6);
    // NP 计入组内日均接待量：Σrec=(4×4500+1500)=19500，Σatt=300 → 65
    expect(a.unitDailyReception).toBeCloseTo(19500 / 300, 6);

    // 排名池仅 A/B/C/D
    expect(a.poolSize).toBe(4);
    expect(b.poolSize).toBe(4);
    expect([a.rank, b.rank]).toEqual([1, 2]);
    expect(out.participation.find((p) => p.dept === TM)!.participants).toBe(4);
  });

  it("headcount 缺省时视为全员参评（ratio=1）", () => {
    const employees = [tmEmp("A", 96, 12), tmEmp("B", 94, 12)];
    const out = computeCs(employees, CFG, {});
    const part = out.participation.find((p) => p.dept === TM)!;
    expect(part.participants).toBe(2);
    expect(part.headcount).toBe(2);
    expect(part.ratio).toBeCloseTo(1, 6);
  });
});
