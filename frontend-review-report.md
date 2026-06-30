# 前端项目审查报告 · SalaryAssistant（佳帮手·薪酬评级助手）

## 元信息

- **审查日期**：2026-06-25
- **审查范围**：全量（首次审查）
- **本次基线提交**：`14324a35399148c7526d70b3f4f29cbacc12e421`（供下次增量审查作基线）
- **技术栈**：React 19 + TypeScript ~6.0（**strict 未开**）、Vite 8、react-router-dom 7、antd 6、xlsx 0.18.5、Vitest 4；包管理器 npm；样式=单文件原生 CSS + antd + 内联 style；无状态库、无数据请求库
- **项目类型**：**纯客户端工具应用**（无后端、无网络请求；全部计算在浏览器本地完成，Excel 模板/解析/导出均在前端）。因此**跳过**「接口层 / 加载-错误-空态三态 / 密钥环境变量 / SSR」等维度——本项目不适用。
- **本次启用的维度**：① 架构与复用（重点）② 规范一致性 ③ 类型安全与健壮性 ④ 性能与可访问性（轻量）
- **客观检查结果**：
  - `npm run lint` → ✅ 干净，无告警
  - `npx tsc -b --noEmit` → ✅ 通过
  - `npm test`（vitest）→ ✅ **71 passed / 4 files**（计算与 Excel 往返逻辑测试覆盖扎实）
  - `npx tsc --strict` 试开 → **0 报错**（关键证据，见 P1-3）
  - `npm audit` → ⚠️ **1 high**（xlsx，见 P1-1）

## 一句话结论

整体**健康度良好**：核心薪酬计算有 71 个测试护航、lint 全绿、类型基本到位，没有发现会算错工资或丢数据的阻断性问题（无 P0）。主要可改进点集中在**两套 Excel 代码的重复**、**一个零成本就能开的 strict 开关**、以及**一个有已知漏洞的依赖**——三件都值得本轮处理。

## 行动清单（按优先级，可直接交给 AI 执行）

### P0 阻断
- 无。

### P1 重要（本轮值得修）

- [ ] **依赖 `xlsx@0.18.5` 存在已知高危漏洞**
  - 位置：[package.json:20](package.json)
  - 问题：`npm audit` 报 high —— 原型污染（[GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)）+ ReDoS（[GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)）；npm 上 "No fix available"，因为 SheetJS 已停止向 npm 发布新版。
  - 影响：解析构造过的恶意 .xlsx 时理论上可被原型污染 / 卡死。**缓解上下文**：本应用只解析"用户自己用本系统模板生成、再上传"的本地文件、且无后端，真实风险显著低于服务端解析陌生文件——但属于"能修就修"。
  - 怎么改：改用 SheetJS 官方 CDN 版（不走 npm 源）：
    ```
    npm rm xlsx
    npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
    ```
    代码层 `import * as XLSX from "xlsx"` 不变；升级后重跑 `npm test` 确认 4 个测试文件仍全过。
  - 状态：新增

- [ ] **Excel 工具代码重复造轮子（`src/excel/*` 与 `src/cs/excel.ts` 各写一套）**
  - 位置（重复点逐条）：
    - `fmtDate` 完全相同 —— [src/excel/export.ts:6](src/excel/export.ts) 与 [src/cs/excel.ts:325](src/cs/excel.ts)
    - 下载逻辑（`Blob`+`createObjectURL`+`a.click`+`revokeObjectURL`，含同一长串 MIME）重复 **3 处** —— [src/excel/template.ts:66](src/excel/template.ts)、[src/excel/export.ts:86](src/excel/export.ts)、[src/cs/excel.ts:330](src/cs/excel.ts)
    - `looksLikeExampleRow` / `isEmptyRow` 近乎逐字重复 —— [src/excel/parse.ts:8](src/excel/parse.ts) 与 [src/cs/excel.ts:98](src/cs/excel.ts)
    - `BOOL_TRUE` / `BOOL_FALSE` 重复且**已出现漂移** —— [src/excel/parse.ts:5](src/excel/parse.ts) 把 `""/null/undefined` 归入 FALSE，[src/cs/excel.ts:13](src/cs/excel.ts) 则没有。复制后各自演化正是 bug 温床。
    - 解析骨架（读 workbook → 找「员工信息」sheet → `sheet_to_json` → 查必填表头 → 跳示例/空行 → 逐行）两边结构重复。
  - 影响：改一处规则（如新增布尔别名、调整跳过示例行的判定）要记得改两份，容易漏；这正是"单页看着没问题、放到项目层面才暴露"的典型。
  - 怎么改：新建 `src/excel/shared.ts`，集中导出 `triggerDownload(ab, filename)`、`fmtDate(d)`、`BOOL_TRUE`/`BOOL_FALSE`/`parseBool(cell)`、`looksLikeExampleRow(row)`、`isEmptyRow(row)`、`readEmployeeSheet(file): Promise<rows>`；让 `src/excel/{template,parse,export}.ts` 与 `src/cs/excel.ts` 全部改为从它引用。每抽一个跑一次 `npm test`（已有 `src/excel/roundtrip.test.ts`、`src/cs/excel.test.ts` 兜底）。
  - 状态：新增

