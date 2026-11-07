import { Effect } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';
import { Layer } from 'effect';
import { describe, expect, test } from 'vitest';
import { ContentUnavailable, makeContentStore } from '../src/content';

const siteFile = (overrides: object = {}) => ({
  schemaVersion: 1,
  generatedAt: '2026-11-07T12:00:00.000Z',
  profile: {
    en: { name: 'Tony Tang', role: 'Head of Engineering', headline: 'H', lead: 'L', story: [], timeline: [], links: {} },
    fr: { name: 'Tony Tang', role: 'Head of Engineering', headline: 'H', lead: 'L', story: [], timeline: [], links: {} },
  },
  documents: [
    { id: 'article:a', lang: 'en', type: 'article', title: 'A', summary: 'S', url: 'https://tonytang.dev/articles/a/', text: 'T' },
  ],
  ...overrides,
});

const COURSE_TEXT = '# Learn Effect\n\nA course.\n\nEach lesson link below is a Markdown copy.\n\n- lesson list';

/** A fake web: each URL answers from `routes`, and every call is counted. */
function fakeWeb(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetch = (async (input: URL | RequestInfo) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const route = routes[url];
    return route ? route() : new Response('nope', { status: 404 });
  }) as typeof globalThis.fetch;
  const layer = FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)));
  return { calls, layer };
}

const json = (body: unknown) => () => new Response(JSON.stringify(body));
const text = (body: string) => () => new Response(body);
const down = () => new Response('oops', { status: 500 });

const COURSE_INDEX = `# Learn Effect

A course.

Each lesson link below is a Markdown copy.

## Chapter 1: Why Effect (free)

- [Why Effect: types lie](https://learn-effect-ts.tonytang.dev/lesson/why-effect.md): Failure goes back in the return type.

## Chapter 8: Scheduling & retrying (paid)

- [Retrying on failure](https://learn-effect-ts.tonytang.dev/lesson/retrying.md): Retry with a Schedule, not a loop: fewer bugs.

## Optional

- [Course home page](https://learn-effect-ts.tonytang.dev): chapter list, price and sign-in
- [Effect documentation](https://effect.website/docs): the official reference
`;

const SITE = 'https://tonytang.dev/mcp-content.json';
const CV_EN = 'https://cv.tonytang.dev/en.md';
const CV_FR = 'https://cv.tonytang.dev/fr.md';
const COURSE = 'https://learn-effect-ts.tonytang.dev/llms.txt';

const healthy = () => ({
  [SITE]: json(siteFile()),
  [CV_EN]: text('# CV'),
  [CV_FR]: text('# CV français'),
  [COURSE]: text(COURSE_TEXT),
});

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>, layer: Layer.Layer<HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.provide(TestClock.layer())) as Effect.Effect<A, E>);

