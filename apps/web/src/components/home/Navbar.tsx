"use client";

import { Github } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatedLogo } from "./AnimatedLogo";

function formatStars(n: number | null) {
  if (n === null) return "—";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

export function Navbar() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStars() {
      try {
        const res = await fetch("https://api.github.com/repos/athrd-com/athrd", {
          headers: { Accept: "application/vnd.github.v3+json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
        }
      } catch (err) {
        // ignore network errors — keep stars null
      }
    }

    fetchStars();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="relative z-50 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full text-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3 font-semibold text-gray-100">
          <Link className="text-lg hover:underline" href="/">
            <AnimatedLogo />
          </Link>
          <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-full text-blue-300">
            Beta
          </span>
        </div>
        <div className="hidden md:flex gap-6 text-gray-400">
          <Link
            href="https://github.com/athrd-com/athrd"
            target={"_blank"}
            className="hover:text-white transition-colors"
          >
            Open Source
          </Link>
          <Link href="/pricing" className="hover:text-white transition-colors">
            Pricing
          </Link>
        </div>
      </div>

      <div>
        <Link
          href="https://github.com/athrd-com/athrd"
          target="_blank"
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <Github size={20} />
          <span className="hidden sm:inline-block text-gray-300">
            {formatStars(stars)}
          </span>
        </Link>
      </div>
    </nav>
  );
}
