import ThreadView from "@/components/thread/thread-view";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchGist } from "~/lib/github";

// Enable static generation and caching
export const revalidate = 604800; // Cache for 1 week

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { gist } = await fetchGist(id);

  if (!gist) {
    return {
      title: "Thread Not Found - ATHRD",
    };
  }

  const url = `https://athrd.com/threads/${id}`;

  return {
    title: `ATHRD - ${gist.description}`,
    description: gist.description,
    openGraph: {
      title: `ATHRD - ${gist.description}`,
      description: gist.description,
      images: [
        {
          url: `https://athrd.com/threads/${id}/og`,
          width: 1200,
          height: 630,
          alt: `ATHRD - ${gist.description}`,
        },
      ],
    },
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: url,
    },
  };
}

async function ThreadContent({ id }: { id: string }) {
  const { gist, file } = await fetchGist(id);
  if (!gist || !file) {
    notFound();
  }

  return <ThreadView gist={gist} file={file} />;
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen w-full text-white font-sans selection:bg-blue-500/30">
      <main className="relative z-10 container mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <div className="animate-pulse">
              <div className="mb-8">
                <div className="h-8 bg-gray-800 rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-gray-800 rounded w-1/2"></div>
              </div>
              <div className="space-y-4">
                <div className="h-32 bg-gray-800 rounded"></div>
                <div className="h-24 bg-gray-800 rounded"></div>
                <div className="h-40 bg-gray-800 rounded"></div>
              </div>
            </div>
          }
        >
          <ThreadContent id={id} />
        </Suspense>
      </main>
    </div>
  );
}
