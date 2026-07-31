FROM python:3.14-slim-bookworm AS font-builder

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-inter-variable \
    && pip install --no-cache-dir fonttools \
    && fonttools varLib.instancer /usr/share/fonts/truetype/inter-vf/Inter.var.ttf wght=400 --output /tmp/Inter-Regular.ttf \
    && fonttools varLib.instancer /usr/share/fonts/truetype/inter-vf/Inter.var.ttf wght=600 --output /tmp/Inter-SemiBold.ttf \
    && rm -rf /var/lib/apt/lists/*

FROM python:3.14-slim-bookworm AS runtime

ARG CARTAVAULT_VERSION=development

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    CARTAVAULT_VERSION=${CARTAVAULT_VERSION}

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-dejavu-core fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

COPY --from=font-builder /tmp/Inter-Regular.ttf /usr/local/share/fonts/cartavault/Inter-Regular.ttf
COPY --from=font-builder /tmp/Inter-SemiBold.ttf /usr/local/share/fonts/cartavault/Inter-SemiBold.ttf

RUN groupadd --system cartavault \
    && useradd --system --gid cartavault --create-home \
        --home-dir /home/cartavault cartavault

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY --chown=cartavault:cartavault backend/alembic.ini ./alembic.ini
COPY --chown=cartavault:cartavault backend/app ./app
COPY --chown=cartavault:cartavault backend/migrations ./migrations
COPY --chown=cartavault:cartavault shared /shared

RUN mkdir -p /app/storage/photos /app/storage/avatars /app/storage/exports \
    && chown -R cartavault:cartavault /app/storage

USER cartavault
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
