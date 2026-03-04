"use client";

import Link from "next/link";
import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 mt-20 border-t border-white/10 bg-black/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-xs text-gray-500 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.16em] text-gray-300">
              <Link className="transition-colors hover:text-white" href="/">
                ATHRD
              </Link>
            </span>
            <span className="text-gray-600">·</span>
            <span>Free forever</span>
            <span className="text-gray-600">·</span>
            <span>Stored in your GitHub Gists</span>
            <span className="text-gray-600">·</span>
            <span>Private by default</span>
            <span className="text-gray-600">·</span>
            <Link
              className="inline-flex items-center gap-1 transition-colors hover:text-white"
              href="https://github.com/athrd-com/athrd"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={12} aria-hidden="true" />
              GitHub
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
