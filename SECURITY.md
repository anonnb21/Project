# Security Policy

## Jangan simpan secret di repository

Data berikut dilarang di-commit, termasuk ke repository private:

- SSH private key dan password VPS.
- API key, access token, refresh token, cookie, dan session secret.
- Isi `.env` nyata.
- Password atau dump database.
- n8n encryption key dan credential export.
- TLS private key.
- Backup atau volume runtime.

Gunakan OS keychain, password manager, GitHub Environments/Actions Secrets, Vault, SOPS dengan KMS/age, atau secret manager cloud. Repository hanya boleh menyimpan nama/referensi secret dan file `.example` dengan placeholder.

## Pemisahan akses

- Gunakan user deployment non-root.
- Pisahkan credential development, staging, dan production.
- Berikan hak minimum dan masa berlaku sesingkat mungkin.
- Production tidak boleh menjadi profil default pada PC baru.
- Jangan meneruskan SSH agent ke host yang tidak dipercaya.

## Respons jika secret ter-commit

1. Cabut atau rotasi secret segera; menghapus commit saja tidak cukup.
2. Hentikan workflow yang menggunakan secret tersebut.
3. Bersihkan riwayat Git bila diperlukan.
4. Audit log penggunaan.
5. Dokumentasikan insiden dan tindakan pencegahannya tanpa menuliskan nilai secret.

