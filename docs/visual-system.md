# Visual Design System — 企业诊断智能体

> 视觉语言规范，供 Agent 协作参考。修改前请阅读本文档。

## 1. Design Philosophy

**定位**：企业咨询报告 — 专业、稳重、克制、可信。

**禁止的视觉风格**：
- 廉价 AI 蓝紫炫光 / 大面积高饱和渐变
- 玻璃拟态堆砌（glassmorphism）
- 过度动画 / 过多彩色标签
- 技术控制台视觉（深色 sidebar、低对比度代码风格）

**推荐的方向**：
- 清晰留白，克制用色
- 重点数据大字号突出
- 一个主强调色（品牌 Emerald，克制使用）
- 浅灰背景 + 白色报告卡片 + 深色正文

---

## 2. Color System

### Semantic Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#fafafa` | 页面背景 |
| `--color-surface` | `#ffffff` | 卡片、浮层背景 |
| `--color-surface-alt` | `#f5f5f5` | 次级背景、区块 |
| `--color-border` | `#e5e5e5` | 默认边框 |
| `--color-border-strong` | `#d4d4d4` | 强调边框、分隔线 |
| `--color-text-primary` | `#171717` | 正文标题 |
| `--color-text-secondary` | `#525252` | 副标题、正文 |
| `--color-text-muted` | `#a3a3a3` | 占位符、禁用态 |
| `--color-accent` | `#059669` | Emerald 600 — 唯一强调色 |
| `--color-accent-hover` | `#047857` | 按钮悬停 |
| `--color-accent-soft` | `#ecfdf5` | 强调色浅底（标签背景等） |

### Neutral Scale（Tailwind neutral）

```
neutral-50   #fafafa   极浅背景
neutral-100  #f5f5f5   次级背景、hover 底
neutral-200  #e5e5e5   边框、分隔线（默认）
neutral-300  #d4d4d4   边框（强调）
neutral-400  #a3a3a3   占位符文字
neutral-500  #737373   次要文字
neutral-600  #525252   正文文字
neutral-700  #404040   标题文字
neutral-800  #262626   深色背景
neutral-900  #171717   最深文字
```

### Brand / Accent Scale（Tailwind brand / emerald）

强调色仅在以下场景使用：
- 关键评分数字（分数 > 80 等）
- 主要 CTA 按钮
- 成功状态标签
- 少量装饰（六边形 logo）

```
brand-50   #ecfdf5   浅强调背景
brand-100  #d1fae5   强调背景（hover）
brand-500  #10b981   图表色
brand-600  #059669   主强调色（品牌）
brand-700  #047857   悬停态
brand-800  #065f46   深色强调
brand-900  #064e3b   极深强调
```

### Status Badges

| Badge | Background | Text |
|---|---|---|
| 成功 | `bg-emerald-50` | `text-emerald-700` |
| 警告 | `bg-amber-50` | `text-amber-700` |
| 危险 | `bg-red-50` | `text-red-700` |
| 中性 | `bg-neutral-100` | `text-neutral-600` |

使用 `.badge-success` / `.badge-warning` / `.badge-danger` / `.badge-neutral` CSS 工具类。

---

## 3. Typography

### Font Stack

```css
--font-sans: "Noto Sans SC", "PingFang SC", "Microsoft YaHei",
             "Helvetica Neue", Arial, sans-serif;
```

**Noto Sans SC** 通过 Next.js `next/font/google` 加载，预设字重：300, 400, 500, 600, 700。

### Type Scale

| Token | Size | Line Height | Usage |
|---|---|---|---|
| `--text-2xs` | 10px | 16px | 极小标签 |
| `--text-xs` | 12px | 16px | 标签、徽章 |
| `--text-sm` | 14px | 20px | 次要内容 |
| `--text-base` | 16px | 24px | 正文 |
| `--text-lg` | 18px | 28px | 卡片标题 |
| `--text-xl` | 20px | 28px | 分节标题 |
| `--text-2xl` | 24px | 32px | 大标题 |
| `--text-3xl` | 30px | 36px | 页面主标题 |
| `--text-4xl` | 36px | 40px | 仪表盘主数字 |

### Metric Display

指标数字使用 `.metric-display`（`text-4xl font-bold tracking-tight text-neutral-900`）。

---

## 4. Spacing System

基于 **4px 网格**：

| Token | Value | 常用场景 |
|---|---|---|
| `--space-1` | 4px | 密集间距 |
| `--space-2` | 8px | 元素内 gap |
| `--space-3` | 12px | 紧凑 padding |
| `--space-4` | 16px | 标准 padding |
| `--space-5` | 20px | 卡片 padding |
| `--space-6` | 24px | 分节间距 |
| `--space-8` | 32px | 大区块间距 |
| `--space-10` | 40px | 页面级间距 |
| `--space-12` | 48px | 分节间隔 |
| `--space-16` | 64px | 大段落 |

