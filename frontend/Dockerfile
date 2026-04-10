FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Final image just holds the built dist
FROM alpine:3.19
COPY --from=builder /app/dist /dist
