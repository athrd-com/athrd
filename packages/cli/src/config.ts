// Configuration for the ATHRD CLI
export const config = {
  // GitHub OAuth App credentials
  // You need to create a GitHub OAuth App at: https://github.com/settings/developers
  // Set the authorization callback URL to: http://localhost
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "Ov23lijiBaPGJoEGr86L",
  },

  // API endpoints (customize for your service)
  api: {
    baseUrl: process.env.ATHRD_API_URL || "https://api.athrd.com",
  },

  // CLI metadata
  name: "@athrd/cli",
  version: "1.0.0",
};
