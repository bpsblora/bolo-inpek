# Alternatif teknis: GitHub Actions + clasp untuk Tindak Lanjut BOLO INPEK

> **Tidak perlu digunakan untuk kebutuhan saat ini.** Metode utama yang tidak membutuhkan instalasi adalah [GitHub Loader melalui browser](./AKTIVASI-GITHUB-TANPA-INSTALASI.md). Dokumen ini disimpan sebagai opsi lanjutan jika suatu saat perlu memperbarui **backend** Apps Script melalui CI/CD. Tidak ada kredensial atau workflow produksi yang diaktifkan otomatis.

**Status:** Workflow dan pengujian sudah dipasang di repository, tetapi **tidak ada akses otomatis Google sebelum konfigurasi dua GitHub Secrets**. Mode awal **pratinjau** dan pemicu auto-deploy **nonaktif**.

> PENTING: Ini untuk Apps Script **Tindak Lanjut BOLO INPEK**, bukan Apps Script admin Kelola Survei, bukan FASIH/Updater, dan bukan proyek Firebase. Login email bersama, Google Sheets, serta URL web app yang sekarang tidak diubah.

## Arsitektur aman (tidak menimpa KodeV2.gs)

GitHub hanya memiliki versi HTML yang sudah direvisi:
`backend/tindak-lanjut/Index_TindakLanjutV2.html`.

Kode backend produksi `KodeV2.gs`, kode audit/healthcheck, dan manifest Apps Script **tidak** disalin ke repo ini. Agar tidak terhapus:

1. GitHub Actions mengunduh **SELURUH** file Apps Script melalui `clasp pull` ke folder temporer yang hanya hidup selama workflow.
2. Memastikan ada `KodeV2.gs`, `Index_TindakLanjutV2.html`, dan `appsscript.json`, serta backend menggunakan template yang benar.
3. Mengganti **hanya** `Index_TindakLanjutV2.html` dalam salinan sementara itu dengan versi dari GitHub.
4. Jika `preview`, berhenti. **Tidak melakukan push/deploy.**
5. Jika `deploy`, memastikan ID deployment dari `index.html` adalah salah satu deployment proyek aktif, menyimpan **versi cadangan** Apps Script, lalu `clasp push --force` proyek lengkap yang baru ditarik.
6. Memperbarui **deployment lama** menggunakan `clasp create-deployment --deploymentId ...`. URL lama tetap dipakai, tidak membuat deployment URL baru.

**Batas keamanan:** Google Apps Script API mengganti seluruh isi proyek saat `push`, tidak memiliki mekanisme PATCH satu file. Pembaruan bersamaan dari editor Google pada saat workflow berjalan dapat tertimpa; hentikan pengeditan langsung ketika sinkronisasi publikasi dilakukan. Tidak ada salinan source backend produksi di log/artefak GitHub Actions. <https://github.com/google/clasp>

## Yang sudah disiapkan

- [Workflow GitHub Actions](../../.github/workflows/tindak-lanjut-sync.yml)
- [Pemeriksa HTML dan tahap sinkronisasi](../../scripts/tindak-lanjut/sync.mjs)
- [Pemeriksaan perlindungan semua file backend](../../scripts/tindak-lanjut/sync-core.mjs)
- [Tes otomatis simulasi](../../scripts/tindak-lanjut/sync.test.mjs)
- [Sumber HTML Tindak Lanjut](./Index_TindakLanjutV2.html)

## Setup satu kali — dengan akun Google pemilik proyek Apps Script

### 1. Aktifkan Google Apps Script API

Buka <https://script.google.com/home/usersettings> dengan akun Google yang memiliki izin mengedit proyek **Tindak Lanjut BOLO INPEK**, lalu aktifkan **Google Apps Script API**.

### 2. Login clasp pada Windows

Install Node.js versi 22 atau yang lebih baru jika belum ada. Buka **PowerShell** dan jalankan:

```powershell
npm install -g @google/clasp@3.4.1
clasp login
```

Masuk menggunakan akun Google yang memiliki akses ke proyek Apps Script Tindak Lanjut. File OAuth akan tersimpan pada `$HOME\.clasprc.json`. **File ini berisi token sensitif**: jangan unggah ke repo, screenshot, email, WhatsApp, atau chat.

### 3. Tambahkan 2 GitHub Secrets

Buka repository `bpsblora/bolo-inpek` → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Nilai |
| --- | --- |
| `CLASPRC_JSON` | **Seluruh isi** file `$HOME\.clasprc.json` hasil `clasp login`. Bukan path-nya. |
| `TL_SCRIPT_ID` | **Script ID** dari editor Apps Script → ikon roda gigi **Project Settings** → **IDs** → **Script ID**. Ini **bukan** URL `/exec`, ID spreadsheet, atau ID deployment. |

Untuk menyalin isi file credential ke clipboard pada PowerShell:

