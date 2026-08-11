# Workspace Context

## Tujuan

Workspace ini dirancang untuk membantu:

- Menjaga instruksi agent konsisten pada beberapa PC dan project.
- Menyiapkan konfigurasi Codex secara repeatable.
- Mendokumentasikan infrastruktur VPS tanpa menaruh credential di Git.
- Mengubah service VPS seperti n8n menjadi konfigurasi declarative yang dapat direproduksi.
- Menyiapkan CI/CD staging, monitoring, backup, dan rollback.

## Prinsip arsitektur

### Agent platform

Satu repository menjadi sumber utama skill dan policy. Setiap repository aplikasi cukup memiliki instruksi project yang ringkas. Skill tidak perlu disalin manual ke setiap folder.

### Secret management

Credential tetap berada di secret manager, keychain, atau environment lokal yang terlindungi. Git hanya menyimpan placeholder atau referensi secret.

### VPS management

Jangan menyalin seluruh filesystem VPS ke GitHub. Simpan Docker Compose, Ansible/Terraform/OpenTofu, konfigurasi reverse proxy, dashboard, alert rules, dan runbook. Database, volume, log sensitif, serta key harus berada di luar Git.

### Staging delivery

Perubahan melalui pull request, test, build image, deploy staging, health check, smoke test, dan rollback bila gagal. Production adalah tahap terpisah dengan approval eksplisit.

## Informasi yang harus diisi pemilik workspace

- GitHub organization/user: `<BELUM_DIISI>`
- Repository aplikasi: `<BELUM_DIISI>`
- Provider dan OS VPS: `<BELUM_DIISI>`
- Host alias staging: `<BELUM_DIISI>`
- Host alias production: `<BELUM_DIISI>`
- Metode deployment: `<BELUM_DIISI>`
- Container registry: `<BELUM_DIISI>`
- Secret manager: `<BELUM_DIISI>`
- Domain staging: `<BELUM_DIISI>`
- Daftar service termasuk n8n: `<BELUM_DIISI>`

Isi dengan alias dan metadata non-rahasia. Jangan menaruh password, token, atau private key dalam dokumen ini.

