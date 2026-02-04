# ===========================================================
#  GisulMatch Frontend Dockerfile (Two-Stage Build)
# ===========================================================

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files first for better layer caching
COPY ./frontend/package.json ./frontend/package-lock.json* ./

# Install dependencies (this layer will be cached if package.json doesn't change)
RUN npm install --legacy-peer-deps && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/tmp/*

# Copy source code (this layer will be rebuilt only when source changes)
COPY ./frontend .

# Build argument for API base URL (can be overridden during build)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build the application
RUN npm run build && \
    rm -rf node_modules && \
    rm -rf /tmp/* /var/tmp/*

# Stage 2: Serve static build
FROM nginx:stable-alpine

# Copy nginx configuration
COPY ./frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
