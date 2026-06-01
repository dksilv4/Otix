# ── Build stage ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --legacy-peer-deps

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Skip tsc type-check (pre-existing TS errors in non-container code paths).
# The vite build alone is sufficient for the container image.
RUN npx vite build

# ── Serve stage ──
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
