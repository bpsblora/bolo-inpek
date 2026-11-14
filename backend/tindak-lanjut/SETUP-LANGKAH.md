# Setup backend Tindak Lanjut BOLO INPEK (panduan cepat)

> **Tujuan tahap ini:** memastikan Google Apps Script aktif dapat mengakses database dan folder arsip yang sama dengan aplikasi lama. Tidak perlu mengganti URL, membuat spreadsheet, atau mengubah tampilan BOLO INPEK.

## Sebelum mulai

- [x] Database Google Sheets lama teridentifikasi dan memiliki 9 tab yang diperlukan.
- [x] Folder Google Drive **Arsip Penutupan Survei** teridentifikasi.
- [x] Pemeriksa *read-only* tersedia di GitHub: [TindakLanjut_Healthcheck.gs](./TindakLanjut_Healthcheck.gs).
- [ ] Pemeriksa dipasang ke proyek Google Apps Script produksi yang sudah ada.
- [ ] Dua Script Properties diisi oleh operator.
- [ ] Pemeriksaan berhasil (`"siap": true`).
- [ ] Pengujian transaksi dilakukan di data uji terpisah sebelum perubahan produksi.

## Langkah 1 — buka proyek Apps Script yang benar

1. Masuk ke [Google Apps Script — Proyek Saya](https://script.google.com/home/projects) dengan akun Google yang memiliki akses ke aplikasi Tindak Lanjut BOLO INPEK.
2. Buka proyek **Tindak Lanjut BOLO INPEK** yang dipakai tombol di dashboard, **bukan** membuat proyek baru.
3. Buka **Deploy → Manage deployments** untuk memastikan proyek ini memang memiliki Web app aktif yang URL-nya dipakai BOLO INPEK. Jangan mengubah deployment dahulu.
4. Salin/backup file backend lama (misalnya `Kode.gs`, tampilan `Index_TindakLanjut.html`, manifest) sebelum mengedit.

## Langkah 2 — pasang pemeriksa dari GitHub

1. Buka [TindakLanjut_Healthcheck.gs](./TindakLanjut_Healthcheck.gs) → **Raw** dan salin semua isinya.
2. Di editor Apps Script proyek lama, klik **+** di samping *Files* → **Script**.
3. Beri nama `TindakLanjut_Healthcheck` (editor membuat ekstensi `.gs`), tempel kode, lalu **Save**.
4. Jangan mengubah fungsi `doGet`, `doPost`, akses operator, atau file yang sebelumnya sudah ada.

## Langkah 3 — isi dua Script Properties

Buka **Project Settings (ikon roda gigi) → Script Properties → Add script property** (atau *Edit script properties*). Tambahkan:

| Property | Isi nilainya |
| --- | --- |
| `TL_DB_SPREADSHEET_ID` | ID dari URL database Google Sheets **Database Tindak Lanjut BOLO INPEK** |
| `TL_ARCHIVE_FOLDER_ID` | ID dari URL folder Drive **Arsip Penutupan Survei** |

Gunakan **ID saja**, bukan URL lengkap. Nilai persisnya tersedia pada kedua tautan yang pernah diverifikasi di percakapan; jangan menaruh ID atau data akun di GitHub publik.

- Database: `https://docs.google.com/spreadsheets/d/<ID_DATABASE>/edit`.
- Folder: `https://drive.google.com/drive/folders/<ID_FOLDER>`.

Simpan properti. Dua key baru hanya dipakai oleh pemeriksa. Jangan menghapus atau mengganti properti produksi lainnya.

## Langkah 4 — jalankan pengecekan

1. Dari daftar fungsi di toolbar editor Apps Script, pilih `boloTlPeriksaIntegrasi`.
2. Klik **Run / Jalankan**.
3. Jika diminta, otorisasi akses Google Sheets dan Drive dengan akun yang memang punya izin. Periksa daftar permission terlebih dahulu; pemeriksa ini hanya membaca metadata/tab/header/baris serta nama folder.
4. Buka **Execution log** atau **Executions**, cari objek hasil.
5. Targetnya: `"siap": true` dan `"error": []`. Semua 9 tab harus `ada:true`, `header_sesuai:true`, serta `arsip.terhubung:true`.

**Jika error:** pastikan ID tidak salah, akses akun sesuai, dan tab belum diubah namanya. Jangan membuat tab baru atau mengubah header untuk memaksa tes lolos tanpa mengecek data lama.

## Langkah 5 — validasi operasional (bukan bagian healthcheck)

Baru setelah hasil `siap:true`, uji pada **kasus percobaan**, bukan assignment atau arsip penting:

- Login operator dengan mekanisme autentikasi yang sudah ada.
- Pastikan pengingat terkait `survey_period_id`, bukan hanya nama survei.
- Coba dua catatan berurutan untuk satu `tindak_lanjut_id`: harus membuat **dua riwayat**, bukan overwrite.
- Pastikan status penanganan berbeda dengan status FASIH dan pengingat hilang hanya bila kasus ditutup.
- Pastikan WhatsApp membuka pesan untuk dikirim manual, bukan mengirim otomatis.
- Untuk penutupan survei, lakukan di salinan data uji, cek arsip berhasil dibuat dan terbaca sebelum menutup periode.

**Tidak perlu redeploy** hanya untuk menjalankan pemeriksa dari editor. Jika kelak kode *produksi* berubah, pilih **Deploy → Manage deployments → pilih deployment aktif → Edit → New version → Deploy** untuk memperbarui aplikasi tanpa mengganti URL. Jangan membuat deployment baru.

## Keamanan

Spreadsheet menyimpan nama, email, nomor WhatsApp, pesan, serta catatan operasional. **Jangan** mengunggah ekspor database atau kredensial ke repository publik. Jangan membuat API tulis baru hanya berbasis email yang dikirim browser. Pengujian pemasangan ini tidak mengubah data maupun status survei.

Setelah pemeriksaan berhasil, langkah pengembangan berikutnya adalah **review file Apps Script produksi** agar fitur simpan catatan, riwayat, pengingat, dan arsip bisa ditingkatkan tanpa menciptakan backend kedua.
