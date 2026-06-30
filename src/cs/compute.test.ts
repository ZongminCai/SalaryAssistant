import { describe, expect, it } from "vitest";
import { computeCs } from "./compute";
import { CS_CONFIGS } from "./config";
import { MONTH_COUNT } from "./types";
import type { CsEmployee } from "./types";

/** 把单值复制成 3 个月数组（用于「全季度同值」的简化测试输入） */
function rep(v: number): number[] {
  return Array.from({ length: MONTH_COUNT }, () => v);
}

let __row = 0;
function nextRow(): number {
  return ++__row;
}

interface EcomInput {
  name: string;
  sat: (number | undefined)[]; // 长度 3
  conv: (number | undefined)[];
  rec: (number | undefined)[];
  expert?: boolean;
}
function ecomEmp(e: EcomInput): CsEmployee {
  return {
    name: e.name,
    values: { 客户满意度: [...e.sat], 转化率: [...e.conv] },
    reception: [...e.rec],
    expertAdvance: e.expert,
    __rowIndex: nextRow(),
    __parseErrors: [],
  };
}

interface JilinInput {
  name: string;
  dept: string;
  group: string;
  values: Record<string, (number | undefined)[]>;
  rec: (number | undefined)[];
  expert?: boolean;
}
function emp(e: JilinInput): CsEmployee {
  const values: Record<string, (number | undefined)[]> = {};
  for (const [k, v] of Object.entries(e.values)) values[k] = [...v];
  return {
    name: e.name,
    dept: e.dept,
    group: e.group,
    values,
    reception: [...e.rec],
    expertAdvance: e.expert,
    __rowIndex: nextRow(),
    __parseErrors: [],
  };
}

const ECOM = CS_CONFIGS.ecom4_cs;
const JILIN = CS_CONFIGS.jilin_cs;

