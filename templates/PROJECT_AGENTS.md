# Project Agent Instructions

## Project

- Tujuan: `<JELASKAN_TUJUAN_PROJECT>`
- Stack: `<ISI_STACK>`
- Environment: development, staging, production

## Commands

```bash
# Install
<COMMAND_INSTALL>

# Test
<COMMAND_TEST>

# Lint
<COMMAND_LINT>

# Build
<COMMAND_BUILD>
```

## Aturan

- Jangan commit secret atau data produksi.
- Jangan mengubah production tanpa approval eksplisit.
- Pertahankan compatibility kecuali perubahan breaking telah disetujui.
- Jalankan test yang relevan dan laporkan command beserta hasilnya.
- Dokumentasikan migration dan rollback untuk perubahan stateful.

## Struktur penting

- Source: `<PATH>`
- Tests: `<PATH>`
- Infrastructure: `<PATH>`
- Documentation: `<PATH>`

