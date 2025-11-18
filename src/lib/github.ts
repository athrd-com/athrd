export interface GistOwner {
  login: string;
  id: number;
  avatar_url: string;
  url: string;
  html_url: string;
  type: string;
}

export interface GistFile {
  filename: string;
  type: string;
  language: string;
  raw_url: string;
  size: number;
  content?: string;
}

export interface GistData {
  id: string;
  description: string;
  owner: GistOwner;
  files: Record<string, GistFile>;
  created_at: string;
  updated_at: string;
}

export async function fetchGist(id: string): Promise<GistData | null> {
  try {
    const response = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
      // Revalidate every hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    return null;
  }
}

export function findAthrdFile(gist: GistData): GistFile | null {
  const files = Object.values(gist.files);
  const athrdFile = files.find((file) => file.filename.startsWith("athrd-"));
  return athrdFile || null;
}
