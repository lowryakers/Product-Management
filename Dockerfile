# Build from the repository root, with the app in app/.
#
# There is a second, identical-in-effect Dockerfile at app/Dockerfile. Whichever
# one Railway picks depends on the service's Root Directory setting:
#
#   Root Directory empty  -> this file is used
#   Root Directory = app  -> app/Dockerfile is used
#
# Both produce the same image, so the deploy works either way and there is one
# less setting to get wrong.

FROM node:20-slim

# Prisma's query engine links against OpenSSL.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/app

# Dependencies first so this layer caches across code-only changes.
COPY app/package.json app/package-lock.json ./
RUN npm ci --include=dev

# --include=dev above is deliberate: typescript and the prisma CLI are needed to
# build, and `npm start` runs `prisma migrate deploy` at boot.
COPY app/ ./

# `prisma generate` reads the schema only — no database needed at build time.
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
