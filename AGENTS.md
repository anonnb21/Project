# Agent Instructions

## Tujuan repository

Repository ini menyediakan instruksi portable, skill reusable, dan bootstrap aman untuk agent. Jangan menambahkan credential atau data produksi.

## Aturan kerja

- Baca `SECURITY.md` sebelum menyentuh deployment, VPS, secret, atau monitoring.
- Utamakan perubahan kecil, dapat diaudit, dan dapat dibatalkan.
- Jangan mengarang host, token, nama secret, hasil command, atau status deployment.
- Minta konfirmasi sebelum operasi destructive, perubahan production, rotasi credential, atau perubahan firewall.
- Untuk audit VPS, mulai dengan command read-only dan redact nilai sensitif dari output.
- Untuk deployment, gunakan artefak immutable, health check, serta rollback yang terdokumentasi.
- Jangan memasukkan `.env`, private key, token, cookie, database dump, backup, atau credential export ke Git.

## Verifikasi minimum

Setelah mengubah repository ini, jalankan:

```bash
bash -n scripts/*.sh
./scripts/doctor.sh --repo-only
git diff --check
```

