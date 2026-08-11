#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/bootstrap-codex.sh [--dry-run]

Memasang skill repository ini ke CODEX_HOME dengan symlink.
Script tidak memasang credential dan tidak menimpa config.toml.
EOF
}

dry_run=false
case "${1:-}" in
  "") ;;
  --dry-run) dry_run=true ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
skills_root="$codex_home/skills"
target="$skills_root/portable-agent-workspace"
source_path="$repo_root/skills"

printf 'Repository : %s\n' "$repo_root"
printf 'CODEX_HOME : %s\n' "$codex_home"
printf 'Skill link : %s -> %s\n' "$target" "$source_path"

if "$dry_run"; then
  printf 'Dry run selesai; tidak ada perubahan.\n'
  exit 0
fi

mkdir -p "$skills_root"

if [[ -L "$target" ]]; then
  current="$(readlink "$target")"
  if [[ "$current" == "$source_path" ]]; then
    printf 'Skill sudah terpasang.\n'
    exit 0
  fi
  printf 'ERROR: %s adalah symlink ke lokasi lain: %s\n' "$target" "$current" >&2
  exit 1
fi

if [[ -e "$target" ]]; then
  printf 'ERROR: %s sudah ada dan tidak akan ditimpa.\n' "$target" >&2
  exit 1
fi

ln -s "$source_path" "$target"
printf 'Skill berhasil dipasang. Jalankan ./scripts/doctor.sh untuk validasi.\n'