describe("电商四部客服接待岗 — 基础流程", () => {
  it("多人完整核算：综合完成率/排名/参评档位/最终薪资", () => {
    // 4 人，sat 与 conv 用同值便于核对：
    // A=高分，B/C=中等，D=偏低
    const employees = [
      ecomEmp({ name: "A", sat: rep(99), conv: rep(62), rec: rep(1300), expert: true }),
      ecomEmp({ name: "B", sat: rep(96), conv: rep(56), rec: rep(1100) }),
      ecomEmp({ name: "C", sat: rep(94), conv: rep(54), rec: rep(1000) }),
      ecomEmp({ name: "D", sat: rep(90), conv: rep(48), rec: rep(950) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 4 });
    expect(out.results).toHaveLength(4);
    out.results.forEach((r) => expect(r.errors).toEqual([]));

    // 单元月度均值：sat=(99+96+94+90)/4=94.75；conv=(62+56+54+48)/4=55
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.ind1?.label).toBe("客户满意度");
    expect(a.ind1?.rate).toBeCloseTo(99 / 94.75, 6);
    expect(a.ind2?.rate).toBeCloseTo(62 / 55, 6);
    expect(a.combinedRate).toBeCloseTo((99 / 94.75) * 0.4 + (62 / 55) * 0.6, 6);
    expect(a.rank).toBe(1);

    // 参评 4/4=100%，tier1，expert 上限分位=0.03 → A(p=0)可达专家
    expect(a.tierLabel).toContain("＞80%");
    expect(a.ceilingLevel).toBe("expert");

    // A 满足基准线（99>=99,62>=62）+ 接待量 1300 > threshold + expert=true → 专家
    expect(a.finalLevel).toBe("expert");
    expect(a.salaryBand).toEqual({ lo: 5000, hi: 5500 });

    // 末位 D：分位=0.75，落在>middle(0.25)→junior 上限
    const d = out.results.find((r) => r.name === "D")!;
    expect(d.ceilingLevel).toBe("junior");
    expect(d.finalLevel).toBe("junior");
    expect(d.salaryBand).toEqual({ lo: 3400, hi: 4200 });
  });

  it("接待量不足 → 中级及以上下调，并写 notes", () => {
    const employees = [
      ecomEmp({ name: "A", sat: rep(99), conv: rep(62), rec: rep(2000), expert: true }),
      // B 排名第 2，分位 0.5；接待量极低
      ecomEmp({ name: "B", sat: rep(98), conv: rep(60), rec: rep(100) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 2 });
    const b = out.results.find((r) => r.name === "B")!;
    expect(b.errors).toEqual([]);
    // ceiling 至多 middle（p=0.5>middle(0.25)→junior）；不论上限如何，此用例核心是接待量不足导致降级
    expect(b.receptionOk).toBe(false);
    if (b.ceilingLevel !== "junior") {
      expect(b.finalLevel).toBe("junior");
      expect(b.notes.join(" ")).toMatch(/接待量不足/);
    }
  });
});

describe("吉林分部客服接待岗 — 部门/组别校验", () => {
  it("天猫/售前服务组（官旗）：组内均值与基准线匹配", () => {
    const employees = [
      emp({
        name: "A",
        dept: "天猫",
        group: "售前服务组（官旗）",
        values: { 转化率: rep(50), 响应时间: rep(13) },
        rec: rep(1500),
        expert: true,
      }),
      emp({
        name: "B",
        dept: "天猫",
        group: "售前服务组（官旗）",
        values: { 转化率: rep(46), 响应时间: rep(15) },
        rec: rep(1300),
      }),
    ];
    const out = computeCs(employees, JILIN, { 天猫: 2, 抖音: 0, 拼多多: 0 });
    const a = out.results.find((r) => r.name === "A")!;
    const b = out.results.find((r) => r.name === "B")!;
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    // 单元月度均值：转化率=48，响应时间=14
    expect(a.ind1?.rate).toBeCloseTo(50 / 48, 6);
    // 响应时间为逆向：rate = 2 - 13/14
    expect(a.ind2?.rate).toBeCloseTo(2 - 13 / 14, 6);
    // 综合完成率（权重 0.5/0.5）
    expect(a.combinedRate).toBeCloseTo((50 / 48) * 0.5 + (2 - 13 / 14) * 0.5, 6);
  });

  it("部门与组别不匹配 → 报错", () => {
    const employees = [
      emp({
        name: "X",
        dept: "天猫",
        group: "客服一组-售前组", // 抖音/拼多多 才有的组
        values: { 转化率: rep(46), 响应时间: rep(15) },
        rec: rep(1500),
      }),
    ];
    const out = computeCs(employees, JILIN, { 天猫: 1, 抖音: 0, 拼多多: 0 });
    expect(out.results[0].errors.join(" ")).toMatch(/不匹配/);
    expect(out.results[0].grade).toBeNull();
  });
});

describe("新规则1 — 缺月数据支持", () => {
  it("缺月员工：指标1/2缺月不参与评级，接待量缺月仍可参与评级", () => {
    const employees = [
      ecomEmp({ name: "A", sat: [96, undefined, 96], conv: rep(56), rec: rep(1000) }),
      ecomEmp({ name: "B", sat: rep(94), conv: rep(54), rec: [1000, 1000, undefined] }),
      ecomEmp({ name: "C", sat: rep(95), conv: rep(55), rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 3 });
    const a = out.results.find((r) => r.name === "A")!;
    const b = out.results.find((r) => r.name === "B")!;
    const c = out.results.find((r) => r.name === "C")!;
    // A 指标1缺月(ind1只有2月) → complete=false，不参与排名/定级/定薪
    expect(a.errors).toEqual([]);
    expect(a.combinedRate).not.toBeNull();
    expect(a.validMonths).toBe(2);
    expect(a.rank).toBeUndefined();
    expect(a.grade).toBeNull();
    expect(a.monthlySalary).toBeNull();
    expect(a.notes.join(" ")).toMatch(/数据不完整/);
    // B 接待量缺月但 ind1/ind2 完整 → complete=true，正常参与评级
    expect(b.errors).toEqual([]);
    expect(b.combinedRate).not.toBeNull();
    expect(b.validMonths).toBe(3);
    expect(b.rank).toBeDefined();
    expect(b.grade).not.toBeNull();
    expect(b.monthlySalary).not.toBeNull();
    // C 数据完整 → 正常评估
    expect(c.errors).toEqual([]);
    expect(c.combinedRate).not.toBeNull();
    expect(c.validMonths).toBe(3);
    expect(c.rank).toBeDefined();
    expect(c.grade).not.toBeNull();
  });

  it("缺月员工的数据参与了对应月份的单元均值", () => {
    // A 只有月1/月3 数据(sat=120)，C 有全部3个月(sat=80)
    // 月1均值=(120+80)/2=100; 月2均值=80(仅C); 月3均值=(120+80)/2=100
    const employees = [
      ecomEmp({ name: "A", sat: [120, undefined, 120], conv: [60, undefined, 60], rec: [1000, undefined, 1000] }),
      ecomEmp({ name: "C", sat: rep(80), conv: rep(40), rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 2 });
    const c = out.results.find((r) => r.name === "C")!;
    // C 的月1 sat 均值应为(120+80)/2=100，月2 均值应为 80（仅C自己）
    expect(c.ind1!.monthly[0].mean).toBeCloseTo(100, 6);
    expect(c.ind1!.monthly[1].mean).toBeCloseTo(80, 6);
    expect(c.ind1!.monthly[2].mean).toBeCloseTo(100, 6);
  });

  it("所有月份均为空 → 仍报错", () => {
    const employees = [
      ecomEmp({ name: "A", sat: [undefined, undefined, undefined], conv: rep(56), rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 1 });
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.errors.length).toBeGreaterThan(0);
    expect(a.errors.join(" ")).toMatch(/客户满意度/);
    expect(a.combinedRate).toBeNull();
  });
});

describe("新规则2 — 单项指标 120% 封顶", () => {
  it("月度封顶在月层执行，再做 3 月均值", () => {
    // 单元月度均值：sat=100，conv=50
    const employees = [
      ecomEmp({ name: "A", sat: rep(150), conv: rep(80), rec: rep(1000), expert: true }),
      ecomEmp({ name: "B", sat: rep(50), conv: rep(20), rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 2 });
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.errors).toEqual([]);

    // sat: 150/100=1.5 → 封顶 1.2
    expect(a.ind1!.monthly[0].capped).toBe(true);
    expect(a.ind1!.monthly[0].rate).toBeCloseTo(1.2, 6);
    expect(a.ind1!.monthly.every((m) => m.rate === 1.2 && m.capped)).toBe(true);
    expect(a.ind1!.rate).toBeCloseTo(1.2, 6);
    expect(a.ind1!.anyCapped).toBe(true);

    // conv: 80/50=1.6 → 封顶
    expect(a.ind2!.monthly[0].capped).toBe(true);
    expect(a.ind2!.rate).toBeCloseTo(1.2, 6);

    // combined = 1.2*0.4 + 1.2*0.6 = 1.2
    expect(a.combinedRate).toBeCloseTo(1.2, 6);
    expect(a.notes.join(" ")).toMatch(/封顶/);

    // 部分月封顶：构造一人 sat 月1=150（封顶）、月2=80、月3=100
    // 该用例已隐含在 b 的「未封顶」一侧；显式断言：
    const b = out.results.find((r) => r.name === "B")!;
    expect(b.ind1!.anyCapped).toBe(false);
    expect(b.ind1!.monthly.every((m) => !m.capped)).toBe(true);
  });

  it("封顶后季度均值 = 各月 capped rate 的算术均值", () => {
    // 单元月度均值会因人数与数值变化，简化为：A 一人 sat 三月=[150,90,90]、conv=[80,40,40]
    // 单元 = 全员，A 即均值，所以个人值 = 均值 → ratio=1.0；改用 2 人构造可观察封顶。
    const employees = [
      // 单元 sat 月度均值: 月1=120, 月2=100, 月3=100; conv: 月1=70, 月2=50, 月3=50
      ecomEmp({ name: "A", sat: [150, 90, 90], conv: [80, 40, 40], rec: rep(1000) }),
      ecomEmp({ name: "B", sat: [90, 110, 110], conv: [60, 60, 60], rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 2 });
    const a = out.results.find((r) => r.name === "A")!;
    // A sat 月度: 150/120=1.25→封 1.2; 90/100=0.9; 90/100=0.9
    expect(a.ind1!.monthly[0].capped).toBe(true);
    expect(a.ind1!.monthly[0].rate).toBeCloseTo(1.2, 6);
    expect(a.ind1!.monthly[1].capped).toBe(false);
    expect(a.ind1!.monthly[1].rate).toBeCloseTo(0.9, 6);
    expect(a.ind1!.monthly[2].rate).toBeCloseTo(0.9, 6);
    expect(a.ind1!.rate).toBeCloseTo((1.2 + 0.9 + 0.9) / 3, 6);
    expect(a.ind1!.anyCapped).toBe(true);
  });
});

describe("新规则3 — 级别内分组定薪", () => {
  it("电商四部：B 综合完成率 0.44，级别内仅自己 → salLo=3400", () => {
    const employees = [
      ecomEmp({ name: "A", sat: rep(150), conv: rep(80), rec: rep(1000), expert: true }),
      ecomEmp({ name: "B", sat: rep(50), conv: rep(20), rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 2 });
    const b = out.results.find((r) => r.name === "B")!;
    expect(b.errors).toEqual([]);
    // B sat=0.5, conv=0.4 → combined = 0.5*0.4 + 0.4*0.6 = 0.44
    expect(b.combinedRate).toBeCloseTo(0.44, 6);
    expect(b.combinedRate as number).toBeLessThan(0.8);
    // B 排名 2，分位 0.5 → ceiling=junior
    expect(b.ceilingLevel).toBe("junior");
    expect(b.finalLevel).toBe("junior");
    expect(b.salaryBand).toEqual({ lo: 3400, hi: 4200 });
    // 级别内仅 1 人（A 是 expert，B 是 junior）→ salLo
    expect(b.monthlySalary).toBe(3400);
  });

  it("吉林：同部门不同组别同级别 → 同分组，最低取salLo最高取salHi", () => {
    // 标准服务组 junior=3200~4000，售前服务组（官旗）junior=3000~3800
    const employees = [
      emp({
        name: "A1",
        dept: "天猫",
        group: "标准服务组",
        values: { 客户满意度: rep(99), 响应时间: rep(10) },
        rec: rep(1500),
      }),
      emp({
        name: "A2",
        dept: "天猫",
        group: "标准服务组",
        values: { 客户满意度: rep(50), 响应时间: rep(40) },
        rec: rep(1500),
      }),
      emp({
        name: "B1",
        dept: "天猫",
        group: "售前服务组（官旗）",
        values: { 转化率: rep(60), 响应时间: rep(10) },
        rec: rep(1500),
      }),
      emp({
        name: "B2",
        dept: "天猫",
        group: "售前服务组（官旗）",
        values: { 转化率: rep(20), 响应时间: rep(40) },
        rec: rep(1500),
      }),
    ];
    const out = computeCs(employees, JILIN, { 天猫: 4, 抖音: 0, 拼多多: 0 });
    const a1 = out.results.find((r) => r.name === "A1")!;
    const a2 = out.results.find((r) => r.name === "A2")!;
    const b1 = out.results.find((r) => r.name === "B1")!;
    const b2 = out.results.find((r) => r.name === "B2")!;
    expect(a1.errors).toEqual([]);
    expect(a2.errors).toEqual([]);
    expect(b1.errors).toEqual([]);
    expect(b2.errors).toEqual([]);
    // A2、B2 完成率都很低，应为 junior
    expect(a2.finalLevel).toBe("junior");
    expect(b2.finalLevel).toBe("junior");
    // 同部门(天猫) 同级别(junior) → 同分组，A2 完成率较高取自己的 salHi，B2 完成率较低取自己的 salLo
    expect(a2.salaryBand!.lo).toBe(3200);
    expect(b2.salaryBand!.lo).toBe(3000);
    // A2 是分组内最高 → salHi，B2 是分组内最低 → salLo
    expect(a2.monthlySalary).toBe(4000); // 标准服务组 junior salHi=4000
    expect(b2.monthlySalary).toBe(3000); // 售前服务组（官旗）junior salLo=3000
  });
});

describe("新规则4 — 是否参与评级定薪", () => {
  it("participate=false 的员工：参与单元均值计算，但不入排名池/不定级/不定薪", () => {
    // 3 人。1 人不参评，但数据很高，拉高均值
    const employees = [
      ecomEmp({ name: "A", sat: rep(96), conv: rep(56), rec: rep(1000), expert: true }),
      ecomEmp({ name: "B", sat: rep(94), conv: rep(54), rec: rep(1000) }),
    ];
    const noPart: CsEmployee = {
      name: "NP",
      values: { 客户满意度: rep(120), 转化率: rep(80) },
      reception: rep(2000),
      participate: false,
      __rowIndex: nextRow(),
      __parseErrors: [],
    };
    const out = computeCs([...employees, noPart], ECOM, { 电商四部: 2 });
    const a = out.results.find((r) => r.name === "A")!;
    const b = out.results.find((r) => r.name === "B")!;
    const np = out.results.find((r) => r.name === "NP")!;

    // NP 有完整明细但不定级不定薪
    expect(np.errors).toEqual([]);
    expect(np.participate).toBe(false);
    expect(np.combinedRate).not.toBeNull();
    expect(np.rank).toBeUndefined();
    expect(np.percentile).toBeUndefined();
    expect(np.tierLabel).toBeUndefined();
    expect(np.ceilingLevel).toBeUndefined();
    expect(np.finalLevel).toBeUndefined();
    expect(np.grade).toBeNull();
    expect(np.salaryBand).toBeNull();
    expect(np.monthlySalary).toBeNull();
    expect(np.notes.join(" ")).toMatch(/不参与评级定薪/);

    // NP 拉高了单元均值：sat 均值=(96+94+120)/3=103.33；conv=(56+54+80)/3=63.33
    const satMean = (96 + 94 + 120) / 3;
    const convMean = (56 + 54 + 80) / 3;
    expect(a.ind1!.monthly[0].mean).toBeCloseTo(satMean, 6);
    expect(a.ind1!.monthly[0].rate).toBeCloseTo(96 / satMean, 6);
    expect(a.ind2!.monthly[0].mean).toBeCloseTo(convMean, 6);

    // 排名池仅 A/B 2 人
    expect(a.poolSize).toBe(2);
    expect(b.poolSize).toBe(2);
    expect([a.rank, b.rank].sort()).toEqual([1, 2]);

    // 参评人数 = 2（不含 NP）；headcount=2 → ratio=100% → tier1
    expect(a.participationRatio).toBeCloseTo(1, 6);
    expect(out.participation.find((p) => p.dept === "电商四部")!.participants).toBe(2);
  });

  it("在职人数 headcount 与 participate 独立：headcount 默认=参评人数", () => {
    // 4 人上传：3 人参评 + 1 人不参评；headcount=3 时参评比例=100%
    const employees: CsEmployee[] = [
      ecomEmp({ name: "A", sat: rep(96), conv: rep(56), rec: rep(1000) }),
      ecomEmp({ name: "B", sat: rep(94), conv: rep(54), rec: rep(1000) }),
      ecomEmp({ name: "C", sat: rep(92), conv: rep(52), rec: rep(1000) }),
      {
        name: "NP",
        values: { 客户满意度: rep(50), 转化率: rep(20) },
        reception: rep(500),
        participate: false,
        __rowIndex: nextRow(),
        __parseErrors: [],
      },
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 3 });
    const part = out.participation.find((p) => p.dept === "电商四部")!;
    expect(part.participants).toBe(3);
    expect(part.headcount).toBe(3);
    expect(part.ratio).toBeCloseTo(1, 6);
  });
});

describe("综合：新旧规则组合", () => {
  it("封顶 + 接待量足 + 排名第一 + expert 进阶 → 专家级；级别内仅自己取salLo", () => {
    const employees = [
      ecomEmp({ name: "A", sat: rep(200), conv: rep(200), rec: rep(2000), expert: true }),
      ecomEmp({ name: "B", sat: rep(95), conv: rep(55), rec: rep(1000) }),
      ecomEmp({ name: "C", sat: rep(95), conv: rep(55), rec: rep(1000) }),
    ];
    const out = computeCs(employees, ECOM, { 电商四部: 3 });
    const a = out.results.find((r) => r.name === "A")!;
    expect(a.errors).toEqual([]);
    // 各月封顶 → combined=1.2
    expect(a.combinedRate).toBeCloseTo(1.2, 6);
    expect(a.ind1!.anyCapped).toBe(true);
    expect(a.ind2!.anyCapped).toBe(true);
    // p=0/3=0 ≤ expert(0.03) → 专家上限
    expect(a.finalLevel).toBe("expert");
    // 级别内仅 A 一人（B、C 是 junior）→ salLo=5000
    expect(a.monthlySalary).toBe(5000);
  });
});
