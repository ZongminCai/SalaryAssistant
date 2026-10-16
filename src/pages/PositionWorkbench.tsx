import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Breadcrumb, Button, Empty, message, Space, Table, Upload } from "antd";
import type { UploadProps } from "antd";
import { DownloadOutlined, ExportOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { POSITION_CONFIGS } from "../positions/registry";
import type { PositionConfig } from "../positions/registry";
import { UNIFIED_ENTRY_LABEL } from "../positions/unified";
import type { PositionKey, PositionResult } from "../calc/types";
import { computeAll } from "../calc/compute";
import { downloadTemplate } from "../excel/template";
import { parseUpload } from "../excel/parse";
import { exportResults } from "../excel/export";
import { CS_CONFIGS } from "../cs/config";
import type { CsPositionKey } from "../cs/types";
import CustomerServiceWorkbench from "./CustomerServiceWorkbench";
import {
  bracketDetailCols,
  gradeColumn,
  incentiveColumn,
  inputColumn,
  msgsColumn,
  rowIndexColumn,
  salaryColumn,
  traceColumn,
} from "./resultColumns";

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

  const inputCols = cfg.fields.map(inputColumn);
  const isLivestream = cfg.key === "livestream_host";

  const columns = [
    rowIndexColumn,
    ...inputCols,
    gradeColumn,
    salaryColumn,
    ...(isLivestream ? [incentiveColumn] : []),
    ...bracketDetailCols,
    traceColumn,
    msgsColumn,
  ];

  return (
    <>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link to="/">首页</Link> }, { title: cfg.label }]}
      />

      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        message="旧版入口"
        description={
          <span>
            本入口仅保留用于旧岗位模板；推荐改用{" "}
            <Link to="/unified">{UNIFIED_ENTRY_LABEL}</Link>（一份模板兼容全部岗位）。
          </span>
        }
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
            pagination={{ defaultPageSize: 30, showSizeChanger: true }}
            rowClassName={(r) => (r.errors.length > 0 ? "row-error" : "")}
          />
        )}
      </div>
    </>
  );
}
