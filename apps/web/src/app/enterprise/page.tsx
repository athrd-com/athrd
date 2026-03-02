"use client";

import { useMemo, useState } from "react";

const faqs = [
  {
    question: "What is Athrd Enterprise?",
    answer:
      "Athrd Enterprise is a private deployment model designed for organizations that need secure sharing, governance, and priority support.",
  },
  {
    question: "How do we get started?",
    answer:
      "Share your use case with our team through the contact form and we will follow up to scope setup, security requirements, and rollout.",
  },
  {
    question: "How does enterprise pricing work?",
    answer:
      "Pricing is custom and based on organization size, required integrations, and support needs.",
  },
  {
    question: "Is our data secure?",
    answer:
      "Yes. We work with your team to align deployment and access controls with your internal security standards.",
  },
];

export default function EnterprisePage() {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState("");

  const emailSubject = "Athrd Enterprise Inquiry";

  const emailBody = useMemo(
    () =>
      [
        `Full name: ${fullName || "-"}`,
        `Role: ${role || "-"}`,
        `Company email: ${email || "-"}`,
        "",
        "What problem are you trying to solve?",
        problem || "-",
      ].join("\n"),
    [fullName, role, email, problem],
  );

  const encodedSubject = encodeURIComponent(emailSubject);
  const encodedBody = encodeURIComponent(emailBody);

  const mailtoHref = `mailto:founder@athrd.com?subject=${encodedSubject}&body=${encodedBody}`;
  const gmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=founder@athrd.com&su=${encodedSubject}&body=${encodedBody}`;
  const outlookHref = `https://outlook.office.com/mail/deeplink/compose?to=founder@athrd.com&subject=${encodedSubject}&body=${encodedBody}`;

  return (
    <main className="min-h-screen text-foreground">
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-start">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Enterprise
          </p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Your data stays yours.
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Athrd runs inside your organization with controls built for secure
            collaboration. Start with your team, then scale across your company
            with SSO and internal workflow integrations.
          </p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Security-first deployment</p>
            <p>Org-wide access controls</p>
            <p>Priority support</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Contact sales</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Fill this out, then choose your email provider to send the message.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="fullName"
                className="mb-1 block text-sm text-foreground"
              >
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={fullName}
                required
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
              />
            </div>

            <div>
              <label htmlFor="role" className="mb-1 block text-sm text-foreground">
                Role
              </label>
              <input
                id="role"
                name="role"
                type="text"
                value={role}
                required
                onChange={(event) => setRole(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-foreground">
                Company email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
              />
            </div>

            <div>
              <label
                htmlFor="problem"
                className="mb-1 block text-sm text-foreground"
              >
                What problem are you trying to solve?
              </label>
              <textarea
                id="problem"
                name="problem"
                rows={4}
                value={problem}
                required
                onChange={(event) => setProblem(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <a
              href={gmailHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Send with Gmail
            </a>
            <a
              href={outlookHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted"
            >
              Send with Outlook
            </a>
            <a
              href={mailtoHref}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted"
            >
              Send with Mail App
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          FAQ
        </h2>

        <div className="mt-6 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-border bg-card p-5"
            >
              <summary className="cursor-pointer list-none pr-8 text-base font-medium">
                {faq.question}
                <span className="float-right text-muted-foreground transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
