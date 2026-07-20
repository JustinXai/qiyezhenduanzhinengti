import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
        <span className="text-3xl" aria-hidden>
          🔍
        </span>
      </div>
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">
        页面未找到
      </h1>
      <p className="mb-8 max-w-xs text-sm text-neutral-500">
        您访问的页面不存在或已被移除。请检查链接是否正确。
      </p>
      <Link
        href="/"
        className="rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
      >
        返回首页
      </Link>
    </main>
  );
}
