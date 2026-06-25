import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Breadcrumb,
  Button,
  Empty,
  InputNumber,
  message,
  Space,
  Table,
  Tag,
  Upload,
} from "antd";
import type { UploadProps } from "antd";
import { DownloadOutlined, ExportOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { CS_CONFIGS } from "../cs/config";
import { computeCs } from "../cs/compute";
import type { CsComputeOutput } from "../cs/compute";
import { downloadCsTemplate, exportCsResults, parseCsUpload } from "../cs/excel";
import type { CsEmployee, CsIndicatorDetail, CsPositionKey, CsResult } from "../cs/types";

const dash = <span style={{ color: "#bbb" }}>—</span>;

function fmtPct(x: number | null | undefined): string {
  return x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`;
}

function indicatorCell(d: CsIndicatorDetail | undefined) {
  if (!d) return dash;
  return (
    <span>
      <strong>{d.label}</strong>
      <span style={{ marginLeft: 6, color: d.anyCapped ? "#fa8c16" : "#1677ff" }}>
        季度{(d.rate * 100).toFixed(1)}%
      </span>
      {d.anyCapped && (
        <Tag color="orange" style={{ marginLeft: 4 }}>含封顶</Tag>
      )}
      <div style={{ color: "#888", fontSize: 12 }}>
        {d.monthly
          .map(
            (m, i) =>
              `${i + 1}月 ${m.value}/均${m.mean.toFixed(1)}=${(m.rate * 100).toFixed(0)}%${m.capped ? "(封顶)" : ""}`,
          )
          .join(" · ")}
      </div>
    </span>
  );
}

export default function CustomerServiceWorkbench({ csKey }: { csKey: CsPositionKey }) {
  const cfg = CS_CONFIGS[csKey];

  const [employees, setEmployees] = useState<CsEmployee[] | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [headcounts, setHeadcounts] = useState<Record<string, number | undefined>>({});

  // 检测到的部门（有数据行的部门）+ 参评标记为「是」的员工数（含缺月员工，实际排名池在 compute 中按数据完整性再筛）
  const deptParticipants = useMemo(() => {
    const m: Record<string, number> = {};
    if (!employees) return m;
    for (const dept of cfg.depts) m[dept] = 0;
    for (const e of employees) {
      if (e.participate === false) continue;
      const dept = cfg.hasDeptGroup ? e.dept : cfg.depts[0];
      if (dept && dept in m) m[dept] += 1;
    }
    return m;
  }, [employees, cfg]);

  const presentDepts = useMemo(
    () => cfg.depts.filter((d) => (deptParticipants[d] ?? 0) > 0),
    [cfg.depts, deptParticipants],
  );

  const output: CsComputeOutput | null = useMemo(() => {
    if (!employees) return null;
    // 仅传入有效的 headcount（其余部门 compute 内部会回退为参评人数作为兑底，但 UI 会阅读提示未填）
    const hc: Record<string, number> = {};
    for (const [k, v] of Object.entries(headcounts)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) hc[k] = v;
    }
    return computeCs(employees, cfg, hc);
  }, [employees, cfg, headcounts]);

  // 在职人数是否均已填写（包含参评数 > 0 的部门）
  const headcountsReady = useMemo(() => {
    if (!employees || employees.length === 0) return false;
    for (const dept of presentDepts) {
      const hc = headcounts[dept];
      const participants = deptParticipants[dept] ?? 0;
      if (typeof hc !== "number" || !Number.isFinite(hc) || hc <= 0) return false;
      if (hc < participants) return false;
    }
    return true;
  }, [employees, presentDepts, headcounts, deptParticipants]);

  const stats = useMemo(() => {
    if (!output) return null;
    const total = output.results.length;
    const errored = output.results.filter((r) => r.errors.length > 0).length;
    const withSalary = output.results.filter((r) => r.monthlySalary !== null).length;
    return { total, errored, ok: total - errored, withSalary };
  }, [output]);

  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls",
    multiple: false,
    showUploadList: false,
    beforeUpload: async (file) => {
      setFileName(file.name);
      try {
        const { employees: emps, fileErrors: fe } = await parseCsUpload(file, cfg);
        setFileErrors(fe);
        if (fe.length > 0) {
          setEmployees(null);
          message.error("文件解析失败，请查看上方错误");
        } else if (emps.length === 0) {
          setEmployees([]);
          message.warning("未读取到有效员工行，请检查表格内容");
        } else {
          // 上传后不默认在职人数；请用户手动填写。
          setHeadcounts({});
          setEmployees(emps);
          message.success(`已读取 ${emps.length} 名员工，请手动填写各部门在职人数后查看结果`);
        }
      } catch (e) {
        message.error(`解析失败：${(e as Error).message}`);
      }
      return Upload.LIST_IGNORE;
    },
  };

  const reset = () => {
    setEmployees(null);
    setFileErrors([]);
    setFileName("");
    setHeadcounts({});
  };

  const columns = [
    { title: "行号", dataIndex: "__rowIndex", key: "__rowIndex", width: 64, fixed: "left" as const,
      render: (v: number) => `第${v}行` },
    { title: "姓名", dataIndex: "name", key: "name", width: 90, fixed: "left" as const,
      render: (v: string) => v || dash },
    ...(cfg.hasDeptGroup
      ? [
          { title: "部门", dataIndex: "dept", key: "dept", width: 80, render: (v: string) => v || dash },
          { title: "组别", dataIndex: "group", key: "group", width: 180, render: (v: string) => v || dash },
        ]
      : []),
    { title: "参评定薪", dataIndex: "participate", key: "participate", width: 88,
      render: (v: boolean) => v
        ? <Tag color="green">是</Tag>
        : <Tag color="default">否</Tag> },
    { title: "有效月份", dataIndex: "validMonths", key: "validMonths", width: 80,
      render: (v: number | undefined) => {
        if (v === undefined) return dash;
        if (v < 3) return <Tag color="orange">{v}/3</Tag>;
        return <span>{v}/3</span>;
      } },
    { title: "指标1", key: "ind1", width: 220, render: (_: unknown, r: CsResult) => indicatorCell(r.ind1) },
    { title: "指标2", key: "ind2", width: 220, render: (_: unknown, r: CsResult) => indicatorCell(r.ind2) },
    { title: "综合完成率(季度)", dataIndex: "combinedRate", key: "combinedRate", width: 140,
      render: (v: number | null) => (v === null ? dash : <strong>{(v * 100).toFixed(1)}%</strong>) },
    { title: "接待量", key: "reception", width: 200, render: (_: unknown, r: CsResult) =>
        r.reception === undefined ? dash : (
          <span>
            季度均值 <strong>{r.reception.toFixed(0)}</strong>
            {r.receptionOk !== undefined && (
              <Tag color={r.receptionOk ? "green" : "red"} style={{ marginLeft: 4 }}>
                {r.receptionOk ? "达标" : "不足"}
              </Tag>
            )}
            {r.receptionMonthly && (
              <div style={{ color: "#888", fontSize: 12 }}>
                {r.receptionMonthly.map((m, i) => `${i + 1}月 ${m.value}`).join(" · ")}
              </div>
            )}
          </span>
        ) },
    { title: "排名", key: "rank", width: 120, render: (_: unknown, r: CsResult) =>
        r.rank === undefined ? dash : (
          <span>
            {r.rank}/{r.poolSize}
            <div style={{ color: "#888", fontSize: 12 }}>分位{fmtPct(r.percentile)}</div>
          </span>
        ) },
    { title: "参评比例/档位", key: "tier", width: 130, render: (_: unknown, r: CsResult) =>
        r.tierLabel === undefined ? dash : (
          <span>
            {fmtPct(r.participationRatio)}
            <div style={{ color: "#888", fontSize: 12 }}>{r.tierLabel}</div>
          </span>
        ) },
    { title: "排名上限", dataIndex: "ceilingLevel", key: "ceiling", width: 110,
      render: (v: CsResult["ceilingLevel"]) => (v ? cfg.levelNames[v] : dash) },
    { title: "岗位评定", dataIndex: "grade", key: "grade", width: 150,
      render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : dash) },
    { title: "次季度月薪(元)", dataIndex: "monthlySalary", key: "monthlySalary", width: 120,
      render: (v: number | null) => (v !== null ? <strong style={{ color: "#1677ff" }}>{v.toLocaleString()}</strong> : dash) },
    { title: "计算依据", dataIndex: "trace", key: "trace", width: 420,
      render: (v: string) => <span style={{ color: "#555", fontSize: 12 }}>{v || "—"}</span> },
    { title: "提示 / 错误", key: "msgs", width: 320, render: (_: unknown, r: CsResult) => (
        <Space size={4} wrap>
          {r.errors.map((e, i) => <Tag color="red" key={`e${i}`}>{e}</Tag>)}
          {r.notes.map((n, i) => <Tag key={`n${i}`}>{n}</Tag>)}
          {r.errors.length === 0 && r.notes.length === 0 ? dash : null}
        </Space>
      ) },
  ];

  return (
    <>
      <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <Link to="/">首页</Link> }, { title: cfg.label }]} />

      <div className="workbench-section">
        <h3>1. 下载本岗位模板</h3>
        <p style={{ color: "#6b7280", margin: "0 0 12px" }}>
          客服接待岗为「队列评级」：按月计算完成率（≤120% 封顶）后取 3 个月均值，岗位级别由部门内排名分位 + 参评比例档位决定；
          综合完成率 {"<"} 80% 时以所在组别薪资区间低限定薪；「是否参与评级定薪」填「否」的员工仅作为单元均值样本。
          模板已为每个指标与接待量展开 月1/月2/月3 三列；Sheet「填写说明」含各组指标与部门-组别对应关系。
        </p>
        <Button type="primary" icon={<DownloadOutlined />} onClick={() => downloadCsTemplate(cfg)}>
          下载 {cfg.label} 模板
        </Button>
      </div>

      <div className="workbench-section">
        <h3>2. 上传填好的员工信息表</h3>
        <Upload.Dragger {...uploadProps} style={{ background: "#fafbff" }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或将 .xlsx 文件拖到此处</p>
          <p className="ant-upload-hint" style={{ color: "#9ca3af" }}>
            只接受用本岗位模板生成的表格；每人只填本组别对应的 2 个指标，各指标与接待量均需分别填写月1/月2/月3 三个月的数据；最后一列「是否参与评级定薪」默认「是」，填「否」仅作均值样本
          </p>
        </Upload.Dragger>
        {fileName && (
          <p style={{ marginTop: 12, color: "#6b7280" }}>当前文件: <strong>{fileName}</strong></p>
        )}
        {fileErrors.length > 0 && (
          <Alert style={{ marginTop: 12 }} type="error" showIcon message="文件解析失败"
            description={<ul style={{ paddingLeft: 18, margin: 0 }}>{fileErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />
        )}
      </div>

      {employees && employees.length > 0 && (
        <div className="workbench-section">
          <h3>3. 填写各部门「评级周期在职人数」</h3>
          <p style={{ color: "#6b7280", margin: "0 0 12px" }}>
            参评比例 = 参评人数 ÷ 在职人数，决定排名档位。参评人数仅计「是否参与评级定薪=是」的行，已自动统计；
            在职人数需手动填写（要求在职 ≥ 参评），未填写时评级结果不会计算。
          </p>
          <Space size={24} wrap>
            {presentDepts.map((dept) => {
              const participants = deptParticipants[dept] ?? 0;
              const hc = headcounts[dept];
              const hasHc = typeof hc === "number" && Number.isFinite(hc) && hc > 0;
              const ratio = hasHc && hc! > 0 ? participants / hc! : 0;
              const tooLow = hasHc && hc! < participants;
              return (
                <div key={dept} style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{dept}</div>
                  <Space>
                    <span style={{ color: "#888" }}>参评 {participants} 人 · 在职</span>
                    <InputNumber
                      min={1}
                      placeholder="请填写"
                      value={hasHc ? hc : null}
                      style={{ width: 100 }}
                      onChange={(val) =>
                        setHeadcounts((prev) => ({
                          ...prev,
                          [dept]: typeof val === "number" ? val : undefined,
                        }))
                      }
                    />
                  </Space>
                  <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                    {!hasHc && <span style={{ color: "#ff4d4f" }}>请填写在职人数</span>}
                    {hasHc && (
                      <>
                        参评比例 {(ratio * 100).toFixed(1)}%
                        {tooLow && <span style={{ color: "#ff4d4f" }}>（在职不应少于参评）</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Space>
        </div>
      )}

      <div className="workbench-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>4. 评级结果</h3>
          {output && output.results.length > 0 && headcountsReady && (
            <Space>
              <Button icon={<ExportOutlined />} onClick={() => exportCsResults(output, cfg)}>导出 Excel</Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>清空重传</Button>
            </Space>
          )}
        </div>

        {stats && headcountsReady && (
          <div className="summary-strip">
            <span>总人数 <strong>{stats.total}</strong></span>
            <span>成功 <strong style={{ color: "#52c41a" }}>{stats.ok}</strong></span>
            <span>异常 <strong style={{ color: "#ff4d4f" }}>{stats.errored}</strong></span>
            <span>已定薪 <strong>{stats.withSalary}</strong></span>
          </div>
        )}

        {output && headcountsReady && output.participation.some((p) => p.participants > 0) && (
          <div className="summary-strip" style={{ flexWrap: "wrap" }}>
            {output.participation.filter((p) => p.participants > 0).map((p) => (
              <span key={p.dept}>
                {p.dept}: 参评{p.participants}/在职{p.headcount} = <strong>{(p.ratio * 100).toFixed(1)}%</strong>（{p.tierLabel}）
              </span>
            ))}
          </div>
        )}

        {output === null ? (
          <Empty description="上传表格后这里展示结果" style={{ padding: "40px 0" }} />
        ) : output.results.length === 0 ? (
          <Empty description="未读取到有效员工行" style={{ padding: "40px 0" }} />
        ) : !headcountsReady ? (
          <Alert
            type="warning"
            showIcon
            style={{ margin: "16px 0" }}
            message="请先在第 3 步填写各部门在职人数"
            description="参评比例需要在职人数才能计算，请为所有有数据的部门填写在职人数（要求 ≥ 参评人数）后查看结果。"
          />
        ) : (
          <Table
            size="small"
            rowKey={(r) => `${r.__rowIndex}-${r.name}`}
            columns={columns}
            dataSource={output.results}
            scroll={{ x: "max-content" }}
            pagination={{ defaultPageSize: 30, showSizeChanger: true, pageSizeOptions: [10, 20, 30, 50, 100] }}
            rowClassName={(r) => (r.errors.length > 0 ? "row-error" : "")}
          />
        )}
      </div>
    </>
  );
}
