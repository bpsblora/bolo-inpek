# Kelola Biodata Petugas — Admin BOLO INPEK

## Status implementasi

Kode GitHub untuk **menu Kelola Petugas** sudah disiapkan. Tombol ada di header setelah Admin INPEK masuk, dan juga tersedia dalam menu Tindak Lanjut. Tampilan HTML otomatis mengikuti GitHub Loader yang telah dipasang sebelumnya.

**Agar operasi Simpan berfungsi, perlu menambahkan satu file GAS baru dan memperbarui deployment Apps Script lama sekali saja.** Ini karena loader hanya menyinkronkan HTML; fungsi baru backend tidak bisa dijalankan dari GitHub secara langsung.

## Data yang dikelola

Tab utama: **petugas** pada [Database Tindak Lanjut BOLO INPEK](https://docs.google.com/spreadsheets/d/1wEK8KmN6cKIEg1UNd22UuzFzCjvBYkSAXRdrUhXRTyU/edit).

Kolom yang digunakan **tetap sama**, sehingga tidak memerlukan migrasi atau perubahan struktur spreadsheet:

| Kolom | Aturan |
| --- | --- |
| `petugas_id` | Identitas tetap; gunakan ID petugas FASIH untuk menghubungkan assignment PPL/PML |
| `nama` | Nama yang digunakan pada pesan WhatsApp |
| `email` | Email kontak petugas; boleh kosong, tetapi harus valid jika diisi |
| `nomor_whatsapp` | Wajib untuk pengingat; menerima 08... atau +62... dan disimpan menjadi 62... |
| `aktif` | TRUE/FALSE; nonaktif tidak muncul dalam pilihan Ingatkan Petugas |

Pada audit 14 November 2026, **29 petugas lama** sudah terdaftar dan 29 ID-nya cocok dengan `sumber_petugas`. Semua memiliki nomor WhatsApp dan status aktif. Data lama **tidak diubah** selama implementasi fitur ini.

`sumber_petugas` merupakan referensi yang dipasok FASIH. Form membaca kandidat yang belum ada di `petugas`, tetapi **tidak menulis ke sumber_petugas**, sehingga pembaruan monitoring FASIH tidak mengembalikan biodata yang diedit admin ke nilai lama.

Catatan dan arsip lama tidak diubah. Penggantian nama/nomor berlaku untuk **pengiriman pengingat berikutnya**, sedangkan pesan WhatsApp sebelumnya tetap tercatat sebagai rekam jejak. ID petugas yang sudah ada **tidak boleh diubah atau dihapus**.

## Pemasangan backend lewat browser: satu kali

1. Buka **Google Apps Script Tindak Lanjut BOLO INPEK yang sudah aktif** (yang memiliki `KodeV2.gs`, `Index_TindakLanjutV2.html`, dan `TindakLanjut_GitHubLoader.gs`).
2. Klik ikon **+** di panel **File**, lalu pilih **Script**.
3. Beri nama `TindakLanjut_KelolaPetugas`.
4. Buka [sumber file TindakLanjut_KelolaPetugas.gs](./TindakLanjut_KelolaPetugas.gs) di GitHub, klik **Raw**, salin **seluruh kode** lalu tempel ke file Script baru.
5. **Simpan**. Jangan mengubah atau menghapus `KodeV2.gs`, `TindakLanjut_GitHubLoader.gs`, maupun file audit.
6. Pilih **Terapkan → Kelola penerapan → Edit (pensil pada deployment yang sedang dipakai) → Versi baru → Terapkan**. **Jangan membuat penerapan baru** agar URL `/exec` lama tetap berlaku.
7. Muat ulang [dashboard BOLO INPEK](https://bpsblora.github.io/bolo-inpek/). Klik **Masuk Admin INPEK**, masukkan email ADMIN yang terdaftar, lalu klik **Kelola Petugas**.

Jika file GAS belum dipasang/deployment belum diperbarui, antarmuka akan menampilkan peringatan bahwa backend Kelola Petugas belum aktif. Data lama tidak terpengaruh.

## Sinkronisasi survei aktif — termasuk IMK Tahunan

[**Panduan Sinkronisasi Survei dan Petugas**](./SINKRONISASI-SURVEI-DAN-PETUGAS.md) menjelaskan cara mengambil sumber yang sama dengan dashboard Monitoring. Setelah modul tambahan `TindakLanjut_SinkronMonitoring.gs` dipasang, tombol Muat Ulang di Kelola Petugas membaca ulang assignment dan periode dari sumber utama. ID PPL/PML yang belum tersedia di sumber monitoring diperlakukan sebagai alias internal, dengan checkbox verifikasi wajib sebelum biodata baru disimpan.

## Pembaruan: Nonaktifkan langsung & deteksi PPL/PML baru dari assignment

### Mengaktifkan / menonaktifkan petugas

- Di tabel, pada kolom **Tindakan**, sekarang terdapat dua tombol: **Edit Biodata** dan **Nonaktifkan** (untuk yang masih aktif) atau **Aktifkan** (untuk yang nonaktif).
- Klik tombol status dan baca pop-up konfirmasi. Jika memilih **Batal**, database tidak berubah. Jika memilih konfirmasi, kolom `aktif` pada baris `petugas` berubah menjadi `FALSE` atau `TRUE`.
- Cara lama tetap tersedia: **Edit Biodata → checkbox Aktif → Simpan Biodata**.
- Pengaturan ini **tidak menghapus ID, assignment, pesan WhatsApp lama, atau catatan tindak lanjut**. Petugas nonaktif tidak muncul di pilihan Ingatkan Petugas. Bila diaktifkan kembali dan masih memiliki assignment, ia dapat diingatkan lagi.

### Deteksi otomatis saat pembaruan sumber FASIH

Saat Admin INPEK login atau membuka/memuat ulang **Kelola Petugas**, backend menggabungkan identitas dari dua tab:

1. `sumber_petugas`: calon petugas dari daftar petugas FASIH.
2. `sumber_assignment`: ID `ppl_id` dan `pml_id` yang muncul pada pekerjaan survei, meskipun ID tersebut **belum** muncul di `sumber_petugas`.

Kedua sumber dibandingkan dengan semua baris `petugas`, **termasuk petugas nonaktif**. Hanya ID yang belum ada di `petugas` muncul sebagai kandidat.

Menu **Petugas Baru Terdeteksi** menampilkan nama, PPL/PML, survei/periode dan jumlah assignment, lalu tombol **Daftarkan Petugas**. Form otomatis mengisi ID dan nama; admin wajib memeriksa biodata serta menambahkan nomor WhatsApp sebelum menyimpan. Setelah disimpan kandidat menghilang dari daftar.

Tombol **Kelola Petugas** pada header mendapat angka jumlah kandidat yang belum didaftarkan. Jika ada assignment dengan **nama tetapi ID FASIH kosong**, ditampilkan peringatan terpisah; sistem tidak menebak ID berdasarkan kemiripan nama karena dapat menyebabkan salah identitas atau salah pengiriman WhatsApp.

Sumber FASIH tetap **read-only** bagi menu ini. Petugas yang hanya dibuat manual tanpa ID dalam assignment belum dapat menerima pengingat berbasis FASIH sampai ID petugasnya cocok dengan ID di sumber assignment.

**Kapan pendeteksian berjalan?** Setelah Updater memasukkan assignment terbaru ke database, buka/klik **Muat Ulang** di Kelola Petugas. Penghitungan pada header juga dilakukan sesudah Admin INPEK login. Ini bukan pemantauan waktu nyata ketika browser tertutup.

### Aktivasi pembaruan backend

Karena deteksi assignment PPL/PML terjadi di fungsi Apps Script, pemilik proyek yang sudah memasang `TindakLanjut_KelolaPetugas.gs` versi sebelumnya perlu **mengganti isi file tersebut** dengan [versi terbaru dari GitHub](./TindakLanjut_KelolaPetugas.gs), lalu **Terapkan → Kelola penerapan → Edit → Versi baru → Terapkan**. Jangan menambahkan file duplikat yang mendefinisikan fungsi sama. URL web app tetap sama.

Tidak perlu mengubah `KodeV2.gs`, struktur Google Sheets, maupun HTML secara manual; GitHub Loader yang sudah aktif mengambil tampilan terbaru setelah cache berakhir.

## Cara memakai

- **Edit petugas lama:** ketik nama pada Cari Petugas → pilih **Edit Biodata** → ubah nama, email, WhatsApp, atau status Aktif → **Simpan Biodata**.
- **Tambah dari FASIH:** klik **Tambah Petugas**, pilih calon yang baru pada dropdown petugas FASIH, lengkapi nomor WhatsApp, lalu Simpan. ID FASIH digunakan otomatis.
- **Tambah manual:** masukkan ID FASIH jika diketahui. Jika dikosongkan, dibuat ID internal. Petugas dengan ID internal yang tidak tercatat di assignment FASIH **belum bisa menerima pengingat berbasis assignment** sampai sumber FASIH menggunakan ID yang sama.
- **Nonaktifkan:** Edit Biodata → matikan centang Aktif → Simpan. Petugas tetap ada di database dan dapat diaktifkan kembali.
- **Refresh:** tombol Muat Ulang di daftar petugas mengambil data terbaru dari Google Sheets. Tindak Lanjut membaca biodata baru ketika admin kembali dari panel Kelola Petugas.

## Validasi dan perlindungan

- Server hanya mengizinkan **sesi ADMIN** melalui `session_(token,true)`. Operator biasa tidak boleh membaca atau mengubah biodata lewat API baru.
- Nomor WA dan email ganda ditolak agar pengingat tidak salah sasaran.
- Dua admin yang membuka petugas bersamaan tidak dapat diam-diam menimpa perubahan: penyimpanan membandingkan biodata awal dan menolak jika sudah berubah.
- Setiap perubahan memakai penguncian `LockService`; rekam jejak riwayat tidak dihapus.
- Data nama/email/WhatsApp hanya diambil server setelah login admin. Jangan menaruh daftar petugas atau nomor kontak di JSON GitHub publik.
- **Login yang ada masih berbasis email terdaftar, bukan verifikasi kepemilikan email/OTP/SSO.** Untuk pembatasan data yang kuat, autentikasi server perlu ditingkatkan di kemudian hari.

## Pengujian tanpa mengubah produksi

Pengujian otomatis di [petugas-admin.test.mjs](../../scripts/tindak-lanjut/petugas-admin.test.mjs) meliputi edit, tambah, nonaktif/aktif, pencegahan nomor ganda, penolakan sesi nonadmin, perubahan bersamaan, dan pelestarian riwayat. Uji pada data produksi sebaiknya diawali dengan membaca daftar dan membuka form; gunakan petugas uji atau salinan database jika ingin mencoba proses Simpan secara penuh.
