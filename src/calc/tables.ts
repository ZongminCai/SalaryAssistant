import type { Bracket, PositionKey } from "./types";

// 1) 视频内容岗  品牌〔2025〕2号  季度累计实际成交金额(万元)
export const VIDEO_CONTENT: Bracket[] = [
  { lo: 600, hi: null, formula: "fixed", fixed: 18000, grade: "专家视频内容专员" },
  { lo: 400, hi: 600, sal_lo: 14000, sal_hi: 17000, grade: "高级视频内容专员" },
  { lo: 300, hi: 400, sal_lo: 12000, sal_hi: 14000, grade: "高级视频内容专员" },
  { lo: 220, hi: 300, sal_lo: 10000, sal_hi: 12000, grade: "高级视频内容专员" },
  { lo: 160, hi: 220, sal_lo: 9000, sal_hi: 10000, grade: "中级视频内容专员" },
  { lo: 100, hi: 160, sal_lo: 8000, sal_hi: 9000, grade: "中级视频内容专员" },
  { lo: 50, hi: 100, sal_lo: 7000, sal_hi: 8000, grade: "中级视频内容专员" },
  { lo: 25, hi: 50, sal_lo: 6000, sal_hi: 7000, grade: "初级视频内容专员" },
  { lo: 10, hi: 25, sal_lo: 5000, sal_hi: 6000, grade: "初级视频内容专员" },
];

interface CrossBorderRegion {
  personal: Bracket[];
  mgmt: Bracket[];
  mgmt_min_span: number;
}

// 2) 跨境运营岗  总裁办〔2025〕46号  个人季度月均销售额(万元)
export const CROSS_BORDER: Record<string, CrossBorderRegion> = {
  "西安": {
    personal: [
      { lo: 500, hi: null, formula: "fixed", fixed: 66666, grade: "专家运营" },
      { lo: 300, hi: 500, sal_lo: 20000, sal_hi: 30000, grade: "高级运营" },
      { lo: 200, hi: 300, sal_lo: 15000, sal_hi: 20000, grade: "高级运营" },
      { lo: 150, hi: 200, sal_lo: 12000, sal_hi: 14000, grade: "中级运营" },
      { lo: 100, hi: 150, sal_lo: 10000, sal_hi: 12000, grade: "中级运营" },
      { lo: 50, hi: 100, sal_lo: 7000, sal_hi: 8500, grade: "初级运营" },
      { lo: 30, hi: 50, sal_lo: 6000, sal_hi: 7000, grade: "初级运营" },
      { lo: 10, hi: 30, sal_lo: 5000, sal_hi: 6000, grade: "初级运营" },
    ],
    mgmt: [
      { lo: 2000, hi: null, formula: "fixed", fixed: 4000 },
      { lo: 1500, hi: 2000, sal_lo: 3000, sal_hi: 4000 },
      { lo: 1000, hi: 1500, sal_lo: 2000, sal_hi: 3000 },
      { lo: 500, hi: 1000, sal_lo: 1500, sal_hi: 2000 },
      { lo: 200, hi: 500, sal_lo: 1000, sal_hi: 1500 },
      { lo: null, hi: 200, formula: "fixed", fixed: 500 },
    ],
    mgmt_min_span: 4,
  },
  "深圳": {
    personal: [
      { lo: 500, hi: null, formula: "fixed", fixed: 66666, grade: "专家运营" },
      { lo: 300, hi: 500, sal_lo: 22000, sal_hi: 32000, grade: "高级运营" },
      { lo: 200, hi: 300, sal_lo: 17000, sal_hi: 22000, grade: "高级运营" },
      { lo: 150, hi: 200, sal_lo: 14000, sal_hi: 17000, grade: "中级运营" },
      { lo: 100, hi: 150, sal_lo: 12000, sal_hi: 14000, grade: "中级运营" },
      { lo: 60, hi: 100, sal_lo: 9000, sal_hi: 11000, grade: "初级运营" },
      { lo: 40, hi: 60, sal_lo: 7000, sal_hi: 9000, grade: "初级运营" },
      { lo: 20, hi: 40, sal_lo: 6000, sal_hi: 7000, grade: "初级运营" },
    ],
    mgmt: [
      { lo: 2000, hi: null, formula: "fixed", fixed: 4800 },
      { lo: 1500, hi: 2000, sal_lo: 3600, sal_hi: 4800 },
      { lo: 1000, hi: 1500, sal_lo: 2400, sal_hi: 3600 },
      { lo: 500, hi: 1000, sal_lo: 1800, sal_hi: 2400 },
      { lo: 200, hi: 500, sal_lo: 1200, sal_hi: 1800 },
      { lo: null, hi: 200, formula: "fixed", fixed: 600 },
    ],
    mgmt_min_span: 4,
  },
};

