/**
 * Everything the tools answer from. The site's content file is fetched at
 * read time, so a new video appears once the site rebuilds, with no deploy
 * here. The file is the contract with tonytangdev/tonytangdev-v2
 * (src/lib/mcp-content.ts there): it's decoded against the schema below, and
 * one this server can't read never replaces a good copy.
 *
 * Each source is cached for a few minutes. A source that fails keeps its last
 * good copy; only the site file is essential.
 */
import { Clock, Data, Effect, Result, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientResponse } from 'effect/http';
import { LOCALES, SITE_DOCUMENT_TYPES, type Document, type Locale } from './documents';

const CACHE_MS = 5 * 60 * 1000;
const CACHE_SECONDS = CACHE_MS / 1000;
const FETCH_TIMEOUT = '5 seconds';

const SITE_FILE = 'https://tonytang.dev/mcp-content.json';
const COURSE = {
  file: 'https://learn-effect-ts.tonytang.dev/llms.txt',
  page: 'https://learn-effect-ts.tonytang.dev/',
  /** Where the course's description ends and its lesson index begins. */
  until: 'Each lesson link below',
};
const CV: Record<Locale, { file: string; page: string; title: string; summary: string }> = {
  en: {
    file: 'https://cv.tonytang.dev/en.md',
    page: 'https://cv.tonytang.dev/',
    title: "Tony Tang's CV",
    summary: 'Full CV: experience, education, projects, skills and freelance availability.',
  },
  fr: {
    file: 'https://cv.tonytang.dev/fr.md',
    page: 'https://cv.tonytang.dev/fr/',
    title: 'CV de Tony Tang',
    summary: 'CV complet : expériences, formation, projets, compétences et disponibilité en freelance.',
  },
};

export const cvPage = (lang: Locale) => CV[lang].page;

const Profile = Schema.Struct({
  name: Schema.String,
  role: Schema.String,
  headline: Schema.String,
  lead: Schema.String,
  story: Schema.Array(Schema.String),
  timeline: Schema.Array(
    Schema.Struct({ period: Schema.String, role: Schema.String, org: Schema.String, lesson: Schema.String }),
  ),
  links: Schema.Record(Schema.String, Schema.String),
});

const SiteFile = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  profile: Schema.Struct({ en: Profile, fr: Profile }),
  documents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      lang: Schema.Literals(LOCALES),
      type: Schema.Literals(SITE_DOCUMENT_TYPES),
      title: Schema.String,
      summary: Schema.String,
      url: Schema.String,
      published: Schema.optional(Schema.String),
      text: Schema.String,
      note: Schema.optional(Schema.String),
      lesson: Schema.optional(Schema.Struct({ title: Schema.String, url: Schema.String })),
    }),
  ),
});
type SiteFile = typeof SiteFile.Type;

export type Content = {
  profile: SiteFile['profile'];
  documents: Document[];
};

/** A lesson's full text from the url of its page; nothing when it can't be read. */
export type GetLessonText = (page: string) => Promise<string | undefined>;

export class ContentUnavailable extends Data.TaggedError('ContentUnavailable')<{ readonly cause: unknown }> {}

const fetchResponse = (url: string) =>
  HttpClient.get(url).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    // Also cached at Cloudflare's edge, across isolates.
    Effect.provideService(FetchHttpClient.RequestInit, { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } }),
    Effect.timeout(FETCH_TIMEOUT),
  );

const fetchText = (url: string) => fetchResponse(url).pipe(Effect.flatMap((response) => response.text));

const fetchSiteFile = fetchResponse(SITE_FILE).pipe(
  Effect.flatMap((response) => response.json),
  Effect.flatMap(Schema.decodeUnknownEffect(SiteFile)),
);

const cvDocument = (lang: Locale, text: string): Document => ({
  id: 'cv',
  lang,
  type: 'cv',
  title: CV[lang].title,
  summary: CV[lang].summary,
  url: CV[lang].page,
  text,
});

