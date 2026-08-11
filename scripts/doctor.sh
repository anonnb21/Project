#!/usr/bin/env bash
set -uo pipefail

repo_only=false
case "${1:-}" in
  "") ;;
  --repo-only) repo_only=true ;;
  -h|--help)
    printf 'Usage: ./scripts/doctor.sh [--repo-only]\n'
    exit 0
    ;;
  *)
    printf 'Usage: ./scripts/doctor.sh [--repo-only]\n' >&2
    exit 2
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failures=0

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; failures=$((failures + 1)); }

required=(
  "AGENTS.md"
  "SECURITY.md"
  "chatgpt/PROJECT_INSTRUCTIONS.md"
  "chatgpt/NEW_COMPUTER_SETUP.md"
  "chatgpt/WORKSPACE_CONTEXT.md"
  "skills/vps-audit/SKILL.md"
  "skills/deploy-staging/SKILL.md"
)

for path in "${required[@]}"; do
  if [[ -s "$repo_root/$path" ]]; then
    pass "$path tersedia"
  else
    fail "$path tidak tersedia atau kosong"
  fi
done

for skill in "$repo_root"/skills/*/SKILL.md; do
  if head -n 1 "$skill" | grep -qx -- '---' && grep -q '^name:' "$skill" && grep -q '^description:' "$skill"; then
    pass "metadata $(dirname "$skill") valid"
  else
    fail "metadata $skill tidak lengkap"
  fi
done

if ! "$repo_only"; then
  codex_home="${CODEX_HOME:-$HOME/.codex}"
  target="$codex_home/skills/portable-agent-workspace"
  if [[ -L "$target" ]]; then
    pass "skill Codex terpasang di $target"
  else
    fail "skill Codex belum terpasang; jalankan ./scripts/bootstrap-codex.sh"
  fi
fi

if (( failures > 0 )); then
  printf '%d pemeriksaan gagal.\n' "$failures" >&2
  exit 1
fi

printf 'Semua pemeriksaan berhasil.\n'