// 3) 商务岗  总裁办〔2025〕43号  季度月均销售额(万元)
export const BUSINESS: Record<string, Bracket[]> = {
  "专员": [
    { lo: 300, hi: null, formula: "fixed", fixed: 18000, grade: "专家商务专员" },
    { lo: 200, hi: 300, sal_lo: 14200, sal_hi: 17000, grade: "高级商务专员" },
    { lo: 150, hi: 200, sal_lo: 12100, sal_hi: 14200, grade: "高级商务专员" },
    { lo: 100, hi: 150, sal_lo: 10000, sal_hi: 12100, grade: "高级商务专员" },
    { lo: 60, hi: 100, sal_lo: 8400, sal_hi: 10000, grade: "中级商务专员" },
    { lo: 40, hi: 60, sal_lo: 7200, sal_hi: 8400, grade: "中级商务专员" },
    { lo: 20, hi: 40, sal_lo: 6000, sal_hi: 7200, grade: "初级商务专员" },
    { lo: 10, hi: 20, sal_lo: 5000, sal_hi: 6000, grade: "初级商务专员" },
  ],
  "主管": [
    { lo: 300, hi: null, formula: "fixed", fixed: 18900, grade: "专家商务专员" },
    { lo: 200, hi: 300, sal_lo: 14900, sal_hi: 17900, grade: "高级商务专员" },
    { lo: 150, hi: 200, sal_lo: 12700, sal_hi: 14900, grade: "高级商务专员" },
    { lo: 100, hi: 150, sal_lo: 10500, sal_hi: 12700, grade: "高级商务专员" },
    { lo: 60, hi: 100, sal_lo: 8800, sal_hi: 10500, grade: "中级商务专员" },
    { lo: 40, hi: 60, sal_lo: 7600, sal_hi: 8800, grade: "中级商务专员" },
    { lo: 20, hi: 40, sal_lo: 6300, sal_hi: 7600, grade: "初级商务专员" },
    { lo: 10, hi: 20, sal_lo: 5300, sal_hi: 6300, grade: "初级商务专员" },
  ],
};

// 4) 抖音/快手商城运营岗  总裁办〔2026〕3号  个人季度月均销售额(万元)
export const MALL_OPS = {
  personal: [
    { lo: 800, hi: null, formula: "fixed", fixed: 45000, grade: "专家运营" },
    { lo: 500, hi: 800, sal_lo: 30000, sal_hi: 40000, grade: "高级运营" },
    { lo: 300, hi: 500, sal_lo: 17000, sal_hi: 25000, grade: "高级运营" },
    { lo: 200, hi: 300, sal_lo: 13000, sal_hi: 16000, grade: "高级运营" },
    { lo: 150, hi: 200, sal_lo: 10000, sal_hi: 12000, grade: "中级运营" },
    { lo: 100, hi: 150, sal_lo: 7500, sal_hi: 9000, grade: "中级运营" },
    { lo: 50, hi: 100, sal_lo: 6500, sal_hi: 7500, grade: "初级运营" },
    { lo: 20, hi: 50, sal_lo: 5000, sal_hi: 6500, grade: "初级运营" },
  ] as Bracket[],
  mgmt: [
    { lo: 2000, hi: null, formula: "fixed", fixed: 3000 },
    { lo: 1500, hi: 2000, sal_lo: 2000, sal_hi: 3000 },
    { lo: 1000, hi: 1500, sal_lo: 1500, sal_hi: 2000 },
    { lo: 500, hi: 1000, sal_lo: 1000, sal_hi: 1500 },
    { lo: 200, hi: 500, sal_lo: 500, sal_hi: 1000 },
    { lo: null, hi: 200, hi_inc: true, formula: "fixed", fixed: 500 },
  ] as Bracket[],
  mgmt_min_span: 5,
};

