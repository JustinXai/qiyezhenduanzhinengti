import type { ReactNode } from "react";

interface SectionProps {
  /** Optional module index shown as a numbered chip (Quick 8-module layout). */
  index?: number;
  title: string;
  subtitle?: string;
  /** Optional stable hook for e2e assertions (Agent G contract). */
  testId?: string;
  children: ReactNode;
}

/** A titled report section. Reusable across Quick / Deep views. */
export function Section({ index, title, subtitle, testId, children }: SectionProps) {
  return (
    <section
      data-testid={testId}
      className="border-t border-neutral-100 py-6 first:border-t-0 first:pt-0"
    >
      <header className="mb-4 flex items-baseline gap-3">
        {index !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
            {index}
          </span>
        )}
        <div>
          <h2 className="text-base font-semibold leading-snug text-neutral-900">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
