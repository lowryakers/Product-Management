# Build with app/ as the context — used when Railway's Root Directory is `app`.
# The Dockerfile at the repository root builds the same image for the case where
# Root Directory is left empty. Keep the two in step.

FROM node:20-slim

# Prisma's query engine links against OpenSSL.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/app

# Dependencies first so this layer caches across code-only changes.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# --include=dev is deliberate: typescript and the prisma CLI are needed to build,
# and `npm start` runs `prisma migrate deploy` at boot.
COPY . .

# `prisma generate` reads the schema only — no database needed at build time.
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
