# BOLO INPEK Updater — Pratinjau Portable Windows

Program berbasis Tkinter untuk menjalankan script scraping lama milik operator dari Windows tanpa membuka VS Code. VPN FortiClient tetap diaktifkan manual. Scraper menggunakan akun SSO yang email/username dan password-nya dimasukkan langsung pada form EXE saat pembaruan. Tidak ada password SSO dalam ZIP atau `.env` pada mode Online.


## Perubahan terakhir: Akun SSO pada aplikasi

- **Email/Username SSO** dan **Password SSO** kini diminta langsung pada jendela EXE.
- Password ditampilkan sebagai titik dan dikosongkan dari form setelah pembaruan dimulai. Mode Online tidak memerlukan `.env` dan `credentials.json`.
- OAuth Desktop JSON ditemukan otomatis di folder EXE atau Download. Untuk membundelnya pada ZIP, pengelola harus menyediakan berkas OAuth Desktop resmi melalui jalur distribusi yang disetujui (misalnya GitHub Actions secret khusus paket). **Jangan mengganti file ini dengan service-account JSON.**
- Tidak ada perubahan pada persyaratan **VPN BPS sebelum akses FASIH** dan status sinkronisasi produksi yang masih nonaktif.

## Integrasi dua Google Sheets secara terpusat (MODE ONLINE)

Kedua target spreadsheet yang sudah diverifikasi memiliki tab:
- **Monitoring Progres BOLO INPEK**: `monitoring`, `periode_survei`, `info_update`, `db_petugas`.
- **Database Tindak Lanjut BOLO INPEK**: `operator`, `petugas`, `survei`, `kontak`, `tindak_lanjut`, `arsip`, `sumber_assignment`, `sumber_petugas`, `sumber_survei`.

ID dokumen Google Sheets **tidak perlu dimasukkan ke kode publik atau ke file konfigurasi tiap PC**. Admin BOLO INPEK menyimpan keduanya **sekali saja** di Firestore, dokumen privat `system_config/sheets`, melalui tab **Integrasi Google Sheets** (saat UI pengembangan sudah diuji/deploy), atau melalui Firebase Console:

- Collection: `system_config`.
- Document ID: `sheets`.
- Field string: `monitoring_id` dan `tindak_lanjut_id`. Nilainya adalah ID dua spreadsheet yang diberikan pengelola.
- Firestore Rules: admin boleh menulis, admin/operator yang terdaftar boleh membaca, pengunjung anonim ditolak.

Saat mode **Online**, operator masuk **Google sekali** melalui OAuth Desktop. Dengan izin `https://www.googleapis.com/auth/spreadsheets`, akses Google tersebut dipakai untuk membuka dan memperbarui kedua spreadsheet menggunakan `gspread.authorize(credentials)`. Dengan demikian **tidak perlu mendistribusikan `credentials.json` service account Google Sheets ke PC pengguna** untuk mode online. Kode autentikasi Google ini masih harus diuji dengan consent screen/izin Google Sheets API yang disetujui pengelola BPS. Pemberian izin OAuth tidak boleh dipakai untuk melewati persetujuan akses instansi.

Mode **Lokal** tetap memakai service account dan kedua ID dari `.env` untuk menjaga kompatibilitas dengan alat lama; bukan model distribusi final. Login SSO Jose Dummy memakai email/username dan password yang diketik pada aplikasi saat pembaruan, bukan file `.env`. VPN tetap diaktifkan manual sebelum portal FASIH diperiksa.

**Penting:** status share dari kedua spreadsheet saat audit tampak memberi hak Editor kepada siapa pun yang mempunyai link. Pemilik menyatakan pengaturan ini memang diperuntukkan bagi internal. Integrasi tidak mengubah izin yang ada; keamanan tetap bergantung pada kontrol distribusi tautan, serta perlu dikaji jika kebijakan akses kantor berubah.

## Uji Login Google (tanpa VPN / FASIH / scraping)

