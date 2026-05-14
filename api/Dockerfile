# syntax=docker/dockerfile:1
FROM golang:1.23-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/root/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/root/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/api ./cmd/api

FROM gcr.io/distroless/static-debian12
COPY --from=builder /bin/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
