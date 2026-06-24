import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Breadcrumb, Button, Empty, message, Space, Table, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { DownloadOutlined, ExportOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { POSITION_CONFIGS } from "../positions/registry";
import type { PositionConfig } from "../positions/registry";
import type { PositionKey, PositionResult } from "../calc/types";
import { computeAll } from "../calc/compute";
import { formatBracket } from "../calc/engine";
import { downloadTemplate } from "../excel/template";
import { parseUpload } from "../excel/parse";
import { exportResults } from "../excel/export";
import { CS_CONFIGS } from "../cs/config";
import type { CsPositionKey } from "../cs/types";
import CustomerServiceWorkbench from "./CustomerServiceWorkbench";

export default function PositionWorkbench() {
  const { positionKey } = useParams<{ positionKey: string }>();
  // 客服接待岗走「队列评级」独立工作台（独立组件，各自持有自己的 hooks）
  if (positionKey && positionKey in CS_CONFIGS) {
    return <CustomerServiceWorkbench csKey={positionKey as CsPositionKey} />;
  }
  const cfg = positionKey ? POSITION_CONFIGS[positionKey as PositionKey] : undefined;
  if (!cfg) {
    return (
      <Alert
        type="error"
        message="未找到该岗位"
        description={
          <span>
            未知 positionKey: {positionKey}。<Link to="/">返回首页</Link>
          </span>
        }
        showIcon
      />
    );
  }
  return <PerfWorkbench cfg={cfg} />;
}

function PerfWorkbench({ cfg }: { cfg: PositionConfig }) {
  const [results, setResults] = useState<PositionResult[] | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const stats = useMemo(() => {
    if (!results) return null;
    const total = results.length;
    const errored = results.filter((r) => r.errors.length > 0).length;
    const ok = total - errored;
    const withSalary = results.filter((r) => r.monthly_salary !== null).length;
    return { total, errored, ok, withSalary };
  }, [results]);

  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls",
    multiple: false,
    showUploadList: false,
    beforeUpload: async (file) => {
      setFileName(file.name);
      try {
        const { employees, fileErrors: fe } = await parseUpload(file, cfg);
        setFileErrors(fe);
        if (fe.length > 0) {
          setResults(null);
          message.error("文件解析失败，请查看上方错误");
        } else if (employees.length === 0) {
          setResults([]);
          message.warning("未读取到有效员工行，请检查表格内容");
        } else {
          const r = computeAll(employees);
          setResults(r);
          const errored = r.filter((x) => x.errors.length > 0).length;
          if (errored > 0) {
            message.warning(`已计算 ${r.length} 名员工，其中 ${errored} 行有错误`);
          } else {
            message.success(`已成功计算 ${r.length} 名员工`);
          }
        }
      } catch (e) {
        message.error(`解析失败：${(e as Error).message}`);
      }
      return Upload.LIST_IGNORE;
    },
  };

  const reset = () => {
    setResults(null);
    setFileErrors([]);
    setFileName("");
  };

  // 表格列。
  const dash = <span style={{ color: "#bbb" }}>—</span>;

  const inputCols = cfg.fields.map((f) => ({
    title: f.label,
    dataIndex: f.key,
    key: f.key,
    width: Math.max(110, f.label.length * 14 + 24),
    // 「姓名」列与「行号」列一起冻结在左侧，水平滚动时保持可见
    ...(f.key === "name" ? { fixed: "left" as const } : {}),
    render: (v: unknown) => {
      if (v === undefined || v === null || v === "") return dash;
      if (typeof v === "boolean") return v ? "是" : "否";
      return String(v);
    },
  }));

  const isLivestream = cfg.key === "livestream_host";

  // 评级结果新增 7 个明细列
  const bracketDetailCols = [
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
        row.salary_bracket
          ? row.salary_bracket.sal_hi - row.salary_bracket.sal_lo
          : dash,
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

  const columns = [
    {
      title: "行号",
      dataIndex: "__rowIndex",
      key: "__rowIndex",
      width: 70,
      fixed: "left" as const,
      render: (v: number | undefined) => (v ? `第 ${v} 行` : "—"),
    },
    ...inputCols,
    {
      title: "岗位评定",
      dataIndex: "grade",
      key: "grade",
      width: 130,
      render: (v: string | null) =>
        v ? <Tag color="blue">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
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
    },
    ...(isLivestream
      ? [
          {
            title: "月度激励(元)",
            dataIndex: "incentive",
            key: "incentive",
            width: 130,
            render: (v: number | null) =>
              v !== null ? <strong>{v.toLocaleString()}</strong> : <span style={{ color: "#bbb" }}>—</span>,
          },
        ]
      : []),
    ...bracketDetailCols,
    {
      title: "计算依据",
      dataIndex: "trace",
      key: "trace",
      width: 360,
      render: (v: string) => <span style={{ color: "#555", fontSize: 12 }}>{v || "—"}</span>,
    },
    {
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
    },
  ];

  return (
    <>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link to="/">首页</Link> }, { title: cfg.label }]}
      />

      <div className="workbench-section">
        <h3>1. 下载本岗位模板</h3>
        <p style={{ color: "#6b7280", margin: "0 0 12px" }}>
          模板包含所有可能字段，第 2 行为示例（上传时会自动跳过）；Sheet「填写说明」详细介绍各字段。
        </p>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={() => downloadTemplate(cfg)}
        >
          下载 {cfg.label} 模板
        </Button>
      </div>

      <div className="workbench-section">
        <h3>2. 上传填好的员工信息表</h3>
        <Upload.Dragger {...uploadProps} style={{ background: "#fafbff" }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或将 .xlsx 文件拖到此处</p>
          <p className="ant-upload-hint" style={{ color: "#9ca3af" }}>
            只接受用本岗位模板生成的表格，业绩单位统一为「万元」
          </p>
        </Upload.Dragger>
        {fileName && (
          <p style={{ marginTop: 12, color: "#6b7280" }}>
            当前文件: <strong>{fileName}</strong>
          </p>
        )}
        {fileErrors.length > 0 && (
          <Alert
            style={{ marginTop: 12 }}
            type="error"
            showIcon
            message="文件解析失败"
            description={
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {fileErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            }
          />
        )}
      </div>

      <div className="workbench-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>3. 评级结果</h3>
          {results && results.length > 0 && (
            <Space>
              <Button icon={<ExportOutlined />} onClick={() => exportResults(results, cfg)}>
                导出 Excel
              </Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>
                清空重传
              </Button>
            </Space>
          )}
        </div>

        {stats && (
          <div className="summary-strip">
            <span>
              总人数 <strong>{stats.total}</strong>
            </span>
            <span>
              成功 <strong style={{ color: "#52c41a" }}>{stats.ok}</strong>
            </span>
            <span>
              异常 <strong style={{ color: "#ff4d4f" }}>{stats.errored}</strong>
            </span>
            <span>
              已定薪 <strong>{stats.withSalary}</strong>
            </span>
          </div>
        )}

        {results === null ? (
          <Empty description="上传表格后这里展示结果" style={{ padding: "40px 0" }} />
        ) : results.length === 0 ? (
          <Empty description="未读取到有效员工行" style={{ padding: "40px 0" }} />
        ) : (
          <Table
            size="small"
            rowKey={(r) => `${r.__rowIndex}-${r.name}`}
            columns={columns}
            dataSource={results}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 30, showSizeChanger: true }}
            rowClassName={(r) => (r.errors.length > 0 ? "row-error" : "")}
          />
        )}
      </div>
    </>
  );
}
