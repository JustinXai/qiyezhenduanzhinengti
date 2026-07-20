"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { DiagnosisReport } from "@/src/contracts";

interface ReportReviewData {
  report: DiagnosisReport;
  originalReport: DiagnosisReport;
  latestRevision: {
    id: string;
    revisionNumber: number;
    revisionReason: string;
    editedFields: string[];
    reviewerName: string | null;
    reviewedAt: string;
  } | null;
  hasRevisions: boolean;
}

interface RevisionInput {
  headlineConclusion?: string;
  publicInformationOpportunityTitle?: string;
  publicInformationOpportunityDescription?: string;
  publicInformationActionText?: string;
  contactName?: string;
  contactPhone?: string;
  contactWechat?: string;
  contactDescription?: string;
  hiddenModules?: string[];
  reviewerName: string;
}

export default function ReportReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>("");
  const [data, setData] = useState<ReportReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);

  // Form state
  const [formData, setFormData] = useState<RevisionInput>({
    reviewerName: "",
  });

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/internal/report-review/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "内部修订功能未启用" : "加载失败");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/internal/report-review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("保存失败");

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      // Refresh data
      const refreshRes = await fetch(`/api/internal/report-review/${token}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setData(refreshData);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!token) return;
    setPublishing(true);

    try {
      const res = await fetch(`/api/internal/report-review/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerName: formData.reviewerName,
          contactSummary: formData.contactDescription,
        }),
      });

      if (!res.ok) throw new Error("发布失败");

      const result = await res.json();
      setPublished(true);
      alert(`已标记为已审核！事件ID: ${result.event.eventId}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold text-red-600">{error || "加载失败"}</h1>
        <Link href="/" className="text-blue-600 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  const report = data.report;
  const companyName = report.companyProfile?.brandName || "未知企业";
  const score = report.scores?.overallScore ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">报告人工修订</h1>
            <p className="text-sm text-gray-500">{companyName}</p>
          </div>
          <Link
            href={`/report/${token}`}
            className="text-blue-600 hover:underline text-sm"
          >
            预览报告 →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Revision Info */}
        {data.hasRevisions && data.latestRevision && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900">当前版本信息</h3>
            <p className="text-sm text-blue-700 mt-1">
              修订版本 #{data.latestRevision.revisionNumber} · 
              由 {data.latestRevision.reviewerName || "未知"} 于{" "}
              {new Date(data.latestRevision.reviewedAt).toLocaleString("zh-CN")} 修订
            </p>
            <p className="text-sm text-blue-600 mt-1">
              已修改字段: {data.latestRevision.editedFields.join(", ")}
            </p>
          </div>
        )}

        {/* Score Info (Read-only) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">综合评分 (不可修改)</h2>
          <div className="flex items-center gap-6">
            <div className="text-4xl font-bold text-blue-600">{score.toFixed(1)}</div>
            <div className="text-sm text-gray-500">
              <p>评分覆盖: {((report.scores?.scoreCoverage ?? 0) * 100).toFixed(0)}%</p>
              <p>诊断ID: {report.diagnosisId}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            综合评分和Evidence数据不可人工修改，以确保报告真实性。
          </p>
        </div>

        {/* Editable Fields */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">可编辑内容</h2>

          <div className="space-y-4">
            {/* Reviewer Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                审核人姓名 *
              </label>
              <input
                type="text"
                value={formData.reviewerName}
                onChange={(e) => setFormData({ ...formData, reviewerName: e.target.value })}
                placeholder="输入审核人姓名"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Public Information Opportunity */}
            {report.questionCoverageGaps && report.questionCoverageGaps.length > 0 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    公开信息完善机会 - 标题
                  </label>
                  <input
                    type="text"
                    value={formData.publicInformationOpportunityTitle ?? report.questionCoverageGaps[0]?.missingInformation ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, publicInformationOpportunityTitle: e.target.value })
                    }
                    placeholder="修改缺失信息的描述"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    公开信息完善机会 - 建议动作
                  </label>
                  <textarea
                    value={formData.publicInformationOpportunityDescription ?? report.questionCoverageGaps[0]?.suggestedAction ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, publicInformationOpportunityDescription: e.target.value })
                    }
                    placeholder="修改建议的具体动作"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    行动建议 - 商业价值说明
                  </label>
                  <textarea
                    value={formData.publicInformationActionText ?? report.questionCoverageGaps[0]?.businessValue ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, publicInformationActionText: e.target.value })
                    }
                    placeholder="修改潜在商业价值说明"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {/* Contact Information */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium text-gray-900 mb-3">联系方式 (用于后续沟通)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                  <input
                    type="text"
                    value={formData.contactName ?? ""}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="姓名"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                  <input
                    type="text"
                    value={formData.contactPhone ?? ""}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="手机号码"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">微信</label>
                  <input
                    type="text"
                    value={formData.contactWechat ?? ""}
                    onChange={(e) => setFormData({ ...formData, contactWechat: e.target.value })}
                    placeholder="微信号"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">补充说明</label>
                <textarea
                  value={formData.contactDescription ?? ""}
                  onChange={(e) => setFormData({ ...formData, contactDescription: e.target.value })}
                  placeholder="其他联系方式或说明"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between bg-white rounded-lg shadow p-6">
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !formData.reviewerName}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "保存中..." : saved ? "✓ 已保存" : "保存修订"}
            </button>
            <Link
              href={`/report/${token}`}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              预览报告
            </Link>
          </div>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {publishing ? "发布中..." : published ? "✓ 已发布" : "标记为已审核"}
          </button>
        </div>

        {/* Help Text */}
        <div className="text-xs text-gray-500">
          <p>修订将创建新的append-only版本，不会覆盖原始报告</p>
          <p>综合评分、Evidence、Claim-Evidence关系等核心数据不可修改</p>
          <p>点击「标记为已审核」将生成ReportPublishedEventV1事件</p>
        </div>
      </main>
    </div>
  );
}