Jika halaman Google Auth Platform sudah menunjukkan Branding tersimpan, jalankan pengujian autentikasi **terpisah** terlebih dahulu:

1. Unduh EXE dari Actions branch `dev-admin-v2`, jalankan Windows portable.
2. Klik tombol **Uji Login Google**. Tidak perlu memilih script Python, mengaktifkan VPN, menyediakan `.env`, atau menyediakan `credentials.json`.
3. Jika `updater-oauth-desktop.json` tersedia pada folder EXE atau folder Download, Updater akan menemukannya otomatis. Jika belum ada, pilih file resmi Desktop OAuth JSON dari Google Cloud Console. File resmi dapat disertakan dalam paket distribusi yang disetujui instansi.
4. Login memakai akun Google operator yang telah diberi izin Firebase (untuk percobaan awal: admin `bpsblora@gmail.com`). Bila Google menampilkan peringatan aplikasi belum diverifikasi karena scope sensitif, ikuti kebijakan keamanan instansi, dan jangan menyetujui izin jika sumber aplikasi tidak terverifikasi/diyakini.
5. Updater menguji pertukaran login Google ke Firebase, membaca dokumen `system_config/sheets`, lalu **membaca saja** metadata tab kedua spreadsheet tujuan melalui akun operator.
6. Pop-up **Uji Login Google Berhasil** hanya muncul setelah seluruh tahap lolos. Jika belum berhasil, lihat alasan kegagalan pada riwayat aplikasi.

Pada tombol diagnostik ini, file publik `updater-settings.json` dibundel sebagai identitas aplikasi yang tidak rahasia. Nilai `enabled: false` tetap berlaku untuk pembaruan produksi; hanya pemeriksaan baca sengaja boleh berjalan tanpa aktivasi. **Tombol diagnostik tidak** menggunakan SSO Jose Dummy, tidak membuka FASIH, tidak menulis file konfigurasi, tidak menyimpan token, tidak menjalankan scraping, dan tidak mengubah Google Sheets. Tetap diperlukan persetujuan dan uji end-to-end terpisah sebelum produksi.

## Urutan VPN → FASIH → SSO (WAJIB)

1. **Operator menyambungkan VPN FortiClient secara manual** sesuai prosedur TI BPS. Aplikasi tidak menghubungkan, mengubah, atau melewati VPN.
2. **Updater memeriksa akses jaringan ke** `https://fasih-sm.bps.go.id/app` melalui HTTPS terverifikasi. Redirect ke halaman SSO dapat dianggap portal sudah terjangkau, tetapi bukan bukti login berhasil.
3. **Jika FASIH tidak terjangkau**, updater berhenti dengan pesan periksa VPN. Tidak membuka Chrome, tidak mengisi akun SSO Jose Dummy, dan tidak mengambil data.
4. Setelah akses portal lolos, updater memeriksa dua Google Sheets dan (mode online) mengambil konfigurasi survei terbaru dengan akun Google operator.
5. **Baru setelah itu Python membuka Chrome dan login SSO dengan akun berwenang yang diisi di form EXE**, kemudian mengambil assignment dan menulis hasil ke Sheets.
6. Sebelum Python asli memulai login SSO, pemeriksaan FASIH dijalankan **ulang secara wajib**. Mekanisme lama yang melanjutkan proses walaupun pemeriksaan koneksi gagal telah dinonaktifkan.

Pemeriksaan portal menilai keterjangkauan jaringan, **bukan** status aplikasi FortiClient secara langsung. Jika portal tiba-tiba tidak bisa diakses saat VPN terputus, scraping dibatalkan sebelum SSO; jika VPN terputus saat scraping berlangsung, proses bisa gagal dan memerlukan pemeriksaan ulang.

## ALUR BARU — Daftar survei langsung dari website (mode online)

