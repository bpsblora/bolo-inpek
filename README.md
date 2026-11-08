# BOLO INPEK — Monitoring Pendataan BPS Kabupaten Blora

Website aktif (branch main): https://bpsblora.github.io/bolo-inpek/

## Pengembangan BOLO INPEK 2.0 (branch dev-admin-v2)

Branch ini adalah **lingkungan pengembangan**, bukan deploy produksi. Fitur monitoring,
grafik, ekspor Excel/PNG, dan iframe tindak lanjut yang sudah ada tetap digunakan.

### Perubahan di branch ini
- Tambah tombol **Pengaturan Admin** pada header, dengan modal responsif.
- **Kelola Survei:** tambah/edit/nonaktifkan/aktifkan, periode dan kode sumber FASIH.
- **Konfigurasi FASIH admin:** impor `config_survei.json` tujuh-field dari scraper lama; ID disimpan di koleksi `scraper_configs` admin-only, terpisah dari metadata publik. Konfigurasi dapat diunduh lagi untuk BOLO INPEK Updater.
- **Kelola Pegawai:** tambah/edit/nonaktifkan/aktifkan, email, nomor WhatsApp, peran,
  dan tombol impor nama PPL/PML yang ditemukan pada data monitoring.
- Daftar survei dashboard bersifat **dinamis**: berasal dari data API monitoring,
  periode survei, dan konfigurasi admin. Data survei baru tidak lagi ditolak
  hanya karena namanya belum tercantum di kode JavaScript.
- Dua mode penyimpanan yang jelas dipisahkan:
  1. **Pratinjau lokal (default):** setiap perubahan hanya di localStorage browser,
     tidak diteruskan ke Google Sheets atau komputer lain.
  2. **Online bersama (opsional):** Firestore dengan login Google dan izin admin.
- Perubahan tidak langsung diterapkan ke branch main.

### Struktur
- index.html: dashboard lama dan pengait konfigurasi survei dinamis.
- admin.js / admin.css: antarmuka Pengaturan Admin.
- firebase-config.js: konfigurasi publik Firebase; saat ini **null** (preview).
- firestore.rules: aturan keamanan Firestore untuk penggunaan bersama.

## Cara menguji mode pratinjau

