#!/bin/sh
# Packages chatgpt/ for the ChatGPT dashboard. Refuses to run until the demo recording URL is real.
set -eu
cd "$(dirname "$0")/chatgpt"
if grep -q REPLACE_WITH_RECORDING_URL plugin.json; then
  echo 'Set review.demo_recording_url in chatgpt/plugin.json first.' >&2
  exit 1
fi
rm -f ../tony-tang-plugin.zip
zip -q -r ../tony-tang-plugin.zip plugin.json mcp.json assets
echo 'Wrote submission/tony-tang-plugin.zip'
