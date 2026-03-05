"use client";

const steps = [
  {
    label: "Step 01",
    title: "Connect athrd once",
    body: "Connect athrd to your AI CLI tooling so sessions sync automatically in the background.",
    command: "athrd auth && athrd hooks install",
  },
  {
    label: "Step 02",
    title: "Capture sessions while coding",
    body: "As engineers work with Claude, Codex, Gemini, Cursor, or VS Code, athrd creates durable session links.",
  },
  {
    label: "Step 03",
    title: "Keep PR links up to date",
    body: "Add the athrd GitHub Action to scan commit messages and keep athrd links updated in every pull request.",
  },
];

export function WorkflowSection() {
  return (
    <section className="w-full max-w-6xl mx-auto mt-20 px-6">
      <div className="rounded-3xl border border-white/10 bg-linear-to-b from-slate-950/80 via-slate-950/30 to-transparent p-6 md:p-10">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-white">
            How athrd fits your delivery flow
          </h2>
          <p className="mt-3 text-gray-400">
            Keep your current workflow. athrd adds session context where your
            team already reviews and ships code.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article
              key={step.label}
              className="rounded-2xl border border-white/10 bg-black/30 p-5"
            >
              <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-300">
                {step.label}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                {step.body}
              </p>
              {step.command && (
                <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-[#07080d] px-3 py-2 text-xs text-cyan-200">
                  <code>{step.command}</code>
                </pre>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
