# Integrasi Backend Tindak Lanjut — BOLO INPEK

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
