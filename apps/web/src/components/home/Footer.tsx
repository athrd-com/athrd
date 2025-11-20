"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 mt-20">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
        <div className="flex items-center gap-2 mb-4 md:mb-0">
          <span className="font-bold text-gray-300">
            <Link className="hover:underline" href="/">
              ATHRD
            </Link>
          </span>{" "}
          for Developers
        </div>
        <div className="gap-6 hidden">
          <Link href="#" className="hover:text-gray-300 transition-colors">
            Terms
          </Link>
          <span className="text-gray-700">|</span>
          <Link href="#" className="hover:text-gray-300 transition-colors">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