- [ ] **TypeScript `strict` 未开启（零成本，建议直接开）**
  - 位置：[tsconfig.app.json:8](tsconfig.app.json)、[tsconfig.node.json:8](tsconfig.node.json) 的 `compilerOptions` 均无 `"strict": true`
  - 问题：strict 关闭意味着 `strictNullChecks` 也关闭——代码里大量 `| null`/`| undefined` 联合类型与 `?.`/`!`/`=== null` 防御逻辑**其实没被编译器强制校验**，类型安全网是漏的。
  - 影响：以后新增代码可以"不处理 null 也能编译通过"，慢慢侵蚀现有的健壮性。
  - 怎么改：在两个 tsconfig 的 `compilerOptions` 加 `"strict": true`。**证据**：本次已用 `npx tsc -p tsconfig.app.json --strict --noEmit` 试跑，**0 报错**——现有代码本就是 strict-ready，开启不会破坏任何东西，纯收益。
  - 状态：新增

### P2 改进（可排期）

- [ ] **calc 与 cs 两套命名风格不一致** — calc 结果字段用 snake_case（`monthly_salary`/`perf_personal`/`raw_salary`，疑似从 Python 移植），cs 用 camelCase（`monthlySalary`/`combinedRate`/`rawSalary`）。位置：[src/calc/types.ts:46](src/calc/types.ts) vs [src/cs/types.ts:143](src/cs/types.ts)。怎么改：**不建议重写 calc**（被 71 个测试与导出列名引用，收益低风险高）；定为约定——**今后新增模块一律 camelCase**。状态：新增
- [ ] **Excel 代码组织不一致** — 岗位侧拆成 `src/excel/{template,parse,export}.ts` 三文件，客服侧塞进单个 340 行 [src/cs/excel.ts](src/cs/excel.ts)。怎么改：抽出 P1-2 的 shared 后，CS 侧也按 template/parse/export 拆分，与岗位侧对齐。状态：新增
- [ ] **缺全局/路由级 ErrorBoundary** — 若某次渲染抛错（如 antd Table 拿到异常数据），非技术用户会看到白屏无提示。`computeOne` 已 try/catch 计算异常（[src/calc/compute.ts:441](src/calc/compute.ts)），但 React 渲染错误未兜底。怎么改：在 [src/App.tsx:14](src/App.tsx) 的 `<main>` 外包一个 `ErrorBoundary`，出错时显示"页面出错了，请刷新/返回首页"。状态：新增
- [ ] **无用资源文件** — `src/assets/hero.png`、`src/assets/react.svg`、`src/assets/vite.svg` 全项目 0 引用（grep 确认）。怎么改：直接删除。状态：新增
- [ ] **卡片类型多处定义** — [src/pages/Home.tsx:6](src/pages/Home.tsx) 的 `HomeCard`、[src/cs/config.ts:245](src/cs/config.ts) 的 `CsCard`、以及 `PositionConfig` 的卡片子集结构重复。怎么改：抽一个共享 `CardMeta { key; label; shortLabel; description; color }` 类型给三处复用。状态：新增

## 分维度小结

- **架构与复用**：主要短板。两套 Excel I/O（岗位 vs 客服）有明确的函数级 + 骨架级重复（P1-2）。**值得肯定**的是：`round100` 已正确跨模块复用（cs/compute 引用 calc/engine），计算引擎用 `Bracket`/`findBracket`/`salaryFromBracket` 做了良好的表驱动抽象，9 个岗位靠 `DISPATCH` 表分发、配置与逻辑分离得干净。
- **规范一致性**：项目内**自身**风格基本统一（函数组件 + hooks、type-only import、antd 体系）；唯一明显裂缝是 calc(snake) vs cs(camel) 两套命名（P2）。`verbatimModuleSyntax` 已开启、type import 一致，是加分项。
- **类型安全与健壮性**：类型建模相当用心（`Bracket`/`CsResult` 等结构完整、注释充分），但 `strict` 没开，安全网没收紧（P1-3，零成本可补）。解析/计算都有结构化的 `errors`/`notes` 收集与行级定位，健壮性意识好。
- **性能与可访问性**：规模小、表格分页、`useMemo` 用在计算上，无性能问题。a11y 基础到位——首页卡片有 `role="button"`/`tabIndex`/`onKeyDown` 键盘可达，`index.html` 有 `lang="zh-CN"` 与完整 `title`。无需额外动作。

## 对比上次审查

- 首次审查，无历史可比。下次可用基线 `14324a3` 起做增量审查（`git diff 14324a3...HEAD`）。

## 给 AI 编程工具的执行指引（可整段复制给 Codex / Claude Code）

> 请阅读本项目根目录 `CLAUDE.md` / `AGENTS.md` 中的「前端规范」区块，并据此修复 `frontend-review-report.md` 中的问题。
> 从 P1 开始逐条按"位置 + 怎么改"执行：先开 `strict`（零风险）→ 再抽 `src/excel/shared.ts` 消重并让 `src/cs/excel.ts` 复用 → 再升级 xlsx 到 SheetJS CDN 版。
> 每修完一组运行 `npm run lint && npx tsc -b --noEmit && npm test` 验证（必须保持 71 个测试全过）。
> 修改时优先复用已有组件/工具而非新建；calc 模块的 snake_case 字段**不要**为了统一命名而重写（风险高收益低）。涉及不确定取舍先询问。
