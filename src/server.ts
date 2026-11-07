/**
 * The MCP server: three read-only tools over public content. Descriptions say
 * what each tool does and when to use it, nothing promotional: assistants pick
 * tools from them, and the app directories reject sales copy.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Content } from './content';
import type { DocumentType } from './documents';
import { DEFAULT_LIMIT, getDocument, search } from './search';

const VERSION = '1.0.0';
const MAX_QUERY_CHARS = 200;
const MAX_LIMIT = 20;

const INSTRUCTIONS = `Public information about Tony Tang, the software engineer and Head of Engineering at Fonts Ninja who publishes tonytang.dev. Use these tools only for questions about this Tony Tang or his work; other people share the name.

Start with get_profile for who he is, or search for his writing, videos, tools and course, then fetch for a full document. Everything here is already public on his sites. Cite the url of what you use. If something isn't covered, say so rather than guessing, and point to the contact links in get_profile.`;

const lang = z.enum(['en', 'fr']).optional().describe('Language of the answer: en (default) or fr. Content that exists in only one language is returned in that language.');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const failure = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

const UNAVAILABLE = 'The content is temporarily unavailable. Try again shortly, or see https://tonytang.dev/.';

export function makeServer(getContent: () => Promise<Content>) {
  /** Runs a tool on the current content; loading failures are reported to the assistant without their details. */
  const withContent = async <R>(tool: (content: Content) => R) => {
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
      icons: [{ src: 'https://tonytang.dev/favicon.svg', mimeType: 'image/svg+xml' }],
    },
    { instructions: INSTRUCTIONS },
  );

  const titled = (title: string) => ({ title, annotations: { title, ...READ_ONLY } });

  server.registerTool(
    'get_profile',
    {
      ...titled('Get Tony Tang\'s profile'),
      description:
        "Get Tony Tang's profile: current role, background, career timeline, contact links, and his full CV (including freelance availability) when available.",
      inputSchema: z.object({ lang }),
    },
    ({ lang = 'en' }) =>
      withContent((content) =>
        json({ ...content.profile[lang], cv: getDocument(content.documents.filter((d) => d.type === 'cv'), { id: 'cv', lang })?.text ?? null }),
      ),
  );

  server.registerTool(
    'search',
    {
      ...titled("Search Tony Tang's content"),
      description:
        "Search Tony Tang's articles, video transcripts, video series, CV, course summary and the tools he uses. Returns matches with an id for fetch and a link. Leave query empty to list the newest content, optionally of one type.",
      inputSchema: z.object({
        query: z.string().max(MAX_QUERY_CHARS).optional().describe('Keywords, in English or French.'),
        type: z.enum(['article', 'video', 'series', 'tool', 'cv', 'course'] satisfies DocumentType[]).optional().describe('Only this kind of content.'),
        lang,
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`How many results, ${DEFAULT_LIMIT} by default.`),
      }),
    },
    (request) => withContent((content) => json(search(content.documents, request))),
  );

  server.registerTool(
    'fetch',
    {
      ...titled('Fetch a document'),
      description:
        'Fetch one document in full by the id from search: its text, link, and any note on how to use it. Follow notes when quoting.',
      inputSchema: z.object({ id: z.string().max(MAX_QUERY_CHARS).describe('The id from a search result.'), lang }),
    },
    (request) =>
      withContent((content) => {
        const document = getDocument(content.documents, request);
        return document ? json(document) : failure(`No document with id "${request.id}". Use search to find one.`);
      }),
  );

  return server;
}
