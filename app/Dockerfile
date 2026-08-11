# ToolVault — single image.
#
# The Express backend serves the built SPA itself:
#
#   app.use(express.static(join(__dirname, '../frontend/dist')))
#
# so the frontend has to be built and placed at ../frontend/dist relative to
# the backend, inside the same image. Splitting these into two containers with
# an nginx proxy does not work — the backend 404s every non-API route because
# the dist directory is not there.
#
# Build context is ./app

# ---- Stage 1: build the SPA ----
FROM node:20-alpine AS frontend

WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend + built SPA ----
FROM node:20-alpine

# better-sqlite3 is a native module and has no prebuilt musl binary, so it
# compiles from source. The toolchain is removed afterwards to keep the
# image small.
RUN apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev && apk del .build-deps

COPY backend/ ./

# Express looks for ../frontend/dist relative to /app/backend
COPY --from=frontend /build/dist /app/frontend/dist

EXPOSE 3001

# Run node directly rather than through the node image's docker-entrypoint.sh.
# Under `docker compose up` (no TTY) that wrapper caused the process to exit
# 0 immediately, producing no output at all and a restart loop; `docker compose
# run` worked because it allocates a TTY. Setting ENTRYPOINT explicitly makes
# node PID 1 and removes the wrapper from the picture entirely.
ENTRYPOINT ["node"]
CMD ["server.js"]
