FROM node:24-alpine AS frontend-builder

ARG CARTAVAULT_VERSION=development
ARG VITE_API_BASE_URL=/api
ARG VITE_STADIA_MAPS_API_KEY

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
    VITE_STADIA_MAPS_API_KEY=${VITE_STADIA_MAPS_API_KEY} \
    VITE_CARTAVAULT_VERSION=${CARTAVAULT_VERSION}

RUN npm run build


FROM python:3.14-slim-trixie AS font-builder

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-inter-variable \
    && pip install --no-cache-dir fonttools \
    && fonttools varLib.instancer /usr/share/fonts/truetype/inter-vf/InterVariable.ttf wght=400 --output /tmp/Inter-Regular.ttf \
    && fonttools varLib.instancer /usr/share/fonts/truetype/inter-vf/InterVariable.ttf wght=600 --output /tmp/Inter-SemiBold.ttf \
    && rm -rf /var/lib/apt/lists/*


FROM python:3.14-slim-trixie AS runtime

ARG CARTAVAULT_VERSION=development

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    CARTAVAULT_VERSION=${CARTAVAULT_VERSION} \
    CARTAVAULT_API_PREFIX=/api \
    CARTAVAULT_FRONTEND_DIST=/app/frontend

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-dejavu-core fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system cartavault \
    && useradd --system --gid cartavault --create-home --home-dir /home/cartavault cartavault

COPY --from=font-builder /tmp/Inter-Regular.ttf /usr/local/share/fonts/cartavault/Inter-Regular.ttf
COPY --from=font-builder /tmp/Inter-SemiBold.ttf /usr/local/share/fonts/cartavault/Inter-SemiBold.ttf

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY --chown=cartavault:cartavault backend/alembic.ini ./alembic.ini
COPY --chown=cartavault:cartavault backend/app ./app
COPY --chown=cartavault:cartavault backend/migrations ./migrations
COPY --chown=cartavault:cartavault shared /shared
COPY --chown=cartavault:cartavault demo /demo
COPY --from=frontend-builder --chown=cartavault:cartavault /build/frontend/dist ./frontend

RUN mkdir -p /app/storage/photos /app/storage/avatars /app/storage/exports /app/storage/imports \
    && chown -R cartavault:cartavault /app/storage

USER cartavault
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=8 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/healthz', timeout=3)"

ENTRYPOINT ["python", "-m", "app.container_entrypoint"]
