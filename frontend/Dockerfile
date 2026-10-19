FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE=/api
ARG VITE_API_ORIGIN=
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN

RUN npm run build

FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD wget -q -O /dev/null http://127.0.0.1/api/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
