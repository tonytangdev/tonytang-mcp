# tonytang-mcp

A public, read-only [MCP](https://modelcontextprotocol.io) server with information about Tony Tang: his background, CV, articles, videos, course and tools.

**Endpoint:** `https://mcp.tonytang.dev/mcp` (Streamable HTTP, no login). Add it as a custom connector in your assistant; [tonytang.dev/mcp](https://tonytang.dev/mcp/) has the steps.

| Tool | What it does |
| --- | --- |
| `get_profile` | Role, background, career timeline, contact links and the full CV, with a profile card in hosts that show interactive UI |
| `search` | Keyword search across all content, including course lessons, or the newest content when the query is empty |
| `fetch` | One document in full by id, with its link and any note on using it |

## How it works

- **Cloudflare Worker**, stateless, so any isolate can answer any request. It serves 2025 and 2026 protocol clients through the official [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server) SDK.
- **Content comes from the sites, at read time.** The tonytang.dev build publishes `/mcp-content.json`, and the Worker reads it along with the CV and the course index. A lesson's full text is read only when it's fetched. [Effect](https://effect.website) handles fetching, schema validation and caching (`src/content.ts`). New content appears after a site rebuild, with no deploy here.
- **The profile card** is an [MCP App](https://modelcontextprotocol.io/extensions/apps/overview): one self-contained HTML resource (`src/card.ts`) that declares no outside domains, so showing it contacts nothing. The bridge to the host is hand-written, because the official client adds about 660 KB for a handful of messages.
- **No LLM.** Tools return source text with canonical links, and the assistant does the thinking.
- **No stored questions.** Only one event per call, with the tool and a client category from a fixed list (`src/usage.ts`). Addresses are used for rate limiting only, and Workers Logs stay off.

Effect also has its own MCP server, but its Workers transport only speaks the 2026 protocol, which would shut out clients that are still on 2025.

## Develop

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

## License

MIT