// 5) 主播岗  总裁办〔2026〕4号
export const LIVESTREAM: Record<string, Bracket[]> = {
  "官旗": [
    { lo: 450, hi: null, formula: "fixed", fixed: 20000, grade: "专家主播" },
    { lo: 300, hi: 450, sal_lo: 11000, sal_hi: 15000, grade: "高级主播" },
    { lo: 225, hi: 300, sal_lo: 9000, sal_hi: 10500, grade: "高级主播" },
    { lo: 150, hi: 225, sal_lo: 7500, sal_hi: 9000, grade: "中级主播" },
    { lo: 90, hi: 150, sal_lo: 6500, sal_hi: 7500, grade: "中级主播" },
    { lo: 45, hi: 90, sal_lo: 5500, sal_hi: 6500, grade: "初级主播" },
    { lo: 20, hi: 45, sal_lo: 5000, sal_hi: 5500, grade: "初级主播" },
  ],
  "其他": [
    { lo: 300, hi: null, formula: "fixed", fixed: 20000, grade: "专家主播" },
    { lo: 200, hi: 300, sal_lo: 11000, sal_hi: 15000, grade: "高级主播" },
    { lo: 150, hi: 200, sal_lo: 9000, sal_hi: 10500, grade: "高级主播" },
    { lo: 100, hi: 150, sal_lo: 7500, sal_hi: 9000, grade: "中级主播" },
    { lo: 60, hi: 100, sal_lo: 6500, sal_hi: 7500, grade: "中级主播" },
    { lo: 30, hi: 60, sal_lo: 5500, sal_hi: 6500, grade: "初级主播" },
    { lo: 15, hi: 30, sal_lo: 5000, sal_hi: 5500, grade: "初级主播" },
  ],
};

// 主播月度激励
export const LIVESTREAM_INCENTIVE: Bracket[] = [
  { lo: 60, hi: null, rate: 0.020 },
  { lo: 50, hi: 60, rate: 0.019 },
  { lo: 40, hi: 50, rate: 0.018 },
  { lo: 30, hi: 40, rate: 0.017 },
  { lo: 25, hi: 30, rate: 0.016 },
  { lo: 20, hi: 25, rate: 0.015 },
  { lo: 15, hi: 20, rate: 0.014 },
  { lo: 10, hi: 15, rate: 0.012 },
  { lo: null, hi: 10, rate: 0.010 },
];

// 6) 产品运营岗  总裁办〔2025〕23号 V2.0  (lo, hi]
export const PRODUCT_OPS: Record<string, Bracket[]> = {
  "电商三部": [
    { lo: 1200, hi: null, lo_inc: false, formula: "fixed", fixed: 88888, grade: "专家运营" },
    { lo: 600, hi: 1200, lo_inc: false, hi_inc: true, formula: "pct", rate: 0.006, grade: "高级运营" },
    { lo: 240, hi: 600, lo_inc: false, hi_inc: true, formula: "pct", rate: 0.005, grade: "中级运营" },
    { lo: 120, hi: 240, lo_inc: false, hi_inc: true, sal_lo: 7000, sal_hi: 8000, grade: "初级运营" },
    { lo: 60, hi: 120, lo_inc: false, hi_inc: true, sal_lo: 6000, sal_hi: 7000, grade: "初级运营" },
    { lo: 36, hi: 60, lo_inc: false, hi_inc: true, sal_lo: 5000, sal_hi: 6000, grade: "初级运营" },
  ],
  "其他部门": [
    { lo: 1000, hi: null, lo_inc: false, formula: "fixed", fixed: 88888, grade: "专家运营" },
    { lo: 500, hi: 1000, lo_inc: false, hi_inc: true, formula: "pct", rate: 0.006, grade: "高级运营" },
    { lo: 200, hi: 500, lo_inc: false, hi_inc: true, formula: "pct", rate: 0.005, grade: "中级运营" },
    { lo: 100, hi: 200, lo_inc: false, hi_inc: true, sal_lo: 7000, sal_hi: 8000, grade: "初级运营" },
    { lo: 50, hi: 100, lo_inc: false, hi_inc: true, sal_lo: 6000, sal_hi: 7000, grade: "初级运营" },
    { lo: 30, hi: 50, lo_inc: false, hi_inc: true, sal_lo: 5000, sal_hi: 6000, grade: "初级运营" },
  ],
};

