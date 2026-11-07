/**
 * mcp.tonytang.dev: a public, read-only MCP server with information about Tony
 * Tang. No login, no LLM, and no stored questions.
 */
import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { makeApp } from './app';
import { makeContentStore } from './content';

export type { Env } from './app';

const store = makeContentStore();
const getContent = () => Effect.runPromise(store.get.pipe(Effect.provide(FetchHttpClient.layer)));

export default makeApp(getContent);
