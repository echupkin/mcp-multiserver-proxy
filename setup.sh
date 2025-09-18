#!/bin/bash

# MCP Gateway Startup Script
# This script helps you quickly set up and run the MCP Gateway

set -e

echo "🚀 MCP Gateway Setup Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed"
}

# Create directory structure
create_directories() {
    print_status "Creating directory structure..."
    
    mkdir -p mcp-gateway/{logs,data}
    cd mcp-gateway
    
    print_success "Directory structure created"
}

# Create configuration file
create_config() {
    print_status "Creating configuration file..."
    
    if [ ! -f "config.json" ]; then
        cat > config.json << 'EOF'
{
  "servers": {
    "flights": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@smamidipaka6/flights-mcp-server"],
      "env": {
        "AMADEUS_API_KEY": "",
        "AMADEUS_API_SECRET": ""
      },
      "description": "Flight search and booking MCP server"
    },
    "weather": {
      "type": "stdio",
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-weather"],
      "env": {
        "OPENWEATHER_API_KEY": ""
      },
      "description": "Weather information MCP server"
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "description": "File system operations MCP server"
    },
    "fetch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "description": "Web scraping and HTTP requests MCP server"
    }
  },
  "gateway": {
    "port": 3000,
    "cors": {
      "origin": "*",
      "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
  }
}
EOF
        print_success "Configuration file created: config.json"
        print_warning "Please edit config.json and add your API keys!"
    else
        print_warning "Configuration file already exists"
    fi
}

# Create environment file
create_env() {
    print_status "Creating environment file..."
    
    if [ ! -f ".env" ]; then
        cat > .env << 'EOF'
# MCP Gateway Environment Variables
NODE_ENV=production
PORT=3000
BASE_URL=http://localhost:3000
CONFIG_PATH=/app/config.json
CORS_ORIGIN=*

# API Keys - FILL THESE IN!
AMADEUS_API_KEY=your_amadeus_api_key_here
AMADEUS_API_SECRET=your_amadeus_api_secret_here
OPENWEATHER_API_KEY=your_openweather_api_key_here
BRAVE_API_KEY=your_brave_api_key_here

# Database (optional)
POSTGRES_CONNECTION_STRING=postgresql://mcpuser:mcppassword@postgres:5432/mcpdb

# Authentication (optional)
GATEWAY_AUTH_TOKEN=your_secure_random_token_here
EOF
        print_success "Environment file created: .env"
        print_warning "Please edit .env and add your API keys!"
    else
        print_warning "Environment file already exists"
    fi
}

# Download and create all necessary files
setup_files() {
    print_status "Setting up project files..."
    
    # Create package.json
    cat > package.json << 'EOF'
{
  "name": "mcp-gateway",
  "version": "1.0.0",
  "description": "HTTP Gateway for multiple MCP servers",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "dotenv": "^16.3.1",
    "http-proxy-middleware": "^2.0.6",
    "ws": "^8.14.2",
    "eventsource": "^2.0.2"
  }
}
EOF

    # Create Dockerfile
    cat > Dockerfile << 'EOF'
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
EOF

    # Create docker-compose.yml
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  mcp-gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - BASE_URL=http://localhost:3000
      - CONFIG_PATH=/app/config.json
      - CORS_ORIGIN=*
    env_file:
      - .env
    volumes:
      - ./config.json:/app/config.json:ro
      - ./logs:/app/logs
      - /tmp:/tmp
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF

    print_success "Project files created"
}

# Interactive API key setup
setup_api_keys() {
    print_status "Setting up API keys (optional - you can do this later)..."
    
    read -p "Do you want to configure API keys now? (y/n): " setup_keys
    
    if [[ $setup_keys =~ ^[Yy]$ ]]; then
        echo
        print_status "API Key Setup - Press Enter to skip any key"
        
        # Amadeus API (for flights)
        echo
        print_status "Amadeus API (for flight server):"
        print_status "Get keys at: https://developers.amadeus.com/"
        read -p "Amadeus API Key: " amadeus_key
        read -p "Amadeus API Secret: " amadeus_secret
        
        # OpenWeather API (for weather)
        echo
        print_status "OpenWeather API (for weather server):"
        print_status "Get key at: https://openweathermap.org/api"
        read -p "OpenWeather API Key: " weather_key
        
        # Update .env file with provided keys
        if [[ ! -z "$amadeus_key" ]]; then
            sed -i "s/AMADEUS_API_KEY=.*/AMADEUS_API_KEY=$amadeus_key/" .env
        fi
        if [[ ! -z "$amadeus_secret" ]]; then
            sed -i "s/AMADEUS_API_SECRET=.*/AMADEUS_API_SECRET=$amadeus_secret/" .env
        fi
        if [[ ! -z "$weather_key" ]]; then
            sed -i "s/OPENWEATHER_API_KEY=.*/OPENWEATHER_API_KEY=$weather_key/" .env
        fi
        
        print_success "API keys configured"
    else
        print_warning "Skipping API key setup. Edit .env file manually later."
    fi
}

# Build and start the gateway
start_gateway() {
    print_status "Building and starting MCP Gateway..."
    
    # Download the server.js file (you would need to provide this)
    if [ ! -f "server.js" ]; then
        print_error "server.js file is missing. Please ensure all project files are present."
        exit 1
    fi
    
    # Build and start
    docker-compose up --build -d
    
    print_success "MCP Gateway started successfully!"
    echo
    print_status "Gateway is running at: http://localhost:3000"
    print_status "Health check: http://localhost:3000/health"
    print_status "Server list: http://localhost:3000/mcp"
    echo
    print_status "To view logs: docker-compose logs -f"
    print_status "To stop: docker-compose down"
}

# Show usage examples
show_examples() {
    echo
    print_status "Usage Examples:"
    echo "  Health check:     curl http://localhost:3000/health"
    echo "  List servers:     curl http://localhost:3000/mcp"
    echo "  Use filesystem:   curl -X POST http://localhost:3000/mcp/filesystem -d '{\"method\":\"list_files\"}'"
    echo
    print_status "For n8n integration:"
    echo "  Use HTTP Request node with URL: http://localhost:3000/mcp/{server-name}"
    echo
    print_status "Configuration files:"
    echo "  Main config: config.json"
    echo "  Environment: .env"
    echo "  Docker: docker-compose.yml"
}

# Main execution
main() {
    echo
    check_docker
    create_directories
    setup_files
    create_config
    create_env
    setup_api_keys
    
    echo
    print_warning "Important: Make sure server.js is present in the directory"
    print_warning "You can copy it from the provided artifacts"
    
    read -p "Do you want to start the gateway now? (y/n): " start_now
    
    if [[ $start_now =~ ^[Yy]$ ]]; then
        start_gateway
        show_examples
    else
        print_success "Setup complete! Run 'docker-compose up --build -d' when ready."
        show_examples
    fi
}

# Run main function
main "$@"