// 7) 直播运营/主播组长岗  总裁办〔2026〕9号  季度月均净销售额(万元)
//    与岗位评定独立的「管理薪资」按 人均净产值(万元) 单独匹配
export const LIVESTREAM_OPS = {
  personal: [
    { lo: 500, hi: null, formula: "fixed", fixed: 35000, grade: "专家直播运营" },
    { lo: 300, hi: 500, sal_lo: 20000, sal_hi: 30000, grade: "高级直播运营" },
    { lo: 200, hi: 300, sal_lo: 15000, sal_hi: 20000, grade: "高级直播运营" },
    { lo: 120, hi: 200, sal_lo: 12000, sal_hi: 15000, grade: "中级直播运营" },
    { lo: 80, hi: 120, sal_lo: 10000, sal_hi: 12000, grade: "中级直播运营" },
    { lo: 50, hi: 80, sal_lo: 8000, sal_hi: 10000, grade: "中级直播运营" },
    { lo: 30, hi: 50, sal_lo: 7000, sal_hi: 8000, grade: "初级直播运营" },
    { lo: 20, hi: 30, sal_lo: 6000, sal_hi: 7000, grade: "初级直播运营" },
    { lo: 10, hi: 20, sal_lo: 5000, sal_hi: 6000, grade: "初级直播运营" },
  ] as Bracket[],
  mgmt: [
    { lo: 50, hi: null, formula: "fixed", fixed: 4000 },
    { lo: 30, hi: 50, sal_lo: 2500, sal_hi: 3500 },
    { lo: 20, hi: 30, sal_lo: 2000, sal_hi: 2500 },
    { lo: 10, hi: 20, sal_lo: 1500, sal_hi: 2000 },
    { lo: 5, hi: 10, sal_lo: 1000, sal_hi: 1500 },
    { lo: 3, hi: 5, sal_lo: 500, sal_hi: 1000 },
  ] as Bracket[],
};

// 8) 视频运营岗  总裁办〔2026〕9号  季度月均净销售额(万元)
export const VIDEO_OPS = {
  personal: [
    { lo: 500, hi: null, formula: "fixed", fixed: 35000, grade: "专家视频运营" },
    { lo: 400, hi: 500, sal_lo: 20000, sal_hi: 30000, grade: "高级视频运营" },
    { lo: 300, hi: 400, sal_lo: 16000, sal_hi: 20000, grade: "高级视频运营" },
    { lo: 200, hi: 300, sal_lo: 12000, sal_hi: 16000, grade: "中级视频运营" },
    { lo: 120, hi: 200, sal_lo: 9000, sal_hi: 12000, grade: "中级视频运营" },
    { lo: 80, hi: 120, sal_lo: 8000, sal_hi: 9000, grade: "初级视频运营" },
    { lo: 50, hi: 80, sal_lo: 6000, sal_hi: 7000, grade: "初级视频运营" },
    { lo: 30, hi: 50, sal_lo: 5000, sal_hi: 6000, grade: "初级视频运营" },
  ] as Bracket[],
  mgmt: [
    { lo: 100, hi: null, formula: "fixed", fixed: 4000 },
    { lo: 70, hi: 100, sal_lo: 2500, sal_hi: 3500 },
    { lo: 50, hi: 70, sal_lo: 2000, sal_hi: 2500 },
    { lo: 30, hi: 50, sal_lo: 1500, sal_hi: 2000 },
    { lo: 15, hi: 30, sal_lo: 1000, sal_hi: 1500 },
    { lo: 10, hi: 15, sal_lo: 500, sal_hi: 1000 },
  ] as Bracket[],
};

// 9) 京东产品运营岗  总裁办〔2026〕10号  季度月均净销售额(万元)
//    单表，区间左开右闭 (lo, hi]；除专家档固定外其余全部线性插值
export const JD_PRODUCT_OPS: Bracket[] = [
  { lo: 1000, hi: null, lo_inc: false, formula: "fixed", fixed: 45000, grade: "专家运营" },
  { lo: 500, hi: 1000, lo_inc: false, hi_inc: true, sal_lo: 18000, sal_hi: 30000, grade: "高级运营" },
  { lo: 200, hi: 500, lo_inc: false, hi_inc: true, sal_lo: 10000, sal_hi: 18000, grade: "中级运营" },
  { lo: 100, hi: 200, lo_inc: false, hi_inc: true, sal_lo: 7000, sal_hi: 9000, grade: "中级运营" },
  { lo: 50, hi: 100, lo_inc: false, hi_inc: true, sal_lo: 6000, sal_hi: 7000, grade: "初级运营" },
  { lo: 20, hi: 50, lo_inc: false, hi_inc: true, sal_lo: 5000, sal_hi: 6000, grade: "初级运营" },
];

export const POSITIONS: Record<PositionKey, string> = {
  video_content: "视频内容岗",
  cross_border_ops: "跨境运营岗",
  business_bd: "商务岗",
  mall_ops: "抖音/快手商城运营岗",
  livestream_host: "主播岗",
  product_ops: "天猫/拼多多运营岗",
  livestream_ops: "直播运营/主播组长岗",
  video_ops: "视频运营岗",
  jd_product_ops: "京东产品运营岗",
};
