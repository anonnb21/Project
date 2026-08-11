---
name: vps-audit
description: Audit VPS secara read-only untuk membuat inventory service, container, jaringan, storage, backup, dan monitoring sebelum perubahan atau migrasi.
---

# VPS Audit

## Gunakan skill ini ketika

- Pengguna meminta pemeriksaan VPS.
- Service VPS akan dipindahkan menjadi konfigurasi declarative.
- Diperlukan baseline keamanan, backup, atau monitoring.

## Workflow

1. Konfirmasi host alias, user, environment, dan scope. Jangan meminta private key di chat.
2. Buat daftar command read-only dan jelaskan data yang mungkin sensitif.
3. Inventarisasi OS, service manager, container runtime, port, firewall, disk, mount, timer, reverse proxy, TLS metadata, backup, dan monitoring.
4. Untuk n8n, catat versi, metode instalasi, nama environment variable tanpa nilainya, database, volume, dan mekanisme backup.
5. Redact IP privat bila diwajibkan, username sensitif, token, header, query parameter, dan nilai environment.
6. Pisahkan fakta terverifikasi, risiko, dan rekomendasi.
7. Jangan melakukan perubahan sampai pengguna menyetujui rencana perubahan dan rollback.

## Larangan

- Jangan menampilkan isi secret atau `.env`.
- Jangan restart service, mengubah firewall, menghapus image/volume, atau melakukan upgrade dalam tahap audit.
- Jangan mengekspor database atau credential ke repository.

## Output

- Inventory.
- Temuan dan tingkat risiko.
- Gap backup/restore dan monitoring.
- Rencana declarative migration.
- Rencana perubahan dan rollback terpisah.

