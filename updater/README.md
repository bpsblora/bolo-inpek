# BOLO INPEK Updater — Pratinjau Portable Windows

Program berbasis Tkinter untuk menjalankan script scraping lama milik operator dari Windows tanpa membuka VS Code. VPN FortiClient tetap diaktifkan manual. Scraper menggunakan satu akun SSO bersama (misalnya akun dummy instansi yang telah diberi hak survei) dari `.env` privat pada PC. Pengguna tidak perlu mengganti akun SSO setiap kali operator berganti.


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
  FASIH_USERNAME/FASIH_PASSWORD dari `.env` privat pada PC.
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
- Bridge mempertahankan fungsi login SSO bawaan scraper lama dan membaca FASIH_USERNAME serta FASIH_PASSWORD dari `.env` lokal. Username/password tidak dikirim ke GitHub, dashboard, atau log aplikasi.
- ChromeDriver mengikuti versi Chrome setempat, bukan versi yang dikunci pada PC lama.
- Pengambilan assignment, pegawai, status, dan upload Google Sheets masih menggunakan fungsi dari script Python lama.
- Panel Admin (branch dev-admin-v2) mendukung impor, edit dan penyimpanan tujuh field FASIH secara privat. Mode online di Updater membaca Firestore secara langsung; mode lokal tetap tersedia untuk uji.
- BELUM diuji end-to-end dengan VPN/SSO/FASIH asli.

## Persyaratan PC operator

1. Windows, Google Chrome, dan FortiClient VPN yang dikonfigurasi secara resmi.
2. BOLO-INPEK-Updater.exe dari artifact workflow GitHub Actions branch dev-admin-v2.
3. Salinan internal script lama (ambil_data_monitoring_inpek_v2.py), beserta berkas privat pada folder yang sama:
   - .env dengan FASIH_USERNAME, FASIH_PASSWORD, GOOGLE_SPREADSHEET_ID, TINDAK_LANJUT_SPREADSHEET_ID, dan GOOGLE_CREDENTIALS_FILE;
   - credentials.json atau nama file service account dari .env;
   - updater-oauth-desktop.json yang diunduh resmi dari Google Cloud Console (OAuth Desktop JSON). Contoh strukturnya ada di updater/templates/contoh-oauth-desktop.json.
   - updater-settings.json lokal HANYA untuk pengembangan dengan BOLO_UPDATER_USE_LOCAL_SETTINGS=1 pada .env. Tanpa flag, updater selalu memakai URL GitHub Pages resmi.
   - config_survei.json hanya diperlukan untuk mode lokal. Mode online membuat ulang konfigurasi itu secara otomatis setelah login operator berhasil.

File konfigurasi/kredensial dan script internal TIDAK boleh dimasukkan ke repository publik. Pertimbangkan akses Google Sheets per pengguna agar service-account key tidak perlu disalin ke banyak PC.

## Cara menggunakan

1. Aktifkan VPN FortiClient secara manual.
2. Jalankan BOLO-INPEK-Updater.exe.
3. Pilih file ambil_data_monitoring_inpek_v2.py pada PC.
4. Pilih mode **Online** (untuk konfigurasi survei terbaru) atau mode **Lokal** (khusus uji) dan centang konfirmasi VPN.
5. Klik **Periksa Persiapan** untuk memvalidasi dua Sheets dan struktur OAuth secara aman tanpa scraping.
6. Setelah penyiapan disetujui, tekan **Perbarui Data FASIH**. Mode online akan meminta login Google operator untuk membaca konfigurasi privat.
7. Saat Chrome FASIH terbuka, scraper menggunakan akun SSO bersama yang sudah dikonfigurasi. Selesaikan OTP/MFA secara manual apabila sistem memintanya.
8. Tunggu scraping dan upload ke **dua spreadsheet** selesai; periksa keduanya sebelum menganggap data telah sinkron.
9. Periksa waktu dan isi monitoring pada dashboard.

Jangan kirim password, token, cookie, isi .env, atau service-account key ke GitHub/ChatGPT. Akun bersama hanya digunakan sesuai izin pengelola FASIH, dan setiap pembaruan idealnya mencatat identitas operator PC untuk audit.

## Membangun EXE

Workflow: .github/workflows/build-updater.yml, berjalan di Windows menggunakan PyInstaller --onefile --windowed. Hasil tersedia dari Actions > BOLO INPEK Updater Portable (Windows) > Artifacts (preview). EXE tidak menyertakan script lama, .env, credentials.json, atau data kantor.

Untuk menjalankan sumber saat debugging di PC developer:
- py -3.11 -m pip install -r updater/requirements-build.txt
- py -3.11 updater/app.py

## Keamanan dan batasan

- Executable tidak menghubungkan VPN secara otomatis. Login SSO dijalankan oleh fungsi asli scraper menggunakan kredensial akun bersama dari `.env` lokal, setelah operator memilih Perbarui Data.
- Aplikasi memuat file Python lokal tepercaya pilihan operator. Jangan memilih script yang tidak dikenal.
- Tidak menyimpan password SSO di EXE, GitHub, atau log. File `.env` yang berisi kredensial akun bersama tetap menjadi rahasia pada PC yang berwenang; cookie tidak dipindahkan antar komputer.
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
