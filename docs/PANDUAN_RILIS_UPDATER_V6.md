# Publikasi Updater BOLO INPEK V6 — GitHub

Tanggal pemeriksaan: 13 November 2026.

## Kondisi sebenarnya

- Dashboard produksi ada pada branch `main`, bukan halaman `pratinjau/`.
- Tombol **Unduh Updater** mengambil daftar GitHub Releases dari repository `bpsblora/bolo-inpek`.
- Tombol memilih rilis resmi dengan tag `updater-v6.13`, `updater-v6.14`, atau versi sesudahnya, lalu memilih berkas ZIP `BOLO-INPEK-...`, `BOLO_INPEK_...`, atau `Bolo_Inpek_...` lebih besar dari 2 MB.
- **Rilis `updater-v2-preview` sengaja ditolak**, karena bukan pembaruan operasional V6. Sampai tanggal ini, rilis V6 belum tersedia di repository. Tombol harus menampilkan pesan belum tersedia, bukan berpura-pura mengunduh.
- Browser tidak bisa menjalankan Selenium FASIH secara langsung. Aplikasi Windows tetap harus dijalankan manual oleh operator yang berwenang.

## Sebelum menerbitkan rilis V6

**Jangan unggah paket V6.13/V6.14 lengkap yang berisi script atau konfigurasi FASIH internal ke repository GitHub ini. Repository `bpsblora/bolo-inpek` bersifat PUBLIC; lampiran Releases juga bisa diunduh publik.** Kredensial SSO, token, cookie, `.env`, `credentials.json`, key service account, serta salinan assignment/responden tidak boleh dibundel.

Jika paket Windows bisa bekerja tanpa memublikasikan komponen internal, siapkan hanya distribusi publik yang sudah disetujui instansi. Verifikasi isi ZIP (termasuk subfolder) sebelum upload. Untuk paket yang memang memerlukan script internal, simpan di repository/private distribution yang aksesnya dibatasi, bukan di GitHub Releases publik. Dashboard publik perlu disesuaikan dengan mekanisme akses privat sebelum tombol dapat digunakan untuk paket tersebut.

## Cara menerbitkan paket PUBLIK yang sudah aman dan disetujui

1. Buka `https://github.com/bpsblora/bolo-inpek/releases`.
2. Pilih **Draft a new release**.
3. Buat tag **`updater-v6.14`** (contoh), dengan nama rilis yang menjelaskan apakah ini rilis uji atau produksi.
4. Lampirkan berkas seperti **`BOLO_INPEK_UPDATER_V6_14.zip`** (harus lebih besar dari 2 MB). Jangan lampirkan source privat atau OAuth/kredensial terlarang.
5. Cek isi dan SHA-256 ZIP sebelum publikasi, uji ekstraksi serta program pada Windows yang berizin, lalu **Publish release**.
6. Buka kembali dashboard, klik **Unduh Updater**. Status rilis/ukuran ZIP akan tampil dan tombol unduhan menjadi aktif. Tidak perlu mengedit HTML untuk rilis versi berikutnya asalkan format tag tetap sesuai.
7. Uji mode online menggunakan VPN FortiClient + Google Chrome/undetected_chromedriver + SSO FASIH, tanpa mengekspos kredensial pada GitHub/website.

## Perbedaan tombol

- **Kelola Survei**: tambah/edit/aktif/nonaktif/hapus survei dan periode pada backend Apps Script Google Sheets yang sudah ada.
- **Unduh Updater**: mengunduh aplikasi Windows yang benar-benar sudah diterbitkan dan lolos pemeriksaan versi.
- **Perbarui Survei (di aplikasi Windows)**: membaca konfigurasi aktif dari sumber online. Survei nonaktif tidak dicacah/scrape. Filter visual Semua/Aktif/Nonaktif di panel admin hanya untuk melihat daftar; nilai `aktif` yang tersimpan menentukan cakupan scraping.
- **Perbarui Kondisi Dashboard (di aplikasi Windows)**: sinkronisasi assignment ke Sheets setelah VPN/SSO siap; jangan dijalankan dari web publik.

## Masalah bila tidak ada unduhan

- **“Belum tersedia”**: belum ada rilis V6 dengan ZIP resmi yang sesuai; bukan gangguan browser.
- **“HTTP 403/429”**: permintaan daftar rilis ke GitHub terkena pembatasan; tunggu atau gunakan koneksi operator yang diizinkan.
- **Versi yang ditemukan keliru**: periksa tag `updater-v6.14`, nama asset dengan awalan BOLO INPEK dan akhiran `.zip`, status rilis bukan draft, dan ukuran berkas >2 MB.
- **Tidak cocok untuk distribusi publik**: jangan mengakali dengan merilis paket internal sebagai ZIP publik. Pakai jalur internal berizin.

Pemeriksaan fungsi tombol dan parser JavaScript telah dilakukan secara statis; **fungsi unduh V6 end-to-end belum dapat dinyatakan berhasil sampai berkas V6 sungguh diterbitkan dan diuji di Windows**.
