#!/bin/sh
# Workers Builds deploy command ("sh deploy.sh"); runs on every push to master.
set -e
cd worker
npm ci
# Builds (Vite: the Worker, the new UI, the old UI's files), then deploys.
npm run deploy
