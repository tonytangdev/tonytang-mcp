/**
 * Finding documents: keyword search over titles, summaries and text, and
 * lookup by id. There's little enough content to scan it all on each call,
 * and the assistant calling these tools can rephrase and search again.
 *
 * Variants of a piece count as one: any variant can match (a French query
 * finds an English-language request's article), and the result is always the
 * requested language if it exists, else whichever does.
 */
import type { Document, DocumentType, Locale } from './documents';

export const DEFAULT_LIMIT = 10;
/** Cap on a document's text, in characters: stays well under what clients accept in one result. */
export const MAX_TEXT_CHARS = 100_000;
const SNIPPET_CHARS = 240;

const WEIGHT = { title: 5, summary: 3, text: 1 };
/** Outweighs any total of field weights: a query's length is capped well under this. */
const COVERAGE = 10_000;

/** Words that say nothing about the subject, in queries phrased as questions. Accents already stripped. */
const FILLER = new Set(
  `a an and are about at be can could did do does for from has have he her him his how i in is it me my of on or
  she should so that the their them they this to use used uses using was we what when where which who why will
  with would you your
  au aux avec ce ces comment dans de des du elle en est et il ils je la le les leur lui ma mes mon ne nous on ou
  par pas pour pourquoi quand que quel quelle quelles quels qui sa se ses son sont sur ta tes ton tu un une utilise
  utiliser vos votre vous`.split(/\s+/),
);

const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const words = (text: string) => normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];

const mentions = (haystack: string[], term: string) => haystack.some((word) => word.startsWith(term));

/** How well a document matches: how many terms it matches first, then field weights. */
function score(document: Document, terms: string[]): number {
  const title = words(document.title);
  const summary = words(document.summary);
  const text = words(document.text);
  let total = 0;
  let matched = 0;
  for (const term of terms) {
    const points =
      (mentions(title, term) ? WEIGHT.title : 0) +
      (mentions(summary, term) ? WEIGHT.summary : 0) +
      (mentions(text, term) ? WEIGHT.text : 0);
    if (points > 0) matched++;
    total += points;
  }
  return matched * COVERAGE + total;
}

/** The variant to show for a language: that language if it exists, else the first there is. */
const pick = <D extends { lang: Locale }>(variants: D[], lang: Locale): D | undefined =>
  variants.find((v) => v.lang === lang) ?? variants[0];

const groupById = (documents: Document[]) => {
  const groups = new Map<string, Document[]>();
  for (const document of documents) {
    const group = groups.get(document.id);
    if (group) group.push(document);
    else groups.set(document.id, [document]);
  }
  return [...groups.values()];
};

/** The text around the first match, or its start. Case and accents can shift offsets, so this scans lowercase-only. */
function snippet(document: Document, terms: string[]): string {
  const flat = document.text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const hits = terms.map((term) => lower.indexOf(term)).filter((at) => at !== -1);
  const at = hits.length > 0 ? Math.min(...hits) : 0;
  const start = at <= SNIPPET_CHARS / 3 ? 0 : flat.indexOf(' ', at - SNIPPET_CHARS / 3) + 1;
  const cut = flat.slice(start, start + SNIPPET_CHARS);
  return `${start > 0 ? '…' : ''}${cut}${start + SNIPPET_CHARS < flat.length ? '…' : ''}`;
}

export type SearchRequest = {
  query?: string | undefined;
  type?: DocumentType | undefined;
  lang?: Locale | undefined;
  limit?: number | undefined;
};

export function search(documents: Document[], request: SearchRequest) {
  const { type, lang = 'en', limit = DEFAULT_LIMIT } = request;
  const allTerms = [...new Set(words(request.query ?? ''))];
  const meaningful = allTerms.filter((term) => !FILLER.has(term));
  const terms = meaningful.length > 0 ? meaningful : allTerms;
  const candidates = groupById(type ? documents.filter((d) => d.type === type) : documents);

  const ranked =
    terms.length === 0
      ? candidates
          .map((variants) => ({ variants, rank: Date.parse(variants[0]?.published ?? '') || 0 }))
      : candidates
          .map((variants) => ({ variants, rank: Math.max(...variants.map((v) => score(v, terms))) }))
          .filter(({ rank }) => rank > 0);
  ranked.sort((a, b) => b.rank - a.rank);

  const results = ranked.slice(0, limit).flatMap(({ variants }) => {
    const document = pick(variants, lang);
    if (!document) return [];
    const { text: _text, ...rest } = document;
    return [{ ...rest, snippet: snippet(document, terms) }];
  });
  return { results, total: ranked.length };
}

export function getDocument(documents: Document[], request: { id: string; lang?: Locale | undefined }) {
  const document = pick(documents.filter((d) => d.id === request.id), request.lang ?? 'en');
  if (!document) return undefined;
  return {
    ...document,
    text: document.text.slice(0, MAX_TEXT_CHARS),
    truncated: document.text.length > MAX_TEXT_CHARS,
  };
}
