FROM python:3.11-slim

# Install uv from the official image (pinned version for reproducible builds)
COPY --from=ghcr.io/astral-sh/uv:0.4.28 /uv /uvx /bin/

WORKDIR /app

# Install dependencies (cached layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
