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
  const [productOrService, setProductOrService] = useState("");
  const [targetRegion, setTargetRegion] = useState("");
  const [customerQuestions, setCustomerQuestions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic client-side validation: productOrService is required
    if (!productOrService.trim()) {
      setError("请填写主要产品或服务");
      setLoading(false);
      return;
    }

    try {
      const questions = customerQuestions
        .split("\n")
        .map((q) => q.trim())
        .filter((q) => q.length > 0)
        .slice(0, 5);

      const payload: Record<string, unknown> = {
        productOrService: productOrService.trim(),
      };

      if (brandName.trim()) {
        payload.brandName = brandName.trim();
      }
      if (website.trim()) {
        payload.website = website.trim();
      }
      if (industry.trim()) {
        payload.industry = industry.trim();
      }
      if (targetRegion.trim()) {
        payload.targetRegion = targetRegion.trim();
      }
      if (questions.length > 0) {
        payload.customerQuestions = questions.map((question) => ({ question }));
      }

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
        setError("请检查输入信息是否正确。");
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
      <form onSubmit={onSubmit} className="flex flex-col gap-5 text-left">
        {/* 企业名称/品牌名称 */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700">
            企业名称/品牌名称
          </span>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="例如：安徽XX食品有限公司"
            data-testid="input-brand-name"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
          />
          <span className="text-xs text-neutral-400">
            填写企业名称或消费者熟悉的品牌名称即可
          </span>
        </label>

        {/* 官网 */}
        <label className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-neutral-700">官网</span>
            <span className="text-xs text-neutral-400">(选填)</span>
          </div>
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="例如：www.xxx.com"
            data-testid="input-website"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
          />
          <span className="text-xs text-neutral-400">
            没有官网也可以填写品牌名称，我们将根据公开信息分析
          </span>
        </label>

        {/* 行业 */}
        <label className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-neutral-700">所属行业</span>
            <span className="text-xs text-neutral-400">(选填)</span>
          </div>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="例如：食品饮料、餐饮服务"
            data-testid="input-industry"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
          />
        </label>

        {/* 主要产品或服务 */}
        <label className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-neutral-700">
              主要产品或服务 <span className="text-red-500">*</span>
            </span>
          </div>
          <input
            type="text"
            required
            value={productOrService}
            onChange={(e) => setProductOrService(e.target.value)}
            placeholder="例如：预制菜、奶茶加盟、企业咨询"
            data-testid="input-product-service"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
          />
        </label>

        {/* 主要市场地区 */}
        <label className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-neutral-700">主要市场地区</span>
            <span className="text-xs text-neutral-400">(选填)</span>
          </div>
          <input
            type="text"
            value={targetRegion}
            onChange={(e) => setTargetRegion(e.target.value)}
            placeholder="例如：全国、华东、安徽"
            data-testid="input-region"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition"
          />
        </label>

        {/* 客户最关心的问题 */}
        <label className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-neutral-700">
              客户最关心的问题
            </span>
            <span className="text-xs text-neutral-400">(选填，最多5个)</span>
          </div>
          <textarea
            value={customerQuestions}
            onChange={(e) => setCustomerQuestions(e.target.value)}
            placeholder={`例如：
产品有什么优势？
如何购买？
如何合作？`}
            rows={4}
            data-testid="input-customer-questions"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition resize-none"
          />
          <span className="text-xs text-neutral-400">
            每行填写一个问题，不填写将使用常见问题模板
          </span>
        </label>

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
