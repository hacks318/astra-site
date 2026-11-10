#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute este script com sudo." >&2
  exit 1
fi

if [[ "$(uname -m)" != "aarch64" && "$(uname -m)" != "arm64" ]]; then
  echo "Esta configuração gratuita da Astra espera uma VM ARM64." >&2
  exit 1
fi

domain="${1:-}"
if [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
  echo "Uso: sudo bash api/deploy-vm.sh api.<IP-PUBLICO>.nip.io" >&2
  exit 1
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 curl git
systemctl enable --now docker

if ! getent ahostsv4 "$domain" >/dev/null; then
  echo "O domínio $domain ainda não resolve. Confira o IP público e tente novamente." >&2
  exit 1
fi

printf 'ASTRA_API_DOMAIN=%s\n' "$domain" > "$project_dir/.env"
printf 'ASTRA_PROVIDER=%s\n' "${ASTRA_PROVIDER:-ollama}" >> "$project_dir/.env"
printf 'OPENAI_BASE_URL=%s\n' "${OPENAI_BASE_URL:-https://api.openai.com/v1}" >> "$project_dir/.env"
printf 'OPENAI_MODEL=%s\n' "${OPENAI_MODEL:-gpt-4o-mini}" >> "$project_dir/.env"
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY" >> "$project_dir/.env"
fi
cd "$project_dir"
docker compose pull ollama caddy
docker compose up -d ollama

for attempt in $(seq 1 60); do
  if docker compose exec -T ollama ollama list >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "O Ollama não iniciou. Consulte: docker compose logs ollama" >&2
    exit 1
  fi
  sleep 2
done

docker compose exec -T ollama ollama pull qwen2.5:3b
docker compose up -d --build

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 10 "https://${domain}/health"; then
    echo
    echo "API Astra publicada em https://${domain}"
    exit 0
  fi
  sleep 5
done

echo "A API não ficou saudável. Confira as regras de entrada TCP 80/443 na rede da VM e os logs:" >&2
docker compose logs --tail=80 caddy api ollama >&2
exit 1
