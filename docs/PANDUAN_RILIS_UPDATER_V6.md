# Distribusi Updater BOLO INPEK V6 — langsung melalui GitHub (tanpa Drive)

Pembaruan arsitektur per 13 November 2026.

## Repository

- **Dashboard publik**: `bpsblora/bolo-inpek` (GitHub Pages)
- **Updater internal**: `bpsblora/bolo-inpek-appscript` (GitHub PRIVAT)
- URL resmi versi terbaru: `https://github.com/bpsblora/bolo-inpek-appscript/releases/latest`
- Aset ZIP tetap: `BOLO-INPEK-Updater-Windows.zip`
- URL unduh langsung dari dashboard: `https://github.com/bpsblora/bolo-inpek-appscript/releases/latest/download/BOLO-INPEK-Updater-Windows.zip`

Tautan GitHub privat hanya dapat diakses akun yang memperoleh hak pada repository tersebut. Jangan membuat/membagikan token pribadi di website publik.

## Alur otomatis

1. Source Python dan konfigurasi V6 disimpan di folder `updater-windows/` pada repository privat, **tanpa** file rahasia OAuth, password SSO, .env, token, atau service-account private key.
2. Pada setiap push perubahan sumber Updater, GitHub Actions `publish-updater-windows.yml` menjalankan pemeriksaan versi, parser Python, pengujian yang tersedia, dan build Windows (PyInstaller).
3. Setelah build ZIP lolos, GitHub Actions menerbitkannya sebagai **GitHub Release privat**, lengkap dengan versi terbaru.
4. Tombol **Unduh Updater** dashboard selalu mengarah ke `releases/latest/download/BOLO-INPEK-Updater-Windows.zip`. Tidak perlu mengedit website lagi ketika rilis berubah.
5. Dalam paket Windows terbaru tersedia `Perbarui-Updater-BOLO-INPEK.cmd`. Operator dapat menjalankan file tersebut untuk mengecek/mengunduh rilis terbaru, menyimpan backup versi sebelumnya, dan memasang versi baru. Wajib tutup aplikasi sebelum pembaruan. Akun GitHub perlu login satu kali via GitHub CLI (`gh`).
6. **Perbarui Kondisi Dashboard** tetap tindakan manual di EXE menggunakan VPN FortiClient + Google Chrome/UC + SSO yang sah. Update EXE otomatis **tidak** berarti scraping otomatis.

## Status pelaksanaan

- Website publik dan tombol terbaru sudah diperbarui pada `main`.
- Workflow GitHub privat dan script update Windows sudah dibuat.
- ZIP V6.15 sebelumnya tersedia dari percakapan operator, tetapi source Python **belum dipindahkan seluruhnya** ke repository privat. Karena itu paket V6.15 belum boleh disebut berhasil diterbitkan atau teruji end-to-end.
- Untuk impor satu kali dari ZIP resmi V6.15 ke repo privat, jalankan `Terbitkan_V6_15_ke_GitHub.bat` yang dibundel dalam `BOLO_INPEK_Publikasi_GitHub_V6_15.zip`. Skrip akan login GitHub, mengirim hanya modul yang diperlukan, dan membiarkan GitHub Actions membuat EXE/Release. Skrip ini tetap memerlukan Git + GitHub CLI dan izin push ke repo privat.
- Uji langsung FASIH dan Google Sheets produksi pada Windows tetap terpisah dari validasi build.

## Keamanan dan kegagalan

- Jangan memindahkan berkas ZIP V6 lengkap dengan konfigurasi internal ke GitHub Release **publik**.
- Jika tautan langsung belum berfungsi, periksa `releases/latest` setelah login GitHub; kemungkinan source belum dipush, workflow gagal, atau rilis belum tersedia.
- Tag V2 preview pada repository publik **bukan** Updater V6 dan tidak digunakan.
- Jangan menambahkan PIN/password, OAuth desktop JSON, cookie sesi, file layanan Google, atau hasil assignment beridentitas responden ke GitHub publik.
