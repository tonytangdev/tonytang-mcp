/** What the server knows about: the content file's documents, plus the CV and course summary. */
export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** The types the site's content file carries; the CV and course come from their own sites. */
export const SITE_DOCUMENT_TYPES = ['article', 'video', 'series', 'tool'] as const;
export const DOCUMENT_TYPES = [...SITE_DOCUMENT_TYPES, 'cv', 'course'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type Document = {
  /** Stable across locales: the variants of one piece share an id. */
  id: string;
  lang: Locale;
  type: DocumentType;
  title: string;
  summary: string;
  url: string;
  published?: string | undefined;
  text: string;
  /** A caveat an assistant should keep in mind when using the text. */
  note?: string | undefined;
};
