"use client";

import type { LucideIcon } from "lucide-react";
import { GitPullRequestCreate, GraduationCap, ShieldCheck } from "lucide-react";
import { HomePanel, HomeSection } from "./sharedStyles";

type Benefit = {
  icon: LucideIcon;
  title: string;
  description: string;
  highlights: string[];
  glowClass: string;
};

const benefits: Benefit[] = [
  {
    icon: GitPullRequestCreate,
    title: "Make PRs easier to review",
    description:
      "Attach AI sessions to each change so reviewers can see decisions, tradeoffs, and execution steps in one place.",
    highlights: [
      "Reduce review back-and-forth",
      "Make design decisions explicit",
      "Preserve code-change rationale",
    ],
    glowClass: "from-sky-500/30 via-cyan-500/10 to-transparent",
  },
  {
    icon: GraduationCap,
    title: "Turn sessions into team knowledge",
    description:
      "Turn everyday AI-assisted coding into reusable project knowledge for onboarding and handoffs.",
    highlights: [
      "Document how features were built",
      "Give engineers and agents more context",
      "Keep decisions near the code",
    ],
    glowClass: "from-emerald-500/30 via-teal-500/10 to-transparent",
  },
  {
    icon: ShieldCheck,
    title: "Adopt AI with better controls",
    description:
      "Keep an auditable trail of AI-assisted work so teams can scale usage with confidence and accountability.",
    highlights: [
      "Track AI usage per change",
      "Support governance requirements",
      "Increase trust in AI-generated code",
    ],
    glowClass: "from-amber-500/30 via-orange-500/10 to-transparent",
  },
];

export function BenefitsSection() {
  return (
    <HomeSection className="mt-24">
      <div className="text-center max-w-3xl mx-auto">
        <span className="inline-flex items-center rounded-full border border-sky-300/30 bg-sky-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
          Why teams adopt athrd
        </span>
        <h2 className="mt-6 text-3xl md:text-5xl font-semibold tracking-tight text-white">
          Turn AI sessions into engineering leverage
        </h2>
        <p className="mt-4 text-gray-400 text-base md:text-lg">
          athrd keeps session context attached to your code so reviews, handoffs,
          and governance are faster and clearer.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {benefits.map((benefit) => (
          <HomePanel key={benefit.title} className="rounded-2xl p-6">
            <div
              className={`pointer-events-none absolute inset-0 bg-linear-to-br ${benefit.glowClass}`}
            />

            <div className="relative">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <benefit.icon className="h-5 w-5 text-white" />
              </div>

              <h3 className="mt-5 text-xl font-semibold text-white">
                {benefit.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                {benefit.description}
              </p>

              <ul className="mt-5 space-y-2 text-sm text-gray-300">
                {benefit.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-300/80" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          </HomePanel>
        ))}
      </div>
    </HomeSection>
  );
}