const courseDocument = (text: string): Document => {
  const end = text.indexOf(COURSE.until);
  return {
    id: 'course:learn-effect',
    lang: 'en',
    type: 'course',
    title: 'Learn Effect',
    summary: 'A narrated, animated-code course on Effect, the TypeScript library, by Tony Tang.',
    url: COURSE.page,
    text: (end === -1 ? text : text.slice(0, end)).trim(),
  };
};

const PAID_LESSON_NOTE = 'The text is free to read; the narrated player is part of the paid course.';

/** One document per lesson in the course index: searchable by title, summary and chapter. */
const lessonDocuments = (index: string): Document[] => {
  const lessons: Document[] = [];
  let chapter: { name: string; paid: boolean } | undefined;
  for (const line of index.split('\n')) {
    if (line.startsWith('## ')) {
      const heading = line.match(/^## (Chapter \d+: .+) \((free|paid)\)$/);
      chapter = heading?.[1] ? { name: heading[1], paid: heading[2] === 'paid' } : undefined;
      continue;
    }
    const lesson = line.match(/^- \[(.+)\]\((.+\/lesson\/([^/)]+))\.md\): (.+)$/);
    if (!chapter || !lesson) continue;
    const [, title = '', url = '', slug = '', summary = ''] = lesson;
    lessons.push({
      id: `lesson:${slug}`,
      lang: 'en',
      type: 'lesson',
      title,
      summary,
      url,
      text: `${chapter.name}. ${summary}`,
      ...(chapter.paid && { note: PAID_LESSON_NOTE }),
    });
  }
  return lessons;
};

export function makeContentStore() {
  const cache = new Map<string, { value: unknown; fetchedAt: number }>();

  /** `load`'s value, within the cache window; past it, a refresh, or the last good copy if that fails. */
  const cached = <A, E, R>(key: string, load: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const entry = cache.get(key) as { value: A; fetchedAt: number } | undefined;
      if (entry && now - entry.fetchedAt < CACHE_MS) return entry.value;
      return yield* load.pipe(
        Effect.tap((value) => Effect.sync(() => cache.set(key, { value, fetchedAt: now }))),
        Effect.catch((error) => (entry ? Effect.succeed(entry.value) : Effect.fail(error))),
      );
    });

  /** A source that adds to the site file but isn't essential: `undefined` when it has no copy. */
  const optional = <A, E, R>(key: string, load: Effect.Effect<A, E, R>) =>
    cached(key, load).pipe(Effect.result, Effect.map((result) => (Result.isSuccess(result) ? result.success : undefined)));

  const get = Effect.gen(function* () {
    const [site, cvEn, cvFr, course] = yield* Effect.all(
      [
        cached(SITE_FILE, fetchSiteFile),
        optional(CV.en.file, fetchText(CV.en.file)),
        optional(CV.fr.file, fetchText(CV.fr.file)),
        optional(COURSE.file, fetchText(COURSE.file)),
      ],
      { concurrency: 'unbounded' },
    );
    return {
      profile: site.profile,
      documents: [
        ...site.documents,
        ...(cvEn === undefined ? [] : [cvDocument('en', cvEn)]),
        ...(cvFr === undefined ? [] : [cvDocument('fr', cvFr)]),
        ...(course === undefined ? [] : [courseDocument(course), ...lessonDocuments(course)]),
      ],
    } satisfies Content;
  }).pipe(Effect.mapError((cause) => new ContentUnavailable({ cause })));

  /**
   * A lesson's full text, from the Markdown copy beside its page. Read on
   * demand, not with the rest, to spare 66 requests on every refresh. Callers
   * pass the url of a document from `get`, never one from a tool's input.
   */
  const lessonText = (page: string) => {
    const file = `${page}.md`;
    return optional(file, fetchText(file));
  };

  return { get, lessonText };
}
