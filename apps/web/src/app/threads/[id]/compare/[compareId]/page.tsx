import ThreadView from "@/components/thread/thread-view";
import type { Metadata } from "next";
import { fetchGist } from "~/lib/github";

// Enable static generation and caching
export const revalidate = 604800; // Cache for 1 week

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; compareId: string }>;
}): Promise<Metadata> {
  const { id, compareId } = await params;

  return {
    title: `Compare Threads ${id} vs ${compareId} - ATHRD`,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string; compareId: string }>;
}) {
  const { id, compareId } = await params;

  // Fetch both gists in parallel
  const [first, second] = await Promise.all([
    fetchGist(id),
    fetchGist(compareId),
  ]);

  return (
    <div className="min-h-screen w-full text-white font-sans selection:bg-blue-500/30">
      <main className="relative z-10 container mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* First Thread */}
          <div className="w-full overflow-hidden">
            {first.gist && first.file ? (
              <ThreadView gist={first.gist} file={first.file} />
            ) : (
              <div className="p-8 text-center text-red-400 border border-red-900/50 rounded-lg bg-red-950/10">
                Thread {id} not found
              </div>
            )}
          </div>

          {/* Second Thread */}
          <div className="w-full overflow-hidden border-l border-gray-800 pl-8">
            {second.gist && second.file ? (
              <ThreadView gist={second.gist} file={second.file} />
            ) : (
              <div className="p-8 text-center text-red-400 border border-red-900/50 rounded-lg bg-red-950/10">
                Thread {compareId} not found
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
