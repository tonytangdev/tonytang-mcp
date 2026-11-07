/**
 * The MCP server: three read-only tools over public content. Descriptions say
 * what each tool does and when to use it, nothing promotional: assistants pick
 * tools from them, and the app directories reject sales copy.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Content } from './content';
import { DEFAULT_LOCALE, DOCUMENT_TYPES, LOCALES } from './documents';
import { DEFAULT_LIMIT, getDocument, search, withText } from './search';

const VERSION = '1.0.0';
const MAX_QUERY_CHARS = 200;
const MAX_LIMIT = 20;

const INSTRUCTIONS = `Public information about Tony Tang, the software engineer who publishes tonytang.dev. Use these tools only for questions about this Tony Tang or his work; other people share the name.

Start with get_profile for who he is, or search for his writing, videos, tools and course, then fetch for a full document. Everything here is already public on his sites. Cite the url of what you use. If something isn't covered, say so rather than guessing, and point to the contact links in get_profile.`;

const langInput = z.enum(LOCALES).optional().describe('Language of the answer: en (default) or fr. Content that exists in only one language is returned in that language.');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const failure = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

const LESSON_UNAVAILABLE = 'The full lesson could not be read just now; this is only its summary, and the url has the rest.';
const UNAVAILABLE = 'The content is temporarily unavailable. Try again shortly, or see https://tonytang.dev/.';

export function makeServer(getContent: () => Promise<Content>, getLessonText: (page: string) => Promise<string | undefined>) {
  /** Runs a tool on the current content; loading failures are reported to the assistant without their details. */
  const withContent = async <R>(tool: (content: Content) => R | Promise<R>) => {
    let content: Content;
    try {
      content = await getContent();
    } catch (error) {
      console.error('Content unavailable', error);
      return failure(UNAVAILABLE);
    }
    return tool(content);
  };

  const server = new McpServer(
    {
      name: 'Tony Tang',
      title: 'Tony Tang',
      version: VERSION,
      websiteUrl: 'https://tonytang.dev/',
      description: 'Public information about Tony Tang, the software engineer behind tonytang.dev.',
      icons: [
        { src: 'https://mcp.tonytang.dev/icon.png', mimeType: 'image/png', sizes: ['192x192'] },
        { src: 'https://tonytang.dev/favicon.svg', mimeType: 'image/svg+xml' },
      ],
    },
    { instructions: INSTRUCTIONS },
  );

  const readOnlyTool = (title: string) => ({ title, annotations: { title, ...READ_ONLY } });

  server.registerTool(
    'get_profile',
    {
      ...readOnlyTool('Get Tony Tang\'s profile'),
      description:
        "Get the profile of Tony Tang, the software engineer behind tonytang.dev: current role, background, career timeline, contact links, and his full CV (including freelance availability) when available.",
      inputSchema: z.object({ lang: langInput }),
    },
    ({ lang = DEFAULT_LOCALE }) =>
      withContent((content) =>
        json({ ...content.profile[lang], cv: getDocument(content.documents, { id: 'cv', lang })?.text ?? null }),
      ),
  );

  server.registerTool(
    'search',
    {
      ...readOnlyTool("Search Tony Tang's content"),
      description:
        "Search the work of Tony Tang, the software engineer behind tonytang.dev: articles, video transcripts, video series, CV, course summary, course lessons and the tools he uses. Results are keyword matches, each in the requested language where it exists. Returns matches with an id for fetch and a link, plus the matching course lesson on videos that have one. Shows up to three lessons unless type is lesson. Leave query empty to list the newest content, optionally of one type.",
      inputSchema: z.object({
        query: z.string().max(MAX_QUERY_CHARS).optional().describe('Keywords, in English or French.'),
        type: z.enum(DOCUMENT_TYPES).optional().describe('Only this kind of content.'),
        lang: langInput,
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`How many results, ${DEFAULT_LIMIT} by default.`),
      }),
    },
    (request) => withContent((content) => json(search(content.documents, request))),
  );

  server.registerTool(
    'fetch',
    {
      ...readOnlyTool('Fetch a document'),
      description:
        'Fetch one document from tonytang.dev and related sites in full, by the id from search: its text, link, and any note on how to use it. Follow notes when quoting.',
      inputSchema: z.object({ id: z.string().max(MAX_QUERY_CHARS).describe('The id from a search result.'), lang: langInput }),
    },
    (request) =>
      withContent(async (content) => {
        const document = getDocument(content.documents, request);
        if (!document) return failure(`No document with id "${request.id}". Use search to find one.`);
        if (document.type !== 'lesson') return json(document);
        const text = await getLessonText(document.url);
        if (text !== undefined) return json(withText(document, text));
        return json({ ...document, note: [document.note, LESSON_UNAVAILABLE].filter(Boolean).join(' ') });
      }),
  );

  return server;
}
