# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Empty by default: the frontend calls relative /api/... paths, proxied to
# the backend by nginx (see nginx.conf) — same pattern as the Vite dev
# server proxy. Only set this if the frontend and backend are not served
# from the same origin.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: static files served by nginx ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
