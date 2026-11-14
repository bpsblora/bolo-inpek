# Integrasi Backend Tindak Lanjut — BOLO INPEK

## Sinkronisasi GitHub → Apps Script

[Mulai setup sinkronisasi via GitHub Actions (pratinjau, deployment lama, lalu auto-sync opsional)](./SINKRONISASI-GITHUB-APPS-SCRIPT.md)

GitHub Actions memakai `clasp pull` terlebih dahulu untuk mempertahankan semua file kode produksi yang tidak disimpan di repository. **Belum dapat berjalan terhadap Google sebelum pemilik mengisi dua GitHub Secrets** (`CLASPRC_JSON` dan `TL_SCRIPT_ID`). Mode deploy otomatis dinonaktifkan secara default.

## Mulai dari sini — setup sekali pada proyek yang sudah aktif

Panduan paling ringkas: [SETUP-LANGKAH.md](./SETUP-LANGKAH.md).

**GitHub menyimpan sumber `.gs`, tetapi tidak otomatis memasangnya ke Google Apps Script.** Karena backend produksi memakai deployment lama dan mempunyai data riwayat, tahap pemasangan pertama dilakukan di editor Apps Script dengan akun operator yang memiliki izin. Pemeriksaan ini bersifat **read-only**, jadi belum perlu deploy ulang. Setelah status `siap: true`, barulah backend produksi dapat diaudit per fungsi.

## Pembaruan UI Konfirmasi dan Pop-up

- [Audit pop-up dan panduan deployment Apps Script](./POPUP-AUDIT.md)
- [Versi siap dipasang: Index_TindakLanjutV2.html](./Index_TindakLanjutV2.html)

Konfirmasi `Tampilkan Kembali` dan `Arsipkan & Tutup` telah dibuat sebagai dialog BOLO INPEK, bukan dialog native browser. **Perubahan ini belum aktif** pada Apps Script sebelum file HTML ditempel pada project produksi dan deployment lama diperbarui. Tidak ada operasi pada data aktif saat audit.

## Update pemeriksaan kode produksi — 14 November 2026

Pemilik memberikan kode backend (kode Apps Script) dan HTML Tindak Lanjut untuk ditinjau.
Keputusan pemilik **tetap memakai login berbasis email yang dikenal tim**; perubahan autentikasi **bukan** bagian dari pekerjaan ini. Perlu diketahui, email yang diketik tidak membuktikan identitas pemilik alamat. Kode produksi sengaja **tidak** disalin ke repository publik agar konfigurasi dan detail akses backend tidak tersebar.

Langkah pemeriksaan berikutnya: setelah `boloTlPeriksaIntegrasi()` menghasilkan `siap:true`, salin file [TindakLanjut_AuditIntegritas.gs](./TindakLanjut_AuditIntegritas.gs) sebagai **file tambahan** ke Apps Script aktif. Jalankan **`jalankanAuditIntegritasBolo`** dari dropdown fungsi di **editor Apps Script**. Fungsi inti `boloTlAuditIntegritas_` tetap privat (akhiran `_`) sehingga tidak muncul pada daftar fungsi. Entry point yang tampil di dropdown memeriksa bahwa pengguna aktif sama dengan pemilik eksekusi dan menolak panggilan website dari pengguna lain. Tidak melakukan penulisan ke spreadsheet, tidak membuat arsip, dan tidak menampilkan data pribadi dalam log.

Audit memeriksa keunikan ID, hubungan riwayat–kontak, hubungan riwayat–assignment–periode, validitas status penanganan, pengingat yang masih aktif, dan survei ditutup tanpa arsip terverifikasi. Hasil yang diharapkan adalah `error: {}`; `peringatan` dapat menunjukkan data lama yang perlu diperiksa secara manual. `siap_untuk_uji:true` berarti **tidak ditemukan kesalahan struktur menurut audit ini**, bukan bahwa transaksi atau deployment sudah diuji.

Dari telaah kode, proses `apiTutup` dapat mengarsipkan meskipun masih ada penanganan aktif; sistem memang menampilkan jumlahnya sebelum konfirmasi. **Jangan menjalankan penutupan pada data produksi untuk sekadar pengujian.** Lakukan uji penutupan di salinan data setelah aturan bisnis penutupan disepakati. Pencatatan kasus sudah menggunakan append-only lewat `apiCatatan` dan proses WhatsApp tetap manual; keduanya akan diuji sesudah audit integritas.

## Status audit awal (14 November 2026)

Database operasional yang **sudah ada** berhasil dibaca melalui Google Sheets. Folder arsip penutupan juga ditemukan. Data operasional, riwayat, dan arsip lama tidak dimodifikasi.

Ada 9 tab yang sudah tersedia: `operator`, `petugas`, `survei`, `kontak`, `tindak_lanjut`, `arsip`, `sumber_assignment`, `sumber_petugas`, dan `sumber_survei`.

