/**
 * The HTTP surface. In front of the MCP endpoint: open CORS, because all of
 * this is public and nothing uses cookies; a rate limit per address, used only
 * for that check and never stored; a request size cap; and usage counts.
 *
 * Sessionless: each request gets a fresh server, for both 2025 and 2026
 * clients, so any isolate can answer anything.
 */
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Content } from './content';
import { makeServer } from './server';
import { countUsage } from './usage';

const MAX_REQUEST_BYTES = 16 * 1024;
const INFO_PAGE = 'https://tonytang.dev/mcp/';

export type Env = {
  ANALYTICS: Pick<AnalyticsEngineDataset, 'writeDataPoint'>;
  RATE_LIMIT: Pick<RateLimit, 'limit'>;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

const refuse = (status: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }, { status });

const withCors = (response: Response) => {
  const mutable = new Response(response.body, response);
  for (const [name, value] of Object.entries(CORS)) mutable.headers.set(name, value);
  return mutable;
};

export function makeApp(getContent: () => Promise<Content>, getLessonText: (page: string) => Promise<string | undefined>) {
  const mcp = createMcpHandler(() => makeServer(getContent, getLessonText));

  const endpoint = async (request: Request, env: Env) => {
    const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.RATE_LIMIT.limit({ key });
    if (!success) return refuse(429, 'Too many requests. Try again in a minute.');
    if (request.method !== 'POST') return mcp.fetch(request);

    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_REQUEST_BYTES) return refuse(413, 'Request too large.');
    countUsage(env.ANALYTICS, body);
    return mcp.fetch(new Request(request, { body }));
  };

  return {
    fetch: async (request: Request, env: Env): Promise<Response> => {
      const { pathname } = new URL(request.url);
      if (pathname === '/') return Response.redirect(INFO_PAGE, 302);
      if (pathname !== '/mcp') return new Response('Not found', { status: 404 });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      return withCors(await endpoint(request, env));
    },
  };
}
