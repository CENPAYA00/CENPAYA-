FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --chown=node:node server.mjs ./
USER node

EXPOSE 8080
CMD ["node", "server.mjs"]