Tailwind 默认 spacing 也可用（`p-4`, `gap-2`, `mt-6` 等）。

---

## 5. Border Radius

| Token | Value | 用途 |
|---|---|---|
| `--radius-sm` | 4px | Input, Select |
| `--radius-md` | 6px | 按钮、默认卡片 |
| `--radius-lg` | 8px | 报告卡片 |
| `--radius-xl` | 12px | 弹窗、浮层 |
| `--radius-full` | 9999px | Pill 标签、Chip |

---

## 6. Shadow System

| Token | 用途 |
|---|---|
| `--shadow-xs` | 微阴影，按钮默认 |
| `--shadow-sm` | 悬停态、次级卡片 |
| `--shadow-md` | 浮层、Dropdown |
| `--shadow-lg` | Modal、高层级 |
| `--shadow-card` | `0 0 0 1px var(--color-border), 0 2px 8px -1px rgb(0 0 0 / 0.05)` — 报告卡片首选 |
| `--shadow-inset` | Input、Select 内部 |

Tailwind 类：`shadow-card`（自定义） / `shadow-sm` / `shadow-md`。

---

## 7. Transitions

| Token | Duration | Usage |
|---|---|---|
| `--transition-fast` | 150ms | 颜色变化、hover |
| `--transition-base` | 200ms | 默认过渡 |
| `--transition-slow` | 300ms | 入场动画 |

Timing function：`cubic-bezier(0.4, 0, 0.2, 1)`（默认 ease）

---

## 8. Component Patterns

### Report Card

```tsx
<div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-card">
  {/* 内容 */}
</div>
```

### Section Header

```tsx
<div className="flex items-center gap-3 mb-4">
  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-xs font-semibold text-neutral-600">
    1
  </div>
  <h2 className="text-lg font-semibold text-neutral-900 tracking-tight">
    分节标题
  </h2>
</div>
```

### Tab Navigation

使用嵌入 `div` 容器的 segmented control 模式（非独立 pill 按钮）：

```tsx
<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
  {tabs.map((tab) => (
    <button
      key={tab.key}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
        active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Number Chip

用于序号或编号展示：

```tsx
<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-xs font-semibold text-neutral-600">
  1
</span>
```

### Status Badge

```tsx
<span className="badge-success">优秀</span>
<span className="badge-warning">待改进</span>
<span className="badge-danger">不合格</span>
<span className="badge-neutral">未知</span>
```

### Divider

```tsx
<div className="border-t border-neutral-200" />
```

---

## 9. CSS Custom Properties Reference

所有 token 在 `:root` 中定义，可直接在任何 CSS 中使用：

```css
.my-class {
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--space-5);
  transition: var(--transition-colors);
}
```

---

## 10. Tailwind Custom Tokens

以下在 `tailwind.config.ts` 中扩展，可直接用 Tailwind 类：

| Token | 用途 | 用法示例 |
|---|---|---|
| `text-2xs` | 极小文字 | `text-2xs text-neutral-400` |
| `font-brand-*` | 品牌色 | `bg-brand-600` |
| `shadow-card` | 报告卡片阴影 | `shadow-card` |
| `max-w-report` | 报告最大宽度 | `max-w-report` |
| `animate-fade-in` | 淡入动画 | `animate-fade-in` |
| `animate-slide-up` | 滑入动画 | `animate-slide-up` |

---

## 11. Common Patterns

### Metric Card

```tsx
<div className="flex flex-col gap-1">
  <span className="text-4xl font-bold tracking-tight text-neutral-900 tabular-nums">
    78
  </span>
  <span className="text-sm font-medium text-neutral-500">综合评分</span>
</div>
```

### Evidence Item

```tsx
<div className="rounded-lg border border-neutral-200 p-4">
  <div className="flex items-start gap-3">
    <span className="mt-0.5 text-xs font-semibold text-neutral-400">01</span>
    <div>
      <p className="text-sm text-neutral-700">证据内容</p>
      <p className="mt-1 text-xs text-neutral-400">来源</p>
    </div>
  </div>
</div>
```

### Progress Bar

```tsx
<div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
  <div
    className="h-full rounded-full bg-brand-500 transition-all"
    style={{ width: "75%" }}
  />
</div>
```

---

## 12. Accessibility Notes

- 所有交互元素必须有 `focus-visible` 样式（已内置于 `globals.css`）
- 颜色对比度必须满足 WCAG AA（neutral-500 及以上用于正文）
- 动画尊重 `prefers-reduced-motion`
- 背景颜色不使用纯黑/纯白

---

*最后更新：2026-07-20 | Agent BA*
