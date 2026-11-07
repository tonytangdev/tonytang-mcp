/**
 * The profile card: what hosts with interactive UI show beside get_profile.
 * Everything it needs is in this file's HTML, and it declares no outside
 * domains, so it contacts nothing of its own and the privacy policy holds. Its
 * only outside input is the font CSS a host chooses to hand it.
 *
 * Host colours and fonts carry the UI, with the brand as an accent: that's
 * what both Claude's and ChatGPT's design rules ask for. The bridge is written
 * by hand because the official client adds some 660 KB for these few messages.
 */
import { cvPage, type Content } from './content';
import type { Locale } from './documents';

export const CARD_URI = 'ui://tonytang/profile-card.html';
export const CARD_MIME_TYPE = 'text/html;profile=mcp-app';
/** The ChatGPT origin goes in OpenAI's alias: Claude refuses to render a card whose ui.domain isn't in its own format. */
export const CARD_META = {
  ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
  'openai/widgetDomain': 'https://mcp.tonytang.dev',
};

const VIDEOS_URL = 'https://tonytang.dev/videos/';

const LABELS: Record<Locale, { career: string; website: string; videos: string }> = {
  en: { career: 'Career', website: 'Website', videos: 'Videos' },
  fr: { career: 'Parcours', website: 'Site', videos: 'Vidéos' },
};

/** What the card shows of a profile. The full profile stays in the tool's text. */
export function profileCard(profile: Content['profile'][Locale], lang: Locale) {
  const { website, course, github } = profile.links;
  const labels = LABELS[lang];
  const links = [
    { label: labels.website, url: website },
    { label: labels.videos, url: VIDEOS_URL },
    { label: 'Learn Effect', url: course },
    { label: 'CV', url: cvPage(lang) },
    { label: 'GitHub', url: github },
  ];
  return {
    lang,
    name: profile.name,
    role: profile.role,
    headline: profile.headline,
    careerHeading: labels.career,
    timeline: profile.timeline.map(({ period, role, org }) => ({ period, role, org })),
    links: links.flatMap(({ label, url }) => (url ? [{ label, url }] : [])),
  };
}

/** The bridge to the host (the MCP Apps protocol over postMessage), and the rendering. Plain JS: it runs as written. */
export const CARD_SCRIPT = `
const card = document.getElementById('card');
const root = document.documentElement;
let nextId = 1;
let initializeId;
let canOpenLinks = false;

const send = (message) => window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
const reportSize = () =>
  send({ method: 'ui/notifications/size-changed', params: { height: Math.ceil(document.body.getBoundingClientRect().height) } });

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function applyHost({ theme, styles }) {
  if (theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
  }
  for (const [name, value] of Object.entries(styles?.variables ?? {})) {
    if (value !== undefined) root.style.setProperty(name, value);
  }
  const fonts = styles?.css?.fonts;
  if (fonts && !document.getElementById('host-fonts')) {
    const style = element('style', fonts);
    style.id = 'host-fonts';
    document.head.append(style);
  }
}

function link({ label, url }) {
  const anchor = element('a', label);
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.addEventListener('click', (event) => {
    if (!canOpenLinks) return;
    event.preventDefault();
    send({ id: nextId++, method: 'ui/open-link', params: { url } });
  });
  return anchor;
}

function render(profile) {
  root.lang = profile.lang;
  const timeline = element('ol');
  for (const { period, role, org } of profile.timeline) {
    const item = element('li', undefined, 'role');
    item.append(element('span', period, 'period'), element('span', role + ', ' + org));
    timeline.append(item);
  }
  const links = element('nav');
  for (const entry of profile.links) {
    if (entry.url.startsWith('https://')) links.append(link(entry));
  }
  card.replaceChildren(
    element('h1', profile.name),
    element('p', profile.role, 'muted'),
    element('p', profile.headline, 'headline'),
    element('div', undefined, 'rule'),
    element('h2', profile.careerHeading),
    timeline,
    links,
  );
  reportSize();
}

function onMessage({ id, method, params, result }) {
  if (id === initializeId && result) {
    canOpenLinks = Boolean(result.hostCapabilities?.openLinks);
    applyHost(result.hostContext ?? {});
    send({ method: 'ui/notifications/initialized' });
  } else if (method === 'ui/notifications/tool-result') {
    if (params?.structuredContent?.card) render(params.structuredContent.card);
  } else if (method === 'ui/notifications/host-context-changed') {
    applyHost(params ?? {});
    reportSize();
  } else if (id !== undefined && method) {
    send({ id, result: {} });
  }
}

window.addEventListener('message', (event) => {
  if (event.source === window.parent && event.data?.jsonrpc === '2.0') onMessage(event.data);
});

if (globalThis.ResizeObserver) new ResizeObserver(reportSize).observe(document.body);

initializeId = nextId++;
send({
  id: initializeId,
  method: 'ui/initialize',
  params: {
    appInfo: { name: 'Tony Tang profile card', version: '1.0.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
    protocolVersion: '2026-01-26',
  },
});
`;

const CARD_STYLE = `
:root {
  color-scheme: light dark;
  --accent: light-dark(oklch(0.47 0.1 196), oklch(0.74 0.1 194));
  --pop: oklch(0.86 0.16 92);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 1rem 1.1rem;
  background: var(--color-background-primary, transparent);
  color: var(--color-text-primary, CanvasText);
  font: 1rem/1.5 var(--font-sans, system-ui, sans-serif);
}
h1, h2, p, ol { margin: 0; padding: 0; }
h1 { font-size: 1.25rem; line-height: 1.2; font-weight: 700; }
h2 { margin-top: 0.9rem; font-size: 0.9rem; font-weight: 600; }
ol { list-style: none; margin-top: 0.25rem; }
.muted, .period { color: var(--color-text-secondary, GrayText); }
.headline { margin-top: 0.5rem; font-weight: 600; }
.rule { height: 3px; width: 3.5rem; margin-top: 0.7rem; border-radius: 2px; background: linear-gradient(90deg, var(--accent) 70%, var(--pop) 70%); }
.role { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.75rem; padding: 0.15rem 0; font-size: 0.9rem; }
nav { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; margin-top: 0.9rem; font-size: 0.9rem; }
a { color: inherit; text-decoration-color: var(--accent); text-decoration-thickness: 2px; text-underline-offset: 3px; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }
@media (max-width: 26rem) { .role { grid-template-columns: 1fr; gap: 0; padding: 0.3rem 0; } }
`;

export const CARD_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tony Tang</title>
<style>${CARD_STYLE}</style>
</head>
<body>
<main id="card"></main>
<script>${CARD_SCRIPT}</script>
</body>
</html>
`;
