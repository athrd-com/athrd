import { loadThreadContext, ThreadLoadError } from "@/lib/thread-loader";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { assertCanReadThread, ThreadAccessError } from "~/server/thread-access";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    await assertCanReadThread(id);
    const context = await loadThreadContext(id);
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
    if (error instanceof ThreadLoadError || error instanceof ThreadAccessError) {
      return {
        title: "Thread Not Found - ATHRD",
      };
    }

    throw error;
  }
}

export default async function ThreadAccessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    await assertCanReadThread(id);
  } catch (error) {
    if (error instanceof ThreadAccessError) {
      notFound();
    }

    throw error;
  }

  return children;
}
