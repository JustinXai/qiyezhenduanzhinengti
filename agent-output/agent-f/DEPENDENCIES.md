# Agent F — 依赖申请

本轮 Round-1 **无新增依赖**。

前端与报告展示层仅使用基线已存在的包:

- `react` / `react-dom`（渲染，含 `react-dom/server` 用于 UI 快照测试）
- `next`（App Router 页面）
- `zod`（仅经 `src/contracts` 复用类型/校验，未新增用法）
- `tailwindcss` / `postcss` / `autoprefixer`（样式）
- `vitest`（测试）

未使用 @testing-library / jsdom：`tests/ui` 通过 `react-dom/server` 的
`renderToStaticMarkup` 在 node 环境渲染组件做静态断言，无需新增测试依赖，也无需改动
Supervisor 独占的 `vitest.config.ts`（其 `environment: "node"` 与 `include:
tests/**/*.test.ts` 均满足）。

如后续需要交互式组件测试（点击/键盘），再单独申请 `@testing-library/react` +
`jsdom` 并说明对 `vitest.config.ts` 的最小改动。