```powershell
Get-Content "$HOME\.clasprc.json" -Raw | Set-Clipboard
```

Tempel **hanya pada nilai GitHub Secret** `CLASPRC_JSON`. Setelahnya, bersihkan clipboard; jangan menyimpan credential di folder proyek yang di-commit.

**Script ID** disalin dari aplikasi yang di dalamnya terdapat `KodeV2.gs` dan `Index_TindakLanjutV2.html`. Pastikan akun tersebut memiliki izin untuk memperbarui **deployment aktif**.

### 4. Pratinjau dahulu (tanpa memodifikasi Apps Script)

Buka tab **Actions** repository → workflow **BOLO INPEK - Sinkronisasi Tindak Lanjut ke Apps Script** → **Run workflow**:

- Branch: `main`
- `mode`: `preview`
- Klik **Run workflow** dan periksa job `validate` serta `sync`.

Jika berhasil, pesan akan menyatakan semua kode Apps Script telah ditarik, hanya HTML Tindak Lanjut yang distage, dan **tidak ada push**. Jika muncul kegagalan credential, periksa apakah `CLASPRC_JSON` yang disalin valid dan Apps Script API sudah aktif.

**Penting:** Jangan langsung jalankan `deploy` bila `preview` belum berhasil.

### 5. Deploy pertama ke URL Apps Script yang sama

Jalankan workflow yang sama dengan `mode: deploy`.

Saat ada perubahan HTML:
- Memastikan proyek dan deployment lama sesuai.
- Membuat versi cadangan **sebelum push** untuk rollback.
- Mempertahankan isi kode backend dan hanya memperbarui HTML.
- Memperbarui deployment lama, **bukan** membuat URL yang berbeda.

Setelah sukses, uji menu **Kelola Survei → Survei Selesai & Pulihkan**. Klik tombol `Tampilkan Kembali` untuk melihat dialog baru, tetapi tekan **Batal** jika hanya menguji tampilan. Jangan uji penutupan pada data produksi.

### 6. (Opsional) Aktifkan sinkronisasi otomatis setiap HTML diubah

Setelah deploy pertama benar-benar berhasil dan sesuai, buka **Settings → Secrets and variables → Actions → Variables → New repository variable**:

- Name: `TL_AUTO_DEPLOY`
- Value: `true`

Setelah itu **setiap commit ke `main` yang mengubah HTML Tindak Lanjut, skrip sinkronisasi, atau workflow ini** dapat memicu update Apps Script otomatis **setelah pengujian lolos**. Anda dapat mengatur aturan approval pada environment `bolo-inpek-tindak-lanjut` untuk memeriksa perubahan sebelum publikasi.

Untuk berhenti, ubah `TL_AUTO_DEPLOY` menjadi `false` atau hapus variabelnya. Bila belum disetel, commit hanya menjalankan validasi; **tidak otomatis menerapkan kode ke Google**.

## Rollback dan batasan

- Sebelum setiap publikasi dengan perubahan, workflow membuat **versi cadangan Apps Script**. Lihat daftar versi di Apps Script untuk pemulihan.
- Jika push berhasil tetapi deployment gagal, URL aktif masih menunjuk versi deployment sebelumnya; cek status dan jangan menjalankan ulang sebelum memeriksa kesalahan.
- Jika source lama pernah berubah langsung di editor Google, setiap publikasi dari GitHub kembali akan menggunakan HTML GitHub sebagai sumber untuk file tersebut. File backend lainnya tetap diambil dari kondisi Apps Script terakhir.
- Pemulihan survei di UI tidak sama dengan pemulihan kode; prosedur ini tidak mengubah tab `survei`, `arsip`, atau `tindak_lanjut`.
- GitHub Actions tidak menerima token OAuth melalui kolom input biasa; gunakan **Secrets**.

## Jika ada error

| Gejala | Pemeriksaan |
| --- | --- |
| `CLASPRC_JSON dan TL_SCRIPT_ID harus disetel` | Pastikan kedua Secret disimpan di repo ini. |
| `401 Unauthorized` | Login clasp ulang pada akun yang punya izin dan perbarui Secret OAuth. |
| `Apps Script API disabled` | Aktifkan API di `script.google.com/home/usersettings`. |
| `KodeV2 tidak ditemukan` | TL_SCRIPT_ID salah atau menunjuk proyek lain; workflow menolak push. |
| `Deployment ... tidak ditemukan` | URL Tindak Lanjut pada `index.html` bukan deployment pada Script ID tersebut; workflow menolak push. |
| Workflow hijau tapi dialog lama tampil | Periksa apakah menjalankan `preview` (tidak menerapkan kode). Jalankan `deploy` dan refresh browser. |
| Manual update Google sedang berlangsung | Jangan jalankan deploy bersamaan; selesaikan dan simpan pekerjaan editor dulu. |
