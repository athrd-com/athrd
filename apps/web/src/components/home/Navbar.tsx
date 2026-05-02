"use client";

import { Github, List, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { authClient } from "~/server/better-auth/client";
import { AnimatedLogo } from "./AnimatedLogo";

function formatStars(n: number | null) {
  if (n === null) return "—";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
}

function getUserInitials(user: { name?: string | null; email?: string | null }) {
  const label = user.name || user.email || "?";
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "?";
}

export function Navbar() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [stars, setStars] = useState<number | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const user = session?.user;

  useEffect(() => {
    let cancelled = false;

    async function fetchStars() {
      try {
        const res = await fetch(
          "https://api.github.com/repos/athrd-com/athrd",
          {
            headers: { Accept: "application/vnd.github.v3+json" },
          },
        );
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

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        throw new Error(result.error.message ?? "Unable to log out.");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to log out", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <nav className="relative z-50 flex items-center justify-between px-6 py-6 max-w-6xl mx-auto w-full text-sm">
      <div className="flex items-center gap-3 font-semibold text-gray-100">
        <Link className="text-lg hover:underline" href="/">
          <AnimatedLogo />
        </Link>
        <span className="px-2 py-0.5 text-xs font-medium bg-linear-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-full text-blue-300">
          Beta
        </span>
      </div>
      <div className="hidden md:flex gap-6 text-gray-400 absolute left-1/2 -translate-x-1/2">
        <Link href="/" className="hover:text-white transition-colors">
          Home
        </Link>
        <Link href="/threads" className="hover:text-white transition-colors">
          Threads
        </Link>
        <Link
          href="/tools"
          className="hover:text-white transition-colors hidden"
        >
          Tools
        </Link>
        <Link href="/enterprise" className="hover:text-white transition-colors">
          Enterprise
        </Link>
      </div>

      <div className="flex min-w-24 justify-end">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Open account menu"
                className="rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
                type="button"
              >
                <Avatar className="size-9 border border-white/15">
                  <AvatarImage
                    alt={user.name || user.email || "User avatar"}
                    src={user.image ?? undefined}
                  />
                  <AvatarFallback className="bg-white/10 text-xs font-semibold text-white uppercase">
                    {getUserInitials(user)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/threads">
                  <List className="size-4" />
                  Threads
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" />
                {isLoggingOut ? "Logging out..." : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : isPending ? (
          <div className="size-9 rounded-full border border-white/10 bg-white/5" />
        ) : (
          <Link
            href="https://github.com/athrd-com/athrd"
            target="_blank"
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            GitHub
            <Github size={14} />
            <span className="hidden sm:inline-block text-gray-300">
              {formatStars(stars)}
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
