// @vitest-environment happy-dom
/// <reference lib="dom" />
import { beforeEach, describe, expect, test } from 'vitest';
import { CARD_HTML, CARD_SCRIPT } from '../src/card';

type Message = { jsonrpc: string; id?: number; method?: string; params?: any; result?: unknown };

const card = {
  lang: 'fr',
  name: 'Tony Tang',
  role: 'Head of Engineering',
  headline: 'AI writes the code.',
  careerHeading: 'Career',
  timeline: [{ period: '2025–now', role: 'Head of Engineering', org: 'Fonts Ninja' }],
  links: [
    { label: 'Website', url: 'https://tonytang.dev/' },
    { label: 'Learn Effect', url: 'https://learn-effect-ts.tonytang.dev' },
  ],
};

let sent: Message[];
let host: { postMessage: (message: Message) => void };
let listener: (event: { source: unknown; data: unknown }) => void;

const fromHost = (data: object, source: unknown = host) => listener({ source, data: { jsonrpc: '2.0', ...data } });
const named = (method: string) => sent.filter((m) => m.method === method);

/** Runs the card's script against a fake host, up to a finished handshake. */
function start(hostCapabilities: object = { openLinks: {} }, hostContext: object = {}) {
  sent = [];
  host = { postMessage: (message) => void sent.push(message) };
  document.body.innerHTML = '<main id="card"></main>';
  const frame = { parent: host, addEventListener: (_: string, handler: typeof listener) => void (listener = handler) };
  new Function('window', CARD_SCRIPT)(frame);
  const id = named('ui/initialize')[0]?.id;
  fromHost({ id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'host', version: '1' }, hostCapabilities, hostContext } });
}

const showCard = (structuredContent: object = card) =>
  fromHost({ method: 'ui/notifications/tool-result', params: { content: [], structuredContent } });

const text = (selector: string) => [...document.querySelectorAll(selector)].map((e) => e.textContent);

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('host-fonts')?.remove();
});

describe('profile card', () => {
  test('it introduces itself to the host, then says it is ready', () => {
    start();
    expect(named('ui/initialize')[0]?.params).toEqual({
      appInfo: { name: 'Tony Tang profile card', version: '1.1.0' },
      appCapabilities: {},
      protocolVersion: '2026-01-26',
    });
    expect(named('ui/notifications/initialized')).toHaveLength(1);
  });

  test('it shows the profile from the tool result', () => {
    start();
    showCard();
    expect(text('h1')).toEqual(['Tony Tang']);
    expect(text('h2')).toEqual(['Career']);
    expect(document.querySelector('main')?.textContent).toContain('AI writes the code.');
    expect(text('li.role')).toEqual(['2025–nowHead of Engineering, Fonts Ninja']);
    expect(text('nav a')).toEqual(['Website', 'Learn Effect']);
  });

  test('it declares the language it is written in', () => {
    start();
    showCard();
    expect(document.documentElement.lang).toBe('fr');
  });

  test('a failed tool result leaves it empty', () => {
    start();
    fromHost({ method: 'ui/notifications/tool-result', params: { isError: true, content: [{ type: 'text', text: 'x' }] } });
    expect(document.querySelector('main')?.textContent).toBe('');
  });

  test('text from the profile is never treated as markup', () => {
    start();
    showCard({ ...card, name: '<img src=x onerror=alert(1)>' });
    expect(document.querySelector('img')).toBeNull();
    expect(text('h1')).toEqual(['<img src=x onerror=alert(1)>']);
  });

  test('only https links are shown', () => {
    start();
    showCard({ ...card, links: [{ label: 'Bad', url: 'javascript:alert(1)' }, card.links[0]] });
    expect(text('nav a')).toEqual(['Website']);
  });

  test('a link opens through the host when the host can open links', () => {
    start();
    showCard();
    const link = document.querySelector('nav a') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(named('ui/open-link')[0]?.params).toEqual({ url: 'https://tonytang.dev/' });
  });

  test('a link stays an ordinary link when the host cannot open links', () => {
    start({});
    showCard();
    const link = document.querySelector('nav a') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(named('ui/open-link')).toEqual([]);
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  test('it takes the theme, colours and fonts the host gives it', () => {
    start({}, { theme: 'dark', styles: { variables: { '--color-text-primary': 'white' }, css: { fonts: '/* host fonts */' } } });
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(root.style.getPropertyValue('--color-text-primary')).toBe('white');
    expect(document.getElementById('host-fonts')?.textContent).toBe('/* host fonts */');
  });

  test('it follows a theme change', () => {
    start({}, { theme: 'light' });
    fromHost({ method: 'ui/notifications/host-context-changed', params: { theme: 'dark' } });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('it reports the height of its content, not of the frame it was given', () => {
    start();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 420 });
    document.body.getBoundingClientRect = () => ({ height: 292.4 }) as DOMRect;
    showCard();
    expect(named('ui/notifications/size-changed').at(-1)?.params).toEqual({ height: 293 });
  });

  test('it reports its height again when its content reflows', () => {
    let reflow = () => {};
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        reflow = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    start();
    showCard();
    document.body.getBoundingClientRect = () => ({ height: 500 }) as DOMRect;
    reflow();
    globalThis.ResizeObserver = original;
    expect(named('ui/notifications/size-changed').at(-1)?.params).toEqual({ height: 500 });
  });

  test('it answers the requests a host can send it', () => {
    start();
    for (const [id, method] of [[50, 'ping'], [51, 'ui/resource-teardown']] as const) fromHost({ id, method });
    expect(sent.filter((m) => m.id === 50 || m.id === 51).map((m) => m.result)).toEqual([{}, {}]);
  });

  test('messages from anything but the host are ignored', () => {
    start();
    fromHost({ method: 'ui/notifications/tool-result', params: { structuredContent: card } }, {});
    expect(document.querySelector('main')?.textContent).toBe('');
  });
});

describe('the card file', () => {
  test('nothing in it loads from anywhere else', () => {
    for (const remote of ['src=', '<link', '@import', 'url(', 'fetch(', 'XMLHttpRequest', 'WebSocket', '<iframe']) {
      expect(CARD_HTML).not.toContain(remote);
    }
  });

  test('it carries no price or sales wording', () => {
    expect(CARD_HTML).not.toMatch(/€|\$\d|price|discount|offer|buy|prix/i);
  });

  test('it is a complete document that supports both themes', () => {
    expect(CARD_HTML).toMatch(/^<!doctype html>/i);
    expect(CARD_HTML).toContain('color-scheme: light dark');
    expect(CARD_HTML).toContain(CARD_SCRIPT);
  });

  test('it stays small', () => {
    expect(new TextEncoder().encode(CARD_HTML).length).toBeLessThan(10_000);
  });
});
