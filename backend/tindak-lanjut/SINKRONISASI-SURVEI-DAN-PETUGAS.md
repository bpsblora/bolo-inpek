# Sinkronisasi Survei Aktif & Petugas — Monitoring → Tindak Lanjut

## Mengapa IMK Tahunan belum terlihat

Pada pemeriksaan 15 November 2026, dua spreadsheet berbeda:

| Sumber | Survei | Assignment | Keterangan |
| --- | ---: | ---: | --- |
| [Monitoring utama](https://docs.google.com/spreadsheets/d/1bgCF8RSkltsd3jpL-naTEgWEIMw5y2rw8EzYRagCGNo/edit) | 7 | 382 | Termasuk **VIMK_TH26** sebanyak **264 assignment** |
| [Tindak Lanjut](https://docs.google.com/spreadsheets/d/1wEK8KmN6cKIEg1UNd22UuzFzCjvBYkSAXRdrUhXRTyU/edit) | 6 | 108 | Masih snapshot survei lama; belum ada VIMK_TH26 |

Monitoring memiliki tabel `monitoring`, `konfigurasi_survei`, `periode_survei`, `assignment_identitas`, `info_update` dan `db_petugas`. Semua 382 baris monitoring memiliki ID assignment yang cocok dengan posisi pada `assignment_identitas`, tanpa ID ganda.

Dari 264 assignment IMK Tahunan pada audit awal, ada **36 nama PPL/PML unik**, dengan **8 nama** belum cocok dengan biodata Tindak Lanjut ketika snapshot masih belum diperbarui. Nama IMK baru itu perlu dikonfirmasi sebelum kontak WhatsApp dikirim.

## Deteksi petugas otomatis untuk seluruh survei aktif

Sejak pembaruan ini, **tidak ada daftar survei khusus** di kode identifikasi petugas. Setelah Updater Windows menulis data terbaru ke Monitoring utama, pemeriksaan backend **TindakLanjut_DeteksiOtomatis.gs** berjalan melalui *time-driven trigger* sekitar **setiap 1 menit** (jadwal Google dapat sedikit bergeser). Ini mencakup survei baru dan periode baru yang ditandai **AKTIF**, bukan hanya IMK Tahunan.

Pemeriksaan otomatis:
- Memvalidasi identitas assignment terbaru, tanggal update, daftar survei, dan perubahan PPL/PML.
- Menyelaraskan hanya tab sumber operasional Tindak Lanjut jika checksum berubah; jika tidak berubah, tidak membuat cadangan atau menulis ulang snapshot.
- Memasukkan rekomendasi ID PPL/PML yang belum terdaftar ke daftar **Petugas Baru Terdeteksi**. Admin yang sedang membuka dashboard menerima angka rekomendasi yang diperbarui berkala.
- Mengabaikan assignment survei **NONAKTIF**, **DITUTUP**, atau dalam **PENGARSIPAN** untuk rekomendasi.
- **Tidak otomatis menambah biodata atau nomor WhatsApp** dan tidak memulai Updater FASIH. Updater tetap membutuhkan Chrome, VPN BPS, dan SSO FASIH sesuai alur manual yang sudah disepakati.

Pemicu dipasang **satu kali** pada login Admin saat fungsi sinkronisasi dipanggil, atau dari tombol **Aktifkan Deteksi Petugas Otomatis** di Tindak Lanjut. Setelah terpasang, pemicu berjalan sendiri walaupun Admin keluar dan laptop ditutup. Penyiapan ini tidak dilakukan hanya dengan menerapkan kode; sekurang-kurangnya satu aktivasi Admin yang berhasil diperlukan.

### Bila nama petugas sudah ada

- Pencocokan nama menggunakan normalisasi Unicode, huruf kecil/besar, serta spasi ganda. **Biodata `petugas` yang telah dikelola Admin diprioritaskan** daripada identitas dari `sumber_petugas`.
- Jika nama **dan ID FASIH** cocok dengan satu petugas terdaftar, penugasan langsung memakai ID lama, termasuk ketika petugas bekerja di survei lain.
- Jika **hanya nama yang sama** tetapi ID FASIH belum ada atau berbeda—termasuk jika terdapat beberapa biodata bernama sama—sistem tidak langsung menyamakan orangnya. Panel **Petugas Baru Terdeteksi** menawarkan **Tautkan ke Petugas Terdaftar** dengan empat digit akhir WhatsApp untuk pembeda. Admin memverifikasi identitas lalu menyetujui dialog konfirmasi.
- Konfirmasi disimpan di tab baru **`padanan_petugas`** (dibuat otomatis saat diperlukan). Berkas ini hanya mencatat `alias_monitoring,petugas_id,nama_monitoring,waktu_taut,ditautkan_oleh`. Riwayat `kontak` dan `tindak_lanjut` tidak diubah.
- Apabila petugas benar-benar berbeda meskipun namanya sama, pilih **Daftarkan Baru** untuk membuat biodata terpisah.
- Jangan menganggap kecocokan nama sebagai verifikasi kepemilikan nomor WhatsApp. Admin tetap wajib memastikan orang yang dihubungi benar sebelum mengirim pengingat.

## Mekanisme baru

Modul [TindakLanjut_SinkronMonitoring.gs](./TindakLanjut_SinkronMonitoring.gs) membaca **spreadsheet Monitoring utama yang sama dengan dashboard**, dari sisi backend Apps Script (tidak dari data JSON publik tanpa ID), kemudian:

1. Memverifikasi konfigurasi survei, status aktif/nonaktif, periode, seluruh data assignment, ID assignment, dan tanggal update.
2. Menyelaraskan tab `survei`, `sumber_survei`, dan `sumber_assignment` **saja** dalam database Tindak Lanjut.
3. Mendaftarkan **VIMK_TH26 / PENDATAAN** dan penugasan terbaru dari seluruh survei aktif.
4. **Tidak mengubah** tabel `petugas`, `operator`, `kontak`, `tindak_lanjut`, ataupun `arsip`. Catatan dan riwayat WhatsApp yang lama tetap tersimpan.
5. Mempertahankan status `DITUTUP` dan `PENGARSIPAN` agar survei yang sudah diarsipkan tidak diaktifkan ulang hanya karena konfigurasi monitoring.
6. Mempertahankan ID petugas lama apabila **nama normalisasi cocok secara unik**.
7. Petugas baru yang ID aslinya tidak tersedia dari sumber monitoring diberi **alias ID lokal deterministik**, berawalan `monitor:`. Ini **bukan UUID FASIH**. Admin wajib memastikan identitas dan nomor WhatsApp sebelum menyimpan biodata.
8. Setelah petugas disimpan, ia dapat dipilih untuk **Ingatkan Petugas** pada assignment yang terhubung dengan alias tersebut. Bila kelak data FASIH menyediakan UUID asli, lakukan rekonsiliasi identitas terkontrol, bukan menimpa ID historis otomatis.

Sumber monitoring **tidak disentuh**; modul hanya membaca data FASIH yang sudah disimpan oleh Updater di Sheets utama. Sebelum memperbarui kedua tab sumber operasional, modul membuat **backup tab** di database Tindak Lanjut. Penulisan hanya dilakukan ketika checksum sumber berbeda dari pembaruan sebelumnya.

## Aktivasi satu kali (tanpa PowerShell atau clasp)

Seperti fitur Kelola Petugas sebelumnya, HTML langsung diperbarui dari GitHub Loader. Namun fungsi baru Apps Script perlu diterapkan satu kali:

1. Buka editor Google Apps Script **Tindak Lanjut BOLO INPEK** yang sudah ada.
2. Pada menu **File → + → Script**, buat file bernama **`TindakLanjut_SinkronMonitoring`**.
3. Buka [kode TindakLanjut_SinkronMonitoring.gs](./TindakLanjut_SinkronMonitoring.gs), klik **Raw**, salin seluruh kode, lalu tempel ke file baru.
4. Pastikan **`TindakLanjut_KelolaPetugas.gs`** memakai [versi terbaru](./TindakLanjut_KelolaPetugas.gs) dan modul **`TindakLanjut_DeteksiOtomatis.gs`** juga tersedia. Workflow GitHub privat telah disiapkan untuk menerapkan ketiganya tanpa instalasi lokal.
5. Simpan semua kode. **Jangan ganti** `KodeV2.gs`, `TindakLanjut_GitHubLoader.gs`, sheet petugas lama, atau deployment URL.
6. Pilih **Terapkan → Kelola penerapan → Edit penerapan aktif → Versi baru → Terapkan**.
7. Buka ulang [BOLO INPEK](https://bpsblora.github.io/bolo-inpek/) dan masuk menggunakan email Admin INPEK seperti biasa.
8. Halaman Tindak Lanjut akan mencoba sinkronisasi otomatis sebelum memuat daftar survei. Atau buka **Kelola Petugas → Muat Ulang** untuk memaksakan pengecekan sumber; Tindak Lanjut juga memiliki tombol **Sinkronkan dari Monitoring**.

**Hasil yang diharapkan**: Tindak Lanjut menampilkan 7 survei aktif (kecuali periode yang sebelumnya benar-benar ditutup), termasuk **VIMK_TH26 — PENDATAAN**, dengan 382 assignment terbaru; Kelola Petugas menampilkan **8 calon petugas** yang memerlukan verifikasi identitas dan WhatsApp, jika data sumber dan master petugas belum berubah.

Jika Apps Script belum memiliki izin membaca Monitoring utama, Google dapat meminta otorisasi untuk sumber tersebut. Jalankan `apiPratinjauSinkronMonitoring` melalui Apps Script editor **tidak disarankan tanpa token**; untuk pratinjau aman, gunakan fungsi backend yang memanggilnya dengan sesi ADMIN dari UI. Kesalahan izin dibaca sebagai pesan sinkronisasi gagal; Tindak Lanjut tetap menampilkan data lamanya daripada mengarang data baru.

## Keselamatan data

- Sinkronisasi **tidak otomatis menambahkan nomor WhatsApp, akun, atau biodata** dari nama yang belum diverifikasi.
- Status **Nonaktif** di `petugas` tidak ditimpa dan tetap menghalangi petugas tampil di pilihan pengingat.
- Tabel sumber Tindak Lanjut adalah **snapshot**, bukan riwayat. Untuk pencatatan riwayat gunakan tabel `tindak_lanjut`; modul tidak membersihkan tabel itu.
- Pengecekan ID assignment wajib berhasil **100%** sebelum perubahan data. Jika ada ID hilang/ganda atau nama assignment tidak cocok, sinkronisasi dibatalkan.
- Karena Google Sheets tidak menyediakan transaksi atomik lintas tab, jika terjadi kegagalan di tengah sinkronisasi, tab backup sumber disimpan untuk pemulihan manual; jangan menjalankan ulang secara berulang tanpa memeriksa error.
- Endpoint baru hanya menerima **token sesi Admin**. Autentikasi email bersama yang disepakati sebelumnya tetap digunakan; ini bukan verifikasi kepemilikan email via OTP/SSO.

## Pengujian

Tes:
- [monitoring-sync.test.mjs](../../scripts/tindak-lanjut/monitoring-sync.test.mjs): kesesuaian assignment, pencatatan survei baru, alias monitoring, penolakan mismatch, penjagaan status survei selesai, dan penolakan non-admin.
- [petugas-admin.test.mjs](../../scripts/tindak-lanjut/petugas-admin.test.mjs): pengelolaan biodata dan pembatasan akses.
- [admin-gate.test.mjs](../../scripts/tindak-lanjut/admin-gate.test.mjs): login Admin dan komunikasi iframe.

Semua pengujian pada data simulasi, tanpa menulis ke spreadsheet produksi.
