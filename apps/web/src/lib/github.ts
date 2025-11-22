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
  truncated?: boolean;
}

export interface GistData {
  id: string;
  description: string;
  owner: GistOwner;
  files: Record<string, GistFile>;
  created_at: string;
  updated_at: string;
}

export async function fetchGist(
  id: string
): Promise<{ gist?: GistData; file?: GistFile }> {
  try {
    const response = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
      // Revalidate every day
      next: { revalidate: 3600 * 24 },
    });

    if (!response.ok) {
      return {};
    }

    const json = (await response.json()) as GistData;
    const file = findAthrdFile(json);
    if (!file) return {};

    if (file.truncated === true) {
      const full = await fetch(file.raw_url, {
        next: { revalidate: 3600 * 24 },
      }).then((res) => res.text());

      file.content = full;
    }

    return { gist: json, file };
  } catch (error) {
    return {};
  }
}

function findAthrdFile(gist: GistData): GistFile | null {
  const files = Object.values(gist.files);
  const athrdFile = files.find((file) => file.filename.startsWith("athrd-"));
  return athrdFile || null;
}

export async function fetchUserGists(accessToken: string): Promise<GistData[]> {
  try {
    const response = await fetch("https://api.github.com/gists", {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${accessToken}`,
      },
      next: { revalidate: 60 }, // Revalidate every minute
    });

    if (!response.ok) {
      return [];
    }

    const json = (await response.json()) as GistData[];

    // Filter for gists that have an athrd file
    return json.filter((gist) =>
      Object.keys(gist.files).some((file) => file.startsWith("athrd-"))
    );
  } catch (error) {
    console.error("Error fetching user gists:", error);
    return [];
  }
}
