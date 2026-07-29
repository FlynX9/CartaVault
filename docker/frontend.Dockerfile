FROM node:24-alpine AS build

ARG CARTAVAULT_VERSION=development
ARG VITE_API_BASE_URL=/api
ARG VITE_STADIA_MAPS_API_KEY

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
COPY shared ../shared

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_STADIA_MAPS_API_KEY=${VITE_STADIA_MAPS_API_KEY} \
    VITE_CARTAVAULT_VERSION=${CARTAVAULT_VERSION}

RUN npm run build

FROM nginx:1.28-alpine AS runtime

COPY docker/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/frontend/dist /usr/share/nginx/html

EXPOSE 80
