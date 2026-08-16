# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.19.0

FROM node:${NODE_VERSION}-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4173

COPY --chown=node:node . .

USER node

EXPOSE 4173

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
