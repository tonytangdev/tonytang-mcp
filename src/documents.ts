/** What the server knows about: the content file's documents, plus the CV and course summary. */
export type Locale = 'en' | 'fr';
export type DocumentType = 'article' | 'video' | 'series' | 'tool' | 'cv' | 'course';

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
