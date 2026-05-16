FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Bake VITE_ vars into the bundle at build time.
# Defaults are the staging Azure Entra app registration values.
# Override at build time with --build-arg VITE_API_APP_ID_URI=... if needed.
ARG VITE_API_APP_ID_URI=api://a406f0a1-e424-45ef-afaa-540dd992ffe5
ARG VITE_AZURE_TENANT_ID=66d756aa-edfd-46e9-895a-06d9e0e21f3a
ARG VITE_AZURE_CLIENT_ID=db8a0c15-d532-447e-8c36-4f1eb19f13d1
ENV VITE_API_APP_ID_URI=$VITE_API_APP_ID_URI
ENV VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
RUN pnpm run build

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx auto-runs envsubst on files in /etc/nginx/templates/ at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
