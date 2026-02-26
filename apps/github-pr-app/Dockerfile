FROM oven/bun:1.2.21 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/github-pr-app build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/github-pr-app/dist ./dist
COPY --from=build /app/apps/github-pr-app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
