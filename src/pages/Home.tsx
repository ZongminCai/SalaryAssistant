import { Col, Row } from "antd";
import { useNavigate } from "react-router-dom";
import { POSITION_LIST } from "../positions/registry";

export default function Home() {
  const nav = useNavigate();
  return (
    <>
      <div className="home-intro">
        <h2>选择岗位开始评级</h2>
        <p>
          每个岗位有独立的字段要求与计算规则。点击下方卡片进入工作台 →
          下载模板 → 在 Excel 中填写员工信息 → 上传 → 自动算出职级与月薪。
        </p>
      </div>
      <Row gutter={[20, 20]}>
        {POSITION_LIST.map((cfg) => (
          <Col key={cfg.key} xs={24} sm={12} lg={8}>
            <div
              className="position-card"
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 24,
                border: "1px solid #ebedf2",
              }}
              onClick={() => nav(`/position/${cfg.key}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") nav(`/position/${cfg.key}`);
              }}
            >
              <div className="card-icon" style={{ background: cfg.color }}>
                {cfg.shortLabel.slice(0, 2)}
              </div>
              <h3>{cfg.label}</h3>
              <p>{cfg.description}</p>
            </div>
          </Col>
        ))}
      </Row>
    </>
  );
}