Tujuan: Admin menambahkan survei + tujuh identitas FASIH di **Pengaturan Admin
BOLO INPEK**. Pada setiap klik **Perbarui Data FASIH**, updater mengunduh
seluruh survei yang aktif dari Firebase Firestore dan menulis salinan
`config_survei.json` secara atomik *sebelum* menjalankan Python lama.
Dengan begitu perubahan di website berlaku pada running berikutnya, tanpa
mengedit script dan tanpa menyalin JSON antar-PC.

Ada **dua identitas yang berbeda**:
- Google BPS operator updater: dipakai sekali setiap sesi untuk membaca data
  internal Firestore. Operator harus mempunyai hak pada koleksi
  `scraper_configs` (dokumen `operators/{FirebaseUID}` dengan `active: true`,
  atau sudah menjadi admin). Login dilakukan melalui browser Google OAuth
  Desktop; tidak ada refresh token yang disimpan permanen.
- Akun SSO bersama 3316 Jose Dummy: dipakai Python untuk login FASIH dengan
  email/username dan password yang dimasukkan melalui form EXE.
  **FortiClient tetap diaktifkan manual**, dan OTP/MFA tetap manual jika diminta.
  Admin FASIH cukup memberi akses survei baru ke akun bersama tersebut.

### Mengaktifkan sinkronisasi online (belum aktif pada branch pengembangan)

1. Siapkan Firebase resmi dengan Google Authentication dan Cloud Firestore.
   Terapkan `firestore.rules` dari branch pengembangan.
2. Buat dokumen `admins/{UID}` aktif untuk pengelola website. Untuk petugas
   yang hanya boleh memperbarui data, buat `operators/{UID}` aktif
   melalui Firebase Console. Hak operator **hanya membaca** ID FASIH.
3. Buat OAuth 2.0 **Desktop Client** dalam Google Cloud Console pada project
   yang disetujui instansi. Izinkan akun Google operator di OAuth consent
   screen / kebijakan Google Workspace. Pastikan Google provider aktif di
   Firebase Auth. Client ID desktop bersifat publik, bukan password.
4. Isi file `firebase-config.js` untuk website dan
   `updater-settings.json` (root GitHub Pages) dengan:
   - `enabled: true`
   - `firebase_project_id`
   - `firebase_api_key` (web API key Firebase)
   - `google_oauth_desktop_client_id`
   Tiga nilai tersebut adalah konfigurasi publik, **bukan** password SSO
   atau private key akun layanan Google.
5. Dari Pengaturan Admin, impor konfigurasi enam survei atau tambah secara
   manual, lalu simpan ID FASIH lengkap bagi setiap survei aktif.
6. Untuk pengujian pada branch yang belum dipublikasi, letakkan salinan
   `updater-settings.json` di folder script scraper pada PC dan set
   `BOLO_UPDATER_USE_LOCAL_SETTINGS=1` pada .env **khusus pengembangan**.
   Hapus/disable flag ini saat produksi.
   Saat produksi, updater membaca file dari
   https://bpsblora.github.io/bolo-inpek/updater-settings.json .
7. Di updater pilih **Online**, aktifkan VPN, tekan Perbarui, login Google
   operator jika diminta, kemudian proses login akun Jose Dummy terjadi
   di browser FASIH melalui Python lama. Data hasil scrape masuk Sheets.

**Pengaman:** jika Google/Firebase gagal, akun tidak berhak, atau suatu
survei aktif belum punya tujuh identitas, scraping langsung dibatalkan.
Updater tidak diam-diam memakai konfigurasi usang. `config_survei.json`
terakhir hanya diperbarui bila data online lengkap dan valid.

Mode **Lokal (uji)** disediakan sebagai pilihan eksplisit untuk debugging
tanpa Firestore. Jangan menggunakan mode ini untuk mengklaim daftar survei
sudah sinkron dengan website.

**Batasan yang masih harus diuji:** konfigurasi Firebase belum ditetapkan,
login Google OAuth Desktop belum diuji memakai akun BPS resmi, dan scraping
FASIH belum diuji end-to-end melalui VPN pada PC operator.

