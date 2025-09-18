# MCP Gateway

A Docker-based HTTP gateway for serving multiple Model Context Protocol (MCP) servers through a single endpoint with URL path-based routing. Perfect for integration with n8n, LiteLLM, and other HTTP-based AI tools.

## Features

- **Multiple Server Types**: Supports stdio, HTTP, and Server-Sent Events (SSE) MCP servers
- **URL Path Routing**: Access different MCP servers via `/mcp/{server-id}` paths
- **Dynamic Management**: Start, stop, and monitor servers via REST API
- **Health Monitoring**: Built-in health checks and status reporting
- **Docker Ready**: Complete containerization with Docker Compose
- **CORS Enabled**: Ready for web applications and cross-origin requests
- **Authentication**: Optional token-based authentication
- **Logging**: Comprehensive request and error logging

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo>
cd mcp-gateway
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Configure Servers

Edit `config.json` to define your MCP servers:

```json
{
  "servers": {
    "flights": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@smamidipaka6/flights-mcp-server"],
      "env": {
        "AMADEUS_API_KEY": "your_key",
        "AMADEUS_API_SECRET": "your_secret"
      }
    }
  }
}
```

### 4. Run with Docker

```bash
# Build and start
docker-compose up --build

# Or run in background
docker-compose up -d
```

## Server Endpoints

Once running, your MCP servers will be available at:

- **Health Check**: `http://localhost:3000/health`
- **Server List**: `http://localhost:3000/mcp`
- **Flight Server**: `http://localhost:3000/mcp/flights`
- **Weather Server**: `http://localhost:3000/mcp/weather`
- **File System**: `http://localhost:3000/mcp/filesystem`

## Supported Server Types

### 1. Stdio Servers
Most common MCP servers that communicate via stdin/stdout:

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-weather"],
  "env": {
    "OPENWEATHER_API_KEY": "your_key"
  }
}
```

### 2. HTTP Servers
Direct HTTP proxy to existing MCP HTTP endpoints:

```json
{
  "type": "http",
  "url": "https://api.example.com/mcp",
  "headers": {
    "Authorization": "Bearer token"
  }
}
```

### 3. SSE Servers
Server-Sent Events endpoints:

```json
{
  "type": "sse",
  "url": "https://sse.example.com/events",
  "headers": {
    "Authorization": "Bearer token"
  }
}
```

## Integration Examples

### n8n Integration

1. Use **HTTP Request** node
2. Set URL to: `http://your-gateway:3000/mcp/flights`
3. Set method to POST
4. Add your MCP request in the body

### LiteLLM Integration

```python
import openai
from litellm import completion

# Configure LiteLLM to use your MCP gateway
response = completion(
    model="gpt-4",
    messages=[{"role": "user", "content": "Search for flights"}],
    tools=[{
        "type": "function",
        "function": {
            "name": "search_flights",
            "url": "http://your-gateway:3000/mcp/flights"
        }
    }]
)
```

## API Reference

### Gateway Endpoints

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/health` | GET | Health check and server status |
| `/mcp` | GET | List all configured servers |
| `/mcp/{id}` | GET | Get specific server info |
| `/mcp/{id}` | POST | Send request to MCP server |
| `/mcp/{id}/start` | POST | Start a stopped server |
| `/mcp/{id}/stop` | POST | Stop a running server |

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "servers": [
    {
      "id": "flights",
      "status": "running",
      "type": "stdio",
      "uptime": 123456
    }
  ]
}
```

### Server List Response

```json
{
  "servers": [
    {
      "id": "flights",
      "type": "stdio", 
      "status": "running",
      "endpoints": ["http://localhost:3000/mcp/flights"],
      "uptime": 123456
    }
  ],
  "total": 1
}
```

## Popular MCP Servers

Here are some popular MCP servers you can add to your gateway:

### Official Servers
- `@modelcontextprotocol/server-filesystem` - File operations
- `@modelcontextprotocol/server-fetch` - Web scraping
- `@modelcontextprotocol/server-brave-search` - Web search
- `@modelcontextprotocol/server-postgres` - Database access
- `@modelcontextprotocol/server-sqlite` - SQLite database
- `@modelcontextprotocol/server-slack` - Slack integration

