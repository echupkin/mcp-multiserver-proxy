FROM node:18-slim

# Install Python and other dependencies for MCP servers
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Create directory for MCP servers
RUN mkdir -p /app/mcp-servers

# Expose port
EXPOSE 3000

# Start the gateway
CMD ["node", "server.js"]
