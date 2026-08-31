FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY backend-api/package.json backend-api/package.json
RUN pnpm install --frozen-lockfile --prod
COPY admin-portal admin-portal
COPY owner-portal owner-portal
COPY seller-portal seller-portal
COPY web-shared web-shared
COPY backend-api backend-api
COPY database database
RUN mkdir -p backend-api/data && chown -R node:node /app
EXPOSE 4000
USER node
CMD ["pnpm", "start"]
