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
                .split(/[,,\s]+/)
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
      if (res.status === 201 && data.status === "READY" && data.publicToken) {
        router.push(`/report/${data.publicToken}`);
        return;
      }
      if (data.error === "INVALID_INPUT") {
        setError("请填写有效的官网网址(需包含 http:// 或 https://)。");
      } else {
        setError(`诊断未能完成(状态:${data.status ?? "未知"})。请稍后重试。`);
      }
    } catch {
      setError("网络错误,请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 text-left">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">企业官网 *</span>
        <input
          type="url"
          required
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
          data-testid="input-website"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">品牌名称</span>
        <input
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="选填"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">所在行业</span>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="选填"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">主要竞品</span>
        <input
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
          placeholder="选填,多个用逗号分隔"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-600" role="alert" data-testid="form-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        data-testid="submit-diagnose"
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
      >
        {loading ? "诊断生成中…" : "开始诊断"}
      </button>
    </form>
  );
}
