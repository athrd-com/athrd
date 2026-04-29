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

export interface GithubOrganization {
  id: number;
  login: string;
  avatar_url: string;
}

export interface FetchUserGistsOptions {
  page?: number;
  perPage?: number;
}

export interface GistPage {
  items: GistData[];
  nextPage?: number;
}

export interface FetchGistOptions {
  accessToken?: string;
  noStore?: boolean;
}

export async function fetchGist(
  id: string,
  options: FetchGistOptions = {},
): Promise<{ gist?: GistData; file?: GistFile }> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(`https://api.github.com/gists/${id}`, {
      headers,
      ...(options.noStore
        ? { cache: "no-store" as RequestCache }
        : { next: { revalidate: 3600 * 24 } }),
    });

    if (!response.ok) {
      return {};
    }

    const json = (await response.json()) as GistData;
    const file = findAthrdFile(json);
    if (!file) return {};

    if (file.truncated === true) {
      const full = await fetch(file.raw_url, {
        headers: options.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : undefined,
        ...(options.noStore
          ? { cache: "no-store" as RequestCache }
          : { next: { revalidate: 3600 * 24 } }),
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

export async function fetchUserGists(
  accessToken: string,
  options: FetchUserGistsOptions = {},
): Promise<GistPage> {
  try {
    const page =
      typeof options.page === "number" && options.page > 0 ? options.page : 1;
    const perPage =
      typeof options.perPage === "number" && options.perPage > 0
        ? options.perPage
        : 20;
    const url = new URL("https://api.github.com/gists");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${accessToken}`,
      },
      next: { revalidate: 60 }, // Revalidate every minute
    });

    if (!response.ok) {
      return { items: [] };
    }

    const json = (await response.json()) as GistData[];

    // Filter for gists that have an athrd file
    const items = json.filter((gist) =>
      Object.keys(gist.files).some((file) => file.startsWith("athrd-"))
    );

    return {
      items,
      nextPage: json.length === perPage ? page + 1 : undefined,
    };
  } catch (error) {
    console.error("Error fetching user gists:", error);
    return { items: [] };
  }
}

export async function fetchUserOrganizations(
  accessToken: string,
): Promise<GithubOrganization[]> {
  try {
    const response = await fetch("https://api.github.com/user/orgs", {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${accessToken}`,
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as GithubOrganization[];
  } catch (error) {
    console.error("Error fetching user organizations:", error);
    return [];
  }
}

export async function deleteGist(
  accessToken: string,
  gistId: string,
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    return response.status === 204;
  } catch (error) {
    console.error("Error deleting gist:", error);
    return false;
  }
}

export async function updateGistDescription(
  accessToken: string,
  gistId: string,
  description: string,
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description }),
      cache: "no-store",
    });

    return response.ok;
  } catch (error) {
    console.error("Error updating gist description:", error);
    return false;
  }
}
