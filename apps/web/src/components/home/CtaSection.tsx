"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import {
  HomeCommandPrompt,
  HomeCommandRow,
  HomePanel,
  HomeSection,
} from "./sharedStyles";

const commands = ["npm install -g @athrd/cli", "athrd login"];

export function CtaSection() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => {
      setCopiedCommand((current) => (current === command ? null : current));
    }, 2000);
  };

  return (
    <HomeSection className="mt-20">
      <HomePanel className="rounded-3xl p-8 md:p-12">
        <div className="pointer-events-none absolute -top-24 -right-10 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />

        <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-white">
              Open-source session history for AI-assisted code
            </h2>
            <p className="mt-4 text-base text-gray-300">
              Run these commands to connect your account and start attaching AI
              session links to your pull requests.
            </p>

            <div className="mt-5 grid gap-2 text-sm text-gray-300">
              {commands.map((command) => (
                <HomeCommandRow key={command} className="justify-between">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <HomeCommandPrompt />
                    <span>{command}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(command)}
                    className="ml-3 shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label={`Copy command: ${command}`}
                  >
                    {copiedCommand === command ? (
                      <Check size={14} className="text-green-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </HomeCommandRow>
              ))}
            </div>
          </div>
        </div>
      </HomePanel>
    </HomeSection>
  );
}