describe('content store', () => {
  test('joins the site file with the CV and the course summary', async () => {
    const { layer } = fakeWeb(healthy());
    const content = await run(makeContentStore().get, layer);
    expect(content.documents.map((d) => [d.id, d.lang, d.type])).toEqual([
      ['article:a', 'en', 'article'],
      ['cv', 'en', 'cv'],
      ['cv', 'fr', 'cv'],
      ['course:learn-effect', 'en', 'course'],
    ]);
    expect(content.profile.en.name).toBe('Tony Tang');
  });

  test('the course summary stops before its lesson index', async () => {
    const { layer } = fakeWeb(healthy());
    const content = await run(makeContentStore().get, layer);
    expect(content.documents.find((d) => d.type === 'course')?.text).toBe('# Learn Effect\n\nA course.');
  });

  test('each lesson in the course index is its own document, linked to its page', async () => {
    const { layer } = fakeWeb({ ...healthy(), [COURSE]: text(COURSE_INDEX) });
    const content = await run(makeContentStore().get, layer);
    expect(content.documents.filter((d) => d.type === 'lesson')).toEqual([
      {
        id: 'lesson:why-effect',
        lang: 'en',
        type: 'lesson',
        title: 'Why Effect: types lie',
        summary: 'Failure goes back in the return type.',
        url: 'https://learn-effect-ts.tonytang.dev/lesson/why-effect',
        text: 'Chapter 1: Why Effect. Failure goes back in the return type.',
      },
      {
        id: 'lesson:retrying',
        lang: 'en',
        type: 'lesson',
        title: 'Retrying on failure',
        summary: 'Retry with a Schedule, not a loop: fewer bugs.',
        url: 'https://learn-effect-ts.tonytang.dev/lesson/retrying',
        text: 'Chapter 8: Scheduling & retrying. Retry with a Schedule, not a loop: fewer bugs.',
        note: 'The text is free to read; the narrated player is part of the paid course.',
      },
    ]);
  });

  test('a lesson\'s text is read from its Markdown copy, once per cache window', async () => {
    const page = 'https://learn-effect-ts.tonytang.dev/lesson/retrying';
    const { calls, layer } = fakeWeb({ [`${page}.md`]: text('# Retrying') });
    const store = makeContentStore();
    expect(await run(store.lessonText(page), layer)).toBe('# Retrying');
    expect(await run(store.lessonText(page), layer)).toBe('# Retrying');
    expect(calls).toEqual([`${page}.md`]);
  });

  test('a lesson whose text cannot be read gives nothing, rather than failing', async () => {
    const page = 'https://learn-effect-ts.tonytang.dev/lesson/retrying';
    const { layer } = fakeWeb({ [`${page}.md`]: down });
    expect(await run(makeContentStore().lessonText(page), layer)).toBeUndefined();
  });

  test('a video keeps the course lesson the site links it to', async () => {
    const lesson = { title: 'Retrying on failure', url: 'https://learn-effect-ts.tonytang.dev/lesson/retrying' };
    const video = { id: 'video:r', lang: 'en', type: 'video', title: 'R', summary: 'S', url: 'https://tonytang.dev/videos/r/', text: 'T', lesson };
    const { layer } = fakeWeb({ ...healthy(), [SITE]: json(siteFile({ documents: [video] })) });
    const content = await run(makeContentStore().get, layer);
    expect(content.documents.find((d) => d.id === 'video:r')?.lesson).toEqual(lesson);
  });

  test('a second read within the cache window fetches nothing', async () => {
    const { calls, layer } = fakeWeb(healthy());
    const store = makeContentStore();
    await run(
      Effect.gen(function* () {
        yield* store.get;
        yield* store.get;
      }),
      layer,
    );
    expect(calls.filter((url) => url === SITE)).toHaveLength(1);
  });

  test('a read after the cache window fetches again', async () => {
    const { calls, layer } = fakeWeb(healthy());
    const store = makeContentStore();
    await run(
      Effect.gen(function* () {
        yield* store.get;
        yield* TestClock.adjust('6 minutes');
        yield* store.get;
      }),
      layer,
    );
    expect(calls.filter((url) => url === SITE)).toHaveLength(2);
  });

  test('a failed refresh keeps serving the last good copy', async () => {
    const routes = healthy();
    const { layer } = fakeWeb(routes);
    const store = makeContentStore();
    const content = await run(
      Effect.gen(function* () {
        yield* store.get;
        routes[SITE] = down;
        yield* TestClock.adjust('6 minutes');
        return yield* store.get;
      }),
      layer,
    );
    expect(content.documents[0]?.id).toBe('article:a');
  });

  test('a file with an unknown schema version never replaces the last good copy', async () => {
    const routes = healthy();
    const { layer } = fakeWeb(routes);
    const store = makeContentStore();
    const content = await run(
      Effect.gen(function* () {
        yield* store.get;
        routes[SITE] = json(siteFile({ schemaVersion: 2, documents: [] }));
        yield* TestClock.adjust('6 minutes');
        return yield* store.get;
      }),
      layer,
    );
    expect(content.documents[0]?.id).toBe('article:a');
  });

  test('with no copy at all, reading fails as unavailable', async () => {
    const { layer } = fakeWeb({ ...healthy(), [SITE]: down });
    const error = await run(Effect.flip(makeContentStore().get), layer);
    expect(error).toBeInstanceOf(ContentUnavailable);
  });

  test('a malformed site file on first load is unavailable, not a crash', async () => {
    const { layer } = fakeWeb({ ...healthy(), [SITE]: text('<html>not json</html>') });
    const error = await run(Effect.flip(makeContentStore().get), layer);
    expect(error).toBeInstanceOf(ContentUnavailable);
  });

  test('the site still answers when the CV and course are down', async () => {
    const { layer } = fakeWeb({ [SITE]: json(siteFile()), [CV_EN]: down, [CV_FR]: down, [COURSE]: down });
    const content = await run(makeContentStore().get, layer);
    expect(content.documents.map((d) => d.id)).toEqual(['article:a']);
  });
});
