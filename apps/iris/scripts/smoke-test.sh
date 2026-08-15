#!/usr/bin/env sh
set -eu

base_url="${1:-http://127.0.0.1:3000}"
response="$(curl --fail --silent --show-error "${base_url}/healthz")"
case "$response" in
  *'"status":"ok"'*) printf '%s\n' 'IRIS health check passed' ;;
  *) printf '%s\n' 'IRIS health check returned an unexpected response' >&2; exit 1 ;;
esac
