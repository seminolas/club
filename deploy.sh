#!/bin/sh
# Workers Builds deploy command ("sh deploy.sh"); runs on every push to master.
set -e
cd worker
npm ci
npx wrangler deploy
