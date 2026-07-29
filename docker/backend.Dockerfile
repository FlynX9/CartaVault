FROM python:3.14-slim-bookworm AS runtime

ARG CARTAVAULT_VERSION=development

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    CARTAVAULT_VERSION=${CARTAVAULT_VERSION}

WORKDIR /app

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
