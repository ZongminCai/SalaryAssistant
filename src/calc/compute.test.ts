import { describe, expect, it } from "vitest";
import { computeOne } from "./compute";
import type { Employee } from "./types";

interface Case {
  name: string;
  emp: Employee;
  grade: string | null;
  salary: number | null;
  incentive: number | null;
}

// 直接移植自 scripts/test_calc.py
const CASES: Case[] = [
  { name: "视频内容-高级插值", emp: { position: "video_content", perf_personal: 500 }, grade: "高级视频内容专员", salary: 15500, incentive: null },
  { name: "视频内容-专家固定", emp: { position: "video_content", perf_personal: 600 }, grade: "专家视频内容专员", salary: 18000, incentive: null },
  { name: "视频内容-初级下限", emp: { position: "video_content", perf_personal: 10 }, grade: "初级视频内容专员", salary: 5000, incentive: null },
  { name: "视频内容-低于区间", emp: { position: "video_content", perf_personal: 5 }, grade: null, salary: null, incentive: null },
  { name: "跨境西安-专员", emp: { position: "cross_border_ops", region: "西安", level: "专员", perf_personal: 320 }, grade: "高级运营", salary: 21000, incentive: null },
  { name: "跨境西安-组长含管理", emp: { position: "cross_border_ops", region: "西安", level: "组长", perf_personal: 320, perf_team: 1600, span_of_control: 6 }, grade: "高级运营", salary: 24200, incentive: null },
  { name: "跨境西安-组长幅度不足", emp: { position: "cross_border_ops", region: "西安", level: "组长", perf_personal: 320, perf_team: 1600, span_of_control: 3 }, grade: "高级运营", salary: 21000, incentive: null },
  { name: "跨境深圳-初级", emp: { position: "cross_border_ops", region: "深圳", level: "专员", perf_personal: 80 }, grade: "初级运营", salary: 10000, incentive: null },
  { name: "跨境西安-试用期80%", emp: { position: "cross_border_ops", region: "西安", level: "专员", perf_personal: 320, probation: true }, grade: "高级运营", salary: 16800, incentive: null },
  { name: "跨境西安-管培生硕士", emp: { position: "cross_border_ops", region: "西安", level: "管培生", education: "211/985硕士" }, grade: "运营管培生", salary: 9000, incentive: null },
  { name: "商务-专员高级", emp: { position: "business_bd", level: "专员", perf_personal: 250 }, grade: "高级商务专员", salary: 15600, incentive: null },
  { name: "商务-主管高级", emp: { position: "business_bd", level: "主管", perf_personal: 250 }, grade: "高级商务专员", salary: 16400, incentive: null },
  { name: "商务-专员专家", emp: { position: "business_bd", level: "专员", perf_personal: 300 }, grade: "专家商务专员", salary: 18000, incentive: null },
  { name: "商务-主管专家", emp: { position: "business_bd", level: "主管", perf_personal: 300 }, grade: "专家商务专员", salary: 18900, incentive: null },
  { name: "商城-专员高级取百", emp: { position: "mall_ops", level: "专员", perf_personal: 600 }, grade: "高级运营", salary: 33300, incentive: null },
  { name: "商城-组长含管理", emp: { position: "mall_ops", level: "组长", perf_personal: 600, perf_team: 1200, span_of_control: 5 }, grade: "高级运营", salary: 35000, incentive: null },
  { name: "商城-专家固定", emp: { position: "mall_ops", level: "专员", perf_personal: 800 }, grade: "专家运营", salary: 45000, incentive: null },
  { name: "主播-官旗高级", emp: { position: "livestream_host", account_type: "官旗", perf_personal: 350 }, grade: "高级主播", salary: 12300, incentive: null },
  { name: "主播-其他高级", emp: { position: "livestream_host", account_type: "其他", perf_personal: 250 }, grade: "高级主播", salary: 13000, incentive: null },
  { name: "主播-专家固定", emp: { position: "livestream_host", account_type: "官旗", perf_personal: 450 }, grade: "专家主播", salary: 20000, incentive: null },
  { name: "主播-季度+月度激励", emp: { position: "livestream_host", account_type: "官旗", perf_personal: 350, monthly_net_sales: 55 }, grade: "高级主播", salary: 12300, incentive: 10450 },
  { name: "主播-激励最低档", emp: { position: "livestream_host", account_type: "其他", monthly_net_sales: 9 }, grade: null, salary: null, incentive: 900 },
  { name: "产品运营-其他中级%", emp: { position: "product_ops", dept: "其他部门", perf_personal: 300 }, grade: "中级运营", salary: 15000, incentive: null },
  { name: "产品运营-电商高级%", emp: { position: "product_ops", dept: "电商三部", perf_personal: 700 }, grade: "高级运营", salary: 42000, incentive: null },
  { name: "产品运营-其他初级插值", emp: { position: "product_ops", dept: "其他部门", perf_personal: 150 }, grade: "初级运营", salary: 7500, incentive: null },
  { name: "产品运营-左开右闭边界200", emp: { position: "product_ops", dept: "其他部门", perf_personal: 200 }, grade: "初级运营", salary: 8000, incentive: null },
  { name: "产品运营-专家固定不取百", emp: { position: "product_ops", dept: "电商三部", perf_personal: 1300 }, grade: "专家运营", salary: 88888, incentive: null },
  { name: "产品运营-管培生本科", emp: { position: "product_ops", level: "管培生", education: "普通本科" }, grade: "运营管培生", salary: 6000, incentive: null },
];

