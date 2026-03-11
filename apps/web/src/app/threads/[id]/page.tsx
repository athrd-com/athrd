import ThreadView from "@/components/thread/thread-view";
import { loadThreadContext, ThreadLoadError } from "@/lib/thread-loader";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

// Enable static generation and caching
export const revalidate = 604800; // Cache for 1 week

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sourceId?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { sourceId } = await searchParams;
  try {
    const context = await loadThreadContext(id, sourceId);
    const url = `https://athrd.com/threads/${id}`;

    return {
      title: `ATHRD - ${context.title}`,
      description: context.title,
      openGraph: {
        title: `ATHRD - ${context.title}`,
        description: context.title,
        images: [
          {
            url: `https://athrd.com/threads/${id}/og`,
            width: 1200,
            height: 630,
            alt: `ATHRD - ${context.title}`,
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
  } catch (error) {
    if (error instanceof ThreadLoadError) {
      return {
        title: "Thread Not Found - ATHRD",
      };
    }

    throw error;
  }
}

async function ThreadContent({
  id,
  sourceId,
}: {
  id: string;
  sourceId?: string;
}) {
  try {
    const context = await loadThreadContext(id, sourceId);
    return <ThreadView context={context} />;
  } catch (error) {
    if (error instanceof ThreadLoadError) {
      notFound();
    }

    throw error;
  }
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sourceId?: string }>;
}) {
  const { id } = await params;
  const { sourceId } = await searchParams;

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
          <ThreadContent id={id} sourceId={sourceId} />
        </Suspense>
      </main>
    </div>
  );
}
