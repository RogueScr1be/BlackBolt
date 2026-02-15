#!/usr/bin/env bash
set -euo pipefail

# Apple Swift OpenAPI Generator entrypoint only.
node scripts/generate-swift-client.mjs