describe("calc engine — 新增展示字段 (perf_bracket / salary_bracket / raw_salary)", () => {
  it("跨境西安专员 perf=320 → 命中 [300,500) 插值，raw=21000", () => {
    const r = computeOne({ position: "cross_border_ops", region: "西安", level: "专员", perf_personal: 320 });
    expect(r.perf_bracket).toEqual({ lo: 300, hi: 500, lo_inc: true, hi_inc: false });
    expect(r.salary_bracket).toEqual({ sal_lo: 20000, sal_hi: 30000 });
    expect(r.raw_salary).toBe(21000);
  });

  it("产品运营其他部门中级 perf=300 → 左开右闭 (200,500]，按比例：sal_bracket=null, raw=15000", () => {
    const r = computeOne({ position: "product_ops", dept: "其他部门", perf_personal: 300 });
    expect(r.perf_bracket).toEqual({ lo: 200, hi: 500, lo_inc: false, hi_inc: true });
    expect(r.salary_bracket).toBeNull();
    expect(r.raw_salary).toBe(15000);
  });

  it("视频内容 perf=500 → 命中 [400, 600) 区间", () => {
    const r = computeOne({ position: "video_content", perf_personal: 500 });
    expect(r.perf_bracket).toEqual({ lo: 400, hi: 600, lo_inc: true, hi_inc: false });
    expect(r.salary_bracket).toEqual({ sal_lo: 14000, sal_hi: 17000 });
  });

  it("产品运营管培生本科 → 无 bracket，raw=6000", () => {
    const r = computeOne({ position: "product_ops", level: "管培生", education: "普通本科" });
    expect(r.perf_bracket).toBeNull();
    expect(r.salary_bracket).toBeNull();
    expect(r.raw_salary).toBe(6000);
  });
});

describe("calc engine — 28 边界用例（移植自 test_calc.py）", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = computeOne(c.emp);
      if (c.grade === null && c.salary === null && c.incentive === null) {
        // 低于区间用例：允许带 error，关键是 grade/salary/incentive 都是 null
        expect(r.grade).toBeNull();
        expect(r.monthly_salary).toBeNull();
        expect(r.incentive).toBeNull();
        return;
      }
      expect(r.errors, `unexpected errors: ${r.errors.join(" ; ")}`).toEqual([]);
      expect(r.grade).toBe(c.grade);
      expect(r.monthly_salary).toBe(c.salary);
      expect(r.incentive).toBe(c.incentive);
    });
  }
});

