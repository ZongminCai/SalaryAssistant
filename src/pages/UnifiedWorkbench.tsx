import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Breadcrumb, Button, Collapse, Empty, message, Space, Table, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { DownloadOutlined, ExportOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  PER_POSITION_RULES,
  POSITION_COLUMN_LABEL,
  UNIFIED_ENTRY_DESCRIPTION,
  UNIFIED_ENTRY_LABEL,
  UNIFIED_FIELDS,
  UNIFIED_TEMPLATE_SPEC,
} from "../positions/unified";
import type { PositionResult } from "../calc/types";
import { computeAll } from "../calc/compute";
import { downloadTemplate } from "../excel/template";
import { parseUnifiedUpload } from "../excel/parse";
import { exportUnifiedResults } from "../excel/export";
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

export default function UnifiedWorkbench() {
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
        const { employees, fileErrors: fe } = await parseUnifiedUpload(file);
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

  // 输入回显列：岗位列取 position_label，其余按统一字段 key 回显
  const inputCols = UNIFIED_FIELDS.map((f) =>
    f.key === "position"
      ? {
          title: POSITION_COLUMN_LABEL,
          dataIndex: "position_label",
          key: "position_label",
          width: 150,
          render: (v: string) => (v ? <Tag color="geekblue">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>),
        }
      : inputColumn(f),
  );

  const columns = [
    rowIndexColumn,
    ...inputCols,
    gradeColumn,
    salaryColumn,
    incentiveColumn,
    ...bracketDetailCols,
    traceColumn,
    msgsColumn,
  ];

  const ruleItems = PER_POSITION_RULES.map((r) => ({
    key: r.key,
    label: r.label,
    children: (
      <div style={{ fontSize: 13, color: "#4b5563" }}>
        <p style={{ margin: "0 0 8px" }}>{r.description}</p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>必填：</strong>
          {r.requiredFields}
        </p>
        <p style={{ margin: "0 0 8px" }}>
          <strong>条件必填：</strong>
          {r.conditionalFields}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {r.extraNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    ),
  }));

  return (
    <>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link to="/">首页</Link> }, { title: UNIFIED_ENTRY_LABEL }]}
      />

      <div className="workbench-section">
        <h3>各岗位规则速览</h3>
        <p style={{ color: "#6b7280", margin: "0 0 12px" }}>{UNIFIED_ENTRY_DESCRIPTION}</p>
        <Collapse items={ruleItems} />
      </div>

      <div className="workbench-section">
        <h3>1. 下载统一模板</h3>
        <p style={{ color: "#6b7280", margin: "0 0 12px" }}>
          模板含 13 列统一字段与 9 行分岗位示例（上传时自动跳过）；Sheet「填写说明」含字段×岗位适用矩阵、
          个人业绩口径与岗位别名表。
        </p>
        <Button type="primary" icon={<DownloadOutlined />} onClick={() => downloadTemplate(UNIFIED_TEMPLATE_SPEC)}>
          下载 {UNIFIED_ENTRY_LABEL} 模板
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
            可混填多个岗位，每行通过「{POSITION_COLUMN_LABEL}」列定岗；业绩单位统一为「万元」
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
              <Button icon={<ExportOutlined />} onClick={() => exportUnifiedResults(results)}>
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
