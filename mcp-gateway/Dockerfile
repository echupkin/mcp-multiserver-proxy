FROM node:18-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p /app/mcp-servers
EXPOSE 3000
CMD ["node", "server.js"]
