import { describe, expect, test } from 'vitest';
import type { Document } from '../src/documents';
import { getDocument, MAX_TEXT_CHARS, search } from '../src/search';

const doc = (overrides: Partial<Document> & { id: string }): Document => ({
  lang: 'en',
  type: 'article',
  title: 'Untitled',
  summary: '',
  url: `https://tonytang.dev/${overrides.id}/`,
  text: '',
  ...overrides,
});

const ids = (docs: Document[], request: Parameters<typeof search>[1]) => search(docs, request).results.map((r) => r.id);

describe('search', () => {
  test('a title match outranks a passing mention in the text', () => {
    const docs = [
      doc({ id: 'mention', text: 'We migrated once, and retries helped.' }),
      doc({ id: 'about-retries', title: 'Retries done right' }),
    ];
    expect(ids(docs, { query: 'retries' })).toEqual(['about-retries', 'mention']);
  });

  test('a document matching more of the query outranks one matching part of it', () => {
    const docs = [
      doc({ id: 'part', title: 'Caching' }),
      doc({ id: 'both', text: 'Caching and retries in one place.' }),
    ];
    expect(ids(docs, { query: 'caching retries' })).toEqual(['both', 'part']);
  });

  test('filler words in a natural question do not outrank the words that matter', () => {
    const docs = [
      doc({ id: 'essay', title: 'What does he do and what do you use', text: 'What does he use? What does he do?' }),
      doc({ id: 'zed', type: 'tool', title: 'Zed', summary: 'Editor' }),
    ];
    expect(ids(docs, { query: 'what editor does he use' })[0]).toBe('zed');
  });

  test('a French question drops its filler words too', () => {
    const docs = [
      doc({ id: 'essay', lang: 'fr', title: 'Quel est le sujet que vous avez' }),
      doc({ id: 'zed', lang: 'fr', type: 'tool', title: 'Zed', summary: 'Éditeur' }),
    ];
    expect(ids(docs, { query: 'quel est son editeur', lang: 'fr' })[0]).toBe('zed');
  });

  test('a query of only common words still searches', () => {
    expect(ids([doc({ id: 'who', title: 'Who is he' })], { query: 'who is' })).toEqual(['who']);
  });

  test('documents that match nothing are left out', () => {
    expect(ids([doc({ id: 'other', title: 'Hiring' })], { query: 'kubernetes' })).toEqual([]);
  });

  test('matching ignores case and accents, and finds plurals from the singular', () => {
    const docs = [doc({ id: 'fr', lang: 'fr', title: 'Les Compétences ingrates' })];
    expect(ids(docs, { query: 'competence', lang: 'fr' })).toEqual(['fr']);
  });

  test('a short term matches whole word starts, not the middle of words', () => {
    const docs = [doc({ id: 'email', title: 'Email retail' }), doc({ id: 'ai', title: 'AI at work' })];
    expect(ids(docs, { query: 'ai' })).toEqual(['ai']);
  });

  test('a two-letter term has to be the whole word, so "go" skips "got"', () => {
    const docs = [doc({ id: 'got', title: 'Got it' }), doc({ id: 'go', title: 'Why Go' })];
    expect(ids(docs, { query: 'go' })).toEqual(['go']);
  });

  test('a query with nothing searchable finds nothing, rather than everything', () => {
    expect(search([doc({ id: 'a', title: 'Caching' })], { query: '???' })).toEqual({ results: [], total: 0 });
  });

  test('a language name stuck to punctuation only matches that word', () => {
    expect(ids([doc({ id: 'caching', title: 'Caching' })], { query: 'c++' })).toEqual([]);
  });

  test('a long summary is shortened in results', () => {
    const [result] = search([doc({ id: 'a', title: 'Caching', summary: 'word '.repeat(400) })], { query: 'caching' }).results;
    expect(result?.summary.length).toBeLessThanOrEqual(301);
  });

  test('each piece appears once, in the requested language', () => {
    const docs = [
      doc({ id: 'a', lang: 'en', title: 'Migration story' }),
      doc({ id: 'a', lang: 'fr', title: 'Histoire de migration' }),
    ];
    const { results } = search(docs, { query: 'migration', lang: 'fr' });
    expect(results.map((r) => [r.id, r.lang])).toEqual([['a', 'fr']]);
  });

  test('a query in another language still finds the piece, returned in the requested language', () => {
    const docs = [
      doc({ id: 'a', lang: 'en', title: 'Zero downtime' }),
      doc({ id: 'a', lang: 'fr', title: 'Sans interruption' }),
    ];
    const { results } = search(docs, { query: 'interruption', lang: 'en' });
    expect(results.map((r) => [r.id, r.lang])).toEqual([['a', 'en']]);
  });

  test('English-only pieces still appear for a French search', () => {
    const { results } = search([doc({ id: 'v', type: 'video', title: 'Caching' })], { query: 'caching', lang: 'fr' });
    expect(results.map((r) => [r.id, r.lang])).toEqual([['v', 'en']]);
  });

  test('English is the default language', () => {
    const docs = [doc({ id: 'a', lang: 'fr', title: 'Caching' }), doc({ id: 'a', lang: 'en', title: 'Caching' })];
    expect(search(docs, { query: 'caching' }).results[0]?.lang).toBe('en');
  });

  test('type narrows the results', () => {
    const docs = [doc({ id: 'a', title: 'Caching' }), doc({ id: 'v', type: 'video', title: 'Caching' })];
    expect(ids(docs, { query: 'caching', type: 'video' })).toEqual(['v']);
  });

  test('limit caps the results, and the total still counts them all', () => {
    const docs = ['a', 'b', 'c'].map((id) => doc({ id, title: 'Caching' }));
    const out = search(docs, { query: 'caching', limit: 2 });
    expect(out.results).toHaveLength(2);
    expect(out.total).toBe(3);
  });

  test('no query lists the newest first, with undated pieces last', () => {
    const docs = [
      doc({ id: 'undated', type: 'tool' }),
      doc({ id: 'old', published: '2025-01-01T00:00:00.000Z' }),
      doc({ id: 'new', published: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(ids(docs, {})).toEqual(['new', 'old', 'undated']);
  });

  test('the snippet shows the text around the first match', () => {
    const text = `${'x '.repeat(400)}the stampede took production down ${'y '.repeat(400)}`;
    const [result] = search([doc({ id: 'a', text })], { query: 'stampede' }).results;
    expect(result?.snippet).toContain('the stampede took production down');
    expect(result?.snippet.length).toBeLessThanOrEqual(260);
  });

  test('results carry no full text', () => {
    const [result] = search([doc({ id: 'a', title: 'Caching', text: 'Long body.' })], { query: 'caching' }).results;
    expect(result).not.toHaveProperty('text');
  });
});

describe('getDocument', () => {
  const variants = [
    doc({ id: 'a', lang: 'en', text: 'English.' }),
    doc({ id: 'a', lang: 'fr', text: 'Français.' }),
    doc({ id: 'v', lang: 'en', text: 'Only English.' }),
  ];

  test('returns the requested language', () => {
    expect(getDocument(variants, { id: 'a', lang: 'fr' })?.text).toBe('Français.');
  });

  test('falls back to the language that exists', () => {
    expect(getDocument(variants, { id: 'v', lang: 'fr' })?.lang).toBe('en');
  });

  test('an unknown id finds nothing', () => {
    expect(getDocument(variants, { id: 'nope' })).toBeUndefined();
  });

  test('long text is cut and flagged', () => {
    const long = doc({ id: 'long', text: 'x'.repeat(MAX_TEXT_CHARS + 10) });
    const out = getDocument([long], { id: 'long' });
    expect(out?.text).toHaveLength(MAX_TEXT_CHARS);
    expect(out?.truncated).toBe(true);
  });

  test('complete text is not flagged', () => {
    expect(getDocument(variants, { id: 'a' })?.truncated).toBe(false);
  });
});
