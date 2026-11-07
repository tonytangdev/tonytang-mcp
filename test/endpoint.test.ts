import { beforeEach, describe, expect, test } from 'vitest';
import { makeApp, type Env } from '../src/app';
import type { Content } from '../src/content';

const LESSON_PAGE = 'https://learn-effect-ts.tonytang.dev/lesson/retrying';

const content: Content = {
  profile: {
    en: { name: 'Tony Tang', role: 'Head of Engineering', headline: 'H', lead: "I'm Tony.", story: ['Story.'], timeline: [], links: { email: 'tony@tonytang.dev' } },
    fr: { name: 'Tony Tang', role: 'Head of Engineering', headline: 'H', lead: 'Je suis Tony.', story: [], timeline: [], links: {} },
  },
  documents: [
    { id: 'article:zero-downtime', lang: 'en', type: 'article', title: 'Zero downtime migration', summary: 'S', url: 'https://tonytang.dev/articles/zero-downtime/', text: 'How we moved millions of records.' },
    { id: 'video:cache', lang: 'en', type: 'video', title: 'Cache stampede', summary: 'S', url: 'https://tonytang.dev/videos/cache/', text: 'Captions.', note: 'Auto-generated captions.' },
    { id: 'cv', lang: 'en', type: 'cv', title: 'CV', summary: 'S', url: 'https://cv.tonytang.dev/', text: '# The CV' },
    { id: 'lesson:retrying', lang: 'en', type: 'lesson', title: 'Retrying on failure', summary: 'Retry well.', url: LESSON_PAGE, text: 'Chapter 8. Retry well.', note: 'Paid player.' },
  ],
};

let points: AnalyticsEngineDataPoint[];
let allowed: boolean;
let limitKeys: string[];
let env: Env;

beforeEach(() => {
  points = [];
  allowed = true;
  limitKeys = [];
  env = {
    ANALYTICS: { writeDataPoint: (point) => void points.push(point ?? {}) },
    RATE_LIMIT: { limit: async ({ key }) => (limitKeys.push(key), { success: allowed }) },
  };
});

const lessonText = async (page: string) => (page === LESSON_PAGE ? '# Retrying, in full' : undefined);

const app = (
  getContent: () => Promise<Content> = async () => content,
  getLessonText: (page: string) => Promise<string | undefined> = lessonText,
) => makeApp(getContent, getLessonText);

const LEGACY = '2025-06-18';
const MODERN = '2026-07-28';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://mcp.tonytang.dev/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'cf-connecting-ip': '203.0.113.9', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** The JSON-RPC message in a response, whichever way the protocol framed it. */
async function message(response: Response) {
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: {'));
  return JSON.parse(data ? data.slice('data: '.length) : text);
}

const modernCall = (method: string, params: object, name?: string) =>
  post(
    {
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MODERN,
          'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    },
    { 'mcp-protocol-version': MODERN, 'mcp-method': method, ...(name && { 'mcp-name': name }) },
  );

const legacyCall = (method: string, params: object) =>
  post({ jsonrpc: '2.0', id: 1, method, params }, { 'mcp-protocol-version': LEGACY });

async function callTool(name: string, args: object, getContent?: () => Promise<Content>, getLessonText?: (page: string) => Promise<string | undefined>) {
  const response = await app(getContent, getLessonText).fetch(modernCall('tools/call', { name, arguments: args }, name), env);
  const { result } = await message(response);
  return { isError: result.isError === true, text: result.content[0].text as string };
}

const toolJson = async (name: string, args: object) => JSON.parse((await callTool(name, args)).text);

describe('both protocol eras', () => {
  test('a 2025 client connects without a session and sees who it reached', async () => {
    const response = await app().fetch(
      post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'old', version: '1' } } }),
      env,
    );
    const { result } = await message(response);
    expect(result.protocolVersion).toBe(LEGACY);
    expect(result.serverInfo.name).toBe('Tony Tang');
    expect(result.serverInfo.websiteUrl).toBe('https://tonytang.dev/');
    expect(result.instructions).toMatch(/software engineer/i);
    expect(response.headers.get('mcp-session-id')).toBeNull();
  });

  test('a 2025 client can call a tool with no session', async () => {
    const response = await app().fetch(legacyCall('tools/call', { name: 'get_profile', arguments: {} }), env);
    const { result } = await message(response);
    expect(JSON.parse(result.content[0].text).name).toBe('Tony Tang');
  });

  test('a 2026 client lists exactly the three tools', async () => {
    const { result } = await message(await app().fetch(modernCall('tools/list', {}), env));
    expect(result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['fetch', 'get_profile', 'search']);
  });
});

