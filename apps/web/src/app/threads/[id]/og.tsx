import { ImageResponse } from "next/og";
import { fetchGist } from "~/lib/github";

export const runtime = "edge";

export const alt = "Thread View";
export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

export default async function Image({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const { gist, file } = await fetchGist(id);

    const repoName: string | undefined = undefined;

    return new ImageResponse(
        (
            <div
                style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    backgroundColor: "#050505", // zinc-950
                    color: "white",
                    fontFamily: "sans-serif",
                    padding: "60px",
                    position: "relative",
                }}
            >
                {/* Background Gradient/Noise approximation */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "800px",
                        height: "400px",
                        backgroundColor: "rgba(28, 57, 142, 0.8)",
                        filter: "blur(120px)",
                        borderRadius: "50%",
                        pointerEvents: "none",
                        zIndex: 0,
                    }}
                />

                {/* Logo Top Right */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        width: "100%",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            fontSize: "48px",
                            fontWeight: "bold",
                            letterSpacing: "-2px",
                        }}
                    >
                        athrd
                    </div>
                </div>

                {/* Main Content */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        marginTop: "auto",
                        marginBottom: "auto",
                    }}
                >
                    {gist ? (
                        <>
                            <div
                                style={{
                                    fontSize: "72px",
                                    fontWeight: "bold",
                                    lineHeight: 1.1,
                                    letterSpacing: "-1px",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    marginBottom: "20px",
                                }}
                            >
                                {gist.description || "Untitled Thread"}
                            </div>
                            {repoName && (
                                <div
                                    style={{
                                        display: "flex",
                                        fontSize: "36px",
                                        color: "#71717a", // zinc-500
                                        fontFamily: "monospace",
                                    }}
                                >
                                    {repoName}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ display: "flex", fontSize: "64px", color: "#ef4444" }}>Thread Not Found</div>
                    )}
                </div>

                {/* Footer User Info */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "24px",
                        marginTop: "32px",
                    }}
                >
                    {gist && (
                        <>
                            <img
                                src={gist.owner.avatar_url}
                                alt={gist.owner.login}
                                width="80"
                                height="80"
                                style={{ borderRadius: "50%", border: "2px solid #27272a" }}
                            />
                            <div style={{ display: "flex", marginLeft: "24px", flexDirection: "column" }}>
                                <div style={{ display: "flex", fontSize: "32px", fontWeight: "bold" }}>
                                    {gist.owner.login}
                                </div>
                                <div style={{ display: "flex", fontSize: "24px", color: "#71717a" }}>
                                    @{gist.owner.login}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
