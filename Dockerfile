FROM node:20-slim

# Install system deps: tectonic runtime libs + Playwright Chromium deps
RUN apt-get update && apt-get install -y \
    curl \
    libssl3 \
    libfontconfig1 \
    libgraphite2-3 \
    libharfbuzz0b \
    libicu72 \
    ca-certificates \
    # Playwright Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Install tectonic from GitHub releases (pinned version for stability)
RUN TECTONIC_VERSION="0.15.0" && \
    curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
    -o /tmp/tectonic.tar.gz && \
    tar xz -C /usr/local/bin/ -f /tmp/tectonic.tar.gz && \
    chmod +x /usr/local/bin/tectonic && \
    rm /tmp/tectonic.tar.gz && \
    tectonic --version

WORKDIR /app

# Copy package files
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev 2>/dev/null || npm install

# Install Playwright Chromium browser binary
RUN npx playwright install chromium

# Copy all service files
COPY services/ ./services/
COPY modes/ ./modes/
COPY config/ ./config/
COPY Aryan_CV/ ./Aryan_CV/
COPY data/profile-data.json ./data/profile-data.json
COPY cv.md ./cv.md
COPY portals.yml ./portals.yml
COPY scan.mjs ./scan.mjs

# Create required directories
RUN mkdir -p data/cold-emails data/company-research batch/tracker-additions reports jds/auto resumes/latex logs prep

# Initialize data files (required for API server)
RUN echo '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|' > data/applications.md && \
    echo '# Job Pipeline\n\n## Pendientes\n\n## Procesadas\n' > data/pipeline.md && \
    echo 'url\tfirst_seen\tsource\ttitle\tcompany\tstatus' > data/scan-history.tsv

# Environment variables (set via Azure Container Apps secrets at runtime)
ENV NODE_ENV=production
ENV LOG_LEVEL=INFO

# Expose API port for dashboard data
EXPOSE 3001

# Run master pipeline (API server + 6h scrape loop)
CMD ["sh", "-c", "node services/master-pipeline.mjs --loop"]
