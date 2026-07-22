"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================================
// 企业诊断智能体 — 首页表单 (Round-8 FINAL MVP)
// 表单字段顺序固定: 1.企业/品牌名称  2.企业官网  3.所属行业  4.主要产品或服务
//                  5.所在地区  6.补充问题与竞品(选填)  7.联系人/手机(选填)
//
// 设计原则:
//   - 只有企业/品牌名称必填；客户问题为空时由系统生成典型决策问题。
//   - 联系方式只用于报告解读联系, 不进入诊断 payload, 也不写入数据库。
//   - 提交后导航到 /api/diagnoses 同步生成的 /report/{token} 页面。
// ============================================================================

interface ApiResponse {
  publicToken?: string;
  status?: string;
  error?: string;
  issues?: { path: string; message: string }[];
}

const MAX_QUESTIONS = 10;
const REPORT_READY_STATUSES = new Set(["READY", "READY_LIMITED"]);

function parseQuestions(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function DiagnoseForm() {
  const router = useRouter();

  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [productOrService, setProductOrService] = useState("");
  const [targetRegion, setTargetRegion] = useState("");
  const [customerQuestionsText, setCustomerQuestionsText] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const questions = parseQuestions(customerQuestionsText);
    if (questions.length > MAX_QUESTIONS) {
      setError(`客户问题最多 ${MAX_QUESTIONS} 个,当前已填写 ${questions.length} 个。`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        website: website.trim(),
        brandName: brandName.trim(),
        industry: industry.trim() || undefined,
        productOrService: productOrService.trim() || undefined,
        targetRegion: targetRegion.trim() || undefined,
        customerQuestions: questions.length > 0 ? questions.map((q) => ({ question: q })) : undefined,
        competitors:
          competitors.trim().length > 0
            ? competitors
                .split(/[,,、\s]+/)
                .map((c) => c.trim())
                .filter(Boolean)
                .slice(0, 20)
            : undefined,
        // 联系方式只用于报告解读联系,不进入 payload, 也不入数据库
      };

      const res = await fetch("/api/diagnoses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiResponse;

      if (res.status === 201 && data.status && REPORT_READY_STATUSES.has(data.status) && data.publicToken) {
        if (contactName || contactPhone) {
          try {
            sessionStorage.setItem(
              `diagnosis-contact:${data.publicToken}`,
              JSON.stringify({ name: contactName.trim(), phone: contactPhone.trim() }),
            );
          } catch {
            // sessionStorage may be unavailable (private mode); fall through silently.
          }
        }
        router.push(`/report/${data.publicToken}`);
        return;
      }
      if (data.error === "INVALID_INPUT") {
        const first = data.issues?.[0];
        setError(
          first
            ? `输入有误: ${first.path || ""} ${first.message}`.trim()
            : "请检查输入字段后重试。",
        );
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
    <form
      onSubmit={onSubmit}
      noValidate
      data-testid="diagnose-form"
      className="mx-auto flex w-full max-w-[720px] flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm sm:p-8"
    >
      {/* 1. 企业/品牌名称 (必填) */}
      <Field
        id="brandName"
        label="企业/品牌名称"
        required
        help="只填写企业名称即可开始诊断。补充官网、行业和客户问题，可以让报告更加准确。"
      >
        <input
          id="brandName"
          required
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="请填写企业的工商注册名或对外品牌名"
          data-testid="input-brand-name"
          className={inputClass}
          autoComplete="organization"
        />
      </Field>

      {/* 2. 企业官网 (选填) */}
      <Field id="website" label="企业官网" optional help="选填，需包含 http:// 或 https://">
        <input
          id="website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
          data-testid="input-website"
          className={inputClass}
          autoComplete="url"
          inputMode="url"
        />
      </Field>

      {/* 3. 所属行业 (选填) */}
      <Field id="industry" label="所属行业" optional help="例如: 教育培训 / 食品制造 / 本地生活服务">
        <input
          id="industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="选填，系统也会根据公开信息辅助判断"
          data-testid="input-industry"
          className={inputClass}
        />
      </Field>

      {/* 4. 主要产品或服务 (选填) */}
      <Field
        id="productOrService"
        label="主要产品或服务"
        optional
        help="例如: 考研培训、烘焙食品、企业软件服务"
      >
        <input
          id="productOrService"
          value={productOrService}
          onChange={(e) => setProductOrService(e.target.value)}
          placeholder="一句话概括主营业务，选填"
          data-testid="input-product"
          className={inputClass}
        />
      </Field>

      {/* 5. 所在地区 (选填) */}
      <Field id="targetRegion" label="所在地区" optional help="例如: 中国 / 成都 / 四川">
        <input
          id="targetRegion"
          value={targetRegion}
          onChange={(e) => setTargetRegion(e.target.value)}
          placeholder="请填写主要业务或客户所在地区"
          data-testid="input-region"
          className={inputClass}
        />
      </Field>

      <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-4" data-testid="advanced-optional">
        <summary className="cursor-pointer text-base font-medium text-neutral-800">
          补充更多信息，让报告更准确（选填）
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <Field
            id="customerQuestions"
            label="客户最常问的问题"
            optional
            help={`选填，最多 ${MAX_QUESTIONS} 个问题，每行一个。为空时系统会自动生成5个典型客户决策问题。`}
          >
            <textarea
              id="customerQuestions"
              rows={5}
              value={customerQuestionsText}
              onChange={(e) => setCustomerQuestionsText(e.target.value)}
              placeholder={"选填。客户在选择、报名、采购或合作前最常问什么？每行一个。"}
              data-testid="input-customer-questions"
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <p className="mt-1 text-sm text-neutral-400" data-testid="questions-count">
              当前已填写 {parseQuestions(customerQuestionsText).length} / 最多 {MAX_QUESTIONS} 个
            </p>
          </Field>

          <Field
            id="competitors"
            label="主要竞品"
            optional
            help="多个用逗号或换行分隔，最多 20 个"
          >
            <textarea
              id="competitors"
              rows={2}
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="选填。如: 同区域同类机构或品牌"
              data-testid="input-competitors"
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </div>
      </details>

      {/* 8. 联系人和手机号 (选填, 仅用于报告解读联系) */}
      <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-medium text-neutral-800">联系人和手机号</span>
          <span className="text-xs text-neutral-400">选填</span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-neutral-500">
          仅用于报告解读联系,不会写入诊断结果,也不会出现在公开报告内容中。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="联系人姓名"
            data-testid="input-contact-name"
            className={inputClass}
            autoComplete="name"
          />
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="手机号"
            data-testid="input-contact-phone"
            className={inputClass}
            autoComplete="tel"
            inputMode="tel"
          />
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
        className="mt-1 inline-flex h-12 w-full items-center justify-center rounded-lg bg-neutral-900 px-5 text-base font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "正在检索公开信息并生成报告…" : "生成企业诊断报告"}
      </button>

      <p className="text-center text-xs leading-relaxed text-neutral-500">
        通常需要 1 至 3 分钟。生成完成后会自动进入报告页,结果基于本次公开网络信息,不承诺排名或经营结果。
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const inputClass =
  "block min-h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base leading-relaxed text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-50 disabled:text-neutral-400";

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  help?: string;
  children: React.ReactNode;
}

function Field({ id, label, required, optional, help, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-baseline gap-1.5 text-base font-medium text-neutral-800"
      >
        <span>{label}</span>
        {required ? (
          <span className="text-xs font-medium text-red-600" aria-label="必填">
            *
          </span>
        ) : null}
        {optional ? <span className="text-sm font-normal text-neutral-400">选填</span> : null}
      </label>
      {children}
      {help ? <p className="text-sm leading-relaxed text-neutral-500">{help}</p> : null}
    </div>
  );
}
