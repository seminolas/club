#!/bin/sh
set -e
cd worker
npm install
if [ "$CF_PAGES_BRANCH" = "staging" ]; then
  npx wrangler deploy --env staging
else
  npx wrangler deploy
fi
