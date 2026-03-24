#!/usr/bin/env bash
set -euo pipefail

IMAGE="${WHATSAPP_IMAGE:-ghcr.io/arvindrajnaidu/whatsapp-cli:latest}"

# --- pre-flight checks ---
for cmd in docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is not installed." >&2
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  echo "Error: docker compose plugin is not installed." >&2
  exit 1
fi

# --- pull image ---
echo "Pulling $IMAGE ..."
docker pull "$IMAGE"

# --- configure environment ---
if [ ! -f .env ]; then
  echo ""
  echo "No .env file found. Let's set up your LLM API key."
  echo "You can use either an Anthropic or OpenAI key (or both)."
  echo ""

  read -rp "Anthropic API key (leave blank to skip): " anthropic_key
  read -rp "OpenAI API key (leave blank to skip): " openai_key

  if [ -z "$anthropic_key" ] && [ -z "$openai_key" ]; then
    echo "Warning: No API key provided. The bot will not be able to respond." >&2
  fi

  cat > .env <<EOF
ANTHROPIC_API_KEY=${anthropic_key}
OPENAI_API_KEY=${openai_key}
EOF
  echo "Wrote .env"
fi

# --- start ---
echo ""
echo "Starting whatsapp-bot ..."
docker compose up -d

echo ""
echo "Container is running. To authenticate with WhatsApp, run:"
echo ""
echo "  docker compose exec whatsapp-bot node bin/whatsapp.mjs login --pairing-code <your-phone-number>"
echo ""
echo "Example: docker compose exec whatsapp-bot node bin/whatsapp.mjs login --pairing-code 60123456789"
echo ""
echo "You'll get an 8-digit code to enter on your phone (WhatsApp > Linked Devices > Link with phone number)."
