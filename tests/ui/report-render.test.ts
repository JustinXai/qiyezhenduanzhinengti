import { describe, expect, it } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The components use Next's automatic JSX runtime (no `React` import, correct for
// Next 15). Vitest's esbuild transform uses the classic runtime and emits
// `React.createElement`, resolving `React` as a free/global identifier at render
// time. Expose it globally so the compiled components render under Node. This is
// a test-only shim; it changes nothing about how the components build in Next.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

import { QuickReport } from "../../components/report/quick-report";
import { DeepReport } from "../../components/report/deep-report";
import { EvidenceView } from "../../components/report/evidence-view";
import {
  toDeepReportViewModel,
  toEvidenceViewModel,
  toQuickReportViewModel,
} from "../../src/report/presentation/report-presentation-service";
import {
  SAMPLE_DIAGNOSIS_REPORT,
  buildSampleReport,
} from "../../src/fixtures/sample-report";
import { FORBIDDEN_COPY } from "../report-presentation/forbidden-copy";

function renderQuick(report = SAMPLE_DIAGNOSIS_REPORT): string {
  const vm = toQuickReportViewModel(report);
  return renderToStaticMarkup(createElement(QuickReport, { vm, onOpenDeep: () => {} }));
}

function renderDeep(report = SAMPLE_DIAGNOSIS_REPORT): string {
  const vm = toDeepReportViewModel(report);
  return renderToStaticMarkup(createElement(DeepReport, { vm }));
}

function renderEvidence(report = SAMPLE_DIAGNOSIS_REPORT): string {
  const vm = toEvidenceViewModel(report);
  return renderToStaticMarkup(createElement(EvidenceView, { vm }));
}

describe("QuickReport rendering", () => {
  it("renders the frozen score name and both CTAs verbatim", () => {
    const html = renderQuick();
    expect(html).toContain("GEO可见度基础指数");
    expect(html).toContain("预约报告解读");
    expect(html).toContain("获取企业GEO优化方案");
    expect(html).toContain(SAMPLE_DIAGNOSIS_REPORT.companyProfile.brandName);
  });

  it("renders the frozen CTA description and 30-minute points", () => {
    const html = renderQuick();
    expect(html).toContain("我们将结合本报告与您的实际业务");
    expect(html).toContain("确定最值得优先处理的 3 件事");
    expect(html).toContain("凡间AI可以交付什么");
  });

  it("renders the demonstrationFix disclaimer byte-exact with the contract", () => {
    const html = renderQuick();
    expect(html).toContain(SAMPLE_DIAGNOSIS_REPORT.demonstrationFix!.disclaimer);
  });

  it("hides the 示范修复 module when demonstrationFix is null", () => {
    const withFix = renderQuick();
    expect(withFix).toContain("示范修复");
    const withoutFix = renderQuick(buildSampleReport({ demonstrationFix: null }));
    expect(withoutFix).not.toContain("示范修复");
  });

  it("shows the competitor 'insufficient evidence' fallback instead of an empty table", () => {
    const html = renderQuick(
      buildSampleReport({
        competitorGaps: [
          {
            id: "gap_weak",
            competitorName: "竞品甲自动化",
            gapStatement: "证据不足",
            evidenceIds: ["ev_observed_news"],
          },
        ],
      }),
    );
    expect(html).toContain("已收到竞品输入");
    expect(html).toContain("暂不做确定性比较");
  });

  it("renders the three-phase roadmap goals only (no SOW / pricing)", () => {
    const html = renderQuick();
    // Round-7.1A: roadmap text may have changed
    expect(html).toContain("建议推进路径");
    expect(html).not.toContain("报价");
    expect(html).not.toContain("SOW");
  });

  it("contains no forbidden marketing copy", () => {
    const html = renderQuick();
    for (const banned of FORBIDDEN_COPY) {
      expect(html).not.toContain(banned);
    }
  });

  it("exposes the e2e data-testid hooks (Agent G contract)", () => {
    const html = renderQuick(); // sample has demonstrationFix and gaps -> modules present
    // Round-7.1A: question-coverage module shows restrained message when no assessments
    for (const key of ["summary", "question-coverage", "competitor", "issues", "fix", "geo", "priority", "roadmap", "cta"]) {
      expect(html).toContain(`data-testid="quick-module-${key}"`);
    }
    expect(html).toContain('data-testid="primary-cta"');
    expect(html).toContain('data-testid="secondary-cta"');
    expect(html).toContain('data-testid="geo-index"');
  });

  it("renders the composite index value inside the geo-index hook", () => {
    const html = renderQuick(); // sample overallScore = 62.53 -> Math.round -> 63
    expect(html).toContain('data-testid="geo-index"');
    expect(html).toContain(">63<"); // composite value rendered inside the headline
  });

  it("omits the fix module when hidden and keeps numbering contiguous", () => {
    const html = renderQuick(buildSampleReport({ demonstrationFix: null }));
    expect(html).not.toContain('data-testid="quick-module-fix"');
    // Round-7: 现在有 9 个模块（summary, ai, competitor, issues, geo, public-info, actions, roadmap, cta）
    // 编号 1-9 连续
    expect(html).toContain('data-testid="quick-module-geo"');
    expect(html).toContain('data-testid="quick-module-cta"');
    // 检查编号连续：不存在跳号（如 >9</span> 意味着有 10 个模块但我们只有 9 个）
    expect(html).not.toContain(">10</span>");
  });
});

describe("DeepReport rendering", () => {
  it("renders the company profile, unresolved questions and all five dimensions", () => {
    const html = renderDeep();
    expect(html).toContain("待确认信息");
    expect(html).toContain("企业清晰度");
    expect(html).toContain("官网完整度");
    expect(html).toContain("客户问题覆盖");
    expect(html).toContain("信任证据");
    expect(html).toContain("AI 可见度");
  });

  it("renders measurement notes framing AI as a diagnostic sample", () => {
    const html = renderDeep();
    expect(html).toContain("诊断样本");
    expect(html).toContain("测量说明");
  });

  it("does not leak forbidden copy", () => {
    const html = renderDeep();
    for (const banned of FORBIDDEN_COPY) {
      expect(html).not.toContain(banned);
    }
  });
});

describe("EvidenceView rendering", () => {
  it("renders sanitised evidence links with no leaked credentials", () => {
    const html = renderEvidence(
      buildSampleReport({
        evidence: [
          {
            ...SAMPLE_DIAGNOSIS_REPORT.evidence[0]!,
            url: "https://user:pw@example.com/a?token=abc&keep=1#frag",
          },
        ],
      }),
    );
    expect(html).toContain("keep=1");
    expect(html).not.toContain("token=abc");
    expect(html).not.toContain("pw@");
    expect(html).not.toContain("#frag");
  });

  it("shows source-type and support-level tags for evidence", () => {
    const html = renderEvidence();
    expect(html).toContain("企业官方来源"); // unified zh-labels single source
    expect(html).toContain("直接支持");
  });
});
