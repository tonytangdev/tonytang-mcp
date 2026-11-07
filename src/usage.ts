/**
 * Usage counts: one event per connection or tool call, with the tool and the
 * client's name. Nothing a person typed is kept: only values from a fixed list or
 * in the shape of a product name are stored, and arguments are never read.
 */
const TOOLS = new Set(['get_profile', 'search', 'fetch']);
const CLIENT_NAME = /^[\w.-]{1,40}$/;
const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo';

type RpcMessage = {
  method?: unknown;
  params?: { name?: unknown; clientInfo?: { name?: unknown }; _meta?: Record<string, { name?: unknown } | undefined> };
};

const clientOf = (message: RpcMessage) => {
  const name = message.params?.clientInfo?.name ?? message.params?._meta?.[CLIENT_INFO_KEY]?.name;
  if (name === undefined) return 'unknown';
  return typeof name === 'string' && CLIENT_NAME.test(name) ? name : 'other';
};

/** What to count for a request, if anything. */
function eventOf(message: RpcMessage): string | undefined {
  if (message.method === 'initialize') return 'connect';
  if (message.method !== 'tools/call') return undefined;
  const tool = message.params?.name;
  return typeof tool === 'string' && TOOLS.has(tool) ? tool : undefined;
}

export function countUsage(analytics: Pick<AnalyticsEngineDataset, 'writeDataPoint'>, body: string) {
  let message: RpcMessage;
  try {
    message = JSON.parse(body);
  } catch {
    return;
  }
  const event = eventOf(message);
  if (event) analytics.writeDataPoint({ indexes: [event], blobs: [event, clientOf(message)], doubles: [1] });
}
