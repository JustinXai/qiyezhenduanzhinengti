"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Real submit → Agent E API flow: POST /api/diagnoses drives the whole
// diagnosis pipeline (mock providers) synchronously to a terminal state; on a
// READY result we navigate to the public report page. No fixture, no hardcoded
// report — the page that opens fetches the canonical report the API stored.
export function DiagnoseForm() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        website: website.trim(),
        brandName: brandName.trim() || undefined,
        industry: industry.trim() || undefined,
        competitors:
          competitors.trim().length > 0
            ? competitors
                .split(/[,，\s]+/)
                .map((c) => c.trim())
                .filter(Boolean)
            : undefined,
      };
      const res = await fetch("/api/diagnoses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        publicToken?: string;
        status?: string;
        error?: string;
        issues?: { path: string; message: string }[];
      };
      if (res.status === 201 && data.publicToken) {
        router.push(`/diagnose/processing?token=${encodeURIComponent(data.publicToken)}`);
        return;
      }
      if (data.error === "INVALID_INPUT") {
        setError("请填写有效的官网网址（需包含 http:// 或 https://）。");
      } else {
        setError("诊断未能完成，请稍后重试。");
      }
    } catch {
      setError("网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-900">发起诊断</h2>
        <p className="text-sm text-neutral-500">
          输入企业官网，生成基于公开证据的诊断报告
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 text-left">
        {/* Required fields */}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold text-neutral-700">
            必填信息
          </legend>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600">
              企业官网 <span className="text-red-500">*</span>
            </span>
            <input
              type="url"
              required
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              data-testid="input-website"
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
            />
          </label>
        </fieldset>

        {/* Optional fields */}
        <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
          <legend className="mb-1 px-0.5 text-sm font-semibold text-neutral-700">
            补充信息（选填）
          </legend>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600">品牌名称</span>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="如：元气森林"
              className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600">所在行业</span>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="如：食品饮料"
              className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600">主要竞品</span>
            <input
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="多个用逗号分隔"
              className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
            />
          </label>
        </fieldset>

        {error ? (
          <p
            className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600"
            role="alert"
            data-testid="form-error"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          data-testid="submit-diagnose"
          className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              诊断生成中…
            </>
          ) : (
            <>
              <span aria-hidden>🚀</span>
              开始诊断
            </>
          )}
        </button>
      </form>
    </div>
  );
}
