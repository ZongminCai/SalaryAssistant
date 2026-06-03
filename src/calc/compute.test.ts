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

describe("calc engine — 新增展示字段 (monthly_perf / perf_bracket / salary_bracket / raw_salary)", () => {
  it("跨境西安专员 perf=320 → 命中 [300,500) 插值，raw=21000", () => {
    const r = computeOne({ position: "cross_border_ops", region: "西安", level: "专员", perf_personal: 320 });
    expect(r.monthly_perf).toBeCloseTo(106.6667, 3);
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

  it("视频内容 perf=500 → monthly_perf≈166.67，区间仍按季度口径 [400,600)", () => {
    const r = computeOne({ position: "video_content", perf_personal: 500 });
    expect(r.monthly_perf).toBeCloseTo(166.6667, 3);
    expect(r.perf_bracket).toEqual({ lo: 400, hi: 600, lo_inc: true, hi_inc: false });
    expect(r.salary_bracket).toEqual({ sal_lo: 14000, sal_hi: 17000 });
  });

  it("产品运营管培生本科 → 无 bracket，raw=6000，monthly_perf=null", () => {
    const r = computeOne({ position: "product_ops", level: "管培生", education: "普通本科" });
    expect(r.monthly_perf).toBeNull();
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
