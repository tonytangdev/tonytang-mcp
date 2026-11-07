# Claude directory listing

Paste these into the portal at https://claude.ai/directory/manage: **Submit new**, then **MCP connector**.

| Field | Value |
| --- | --- |
| Server URL | `https://mcp.tonytang.dev/mcp` |
| Server name | Tony Tang |
| URL slug (permanent once published) | `tony-tang` |
| Categories | Education |
| Documentation URL | https://tonytang.dev/mcp/ |
| Privacy policy URL | https://tonytang.dev/privacy/ |
| Support contact | tony@tonytang.dev |
| Icon | `icon-512.png` |
| Authentication | None. All content is public. |
| Reads or writes | Reads only |
| Test account | Not applicable: no login, no user data |
| Allowed link URIs | `https://tonytang.dev`, `https://cv.tonytang.dev`, `https://learn-effect-ts.tonytang.dev` |

## One-liner

Read Tony Tang's articles, video transcripts, CV and Effect lessons, with links to the sources.

## Description

Answers questions about Tony Tang, a software engineer in Paris, from his own published work. Assistants can read his background, career timeline and CV, search his articles and video transcripts, and open full lessons from his Effect course, in English or French where a translation exists.

Every answer comes from public source text and links back to the original, so it can be checked. The server has three read-only tools: get_profile, search and fetch. It needs no login, changes nothing, and keeps no questions.

In assistants that show interactive UI, get_profile also displays a small profile card with his career timeline and links.

Limitations: it only covers Tony Tang's own public work, and other people share his name. Video transcripts come from automatic captions and can contain mistakes. The course's narrated player is a paid product, and nothing here sells it: lesson text is public, and links go to public pages.

## Screenshots (PNG, 1440px wide, cropped to the card)

| File | Paired prompt |
| --- | --- |
| `screenshots/card-en-light.png` | Who is Tony Tang? |
| `screenshots/card-en-dark.png` | What has Tony Tang worked on? |
| `screenshots/card-fr-light.png` | Qui est Tony Tang ? |
