import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { validateToken, getConfig } from './auth/middleware.js';
import { ToolRegistry } from './tools/index.js';
import { RUN_WORKOUT_SYNTAX_RESOURCE } from './resources/run-workout-syntax.js';
import { CYCLING_WORKOUT_SYNTAX_RESOURCE } from './resources/cycling-workout-syntax.js';

export interface ServerOptions {
  port: number;
}

export async function createServer(options: ServerOptions): Promise<express.Express> {
  const app = express();
  app.use(express.json());

  const config = getConfig();

  // Create tool registry with API clients (shared across connections)
  const toolRegistry = new ToolRegistry({
    intervals: config.intervals,
    trainerroad: config.trainerRoad,
  });

  console.log('Tool registry created');

  // Store active transports and servers by sessionId
  const sessions: Record<string, { transport: StreamableHTTPServerTransport; server: McpServer }> = {};

  // Health check endpoint (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Root redirect to GitHub
  app.get('/', (_req: Request, res: Response) => {
    res.redirect(302, 'https://github.com/gesteves/domestique');
  });

  // Notify all connected clients that tools have changed
  // Useful after deployments that add/modify/remove tools
  app.post('/admin/notify-tools-changed', validateToken, async (_req: Request, res: Response) => {
    const sessionIds = Object.keys(sessions);
    let notified = 0;

    for (const sessionId of sessionIds) {
      const { server } = sessions[sessionId];
      try {
        await server.sendToolListChanged();
        notified++;
      } catch (error) {
        console.error(`Failed to notify session ${sessionId}:`, error);
      }
    }

    console.log(`Notified ${notified}/${sessionIds.length} sessions of tool list change`);
    res.json({
      success: true,
      sessions_notified: notified,
      total_sessions: sessionIds.length,
    });
  });

  // MCP endpoint - handles all Streamable HTTP requests
  app.all('/mcp', validateToken, async (req: Request, res: Response) => {
    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // If we have an existing session, use it
    if (sessionId && sessions[sessionId]) {
      const { transport } = sessions[sessionId];
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
      return;
    }

    // If the client sent a session ID but we don't recognize it (e.g. after a
    // server restart/deployment), return 404 so the client knows to re-initialize.
    // Per the MCP spec, 404 signals "session not found" and the client should
    // start a new session by sending a fresh initialization request.
    if (sessionId) {
      console.log(`Unknown session ID: ${sessionId}, returning 404 to trigger re-initialization`);
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      });
      return;
    }

    // For new sessions (initialization), create a new server and transport
    const mcpServer = new McpServer(
      { name: 'domestique', version: '1.0.0' },
      { capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} } }
    );

    // Register tools for this connection
    toolRegistry.registerTools(mcpServer);

    // Register resources
    mcpServer.resource(
      'intervals-run-workout-syntax',
      'intervals-run-workout-syntax://docs',
      {
        description: 'Documentation for creating structured running workouts in Intervals.icu format',
        mimeType: 'text/markdown',
        annotations: {
          audience: ['assistant'],
        },
      },
      async () => {
        console.log('[MCP] Resource requested: intervals-run-workout-syntax');
        return {
          contents: [
            {
              uri: 'intervals-run-workout-syntax://docs',
              mimeType: 'text/markdown',
              text: RUN_WORKOUT_SYNTAX_RESOURCE,
            },
          ],
        };
      }
    );

    mcpServer.resource(
      'intervals-cycling-workout-syntax',
      'intervals-cycling-workout-syntax://docs',
      {
        description: 'Documentation for creating structured cycling workouts in Intervals.icu format',
        mimeType: 'text/markdown',
        annotations: {
          audience: ['assistant'],
        },
      },
      async () => {
        console.log('[MCP] Resource requested: intervals-cycling-workout-syntax');
        return {
          contents: [
            {
              uri: 'intervals-cycling-workout-syntax://docs',
              mimeType: 'text/markdown',
              text: CYCLING_WORKOUT_SYNTAX_RESOURCE,
            },
          ],
        };
      }
    );

    // Register prompts
    mcpServer.registerPrompt(
      'daily_summary',
      {
        title: 'Daily Summary',
        description:
          'Get a complete overview of your fitness status today including recovery, strain, workouts, and fitness metrics',
      },
      async () => {
        console.log('[MCP] Prompt requested: daily_summary');
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Give me my daily fitness summary for today.',
              },
            },
          ],
        };
      }
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        console.log(`Session initialized: ${newSessionId}`);
        sessions[newSessionId] = { transport, server: mcpServer };
      },
      onsessionclosed: (closedSessionId) => {
        console.log(`Session closed: ${closedSessionId}`);
        delete sessions[closedSessionId];
      },
    });

    // Connect the server to the transport
    await mcpServer.connect(transport);

    // Handle the request
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const app = await createServer(options);

  app.listen(options.port, () => {
    console.log(`Domestique MCP server running on port ${options.port}`);
    console.log(`Health check: http://localhost:${options.port}/health`);
    console.log(`MCP endpoint: http://localhost:${options.port}/mcp`);
  });
}
