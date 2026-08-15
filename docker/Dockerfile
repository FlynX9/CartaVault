FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS frontend-builder

ARG CARTAVAULT_VERSION=development
ARG VITE_API_BASE_URL=/api

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
# npm/cli can omit this platform-specific optional dependency when the lockfile
# was generated on Windows. Keep the locked musl binary explicit so the Linux
# image build remains reproducible.
RUN npm ci --include=optional \
    && npm install --no-save --ignore-scripts=false lightningcss-linux-x64-musl@1.32.0

COPY frontend ./
COPY shared ../shared

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_CARTAVAULT_VERSION=${CARTAVAULT_VERSION}

RUN npm run build


FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS documentation-builder

ARG CARTAVAULT_VERSION=development
WORKDIR /build/website

COPY website/package.json website/package-lock.json ./
RUN npm ci --include=optional

COPY website ./
ENV CARTAVAULT_VERSION=${CARTAVAULT_VERSION}
RUN find src/content/docs -type f \( -name '*.md' -o -name '*.mdx' \) -exec sed -i "s/\\*\\*master\\*\\*/\\*\\*${CARTAVAULT_VERSION}\\*\\*/g" {} + \
    && npm run build


FROM python:3.14-slim-trixie@sha256:7bec7ddcddeff7975d6ba9b4be7dd6f6b2f55e7491539145e2978f7f97ce9144 AS font-builder

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-inter-variable \
    && pip install --no-cache-dir fonttools \
    && fonttools varLib.instancer /usr/share/fonts/truetype/inter-vf/InterVariable.ttf wght=400 --output /tmp/Inter-Regular.ttf \
    && fonttools varLib.instancer /usr/share/fonts/truetype/inter-vf/InterVariable.ttf wght=600 --output /tmp/Inter-SemiBold.ttf \
    && rm -rf /var/lib/apt/lists/*


FROM debian:trixie-slim AS vector-assets

ARG PLANETILER_OPENMAPTILES_VERSION=v3.16
ARG PLANETILER_OPENMAPTILES_SHA256=246cd5c9c10102a3bcc58465ae7dde5b97aa4cee6524ea25788e23333ba2579d
ARG OPENMAPTILES_FONTS_REVISION=025ff2b2f84cc0fdf11f7b1d74b3a784595fe7a4

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates curl \
    && mkdir -p /opt/planetiler /opt/vector-assets/fonts \
    && curl --fail --location --retry 3 "https://github.com/openmaptiles/planetiler-openmaptiles/releases/download/${PLANETILER_OPENMAPTILES_VERSION}/planetiler-openmaptiles.jar" --output /opt/planetiler/planetiler-openmaptiles.jar \
    && echo "${PLANETILER_OPENMAPTILES_SHA256}  /opt/planetiler/planetiler-openmaptiles.jar" | sha256sum --check --strict \
    && curl --fail --location --retry 3 "https://github.com/openmaptiles/fonts/archive/${OPENMAPTILES_FONTS_REVISION}.tar.gz" --output /tmp/fonts.tar.gz \
    && tar -xzf /tmp/fonts.tar.gz -C /tmp \
    && cp -R "/tmp/fonts-${OPENMAPTILES_FONTS_REVISION}/Klokantech Noto Sans Regular" "/opt/vector-assets/fonts/Noto Sans Regular" \
    && cp -R "/tmp/fonts-${OPENMAPTILES_FONTS_REVISION}/Klokantech Noto Sans Italic" "/opt/vector-assets/fonts/Noto Sans Italic" \
    && rm -rf /tmp/fonts.tar.gz "/tmp/fonts-${OPENMAPTILES_FONTS_REVISION}" /var/lib/apt/lists/*


FROM python:3.14-slim-trixie@sha256:7bec7ddcddeff7975d6ba9b4be7dd6f6b2f55e7491539145e2978f7f97ce9144 AS runtime

ARG CARTAVAULT_VERSION=development
ARG CARTAVAULT_REVISION=unknown
ARG CARTAVAULT_BUILD_DATE=unknown

LABEL org.opencontainers.image.title="CartaVault" \
    org.opencontainers.image.description="Self-hosted maps, places and trip planning" \
    org.opencontainers.image.url="https://cartavault.fr" \
    org.opencontainers.image.source="https://github.com/FlynX9/CartaVault" \
    org.opencontainers.image.documentation="https://cartavault.fr/docs/en/" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.version="${CARTAVAULT_VERSION}" \
    org.opencontainers.image.revision="${CARTAVAULT_REVISION}" \
    org.opencontainers.image.created="${CARTAVAULT_BUILD_DATE}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    CARTAVAULT_VERSION=${CARTAVAULT_VERSION} \
    CARTAVAULT_API_PREFIX=/api \
    CARTAVAULT_FRONTEND_DIST=/app/frontend

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-dejavu-core fonts-wqy-zenhei openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system cartavault \
    && useradd --system --gid cartavault --create-home --home-dir /home/cartavault cartavault

COPY --from=font-builder /tmp/Inter-Regular.ttf /usr/local/share/fonts/cartavault/Inter-Regular.ttf
COPY --from=font-builder /tmp/Inter-SemiBold.ttf /usr/local/share/fonts/cartavault/Inter-SemiBold.ttf
COPY --from=vector-assets /opt/planetiler /opt/planetiler
COPY --from=vector-assets /opt/vector-assets /app/vector-assets

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY --chown=cartavault:cartavault backend/alembic.ini ./alembic.ini
COPY --chown=cartavault:cartavault backend/app ./app
COPY --chown=cartavault:cartavault backend/migrations ./migrations
COPY --chown=cartavault:cartavault shared /shared
COPY --chown=cartavault:cartavault demo /demo
COPY --from=frontend-builder --chown=cartavault:cartavault /build/frontend/dist ./frontend
COPY --from=documentation-builder --chown=cartavault:cartavault /build/website/dist/docs ./frontend/docs
COPY --from=documentation-builder --chown=cartavault:cartavault /build/website/dist/_astro ./frontend/_astro
COPY --from=documentation-builder --chown=cartavault:cartavault /build/website/dist/pagefind ./frontend/pagefind
COPY --from=documentation-builder --chown=cartavault:cartavault /build/website/dist/images ./frontend/images

RUN mkdir -p /app/storage/photos /app/storage/avatars /app/storage/exports /app/storage/imports /data/maps /data/maps/work \
    && chown -R cartavault:cartavault /app/storage /data/maps

USER cartavault
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=8 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/healthz', timeout=3)"

ENTRYPOINT ["python", "-m", "app.container_entrypoint"]
