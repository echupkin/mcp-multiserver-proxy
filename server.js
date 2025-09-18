const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const EventSource = require('eventsource');
const path = require('path');
const fs = require('fs').promises;

require('dotenv').config();

class MCPGateway {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.servers = new Map(); // serverId -> serverInfo
    this.processes = new Map(); // serverId -> child process
    this.config = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.loadConfiguration();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-MCP-Server']
    }));
    this.app.use(morgan('combined'));
    this.app.use(express.json({ limit: '10mb' }));
  }

  async loadConfiguration() {
    try {
      const configPath = process.env.CONFIG_PATH || './config.json';
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      console.log('Configuration loaded:', Object.keys(this.config.servers || {}));
      
      // Start all configured MCP servers
      await this.startAllServers();
    } catch (error) {
      console.error('Failed to load configuration:', error);
      // Use default configuration
      this.config = { servers: {} };
    }
  }

  async startAllServers() {
    if (!this.config?.servers) return;

    for (const [serverId, serverConfig] of Object.entries(this.config.servers)) {
      try {
        await this.startMCPServer(serverId, serverConfig);
      } catch (error) {
        console.error(`Failed to start server ${serverId}:`, error);
      }
    }
  }

  async startMCPServer(serverId, config) {
    console.log(`Starting MCP server: ${serverId}`);
    
    const serverInfo = {
      id: serverId,
      type: config.type || 'stdio',
      status: 'starting',
      config: config,
      startTime: Date.now()
    };

    this.servers.set(serverId, serverInfo);

    switch (config.type) {
      case 'stdio':
        await this.startStdioServer(serverId, config);
        break;
      case 'http':
        await this.startHttpServer(serverId, config);
        break;
      case 'sse':
        await this.startSSEServer(serverId, config);
        break;
      default:
        throw new Error(`Unsupported server type: ${config.type}`);
    }
  }

  async startStdioServer(serverId, config) {
    const { command, args = [], env = {}, cwd } = config;
    
    const childEnv = { ...process.env, ...env };
    const options = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
      cwd: cwd || process.cwd()
    };

    const child = spawn(command, args, options);
    this.processes.set(serverId, child);

    child.on('error', (error) => {
      console.error(`Server ${serverId} error:`, error);
      this.updateServerStatus(serverId, 'error');
    });

    child.on('exit', (code, signal) => {
      console.log(`Server ${serverId} exited with code ${code}, signal ${signal}`);
      this.updateServerStatus(serverId, 'stopped');
      this.processes.delete(serverId);
    });

    // Set up stdio proxy endpoint
    this.setupStdioProxy(serverId, child);
    this.updateServerStatus(serverId, 'running');
  }

  async startHttpServer(serverId, config) {
    // For HTTP servers, we just proxy to the existing endpoint
    const serverInfo = this.servers.get(serverId);
    serverInfo.url = config.url;
    serverInfo.headers = config.headers || {};
    
    this.setupHttpProxy(serverId, config);
    this.updateServerStatus(serverId, 'running');
  }

  async startSSEServer(serverId, config) {
    // For SSE servers, we proxy the SSE endpoint
    const serverInfo = this.servers.get(serverId);
    serverInfo.url = config.url;
    serverInfo.headers = config.headers || {};
    
    this.setupSSEProxy(serverId, config);
    this.updateServerStatus(serverId, 'running');
  }

  setupStdioProxy(serverId, childProcess) {
    // Create a POST endpoint that communicates with the stdio process
    this.app.post(`/mcp/${serverId}`, async (req, res) => {
      try {
        const request = JSON.stringify(req.body) + '\n';
        
        // Set up response listener
        const responseHandler = (data) => {
          try {
            const response = JSON.parse(data.toString());
            childProcess.stdout.removeListener('data', responseHandler);
            res.json(response);
          } catch (parseError) {
            // Ignore parse errors, might be partial data
          }
        };

        childProcess.stdout.on('data', responseHandler);
        
        // Send request to child process
        childProcess.stdin.write(request);
        
        // Set timeout
        setTimeout(() => {
          childProcess.stdout.removeListener('data', responseHandler);
          if (!res.headersSent) {
            res.status(408).json({ error: 'Request timeout' });
          }
        }, 30000);

      } catch (error) {
        console.error(`Error communicating with ${serverId}:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  setupHttpProxy(serverId, config) {
    const proxy = createProxyMiddleware({
      target: config.url,
      changeOrigin: true,
      pathRewrite: {
        [`^/mcp/${serverId}`]: ''
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add custom headers
        if (config.headers) {
          Object.entries(config.headers).forEach(([key, value]) => {
            proxyReq.setHeader(key, value);
          });
        }
      },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${serverId}:`, err);
        res.status(502).json({ error: 'Bad Gateway' });
      }
    });

    this.app.use(`/mcp/${serverId}`, proxy);
  }

  setupSSEProxy(serverId, config) {
    this.app.get(`/mcp/${serverId}/sse`, (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const eventSource = new EventSource(config.url, {
        headers: config.headers || {}
      });

      eventSource.onmessage = (event) => {
        res.write(`data: ${event.data}\n\n`);
      };

      eventSource.onerror = (error) => {
        console.error(`SSE error for ${serverId}:`, error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'SSE connection error' })}\n\n`);
      };

      req.on('close', () => {
        eventSource.close();
      });
    });

    // Also set up POST endpoint for SSE servers
    this.app.post(`/mcp/${serverId}`, async (req, res) => {
      try {
        const axios = require('axios');
        const response = await axios.post(config.url, req.body, {
          headers: {
            'Content-Type': 'application/json',
            ...config.headers
          }
        });
        res.json(response.data);
      } catch (error) {
        console.error(`HTTP request error for ${serverId}:`, error);
        res.status(error.response?.status || 500).json({ 
          error: error.message 
        });
      }
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const serverStatuses = Array.from(this.servers.entries()).map(([id, info]) => ({
        id,
        status: info.status,
        type: info.type,
        uptime: Date.now() - info.startTime
      }));

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        servers: serverStatuses
      });
    });

    // List all servers
    this.app.get('/mcp', (req, res) => {
      const serverList = Array.from(this.servers.entries()).map(([id, info]) => ({
        id,
        type: info.type,
        status: info.status,
        endpoints: this.getServerEndpoints(id, info),
        uptime: Date.now() - info.startTime
      }));

      res.json({
        servers: serverList,
        total: serverList.length
      });
    });

    // Get specific server info
    this.app.get('/mcp/:serverId', (req, res) => {
      const serverId = req.params.serverId;
      const serverInfo = this.servers.get(serverId);
      
      if (!serverInfo) {
        return res.status(404).json({ error: 'Server not found' });
      }

      res.json({
        id: serverId,
        type: serverInfo.type,
        status: serverInfo.status,
        endpoints: this.getServerEndpoints(serverId, serverInfo),
        uptime: Date.now() - serverInfo.startTime,
        config: { ...serverInfo.config, env: undefined } // Hide env vars
      });
    });

    // Dynamic server management
    this.app.post('/mcp/:serverId/start', async (req, res) => {
      const serverId = req.params.serverId;
      const serverInfo = this.servers.get(serverId);
      
      if (!serverInfo) {
        return res.status(404).json({ error: 'Server not found' });
      }

      try {
        await this.startMCPServer(serverId, serverInfo.config);
        res.json({ message: `Server ${serverId} started` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/mcp/:serverId/stop', (req, res) => {
      const serverId = req.params.serverId;
      const process = this.processes.get(serverId);
      
      if (process) {
        process.kill('SIGTERM');
        this.updateServerStatus(serverId, 'stopping');
        res.json({ message: `Server ${serverId} stopping` });
      } else {
        this.updateServerStatus(serverId, 'stopped');
        res.json({ message: `Server ${serverId} was not running` });
      }
    });

    // Catch-all for unknown routes
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: Array.from(this.servers.keys()).map(id => `/mcp/${id}`)
      });
    });
  }

  getServerEndpoints(serverId, serverInfo) {
    const baseUrl = process.env.BASE_URL || `http://localhost:${this.port}`;
    const endpoints = [`${baseUrl}/mcp/${serverId}`];
    
    if (serverInfo.type === 'sse') {
      endpoints.push(`${baseUrl}/mcp/${serverId}/sse`);
    }
    
    return endpoints;
  }

  updateServerStatus(serverId, status) {
    const serverInfo = this.servers.get(serverId);
    if (serverInfo) {
      serverInfo.status = status;
      console.log(`Server ${serverId} status: ${status}`);
    }
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 MCP Gateway running on port ${this.port}`);
      console.log(`📋 Health check: http://localhost:${this.port}/health`);
      console.log(`📋 Server list: http://localhost:${this.port}/mcp`);
      
      if (this.servers.size > 0) {
        console.log('\n🔧 Available MCP servers:');
        this.servers.forEach((info, id) => {
          console.log(`  - ${id}: http://localhost:${this.port}/mcp/${id}`);
        });
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down gracefully...');
      this.processes.forEach((child, serverId) => {
        console.log(`Stopping server: ${serverId}`);
        child.kill('SIGTERM');
      });
      process.exit(0);
    });
  }
}

// Start the gateway
const gateway = new MCPGateway();
gateway.start().catch(console.error);
