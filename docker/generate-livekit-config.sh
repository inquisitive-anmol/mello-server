#!/bin/bash
# Script to generate livekit.yaml from livekit.yaml.template by substituting env variables.
# This prevents checking in raw API keys into git.

set -e

# Change to server directory
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Error: .env file not found."
  exit 1
fi

# Extract LIVEKIT_API_KEY from .env
export LIVEKIT_API_KEY=$(grep '^LIVEKIT_API_KEY=' .env | cut -d'=' -f2 | tr -d '"')

if [ -z "$LIVEKIT_API_KEY" ]; then
  echo "Error: LIVEKIT_API_KEY not found in .env"
  exit 1
fi

# Verify envsubst is available (or use sed fallback)
if command -v envsubst >/dev/null 2>&1; then
  envsubst < livekit.yaml.template > livekit.yaml
  echo "Generated livekit.yaml using envsubst."
else
  sed "s|\${LIVEKIT_API_KEY}|${LIVEKIT_API_KEY}|g" livekit.yaml.template > livekit.yaml
  echo "Generated livekit.yaml using sed fallback."
fi
