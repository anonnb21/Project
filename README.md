# Portable Agent Workspace

Paket ini menyimpan instruksi agent yang dapat dipakai ulang di ChatGPT Project/Workspace, Codex, dan agent lain tanpa menyimpan credential.

## Pemakaian cepat di ChatGPT

1. Buka `chatgpt/PROJECT_INSTRUCTIONS.md`, salin isinya ke **Project Instructions**.
2. Unggah `chatgpt/WORKSPACE_CONTEXT.md` sebagai file knowledge/project.
3. Untuk menyiapkan PC baru, buka chat terpisah lalu salin seluruh isi `chatgpt/NEW_COMPUTER_SETUP.md` sebagai pesan pertama.
4. Tambahkan dokumen project Anda sendiri, misalnya arsitektur, README, dan runbook.
5. Jangan unggah `.env`, private key, token, database dump, atau backup produksi.

ChatGPT tidak otomatis membaca repository lokal. File harus diunggah, disambungkan melalui connector yang diizinkan, atau diekspos melalui MCP yang aman.

## Pemakaian cepat di Codex

```bash
git clone <URL_REPOSITORY_AGENT_PLATFORM> ~/agent-platform
cd ~/agent-platform
./scripts/bootstrap-codex.sh --dry-run
./scripts/bootstrap-codex.sh
./scripts/doctor.sh
```

Bootstrap memasang skill dengan symlink ke `${CODEX_HOME:-$HOME/.codex}/skills/portable-agent-workspace`. Ia tidak menyalin credential dan tidak menimpa konfigurasi Codex.

## Struktur

```text
.
├── AGENTS.md
├── SECURITY.md
├── chatgpt/
│   ├── PROJECT_INSTRUCTIONS.md
│   ├── NEW_COMPUTER_SETUP.md
│   └── WORKSPACE_CONTEXT.md
├── skills/
│   ├── deploy-staging/SKILL.md
│   └── vps-audit/SKILL.md
├── templates/
│   ├── PROJECT_AGENTS.md
│   └── env.example
└── scripts/
    ├── bootstrap-codex.sh
    └── doctor.sh
```

## Batas penting

- Repository ini adalah sumber instruksi, bukan secret store.
- Akses staging dan production harus menggunakan identitas terpisah serta hak minimum.
- Audit VPS dimulai read-only.
- Deployment production memerlukan approval eksplisit.
- Salin konfigurasi declarative ke Git, bukan filesystem, database, atau volume runtime VPS.
