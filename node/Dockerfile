# Build Stage
FROM golang:1.24-alpine AS builder

WORKDIR /src

ENV GOTOOLCHAIN=auto

# Download dependencies first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and build statically linked binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /otix-node .

# Final Lightweight Runtime Stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata curl

WORKDIR /app

# Create default storage directories
RUN mkdir -p /app/storage/saves /app/storage/downloads /storage/installers

COPY --from=builder /otix-node /app/otix-node
COPY config.example.yaml /app/config.example.yaml

ENV PORT=8090
ENV CONFIG_PATH="/app/config.yaml"

EXPOSE 8090

ENTRYPOINT ["/app/otix-node"]
