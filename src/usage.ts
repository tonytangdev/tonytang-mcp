/**
 * Usage counts: one event per connection or tool call, with the tool and the
 * kind of client. Only values from the fixed lists below are stored, so
 * nothing a caller writes can end up in the data, and arguments are never read.
 */
const TOOLS = new Set(['get_profile', 'search', 'fetch']);
const KNOWN_CLIENTS = ['claude', 'chatgpt', 'openai', 'cursor', 'vscode', 'visual studio code', 'perplexity', 'gemini', 'copilot', 'windsurf', 'zed'];
const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo';

type RpcMessage = {
  method?: unknown;
  params?: { name?: unknown; clientInfo?: { name?: unknown }; _meta?: Record<string, { name?: unknown } | undefined> };
};

const clientOf = (message: RpcMessage) => {
  const name = message.params?.clientInfo?.name ?? message.params?._meta?.[CLIENT_INFO_KEY]?.name;
  if (typeof name !== 'string') return 'unknown';
  const lower = name.toLowerCase();
  return KNOWN_CLIENTS.find((client) => lower.includes(client)) ?? 'other';
};

/** What to count for a request, if anything. */
function eventOf(message: RpcMessage): string | undefined {
  if (message.method === 'initialize') return 'connect';
  if (message.method !== 'tools/call') return undefined;
  const tool = message.params?.name;
  return typeof tool === 'string' && TOOLS.has(tool) ? tool : undefined;
}

const parse = (body: string): RpcMessage | undefined => {
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
};

export function countUsage(analytics: Pick<AnalyticsEngineDataset, 'writeDataPoint'>, body: string) {
  const message = parse(body);
  const event = message && eventOf(message);
  if (message && event) analytics.writeDataPoint({ indexes: [event], blobs: [event, clientOf(message)], doubles: [1] });
}
