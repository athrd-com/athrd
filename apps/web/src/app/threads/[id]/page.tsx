import ThreadView from "@/components/thread/thread-view";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { gist, file } = await fetchGist(id);
  if (!gist || !file) {
    notFound();
  }

  return (
    <div className="min-h-screen w-full text-white font-sans selection:bg-blue-500/30">
      <main className="relative z-10 container mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <ThreadView gist={gist} file={file} />
      </main>
    </div>
  );
}
