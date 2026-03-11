import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";

interface OrgComingSoonProps {
  organizationName?: string;
}

export function OrgComingSoon({ organizationName }: OrgComingSoonProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))] p-8 shadow-[0_30px_120px_-60px_rgba(2,6,23,0.95)] sm:p-10">
      <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(180deg,transparent,rgba(148,163,184,0.05),transparent)] lg:block" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] lg:items-end">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
            <Sparkles className="size-3.5" />
            Coming soon
          </div>
          <div className="max-w-2xl space-y-3">
            <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-[-0.04em] text-slate-50">
              Keep your team&apos;s threads private
            </h2>
            <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Bring athrd to {organizationName ?? "your organization"} with
              member-only visibility, GitHub org access controls, and a shared
              space for internal threads.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2 rounded-full px-5">
              <a
                href={`mailto:founder@athrd.com?subject=${encodeURIComponent(
                  `Enable athrd for ${organizationName ?? "our organization"}`,
                )}`}
              >
                Let me know when it's ready
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.75rem] border border-slate-800 bg-slate-950/55 p-5 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.7)] backdrop-blur">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-4 text-slate-50">
            <span className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-white/8">
              <LockKeyhole className="size-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Private to your org</p>
              <p className="text-sm text-slate-300">
                Threads visible only to members of the selected GitHub
                organization.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Early access
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Share your team name and expected seat count. We will reach out
              when private org access opens up.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
