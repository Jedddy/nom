# Builds the static export and serves it.
#
# Dokploy's Traefik terminates TLS and routes the domain to this container's port 80;
# it does not read files from disk, so the container still needs an HTTP server. The
# export is directory-style (see `trailingSlash` in next.config.ts), which stock nginx
# resolves with no configuration of its own.
#
# The build context is the REPOSITORY ROOT, not docs/site: pages include
# docs/architecture.md and docs/ai-sdk.md at build time, and those live outside the app.
#
#   docker build -f docs/site/Dockerfile -t nom-docs .

FROM oven/bun:1.3.14 AS build
WORKDIR /repo

COPY docs/site/package.json docs/site/bun.lock ./docs/site/
RUN cd docs/site && bun install --frozen-lockfile

# The included markdown lives outside docs/site, so both paths are copied.
COPY docs/architecture.md docs/ai-sdk.md docs/devtools.md ./docs/
COPY docs/site ./docs/site

RUN cd docs/site && bun run build

FROM nginx:1.27-alpine
COPY docs/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/docs/site/out /usr/share/nginx/html
EXPOSE 80
