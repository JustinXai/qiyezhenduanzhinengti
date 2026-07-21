"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Inner client component — uses useSearchParams, must be inside Suspense.
 * Polls GET /api/diagnoses/[id]?publicToken=… until READY, then navigates to report.
 */
function ProcessingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [stageIndex, setStageIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!token) {
      router.replace("/");
      return;
    }

    let idx = 0;
    const advance = () => {
      if (idx < STAGES.length - 1) {
        idx++;
        setStageIndex(idx);
      }
    };
    const interval = setInterval(advance, 2500);

    async function poll() {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const res = await fetch(
          `/api/diagnoses/${String(token)}?publicToken=${encodeURIComponent(String(token))}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { status?: string };
          if (data.status === "READY") {
            clearInterval(interval);
            router.replace(`/report/${token}`);
            return;
          }
        }
      } finally {
        pollingRef.current = false;
      }
    }

    poll();
    const pollInterval = setInterval(poll, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(pollInterval);
    };
  }, [token, router]);

  useEffect(() => {
    const t = setTimeout(() => setChecked(true), 100);
    return () => clearTimeout(t);
  }, []);

  const current = STAGES[stageIndex] ?? STAGES[0];

  return (
    <main className="mx-auto flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        {/* Animated icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
            <span className="text-3xl" aria-hidden>
              {current.icon}
            </span>
            {checked && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
            )}
          </div>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          正在诊断中…
        </h1>
        <p className="mb-8 text-sm text-neutral-500">
          预计需要 1–2 分钟，请勿关闭页面
        </p>

        {/* Stage list */}
        <div className="mb-8 flex flex-col gap-3 text-left">
          {STAGES.map((stage, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <div
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs transition-colors duration-300 ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-200 text-neutral-400"
                  }`}
                >
                  {done ? (
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span className="text-[10px]">{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-sm transition-colors duration-300 ${
                    active
                      ? "font-medium text-neutral-900"
                      : done
                        ? "text-neutral-400 line-through"
                        : "text-neutral-400"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Spinner */}
        <div className="flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
        </div>
      </div>
    </main>
  );
}

/**
 * Suspense shell — required by Next.js when useSearchParams is used inside a
 * client component, so the page can be statically generated at build time.
 */
export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen flex-col items-center justify-center px-6">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
        </main>
      }
    >
      <ProcessingClient />
    </Suspense>
  );
}

const STAGES = [
  { icon: "🏢", label: "正在核验企业信息" },
  { icon: "🔎", label: "正在搜索公开资料" },
  { icon: "📎", label: "正在整理证据" },
  { icon: "🧠", label: "正在分析客户问题覆盖" },
  { icon: "📄", label: "正在生成诊断报告" },
] as const;
