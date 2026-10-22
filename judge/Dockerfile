FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
RUN npm install --global pnpm@12.14.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY judge/package.json judge/tsconfig.json ./judge/
RUN pnpm install --frozen-lockfile --filter @cpp-trap/judge...
COPY shared/src ./shared/src
COPY judge/src ./judge/src
RUN pnpm --filter @cpp-trap/judge exec tsc --noEmit false --outDir dist --rootDir .. \
    && ln -s judge/src/server.js judge/dist/server.js \
    && node -e "require('fs').writeFileSync('/tmp/ca-certificates.crt', require('tls').rootCertificates.join('\n'))"

FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
COPY --from=build /tmp/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
    && printf '%s\n' \
       'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/20261001T000000Z noble main universe' \
       'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/20261001T000000Z noble-updates main universe' \
       'deb [check-valid-until=no] https://snapshot.ubuntu.com/ubuntu/20261001T000000Z noble-security main universe' \
       > /etc/apt/sources.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
       g++-13=13.3.0-6ubuntu2~24.04.1 util-linux=2.39.3-9ubuntu6.6 \
       procps=2:4.0.4-4ubuntu3.3 tini=0.19.0-1 bubblewrap=0.9.0-1ubuntu0.3 \
    && ln -s g++-13 /usr/bin/g++ \
    && groupadd --gid 61001 runner \
    && useradd --uid 61001 --gid 61001 --no-create-home --shell /usr/sbin/nologin runner \
    && mkdir -m 0711 /work \
    && chmod 0700 /tmp /var/tmp \
    && find / -xdev -perm /6000 -type f -exec chmod a-s {} + \
    && apt-get purge -y curl wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /app/judge/dist /judge/dist
RUN chown -R root:root /judge && chmod -R 0700 /judge
WORKDIR /judge
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["/usr/local/bin/node","/judge/dist/server.js"]
RUN ["/usr/bin/rm","-f","/bin/sh","/usr/bin/sh","/bin/bash","/usr/bin/bash","/usr/bin/dash","/bin/dash"]