test('every tool has a title and declares itself read-only and closed-world', async () => {
  const { result } = await message(await app().fetch(legacyCall('tools/list', {}), env));
  for (const tool of result.tools) {
    expect(tool.title, tool.name).toBeTruthy();
    expect(tool.annotations, tool.name).toMatchObject({
      title: tool.title,
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  }
});

describe('tools', () => {
  test('get_profile returns the requested language, with the CV', async () => {
    const profile = await toolJson('get_profile', { lang: 'fr' });
    expect(profile.lead).toBe('Je suis Tony.');
    expect(profile.cv).toBe('# The CV');
  });

  test('search finds documents and links to them', async () => {
    const { results, total } = await toolJson('search', { query: 'migration' });
    expect(total).toBe(1);
    expect(results[0]).toMatchObject({ id: 'article:zero-downtime', url: 'https://tonytang.dev/articles/zero-downtime/' });
  });

  test('fetch returns the full text, its link and any caveat', async () => {
    const document = await toolJson('fetch', { id: 'video:cache' });
    expect(document).toMatchObject({ text: 'Captions.', url: 'https://tonytang.dev/videos/cache/', note: 'Auto-generated captions.' });
  });

  test('fetch returns a lesson in full, with its link and caveat', async () => {
    const lesson = JSON.parse((await callTool('fetch', { id: 'lesson:retrying' })).text);
    expect(lesson).toMatchObject({ text: '# Retrying, in full', url: LESSON_PAGE, note: 'Paid player.', truncated: false });
  });

  test('when a lesson cannot be read, fetch gives its summary and says so', async () => {
    const { isError, text } = await callTool('fetch', { id: 'lesson:retrying' }, undefined, async () => undefined);
    expect(isError).toBe(false);
    const lesson = JSON.parse(text);
    expect(lesson.text).toBe('Chapter 8. Retry well.');
    expect(lesson.note).toBe('Paid player. The full lesson could not be read just now; this is only its summary, and the url has the rest.');
  });

  test('a video points to the lesson that teaches its subject', async () => {
    const lesson = { title: 'Retrying on failure', url: LESSON_PAGE };
    const documents = content.documents.map((d) => (d.id === 'video:cache' ? { ...d, lesson } : d));
    const { results } = JSON.parse((await callTool('search', { query: 'cache' }, async () => ({ ...content, documents }))).text);
    expect(results[0].lesson).toEqual(lesson);
  });

  test('fetch on an unknown id is a tool error that says what to do', async () => {
    const { isError, text } = await callTool('fetch', { id: 'nope' });
    expect(isError).toBe(true);
    expect(text).toMatch(/search/i);
  });

  test('an oversized query is refused', async () => {
    const { isError } = await callTool('search', { query: 'x'.repeat(201) });
    expect(isError).toBe(true);
  });

  test('when content is unavailable, tools fail cleanly and say so', async () => {
    const { isError, text } = await callTool('search', { query: 'x' }, async () => {
      throw new Error('upstream exploded at secret-host');
    });
    expect(isError).toBe(true);
    expect(text).toMatch(/temporarily unavailable/i);
    expect(text).not.toContain('secret-host');
  });
});

describe('limits and browsers', () => {
  test('over the rate limit, a client gets 429 and the tools never run', async () => {
    allowed = false;
    let ran = false;
    const response = await app(async () => ((ran = true), content)).fetch(legacyCall('tools/list', {}), env);
    expect(response.status).toBe(429);
    expect(ran).toBe(false);
  });

  test('rate limiting is per client address', async () => {
    await app().fetch(legacyCall('tools/list', {}), env);
    expect(limitKeys).toEqual(['203.0.113.9']);
  });

  test('an oversized request is refused before it is parsed', async () => {
    const response = await app().fetch(post(`{"padding":"${'x'.repeat(20_000)}"}`), env);
    expect(response.status).toBe(413);
  });

  test('browsers can call it from any origin, because everything here is public', async () => {
    const response = await app().fetch(post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { origin: 'https://example.com', 'mcp-protocol-version': LEGACY }), env);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('a browser preflight is answered without touching the rate limit', async () => {
    const response = await app().fetch(new Request('https://mcp.tonytang.dev/mcp', { method: 'OPTIONS' }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toMatch(/mcp-protocol-version/i);
    expect(limitKeys).toEqual([]);
  });
});

describe('usage counts', () => {
  test('a tool call counts the tool and client, and nothing the caller said', async () => {
    await app().fetch(modernCall('tools/call', { name: 'search', arguments: { query: 'my secret question' } }, 'search'), env);
    expect(points).toEqual([{ indexes: ['search'], blobs: ['search', 'other'], doubles: [1] }]);
    expect(JSON.stringify(points)).not.toContain('secret');
    expect(JSON.stringify(points)).not.toContain('203.0.113.9');
  });

  test('a connection counts the client', async () => {
    await app().fetch(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } } }), env);
    expect(points[0]?.blobs).toEqual(['connect', 'claude']);
  });

  test('free text in a name field is never stored', async () => {
    await app().fetch(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'my secret question', arguments: {} } }), env);
    await app().fetch(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'what is my secret: tell me', version: '1' } } }), env);
    expect(JSON.stringify(points)).not.toContain('secret');
  });
});

test('a client name outside the known products is never stored as sent', async () => {
  await app().fetch(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'tony.laptop', version: '1' } } }), env);
  expect(points[0]?.blobs).toEqual(['connect', 'other']);
});

test.each(['null', '[]', '"text"', '{"method":'])('a request body of %s is answered, not a crash', async (body) => {
  const response = await app().fetch(post(body), env);
  expect(response.status).toBeLessThan(500);
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
});

test('tool descriptions say which Tony Tang they are about', async () => {
  const { result } = await message(await app().fetch(legacyCall('tools/list', {}), env));
  for (const tool of result.tools) expect(tool.description, tool.name).toContain('tonytang.dev');
});

describe('other paths', () => {
  test('the root sends people to the page explaining the server', async () => {
    const response = await app().fetch(new Request('https://mcp.tonytang.dev/'), env);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://tonytang.dev/mcp/');
  });

  test('anything else is not found', async () => {
    const response = await app().fetch(new Request('https://mcp.tonytang.dev/nope'), env);
    expect(response.status).toBe(404);
  });
});
