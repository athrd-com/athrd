import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { assertCanReadThread, ThreadAccessError } from "~/server/thread-access";

export default async function CompareAccessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ compareId: string }>;
}) {
  const { compareId } = await params;

  try {
    await assertCanReadThread(compareId);
  } catch (error) {
    if (error instanceof ThreadAccessError) {
      notFound();
    }

    throw error;
  }

  return children;
}