## Kondisi saat ini

- Antarmuka Windows: pilih file Python, periksa berkas, konfirmasi VPN, mulai scraping, lihat log lokal, dan buka dashboard.
- Bridge mempertahankan fungsi login SSO bawaan scraper lama namun membaca identitas SSO dari form EXE (hanya selama proses berlangsung). Email/password tidak dikirim ke GitHub, dashboard, atau log aplikasi.
- ChromeDriver mengikuti versi Chrome setempat, bukan versi yang dikunci pada PC lama.
- Pengambilan assignment, pegawai, status, dan upload Google Sheets masih menggunakan fungsi dari script Python lama.
- Panel Admin (branch dev-admin-v2) mendukung impor, edit dan penyimpanan tujuh field FASIH secara privat. Mode online di Updater membaca Firestore secara langsung; mode lokal tetap tersedia untuk uji.
- BELUM diuji end-to-end dengan VPN/SSO/FASIH asli.

## Persyaratan PC operator

1. Windows, Google Chrome, dan FortiClient VPN yang dikonfigurasi secara resmi.
2. BOLO-INPEK-Updater.exe dari artifact workflow GitHub Actions branch dev-admin-v2.
3. Salinan internal script lama (ambil_data_monitoring_inpek_v2.py). Untuk **mode Online (direkomendasikan)**, berkas privat yang diperlukan pada PC:
   - Email/username dan password SSO diisikan pada form EXE saat setiap pembaruan. **Tidak perlu file .env untuk mode Online**;
   - updater-oauth-desktop.json yang diunduh resmi dari Google Cloud Console. Contoh format: updater/templates/contoh-oauth-desktop.json;
   - updater-settings.json lokal hanya untuk pengembangan dengan BOLO_UPDATER_USE_LOCAL_SETTINGS=1. Produksi mengambil settings dari GitHub Pages resmi secara online.
4. Mode Online membaca ID dua spreadsheet dan daftar survei dari **Firestore**, sehingga **tidak memerlukan credentials.json service account atau ID Google Sheets lokal**.
5. Mode Lokal lama (khusus debugging) tetap memerlukan GOOGLE_SPREADSHEET_ID, TINDAK_LANJUT_SPREADSHEET_ID dan GOOGLE_CREDENTIALS_FILE pada .env, credentials.json, serta config_survei.json.

File konfigurasi/kredensial dan script internal TIDAK boleh dimasukkan ke repository publik. Izin Google Sheets untuk operator diperiksa melalui login OAuth, tanpa membagikan private key ke tiap PC.

## Cara menggunakan

1. Aktifkan VPN FortiClient secara manual.
2. Jalankan BOLO-INPEK-Updater.exe.
3. Jika paket internal memuat file `ambil_data_monitoring_inpek_v2.py` di sebelah EXE, aplikasi mengisinya otomatis; jika tidak, gunakan tombol Pilih Script.
4. Isi **Email/Username SSO** serta **Password SSO** langsung di EXE, pilih mode Online, kemudian centang konfirmasi VPN BPS.
5. Klik **Periksa Persiapan** untuk memvalidasi struktur OAuth dan akses FASIH (jika VPN telah diaktifkan). Mode Lokal juga memeriksa akses baca kedua Sheets; mode Online memeriksa izin Sheets saat login operator sebelum scraping.
6. Setelah penyiapan disetujui, tekan **Perbarui Data FASIH**. Mode online akan meminta login Google operator untuk membaca konfigurasi privat.
7. Saat Chrome FASIH terbuka, scraper menggunakan akun SSO yang dimasukkan melalui form EXE. Selesaikan OTP/MFA secara manual apabila sistem memintanya.
8. Tunggu scraping dan upload ke **dua spreadsheet** selesai; periksa keduanya sebelum menganggap data telah sinkron.
9. Periksa waktu dan isi monitoring pada dashboard.