describe("calc engine — 直播运营/主播组长 + 视频运营 (总裁办〔2026〕9号)", () => {
  it("直播运营专员-中级+管理: perf=100, pcv=15 → 11000+1750=12800", () => {
    const r = computeOne({
      position: "livestream_ops",
      level: "直播运营专员",
      perf_personal: 100,
      per_capita_value: 15,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("中级直播运营");
    expect(r.monthly_salary).toBe(12800);
    // raw = 11000 + 1750 = 12750
    expect(r.raw_salary).toBe(12750);
  });

  it("直播运营专员-专家+管理: perf=600 (≥500 固定), pcv=60 → 35000+4000=39000", () => {
    const r = computeOne({
      position: "livestream_ops",
      level: "直播运营专员",
      perf_personal: 600,
      per_capita_value: 60,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("专家直播运营");
    expect(r.monthly_salary).toBe(39000);
  });

  it("主播组长-中级+管理 grade 覆盖: perf=120, pcv=40 → salary=15000, grade=「主播组长」", () => {
    const r = computeOne({
      position: "livestream_ops",
      level: "主播组长",
      perf_personal: 120,
      per_capita_value: 40,
    });
    expect(r.errors).toEqual([]);
    // 薪酬照算（与同 perf/pcv 的专员一致）
    expect(r.monthly_salary).toBe(15000);
    // grade 被 level 原值覆盖
    expect(r.grade).toBe("主播组长");
  });

  it("直播运营专员-高级也计算管理薪资: perf=350, pcv=20 → 22500+2000=24500", () => {
    const r = computeOne({
      position: "livestream_ops",
      level: "直播运营专员",
      perf_personal: 350,
      per_capita_value: 20,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("高级直播运营");
    expect(r.monthly_salary).toBe(24500);
    expect(r.trace).toMatch(/管理部分/);
  });

  it("视频运营专员-中级+管理薪资低于最低档: perf=250, pcv=5 → 个人 14000、管理=0、notes 提示", () => {
    const r = computeOne({
      position: "video_ops",
      level: "视频运营专员",
      perf_personal: 250,
      per_capita_value: 5,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("中级视频运营");
    expect(r.monthly_salary).toBe(14000);
    expect(r.notes.join(" ")).toMatch(/人均净产值 5 万低于最低档/);
  });

  it("视频运营专员-业绩低于最低区间: perf=20 → 报错", () => {
    const r = computeOne({
      position: "video_ops",
      level: "视频运营专员",
      perf_personal: 20,
    });
    expect(r.grade).toBeNull();
    expect(r.monthly_salary).toBeNull();
    expect(r.errors.join(" ")).toMatch(/低于最低评级区间/);
  });

  it("直播运营组长-中级业绩+管理 grade 覆盖: perf=100, pcv=15 → salary=12800, grade=「直播运营组长」", () => {
    const r = computeOne({
      position: "livestream_ops",
      level: "直播运营组长",
      perf_personal: 100,
      per_capita_value: 15,
    });
    expect(r.errors).toEqual([]);
    expect(r.monthly_salary).toBe(12800);
    expect(r.grade).toBe("直播运营组长");
  });

  it("直播运营专员-缺业绩: perf_personal 未填 → 报错", () => {
    const r = computeOne({
      position: "livestream_ops",
      level: "直播运营专员",
    });
    expect(r.monthly_salary).toBeNull();
    expect(r.errors.join(" ")).toMatch(/缺少必填字段.*perf_personal/);
  });

  it("视频运营组长-中级业绩+管理 grade 覆盖: perf=250, pcv=50 → salary=16000, grade=「视频运营组长」", () => {
    const r = computeOne({
      position: "video_ops",
      level: "视频运营组长",
      perf_personal: 250,
      per_capita_value: 50,
    });
    expect(r.errors).toEqual([]);
    // 个人 14000 + 管理 2000 = 16000
    expect(r.monthly_salary).toBe(16000);
    expect(r.grade).toBe("视频运营组长");
  });
});

describe("calc engine — 京东产品运营岗 (总裁办〔2026〕10号)", () => {
  it("京东-专家固定: perf=1500 (>1000) → 专家运营、salary=45000（不取百）", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "专员",
      perf_personal: 1500,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("专家运营");
    expect(r.monthly_salary).toBe(45000);
  });

  it("京东-高级插值上限: perf=1000 命中 (500, 1000] 右端 → salary=30000", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "专员",
      perf_personal: 1000,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("高级运营");
    expect(r.raw_salary).toBe(30000);
    expect(r.monthly_salary).toBe(30000);
  });

  it("京东-中级 perf=300 → 命中 (200, 500]，raw≈12666.67、salary=12700", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "专员",
      perf_personal: 300,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("中级运营");
    expect(r.raw_salary).toBeCloseTo(12666.67, 1);
    expect(r.monthly_salary).toBe(12700);
  });

  it("京东-初级 perf=30 → 命中 (20, 50]，raw≈5333.33、salary=5300", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "专员",
      perf_personal: 30,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("初级运营");
    expect(r.raw_salary).toBeCloseTo(5333.33, 1);
    expect(r.monthly_salary).toBe(5300);
  });

  it("京东-管培生本科: education=普通本科 → grade=运营管培生、salary=6000", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "管培生",
      education: "普通本科",
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("运营管培生");
    expect(r.monthly_salary).toBe(6000);
  });

  it("京东-助理: level=助理 → grade=运营助理、salary=null、notes 含谈薪制", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "助理",
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("运营助理");
    expect(r.monthly_salary).toBeNull();
    expect(r.notes.join(" ")).toMatch(/谈薪制/);
  });

  it("京东-业绩低于区间: perf=15 → 报错", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "专员",
      perf_personal: 15,
    });
    expect(r.grade).toBeNull();
    expect(r.monthly_salary).toBeNull();
    expect(r.errors.join(" ")).toMatch(/低于最低评级区间/);
  });

  it("京东-试用期专员: perf=300, probation=true → 转正 12700、试用期 round100(12700×0.8)=10200", () => {
    const r = computeOne({
      position: "jd_product_ops",
      level: "专员",
      perf_personal: 300,
      probation: true,
    });
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("中级运营");
    expect(r.std_salary).toBe(12700);
    expect(r.monthly_salary).toBe(10200);
  });
});
