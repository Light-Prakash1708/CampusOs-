# Single-server deployment: `docker build -t campusos . && docker run -p 3000:3000 --env-file .env campusos`
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 campusos
COPY --from=build --chown=campusos /app ./
USER campusos
EXPOSE 3000
# Migrations are idempotent and run on every start.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