Jangan kirim password, token, cookie, isi .env, atau service-account key ke GitHub/ChatGPT. Akun bersama hanya digunakan sesuai izin pengelola FASIH, dan setiap pembaruan idealnya mencatat identitas operator PC untuk audit.

## Membangun EXE

Workflow: .github/workflows/build-updater.yml, berjalan di Windows menggunakan PyInstaller --onefile --windowed. Hasil tersedia dari Actions > BOLO INPEK Updater Portable (Windows) > Artifacts (preview). EXE tidak menyertakan script lama, .env, credentials.json, atau data kantor.

Untuk menjalankan sumber saat debugging di PC developer:
- py -3.11 -m pip install -r updater/requirements-build.txt
- py -3.11 updater/app.py

## Keamanan dan batasan

- Executable tidak menghubungkan VPN secara otomatis. Login SSO dijalankan oleh fungsi asli scraper menggunakan email dan password dari form EXE, setelah operator memilih Perbarui Data.
- Aplikasi memuat file Python lokal tepercaya pilihan operator. Jangan memilih script yang tidak dikenal.
- Tidak menyimpan password SSO di file, EXE, GitHub, atau log; kolom password dikosongkan setelah pembaruan dimulai. Cookie tidak dipindahkan antar komputer.
- Menulis ke Sheets sesuai hak akses konfigurasi lokal.
- Build sukses belum membuktikan Selenium dapat dipakai di FASIH. Uji Chrome, SSO, VPN, dan penulisan spreadsheet wajib sebelum produksi.
- Admin dapat mengubah daftar survei melalui website tanpa mengedit Python. Updater mengambil konfigurasi otomatis saat setiap run setelah Firebase dan OAuth Desktop diaktifkan.
- Jangan letakkan ID FASIH, service-account JSON, ataupun data responden dalam repository publik. Koleksi Firestore scraper_configs dapat dibaca hanya oleh admin atau operator updater yang diberi izin; hanya admin boleh mengubahnya.
- Scraper lama melewati verifikasi sertifikat HTTPS; bridge Updater kini memaksa verifikasi sertifikat pada request FASIH dan sesi API. Jika jaringan BPS memerlukan CA internal, mintakan CA resmi dari IT (jangan menggunakan verify=False).
- Preflight memeriksa kedua spreadsheet sebelum mengambil data dan memblokir pembaruan bila TINDAK_LANJUT_SPREADSHEET_ID tidak dikonfigurasi. Akses baca belum membuktikan akses Editor.
- Ada kunci agar tidak ada dua proses updater dari PC yang sama. **Dua PC berbeda masih dapat berjalan bersamaan**; tetapkan satu operator pada waktu uji sampai koordinasi/lock server selesai.

## Struktur konfigurasi asli (telah diverifikasi dari ZIP)

Setiap objek dalam daftar `surveys` harus mempunyai tujuh field string: `code`, `name`, `survey_id`, `survey_period_id`, `role_pencacah_id`, `role_pengawas_id`, dan `nama_assignment_field`. Untuk enam survei lama, field nama assignment menggunakan `data1`, `data2`, atau `data3` tergantung surveinya.

**Impor konfigurasi dari UI:** buka Pengaturan Admin → Kelola Survei → Impor Config FASIH, pilih file `config_survei.json` dari paket uji privat. Setelah itu, klik **Unduh Config Updater** untuk menghasilkan konfigurasi terbaru (hanya survei aktif) dan pindahkan ke folder script pada PC operator. Pada mode pratinjau data hanya tersimpan di browser; database bersama membutuhkan autentikasi Firebase dan Security Rules yang sudah diterapkan.

**Peringatan:** ZIP asli mengandung file .env dengan kredensial SSO dan credentials.json dengan private key Google. Jangan gunakan ZIP lengkap sebagai paket distribusi. Gunakan paket uji yang sudah dibersihkan dan dapatkan kredensial Sheets melalui prosedur kantor yang aman.
