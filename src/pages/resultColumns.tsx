// 评级结果表共用列定义：旧岗位工作台与统一工作台共用，禁止各写一份。
import { Space, Tag } from "antd";
import { formatBracket } from "../calc/engine";
import type { PositionResult } from "../calc/types";

export const dash = <span style={{ color: "#bbb" }}>—</span>;

export const rowIndexColumn = {
  title: "行号",
  dataIndex: "__rowIndex",
  key: "__rowIndex",
  width: 70,
  fixed: "left" as const,
  render: (v: number | undefined) => (v ? `第 ${v} 行` : "—"),
};

/** 输入回显列；「姓名」列与「行号」列一起冻结在左侧 */
export function inputColumn(f: { key: string; label: string }) {
  return {
    title: f.label,
    dataIndex: f.key,
    key: f.key,
    width: Math.max(110, f.label.length * 14 + 24),
    ...(f.key === "name" ? { fixed: "left" as const } : {}),
    render: (v: unknown) => {
      if (v === undefined || v === null || v === "") return dash;
      if (typeof v === "boolean") return v ? "是" : "否";
      return String(v);
    },
  };
}

export const gradeColumn = {
  title: "岗位评定",
  dataIndex: "grade",
  key: "grade",
  width: 130,
  render: (v: string | null) =>
    v ? <Tag color="blue">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
};

export const salaryColumn = {
  title: "次季度月薪(元)",
  dataIndex: "monthly_salary",
  key: "monthly_salary",
  width: 140,
  render: (v: number | null, row: PositionResult) =>
    v !== null ? (
      <span>
        <strong style={{ color: "#1677ff" }}>{v.toLocaleString()}</strong>
        {row.std_salary ? (
          <div style={{ color: "#999", fontSize: 12 }}>转正后 {row.std_salary.toLocaleString()}</div>
        ) : null}
      </span>
    ) : (
      <span style={{ color: "#bbb" }}>—</span>
    ),
};

export const incentiveColumn = {
  title: "月度激励(元)",
  dataIndex: "incentive",
  key: "incentive",
  width: 130,
  render: (v: number | null) =>
    v !== null ? <strong>{v.toLocaleString()}</strong> : <span style={{ color: "#bbb" }}>—</span>,
};

/** 评级结果新增 7 个明细列 */
export const bracketDetailCols = [
  {
    title: "业绩对应核算区间",
    dataIndex: "perf_bracket",
    key: "perf_bracket",
    width: 170,
    render: (b: PositionResult["perf_bracket"]) => (b ? formatBracket(b) : dash),
  },
  {
    title: "业绩区间下限",
    key: "perf_lo",
    width: 110,
    render: (_: unknown, row: PositionResult) =>
      row.perf_bracket && row.perf_bracket.lo !== null ? row.perf_bracket.lo : dash,
  },
  {
    title: "业绩区间差值",
    key: "perf_diff",
    width: 110,
    render: (_: unknown, row: PositionResult) => {
      const b = row.perf_bracket;
      if (!b || b.lo === null || b.hi === null) return dash;
      return b.hi - b.lo;
    },
  },
  {
    title: "对应薪资区间",
    dataIndex: "salary_bracket",
    key: "salary_bracket",
    width: 170,
    render: (sb: PositionResult["salary_bracket"]) =>
      sb ? `[${sb.sal_lo}, ${sb.sal_hi})` : dash,
  },
  {
    title: "薪资区间下限",
    key: "sal_lo",
    width: 110,
    render: (_: unknown, row: PositionResult) =>
      row.salary_bracket ? row.salary_bracket.sal_lo : dash,
  },
  {
    title: "薪资区间差值",
    key: "sal_diff",
    width: 110,
    render: (_: unknown, row: PositionResult) =>
      row.salary_bracket ? row.salary_bracket.sal_hi - row.salary_bracket.sal_lo : dash,
  },
  {
    title: "计算薪资具体值",
    dataIndex: "raw_salary",
    key: "raw_salary",
    width: 130,
    render: (v: number | null | undefined) =>
      v !== null && v !== undefined ? (
        <span style={{ color: "#1f2937" }}>{Number(v.toFixed(2)).toLocaleString()}</span>
      ) : (
        dash
      ),
  },
];

export const traceColumn = {
  title: "计算依据",
  dataIndex: "trace",
  key: "trace",
  width: 360,
  render: (v: string) => <span style={{ color: "#555", fontSize: 12 }}>{v || "—"}</span>,
};

export const msgsColumn = {
  title: "提示 / 错误",
  key: "msgs",
  width: 320,
  render: (_: unknown, row: PositionResult) => (
    <Space size={4} wrap>
      {row.errors.map((e, i) => (
        <Tag color="red" key={`e${i}`}>
          {e}
        </Tag>
      ))}
      {row.notes.map((n, i) => (
        <Tag key={`n${i}`}>{n}</Tag>
      ))}
      {row.errors.length === 0 && row.notes.length === 0 ? <span style={{ color: "#bbb" }}>—</span> : null}
    </Space>
  ),
};
