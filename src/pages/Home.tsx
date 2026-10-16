import { Col, Row, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { POSITION_LIST } from "../positions/registry";
import { UNIFIED_ENTRY_DESCRIPTION, UNIFIED_ENTRY_LABEL } from "../positions/unified";
import { CS_CARD_LIST } from "../cs/config";

interface HomeCard {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}

export default function Home() {
  const nav = useNavigate();
  const salesCards: HomeCard[] = POSITION_LIST;
  const csCards: HomeCard[] = CS_CARD_LIST;

  const renderCard = (cfg: HomeCard, legacy = false) => (
    <Col key={cfg.key} xs={24} sm={12} lg={8}>
      <div
        className="position-card"
        style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #ebedf2" }}
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
        <h3>
          {cfg.label}
          {legacy && (
            <Tag style={{ marginLeft: 8 }} color="default">
              旧版
            </Tag>
          )}
        </h3>
        <p>{cfg.description}</p>
      </div>
    </Col>
  );

  return (
    <>
      <div className="home-intro">
        <h2>选择岗位开始评级</h2>
        <p>
          推荐使用统一入口：一份模板混填多个岗位，每行按「员工岗位」列定岗 → 上传 → 自动算出职级与月薪。
          旧岗位入口保留一个季度，用于旧模板文件。
        </p>
      </div>

      <h3 className="home-group-title">销售 / 运营类岗位</h3>
      <Row gutter={[20, 32]}>
        <Col span={24}>
          <div
            className="position-card unified-card"
            style={{ background: "#f5f9ff", borderRadius: 12, padding: 24, border: "1px solid #91caff" }}
            onClick={() => nav("/unified")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") nav("/unified");
            }}
          >
            <div className="card-icon" style={{ background: "#1677ff" }}>
              统一
            </div>
            <h3>
              {UNIFIED_ENTRY_LABEL}
              <Tag style={{ marginLeft: 8 }} color="blue">
                推荐
              </Tag>
            </h3>
            <p>{UNIFIED_ENTRY_DESCRIPTION}</p>
            <p style={{ marginTop: 8, color: "#8c8c8c", fontSize: 12 }}>
              覆盖岗位：{POSITION_LIST.map((c) => c.label).join("、")}
            </p>
          </div>
        </Col>
        {salesCards.map((cfg) => renderCard(cfg, true))}
      </Row>

      <h3 className="home-group-title" style={{ marginTop: 36 }}>
        客服接待类岗位
        <span className="home-group-sub">队列评级：按组别/部门均值算完成率 + 部门内排名分位定级</span>
      </h3>
      <Row gutter={[20, 32]}>{csCards.map((cfg) => renderCard(cfg))}</Row>
    </>
  );
}
