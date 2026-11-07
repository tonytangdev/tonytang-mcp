/**
 * The HTTP surface. In front of the MCP endpoint: open CORS, because all of
 * this is public and nothing uses cookies; a rate limit per address, used only
 * for that check and never stored; a request size cap; and usage counts.
 *
 * Sessionless: each request gets a fresh server, for both 2025 and 2026
 * clients, so any isolate can answer anything.
 */
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Content, GetLessonText } from './content';
import { ICON_PNG } from './icon';
import { makeServer } from './server';
import { countUsage } from './usage';

const MAX_REQUEST_BYTES = 16 * 1024;
const INFO_PAGE = 'https://tonytang.dev/mcp/';

export type Env = {
  ANALYTICS: Pick<AnalyticsEngineDataset, 'writeDataPoint'>;
  RATE_LIMIT: Pick<RateLimit, 'limit'>;
  /** The token the ChatGPT dashboard issues to prove this domain is ours. Public by design. */
  OPENAI_APPS_CHALLENGE?: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

const ICON_HEADERS = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' };

const refuse = (status: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }, { status });

const withCors = (response: Response) => {
  const mutable = new Response(response.body, response);
  for (const [name, value] of Object.entries(CORS)) mutable.headers.set(name, value);
  return mutable;
};

const icon = (request: Request) =>
  request.method === 'GET' || request.method === 'HEAD'
    ? withCors(new Response(ICON_PNG, { headers: ICON_HEADERS }))
    : new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });

export function makeApp(getContent: () => Promise<Content>, getLessonText: GetLessonText) {
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
      if (pathname === '/icon.png') return icon(request);
      if (pathname === '/.well-known/openai-apps-challenge' && env.OPENAI_APPS_CHALLENGE) {
        return new Response(env.OPENAI_APPS_CHALLENGE, { headers: { 'Content-Type': 'text/plain' } });
      }
      if (pathname !== '/mcp') return new Response('Not found', { status: 404 });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      return withCors(await endpoint(request, env));
    },
  };
}
