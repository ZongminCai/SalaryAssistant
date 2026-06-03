# 佳帮手 · 薪酬评级助手 (SalaryAssistant)

为薪酬专员提供的 Web 工具：覆盖佳帮手集团 6 类岗位（视频内容 / 跨境运营 / 商务 / 商城运营 / 主播 / 产品运营）的**季度评级与定薪**计算。下载岗位模板 → 在 Excel 中填入员工绩效 → 上传 → 自动算出每人「岗位评定 + 次季度月薪」并标出错误行 → 一键导出结果。

源自同名 Claude Skill（`手搓技能/salary-grading/`），区间表、计算规则 1:1 移植自 Python 引擎 `scripts/calc_pay.py`。

## 技术栈

- **React 19 + TypeScript + Vite**：纯前端 SPA，零后端，部署到任何静态站点即可。
- **Ant Design 5**：中文 UI 库，表格 / 上传 / 卡片开箱即用。
- **SheetJS (`xlsx`)**：浏览器内生成模板、解析上传、导出结果。
- **Vitest**：移植 28 个边界用例 + 3 个模板圆环测试，全部 PASS 才算引擎正确。

## 项目结构

```
src/
├── calc/           # 计算引擎（engine / tables / compute / types）+ Vitest 用例
├── excel/          # 模板生成、上传解析、结果导出
├── positions/      # 6 个岗位的字段元数据
├── pages/          # Home（卡片）+ PositionWorkbench（工作台）
├── App.tsx         # 路由
└── main.tsx        # 入口（ConfigProvider / BrowserRouter）
```

## 本地运行

```bash
npm install
npm run dev          # 启动 http://localhost:5173
npm run test         # 跑 31 条 vitest 用例
npm run build        # 输出 dist/，可部署到任意静态站点
npm run preview      # 本地预览构建产物
```

## 使用流程

1. 打开首页 → 在 6 张岗位卡片中点击对应岗位。
2. 「下载模板」→ 在 Excel 中填写员工信息（第 1 行表头、第 2 行示例行会被自动跳过）。
3. 「上传填好的表」→ 系统逐行解析 + 计算，结果实时展示：
   - 错误行红底高亮，红色 Tag 列出具体原因（字段缺失 / 格式错误 / 业绩低于最低区间等）。
   - 正确行显示岗位评定、次季度月薪、计算依据（trace）。
   - 主播岗额外显示月度激励列。
4. 「导出 Excel」→ 含所有列 + 计算依据 + 错误信息 + 「错误行」独立 sheet。

## 计算规则要点（详见技能源 `references/`）

- 业绩**单位统一为「万元」**。
- **专家档位固定值**（66666 / 88888 / 45000 / 20000 / 18000 / 18900 等）不参与四舍五入取百，其余计算结果一律取百。
- **组长管理薪资**：跨境 ≥4 人、商城 ≥5 人才叠加。
- **产品运营区间**为 `(低, 高]` 左开右闭。
- **试用期**：跨境 / 产品运营按转正后 ×80% 取百。
- **管培生**按学历定薪；**助理**采用谈薪制。

## 与 Python 引擎对照

`scripts/calc_pay.py` 的 28 个 `test_calc.py` 边界用例已逐条移植到 `src/calc/compute.test.ts`。区间表更新时，**同时改动 `tables.ts` 与 `calc_pay.py`，并跑两边的测试**，确保两端继续一致。
