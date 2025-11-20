"use client";

import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { Openai } from "@/components/ui/svgs/openai";
import { Vscode } from "@/components/ui/svgs/vscode";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { CursorDark } from "../ui/svgs/cursorDark";

type PackageManager = "npm" | "npx" | "pnpm" | "yarn";

export function HeroSection() {
  const [copied, setCopied] = useState(false);
  const [brandIndex, setBrandIndex] = useState(0);
  const [packageManager, setPackageManager] = useState<PackageManager>("npm");

  const getCommand = (pm: PackageManager) => {
    switch (pm) {
      case "npm":
        return "npm install -g @athrd/cli";
      case "npx":
        return "npx @athrd/cli";
      case "pnpm":
        return "pnpm add -g @athrd/cli";
      case "yarn":
        return "yarn global add @athrd/cli";
    }
  };

  const command = getCommand(packageManager);

  const brands = [
    {
      name: "VS Code",
      color: "from-blue-500 to-sky-500",
      icon: <Vscode className="w-8 h-8 md:w-10 md:h-10" />,
    },
    {
      name: "Claude",
      color: "from-orange-500 to-red-500",
      icon: (
        <ClaudeAiIcon
          className="w-8 h-8 md:w-10 md:h-10 text-white"
          fill="currentColor"
        />
      ),
    },
    {
      name: "Cursor",
      color: "from-white-500 to-slate-500",
      icon: (
        <CursorDark
          className="w-8 h-8 md:w-10 md:h-10 text-white"
          fill="currentColor"
        />
      ),
    },
    {
      name: "Codex",
      color: "from-white-500 to-slate-400",
      icon: (
        <Openai
          className="w-8 h-8 md:w-10 md:h-10 text-white"
          fill="currentColor"
        />
      ),
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setBrandIndex((prev) => (prev + 1) % brands.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const currentBrand = brands[brandIndex] || brands[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center text-center max-w-4xl mx-auto mt-12 mb-24">
      <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-6 leading-[1.1]">
        Share your
        <span className="inline-flex items-center gap-3 md:gap-5 mx-4">
          <span className="relative group inline-flex">
            <div
              className={`absolute -inset-0.5 bg-linear-to-r ${currentBrand!.color
                } rounded-xl opacity-80 blur-[2px] transition-all duration-500`}
            ></div>
            <div className="relative w-14 h-14 md:w-20 md:h-20 bg-[#0a0a0a] rounded-xl flex items-center justify-center border border-white/10">
              {currentBrand!.icon}
            </div>
          </span>
          <span>{currentBrand!.name}</span>
        </span>
        <br />
        coding threads
      </h1>

      <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-12 font-light">
        Stop screenshotting your VS Code and Claude chats. Turn your local AI
        conversations into shareable, interactive links for your team.
      </p>

      {/* Install Command */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative group">
          <div className="absolute -inset-px bg-linear-to-r from-gray-700 to-gray-800 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative flex items-center bg-[#111] border border-gray-800 rounded-lg px-4 py-3 pr-12 font-mono text-sm text-gray-300 shadow-xl min-w-[300px] md:min-w-[400px]">
            <span className="text-green-500 mr-3">$</span>
            {command}

            <button
              onClick={handleCopy}
              className="absolute right-2 p-2 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/10"
            >
              {copied ? (
                <Check size={16} className="text-green-500" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["npm", "npx", "pnpm", "yarn"] as PackageManager[]).map((pm) => (
            <button
              key={pm}
              onClick={() => setPackageManager(pm)}
              className={`px-4 py-2 rounded-md font-mono text-sm transition-all ${packageManager === pm
                ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300"
                }`}
            >
              {pm}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