### Community Servers
- `@smamidipaka6/flights-mcp-server` - Flight search and booking
- Various weather, email, calendar, and social media integrations
- Database connectors (MySQL, MongoDB, etc.)
- API integrations (GitHub, Jira, etc.)

## Configuration Reference

### Server Configuration Schema

```json
{
  "servers": {
    "server-id": {
      "type": "stdio|http|sse",
      "description": "Human readable description",
      
      // For stdio servers
      "command": "executable",
      "args": ["arg1", "arg2"],
      "env": {"KEY": "value"},
      "cwd": "/path/to/working/directory",
      
      // For http/sse servers  
      "url": "https://api.example.com",
      "headers": {"Authorization": "Bearer token"},
      "timeout": 30000
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
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Runtime environment |
| `PORT` | No | `3000` | Server port |
| `BASE_URL` | No | `http://localhost:3000` | Public base URL |
| `CONFIG_PATH` | No | `./config.json` | Configuration file path |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins |

## Monitoring and Logging

### Health Monitoring

The gateway provides comprehensive health monitoring:

```bash
# Check overall health
curl http://localhost:3000/health

# Get detailed server status
curl http://localhost:3000/mcp/flights
```

### Logs

Logs are written to stdout and can be collected with Docker:

```bash
# View live logs
docker-compose logs -f mcp-gateway

# View logs for specific timeframe
docker-compose logs --since="1h" mcp-gateway
```

## Troubleshooting

### Common Issues

1. **Server Won't Start**
   - Check if required API keys are set in environment
   - Verify command and args in configuration
   - Check Docker logs for error messages

2. **Connection Refused**
   - Ensure server is listening on correct port
   - Check firewall settings
   - Verify Docker port mapping

3. **MCP Server Crashes**
   - Check individual server logs
   - Verify API credentials and rate limits
   - Ensure all dependencies are installed

### Debug Mode

Enable debug logging:

```bash
# Set debug environment
NODE_ENV=development docker-compose up
```

### Manual Server Management

```bash
# Start specific server
curl -X POST http://localhost:3000/mcp/flights/start

# Stop specific server  
curl -X POST http://localhost:3000/mcp/flights/stop

# Check server status
curl http://localhost:3000/mcp/flights
```

## Security Considerations

### Authentication

Add authentication tokens to your configuration:

```json
{
  "gateway": {
    "auth": {
      "required": true,
      "tokens": ["your-secure-token-here"]
    }
  }
}
```

Then include the token in requests:

```bash
curl -H "Authorization: Bearer your-secure-token-here" \
     http://localhost:3000/mcp/flights
```

### Network Security

- Run behind a reverse proxy (nginx, Cloudflare)
- Use HTTPS in production
- Restrict CORS origins for web applications
- Implement rate limiting

### API Key Management

- Store API keys in environment variables, not config files
- Use Docker secrets for sensitive data
- Rotate API keys regularly
- Monitor API usage and quotas

## Scaling and Performance

### Horizontal Scaling

Deploy multiple instances behind a load balancer:

```bash
# Scale with Docker Compose
docker-compose up --scale mcp-gateway=3
```

### Performance Tuning

- Adjust Node.js memory limits: `NODE_OPTIONS="--max-old-space-size=4096"`
- Configure connection pooling for database servers
- Implement caching for frequently accessed data
- Monitor memory usage and CPU utilization

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run with specific config
CONFIG_PATH=./dev-config.json npm run dev
```

### Adding New Server Types

Extend the `MCPGateway` class to support additional server types:

```javascript
async startCustomServer(serverId, config) {
  // Your custom server startup logic
  this.setupCustomProxy(serverId, config);
  this.updateServerStatus(serverId, 'running');
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: Report bugs and request features
- Documentation: Check the wiki for detailed guides
- Community: Join discussions in GitHub Discussions

## Changelog

### v1.0.0
- Initial release
- Support for stdio, HTTP, and SSE servers
- Docker containerization
- Health monitoring and management APIs
- CORS and authentication support