Clone branch \`dev-admin-v2\`, kemudian jalankan HTTP server lokal di direktori repo:

\`\`\`bash
git clone --branch dev-admin-v2 https://github.com/bpsblora/bolo-inpek.git
cd bolo-inpek
python -m http.server 8000
\`\`\`

Buka http://localhost:8000, klik **Pengaturan Admin**, lalu:
1. Tambahkan survei percobaan, pastikan muncul sebagai kartu **0 assignment**
   sampai ada data yang ditarik dari FASIH.
2. Edit periode, nonaktifkan, aktifkan kembali; pastikan tampilan berubah.
3. Tambah pegawai; coba edit dan nonaktifkan.
4. Gunakan "Impor Nama Monitoring" setelah API selesai memuat data.
5. Muat ulang halaman: data pratinjau akan tetap ada pada browser yang sama.
6. Pastikan dashboard PML, PPL, status, ekspor, dan tindak lanjut sebelumnya
   tidak mengalami regresi.

**Catatan:** mode pratinjau bukan login admin. Data pratinjau adalah simulasi
yang hanya tersimpan di browser pengguna; jangan mengisi data rahasia.

## Menyalakan database online (belum dilakukan)

Gunakan proyek Firebase resmi yang disetujui pengelola sistem BPS:

1. Buat Firebase project dan Web App; aktifkan **Authentication > Google**.
2. Tambahkan domain \`bpsblora.github.io\` dan domain uji ke daftar authorized
   domains Authentication sesuai lingkungan tes.
3. Aktifkan Cloud Firestore dengan kebijakan wilayah, retensi, dan persetujuan
   keamanan data instansi. Terapkan file \`firestore.rules\` pada Firestore Rules.
4. Dari akun calon admin, login untuk mengetahui UID Firebase Auth.
   Buat dokumen \`admins/{UID}\` melalui Firebase Console dengan isi
   \`{"active": true}\` (Boolean). Jangan membuat menu publik yang bisa
   mengangkat dirinya sendiri sebagai admin.
5. Isi \`window.BOLO_FIREBASE_CONFIG\` di \`firebase-config.js\` dengan web app
   configuration Firebase dari project resmi (bukan password/token FASIH).
6. Uji akun admin dapat menulis survei dan petugas, sementara akun yang
   tidak terdaftar di \`admins\` ditolak oleh Security Rules. Uji dari dua browser
   untuk memastikan perubahan online tersinkron.
7. Baru ajukan persetujuan untuk merge ke \`main\`.

**Keamanan:** koleksi \`surveys\` hanya untuk metadata publik. Jangan menaruh
nomor telepon, kredensial, atau catatan rahasia dalam metadata survei.
Koleksi \`employees\` hanya boleh dibaca dan ditulis admin. Firebase API key
untuk web bukan kunci akses database; perlindungan utamanya Security Rules.
Credential FASIH, service account dan token API harus disimpan di server
(secrets manager), **bukan** di HTML/JavaScript/GitHub Pages.

## Perubahan terbaru — sinkronisasi survei online ke Updater

- **Kelola Survei** di website menyimpan metadata aktif dan ID survei FASIH pada koleksi `surveys` serta `scraper_configs`. Nama survei dan tujuh identitas harus cocok.
- **Updater** (mode Online) membuka login Google operator, memperoleh Firebase Auth ID token, membaca kedua koleksi dengan izin admin/operator, dan menulis konfigurasi survei lengkap ke PC **sebelum** Python berjalan.
- SSO FASIH tetap satu akun bersama yang sudah diberi akses ke semua survei dari .env privat, sementara koneksi FortiClient dan tombol Perbarui tetap manual.
- Bila pengambilan konfigurasi online gagal, akun operator tidak berhak, atau ada survei aktif tanpa ID, pembaruan **dibatalkan** agar tidak diam-diam memakai konfigurasi lama.
- Petunjuk persiapan `updater-settings.json`, OAuth Desktop, Firebase Auth, Firestore Rules dan daftar operator tersedia pada [updater/README.md](updater/README.md).
- **Saat ini mode online belum dapat dipakai pada website aktif**, karena Firebase project dan OAuth Desktop belum dikonfigurasi serta branch masih pengembangan. File `updater-settings.json` sengaja memiliki `enabled: false`. Jangan ubah menjadi true sebelum layanan dan pengujian siap.

## Yang BELUM diintegrasikan

- Updater Portable menjalankan scraping **manual** pada PC operator yang telah mengaktifkan FortiClient VPN. Scraper menggunakan akun SSO bersama yang telah diberi akses survei; kredensial hanya berasal dari .env privat di PC, tidak ditanam di EXE atau GitHub.
  Akun SSO tidak perlu berganti ketika operator berganti. Verifikasi MFA/OTP, jika diminta FASIH, tetap dilakukan manual. Belum diuji end-to-end di jaringan BPS.
- Penambahan survei dari UI akan ikut terbaca oleh Updater pada pembaruan berikutnya setelah Firebase/OAuth diaktifkan; data assignment baru tetap bergantung pada hak SSO bersama di FASIH dan kesesuaian adaptor Python.
- Direktori pegawai baru belum menjadi sumber nomor WhatsApp untuk iframe
  tindak lanjut Apps Script lama. Migrasi kedua sumber data harus dibuat
  dengan pengujian dan persetujuan, agar riwayat tindak lanjut tidak hilang.
- Tidak ada koneksi login admin bersama sebelum Firebase diaktifkan.

## Aturan rilis

Branch \`main\` tetap produksi. Lakukan pengujian UI, integrasi API, otorisasi
Firestore, keamanan privasi data, dan regresi fitur lama terlebih dahulu.
Gabungkan pull request ke \`main\` hanya setelah verifikasi oleh pengelola.
