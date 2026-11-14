# Pintu Masuk Admin INPEK — Dashboard Monitoring

**Berlaku mulai 14 November 2026.** Dashboard monitoring tetap dapat dilihat tanpa login; tindakan pengelolaan dipusatkan melalui **Masuk Admin INPEK**.

## Alur baru

1. Saat pengunjung pertama kali membuka BOLO INPEK, hanya tombol **Masuk Admin INPEK** yang ditampilkan pada header.
2. Tombol tersebut membuka dialog Tindak Lanjut yang sudah ada dan meminta email **ADMIN INPEK**. Tidak dibuat daftar email admin di JavaScript publik.
3. HTML Apps Script memanggil `apiLogin(email)` sehingga email harus ada dan aktif pada tab `operator` di Google Sheets. Untuk membuka tombol di dashboard, hasil verifikasi harus memiliki `operator.peran === 'ADMIN'`. Akun `OPERATOR` tidak membuka menu admin.
4. Iframe Apps Script mengirim pemberitahuan ke dashboard berisi nonce acak, nama, email, dan peran. **Token backend tidak dikirim** ke Github Pages. Dashboard memeriksa origin Google, nonce sesi, dan pesan browser tepercaya.
5. Header menampilkan: **Muat Ulang Data**, **Kelola Survei**, **Perbarui Survei**, **Tindak Lanjut**, dan **Keluar**. Tombol Tindak Lanjut pada kartu survei juga baru muncul setelah login.
6. Sesi tampilan berlaku maksimal 55 menit atau sampai browser/tab ditutup; tombol **Keluar** segera menyembunyikan menu dan membuang iframe yang memegang token.
7. Tindak Lanjut memakai iframe yang sudah login. Pilih survei/periode pada dropdown di dalam pop-up. Menu **Survei Selesai & Pulihkan** tersedia dari Tindak Lanjut tanpa login ulang.
8. Tab **Kelola Survei → Survei Selesai & Pulihkan** menyediakan tombol **Buka Arsip melalui Sesi Admin**, lalu gunakan tombol **Survei Selesai & Pulihkan** pada pop-up Tindak Lanjut.

## Fitur yang dipertahankan

- Monitoring umum dan indikator FASIH tetap tampil tanpa login.
- Tombol Muat Ulang Data menggunakan mekanisme refresh sebelumnya, dengan filter tetap terjaga.
- Kelola Survei tetap memakai aplikasi Apps Script admin yang sudah ada.
- Perbarui Survei tetap menuju paket Updater Windows GitHub privat.
- Data petugas, riwayat tindak lanjut, dan arsip tidak berubah.
- Login HTML Tindak Lanjut yang digunakan langsung (tanpa melalui dashboard) tetap bisa dipakai dengan peran ADMIN/OPERATOR sesuai izin backend.

## Batas akses dan keamanan

**Email saja bukan verifikasi kepemilikan email.** Mekanisme `apiLogin` saat ini memeriksa apakah alamat yang diketik terdaftar dan berstatus ADMIN; ia **tidak** mengirim kode OTP atau menggunakan Google Sign-In. Ini merupakan keputusan login bersama yang sebelumnya digunakan tim. Karena itu, pintu masuk baru adalah pembatas tampilan dan penyederhanaan workflow, **bukan sistem keamanan kuat untuk melindungi data sensitif**. Pengguna yang mengetahui email admin masih bisa mencoba login. Untuk autentikasi sesungguhnya, backend perlu menggunakan Google Workspace SSO/OAuth dan memverifikasi identitas pemilik akun.

Aplikasi *Kelola Survei* berjalan pada backend lain; apabila backend tersebut masih memiliki login tersendiri, formulir itu tetap dapat meminta autentikasi tambahan. Pengelolaan data wajib tetap memvalidasi izin pada backend, terlepas dari apakah tombol ditampilkan dashboard. Tautan updater dari repository privat tetap memerlukan izin GitHub.

**Keluar** membuang sesi iframe dari dashboard, tetapi cache token Apps Script yang tidak lagi dapat diakses dari iframe dapat tetap ada sampai masa berlakunya berakhir. Untuk pencabutan sesi server, gunakan tombol Keluar di dalam aplikasi Tindak Lanjut sebelum menutup jika diperlukan.

## Cara menguji

1. Buka [BOLO INPEK](https://bpsblora.github.io/bolo-inpek/) pada tab baru. Header seharusnya menampilkan satu tombol **Masuk Admin INPEK**; kartu survei tidak menampilkan Tindak Lanjut.
2. Klik **Masuk Admin INPEK**, masukkan email terdaftar dengan peran `OPERATOR`: harus **ditolak untuk mode admin dashboard**.
3. Masuk dengan email terdaftar berperan `ADMIN`: menu dan tombol Tindak Lanjut pada kartu muncul.
4. Klik **Tindak Lanjut**, lalu pilih survei dan periode melalui dropdown: harus terbuka tanpa login ulang.
5. Di dalam pop-up Tindak Lanjut pilih **Survei Selesai & Pulihkan**. Pastikan daftar arsip terbuka, lalu pilih **Kembali ke Tindak Lanjut**.
6. Coba **Kelola Survei → Survei Selesai & Pulihkan → Buka Arsip melalui Sesi Admin**. Tidak ada formulir login baru untuk arsip.
7. Klik **Keluar**: menu dan tombol pada kartu kembali disembunyikan.
8. Jangan klik **Tampilkan Kembali** atau **Arsipkan & Tutup** untuk pengujian tampilan; cukup buka dialog dan pilih **Batal**.

### Implementasi dan tes otomatis

- [index.html](../../index.html)
- [Index_TindakLanjutV2.html](./Index_TindakLanjutV2.html)
- [admin-gate.test.mjs](../../scripts/tindak-lanjut/admin-gate.test.mjs)

`Index_TindakLanjutV2.html` telah terhubung melalui **GitHub Loader** yang dipasang sebelumnya. Setelah commit HTML, tunggu berakhirnya cache (maks. sekitar 3 menit), lalu tutup-buka kembali pop-up. Tidak perlu mengedit atau deploy ulang file `.gs` untuk perubahan ini.
