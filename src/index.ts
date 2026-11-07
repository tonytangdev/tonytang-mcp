/**
 * mcp.tonytang.dev: a public, read-only MCP server with information about Tony
 * Tang. No login, no LLM, and no stored questions.
 */
import { Effect } from 'effect';
import { FetchHttpClient, type HttpClient } from 'effect/http';
import { makeApp } from './app';
import { makeContentStore } from './content';

const store = makeContentStore();
const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));

export default makeApp(() => run(store.get), (page) => run(store.lessonText(page)));
