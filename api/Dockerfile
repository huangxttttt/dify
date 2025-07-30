# base image
FROM python:3.12-slim-bookworm AS base

WORKDIR /app/api

# Install uv
ENV UV_VERSION=0.7.11
RUN pip install --no-cache-dir uv==${UV_VERSION}

# packages stage
FROM base AS packages

# Use Aliyun mirror to speed up apt in China
RUN sed -i 's@deb.debian.org@mirrors.aliyun.com@g' /etc/apt/sources.list.d/debian.sources


RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc g++ libc-dev libffi-dev libgmp-dev libmpfr-dev libmpc-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --locked

# production stage
FROM base AS production

ENV FLASK_APP=app.py
ENV EDITION=SELF_HOSTED
ENV DEPLOY_ENV=PRODUCTION
ENV CONSOLE_API_URL=http://127.0.0.1:5001
ENV CONSOLE_WEB_URL=http://127.0.0.1:3000
ENV SERVICE_API_URL=http://127.0.0.1:5001
ENV APP_WEB_URL=http://127.0.0.1:3000
ENV TZ=UTC
ENV TIKTOKEN_CACHE_DIR=/app/api/.tiktoken_cache
ENV VIRTUAL_ENV=/app/api/.venv

EXPOSE 5001

WORKDIR /app/api

# Use Aliyun mirror to avoid 502 issues during apt install
RUN sed -i 's@deb.debian.org@mirrors.aliyun.com@g' /etc/apt/sources.list.d/debian.sources


RUN apt-get update \
    && apt-get install -y --no-install-recommends --fix-missing \
        curl nodejs libgmp-dev libmpfr-dev libmpc-dev \
        expat libldap-2.5-0 perl libsqlite3-0 zlib1g \
        media-types libmagic1 \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy Python environment and packages
COPY --from=packages ${VIRTUAL_ENV} ${VIRTUAL_ENV}
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

# Download NLTK and tiktoken data
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('averaged_perceptron_tagger')" \
    && python -c "import tiktoken; tiktoken.encoding_for_model('gpt2')"

# Copy source code and entrypoint
COPY . /app/api/
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ARG COMMIT_SHA
ENV COMMIT_SHA=${COMMIT_SHA}

ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
