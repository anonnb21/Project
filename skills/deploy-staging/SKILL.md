---
name: deploy-staging
description: Merancang dan memvalidasi deployment staging yang reproducible dengan CI/CD, artefak immutable, health check, smoke test, dan rollback.
---

# Deploy Staging

## Prasyarat

- Repository aplikasi memiliki test dan build yang dapat dijalankan.
- Staging terpisah secara logis dari production.
- Secret tersedia melalui secret manager atau CI environment.
- User deployment memiliki hak minimum.
- Backup dan rollback tersedia untuk perubahan stateful.

## Workflow

1. Validasi source revision, test, lint, dan build.
2. Buat image immutable dan tag dengan commit SHA.
3. Publikasikan image ke registry yang terautentikasi.
4. Deploy hanya revision yang dipilih ke staging.
5. Jalankan migration dengan mekanisme terkontrol.
6. Jalankan health check, smoke test, dan pemeriksaan log/metrics.
7. Jika validasi gagal, rollback ke revision terakhir yang sehat.
8. Catat revision, waktu, hasil validasi, dan pelaksana tanpa mencatat secret.

## Guardrails

- Jangan menggunakan secret production pada staging.
- Jangan meneruskan credential dari pull request yang tidak dipercaya.
- Jangan menganggap staging sukses hanya karena container berstatus running.
- Production deployment memerlukan workflow dan approval terpisah.

