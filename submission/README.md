# Directory submission

Everything here is ready to paste or upload. Portals need your login and your own policy attestations, so the submit steps are yours.

## Claude

Needs a paid Claude plan. Nothing else to deploy.

1. Open https://claude.ai/directory/manage, then **Submit new**, then **MCP connector**.
2. Copy the values from `claude-listing.md`.
3. Upload `icon-512.png` and the three screenshots with their prompts.
4. Complete the compliance step and submit.

The screenshots show the real card with production data, rendered in a test host. If review asks for captures from Claude itself, replace them.

## ChatGPT

1. Deploy this branch first: the card needs its `openai/widgetDomain`.
2. Add the server as a custom connection and confirm the card renders. Run all eight test cases from `chatgpt/plugin.json`.
3. Record that run, host it at an HTTPS URL, and put the URL in `review.demo_recording_url`.
4. Confirm `publication.countries`. The default is France, the UK and the US.
5. Complete individual verification in your OpenAI organization settings.
6. Run `./build-chatgpt-zip.sh`, then upload the ZIP at https://platform.openai.com/plugins.
7. Publish the challenge token shown in the dashboard, which needs no redeploy:

   ```sh
   pnpm exec wrangler secret put OPENAI_APPS_CHALLENGE
   ```

8. Connect the server, resolve any automated findings, select **Submit for review**, and complete the attestations.

If the form asks for annotation justifications: every tool only reads a fixed set of Tony's public content, so `readOnlyHint` is true, `destructiveHint` is false and `openWorldHint` is false.

EU data residency projects can't submit plugins with MCP servers.

## Before either submission

- The server exists to share public work and links to a paid course. Both directories exclude apps that exist primarily to promote, so the listing leads with what it reads, and nothing here sells.
- Keep tool descriptions and `instructions` factual after approval.