**Jangan membuat spreadsheet atau deployment pengganti.** Gunakan proyek Apps Script **Tindak Lanjut BOLO INPEK** yang sudah ada. Identitas database dan folder privat tidak disimpan di repo publik.

## Alur yang dipertahankan

- BOLO INPEK GitHub Pages: tombol Tindak Lanjut membuka dialog/iframe Apps Script aktif memakai `survei` dan `survey_period_id`.
- Apps Script menangani autentikasi operator, pencatatan, pengingat, penutupan, dan proses arsip.
- Google Sheets menyimpan kontak WhatsApp (dikirim manual), riwayat tindak lanjut secara **append-only**, serta metadata arsip.
- `tindak_lanjut_id` menghubungkan riwayat dari satu kasus; `riwayat_id` unik per catatan. Tidak boleh menimpa catatan sebelumnya.
- `survey_period_id` adalah identitas periode. Jangan pakai nama survei saja sebagai kunci karena survei bisa berjalan di beberapa periode.
- `arsip` memiliki versi, URL hasil arsip, hitungan assignment/riwayat, dan status arsip. Sebelum menutup atau membersihkan data aktif, verifikasi arsip dapat dibuka dan isinya cocok.
- Status tindak lanjut harus tetap **terpisah** dari status assignment FASIH. Tidak menutup pengingat jika kasus belum benar-benar selesai.

## Setup pemeriksaan aman

1. Buka proyek Apps Script aktif **Tindak Lanjut BOLO INPEK**, **buat salinan/backup** `Kode.gs`, `Index_TindakLanjut.html`, dan manifest sebelum perubahan.
2. Tambahkan berkas `TindakLanjut_Healthcheck.gs` sebagai file baru pada proyek yang sama; jangan mengganti `doGet` atau `doPost` produksi.
3. Di **Project Settings → Script properties**, isi `TL_DB_SPREADSHEET_ID` dengan ID database yang sudah ada dan `TL_ARCHIVE_FOLDER_ID` dengan ID folder arsip yang sudah ada. Jangan simpan ID atau token di JavaScript publik.
4. Jalankan fungsi `boloTlPeriksaIntegrasi` dari editor Apps Script dengan akun yang memiliki izin. Hasil `siap: true` berarti **struktur spreadsheet dan folder** cocok, bukan berarti semua alur transaksi telah diuji.
5. Uji **pada data uji yang disepakati**: login operator, buka daftar kasus per periode, buat dua catatan untuk `tindak_lanjut_id` yang sama (harus dua baris riwayat), status selesai menghentikan pengingat, WhatsApp tetap memerlukan klik kirim manual, arsip salinan dibaca kembali sebelum periode ditutup.
6. Setelah kode backend asli dan autentikasi ditinjau, ubah **deployment yang sama** melalui *Manage deployments → Edit → New version*, bukan membuat URL web app baru. Pastikan `TINDAK_LANJUT_URL` pada `index.html` tetap mengarah ke deployment aktif.

## Kontrak backend yang sudah dipakai frontend

- `GET ?action=closed` saat dashboard memuat data: mengharapkan `{success:true, closed:[...], pengingat:[...]}`. `pengingat[].survey_period_id` dan `pengingat[].jumlah` dipakai untuk badge.
- Tombol `data-tindak-survei` mengirim parameter `survei` dan `survey_period_id` ke URL aplikasi melalui iframe.
- Sumber `sumber_assignment` sudah memiliki `assignment_id`, `survey_period_id`, `status`, `status_asli`, `ppl_id`, dan `pml_id`.
- Penanda eksklusi pada monitoring tidak otomatis menghapus catatan atau arsip pada aplikasi Tindak Lanjut.

## Keamanan dan batas integrasi

- **Jangan** memasang endpoint tulis tanpa autentikasi server-side dan pengecekan peran operator dari tab `operator`.
- Jangan menganggap `operator_email` dari parameter klien sebagai bukti identitas.
- Web app dengan mode *execute as me* tidak selalu bisa memperoleh identitas pengunjung lewat `Session.getActiveUser().getEmail()`. Pertahankan mekanisme login terverifikasi yang sudah berjalan.
- Spreadsheet, nomor telepon, isi pesan dan riwayat tidak boleh dipublikasikan ke GitHub Pages.
- Paket ini **bukan** deployment backend: ia hanya melakukan audit skema dan folder, tanpa mengubah transaksi produksi.

## Rujukan berkas

- `TindakLanjut_Healthcheck.gs`: fungsi **read-only** audit struktur dan akses.
- `index.html` repository utama: UI/tombol, iframe, URL Apps Script aktif dan badge pengingat.
- Script produksi: proyek Google Apps Script yang sudah ada (perlu ditinjau langsung sebelum menambah/mengubah endpoint tulis).
