<!-- FRONTEND-REVIEW:START (本区块由 frontend-review 技能自动维护；重新运行会更新此区块。区块外的内容不会被改动，可自由编写。) -->

# 前端规范（SalaryAssistant 专属）

> 本规范由代码审查沉淀而来，描述**本项目**应长期遵守的约定。后续无论用 Claude Code 还是 Codex 编程，都应遵守。
> 更新时间：2026-06-25 ｜ 适用项目类型：**纯客户端工具应用（无后端，浏览器内计算 + Excel I/O）**

## 技术栈基线

- React 19 + TypeScript（Vite 8）｜路由 react-router-dom 7｜UI antd 6 + @ant-design/icons｜Excel 用 xlsx（SheetJS）
- 样式：`src/index.css` 原生 CSS + antd 组件 + 局部内联 style；**无** Tailwind / CSS-in-JS / 状态库 / 数据请求库（本项目不联网）
- 包管理器：npm
- **提交前必须全部通过**：`npm run lint`、`npx tsc -b --noEmit`、`npm test`（当前基线 **71 个测试**，不得改少或改红）

## 必须遵守

### 复用优先（最重要）
- 写新代码前先搜项目里是否已有可复用的工具/类型/组件；**有就复用，不要重写**。
- **Excel 相关通用逻辑统一放到 `src/excel/shared.ts`**（下载触发 `triggerDownload`、`fmtDate`、布尔解析 `BOOL_TRUE/BOOL_FALSE/parseBool`、`looksLikeExampleRow`、`isEmptyRow`、读 sheet 等）。岗位侧 `src/excel/*` 与客服侧 `src/cs/excel.ts` 都从这里引用，**禁止再各写一份**。
- 薪资取整一律用 `src/calc/engine.ts` 的 `round100`，区间匹配用 `findBracket`/`salaryFromBracket`，不要另写。
- 重复出现的常量/MIME/魔法值抽成共享常量，禁止散落硬编码。

### 目录与职责
- `src/calc/`：岗位（销售/运营）薪酬计算引擎（表驱动 + `DISPATCH` 分发）｜`src/cs/`：客服「队列评级」模型（依赖均值/排名/分位，独立于 calc）｜`src/excel/`：岗位 Excel 模板/解析/导出｜`src/positions/`、`src/cs/config.ts`：配置数据｜`src/pages/`：页面｜业务规则改动优先改**配置/表格**而非散落进组件。
- 新增岗位：在 `positions/registry.ts` + `calc/tables.ts` + `calc/compute.ts` 的 `DISPATCH` 三处登记，**不要**在页面里写岗位特例。

### 命名
- **新增模块一律 camelCase**（变量/函数/对象字段、布尔 `is/has` 前缀、事件 `handleXxx`）。
- `src/calc/*` 现存 snake_case 结果字段（`monthly_salary` 等）是历史遗留，**保持现状、不要为统一命名而重写**（被测试与导出列名引用，风险高）。

### 代码风格 / 类型
- 统一函数组件 + hooks；type-only 导入用 `import type`（已开 `verbatimModuleSyntax`）。
- 以 ESLint 配置为准，不写 `eslint-disable`（除非有注释说明且不可避免，如动态 key 赋值）。
- **目标开启 `tsconfig` 的 `strict`**（已验证现有代码 0 报错）；不得用 `any`/`as any`/`@ts-ignore` 掩盖类型问题。
- 解析外部 Excel 数据要继续走"结构化 `errors`/`notes` + 行级定位"的现有模式，不盲信单元格内容。

### 健壮性与可访问性
- 面向非技术用户：交互元素保证键盘可达（沿用首页卡片的 `role`/`tabIndex`/`onKeyDown` 写法）；出错给清晰中文提示而非白屏（建议加全局 ErrorBoundary）。
- 任何可能抛错的解析/计算都要兜底，错误信息要能定位到「第 N 行 / 哪个字段」。

## 反模式（本项目要避免）
- ❌ 在 `src/cs/excel.ts` 和 `src/excel/parse.ts` 各维护一份 `BOOL_TRUE`/`isEmptyRow`/`fmtDate`/下载逻辑 —— 必须收敛到 `src/excel/shared.ts`。
- ❌ 把岗位/客服的业务阈值硬编码进页面组件 —— 放进 `tables.ts` / `config.ts`。
- ❌ 关闭或绕过 `strict`、用 `any` 压类型错误。
- ❌ 引入 npm 源的 `xlsx`（有已知 CVE）—— 用 SheetJS 官方 CDN 版 tgz 安装。
- ❌ 留 Vite 模板残留的无用资源（`src/assets/react.svg`/`vite.svg`/`hero.png`）。

<!-- FRONTEND-REVIEW:END -->
