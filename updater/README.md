# BOLO INPEK Updater — Pratinjau Portable Windows

Program berbasis Tkinter untuk menjalankan script scraping lama milik operator dari Windows tanpa membuka VS Code. VPN FortiClient tetap diaktifkan manual dan login SSO FASIH tetap dilakukan manusia melalui Chrome.

## Kondisi saat ini

- Antarmuka Windows: pilih file Python, periksa berkas, konfirmasi VPN, mulai scraping, lihat log lokal, dan buka dashboard.
- Bridge mengganti login username/password otomatis pada script lama menjadi login SSO manual; tidak membaca FASIH_USERNAME dan FASIH_PASSWORD dari .env.
- ChromeDriver mengikuti versi Chrome setempat, bukan versi yang dikunci pada PC lama.
- Pengambilan assignment, pegawai, status, dan upload Google Sheets masih menggunakan fungsi dari script Python lama.
- BELUM terhubung ke daftar survei online Pengaturan Admin. Sementara daftar survei scraping masih berasal dari config_survei.json lokal.
- BELUM diuji end-to-end dengan VPN/SSO/FASIH asli.

## Persyaratan PC operator

1. Windows, Google Chrome, dan FortiClient VPN yang dikonfigurasi secara resmi.
2. BOLO-INPEK-Updater.exe dari artifact workflow GitHub Actions branch dev-admin-v2.
3. Salinan internal script lama (ambil_data_monitoring_inpek_v2.py), beserta file lokal:
   - config_survei.json
   - .env dengan GOOGLE_SPREADSHEET_ID dan GOOGLE_CREDENTIALS_FILE
   - credentials.json atau nama file service account yang dikonfigurasi.

File konfigurasi/kredensial dan script internal TIDAK boleh dimasukkan ke repository publik. Pertimbangkan akses Google Sheets per pengguna agar service-account key tidak perlu disalin ke banyak PC.

## Cara menggunakan

1. Aktifkan VPN FortiClient secara manual.
2. Jalankan BOLO-INPEK-Updater.exe.
3. Pilih file ambil_data_monitoring_inpek_v2.py pada PC.
4. Periksa status file dan centang konfirmasi VPN.
5. Tekan Perbarui Data FASIH, lalu konfirmasi jalankan script lokal.
6. Saat Chrome terbuka, login SSO/OTP manual jika diminta.
7. Tunggu scraping dan upload Google Sheets selesai.
8. Periksa waktu dan isi monitoring pada dashboard.

Jangan kirim password, token, cookie, isi .env, atau service-account key ke GitHub/ChatGPT.

## Membangun EXE

Workflow: .github/workflows/build-updater.yml, berjalan di Windows menggunakan PyInstaller --onefile --windowed. Hasil tersedia dari Actions > BOLO INPEK Updater Portable (Windows) > Artifacts (preview). EXE tidak menyertakan script lama, .env, credentials.json, atau data kantor.

Untuk menjalankan sumber saat debugging di PC developer:
- py -3.11 -m pip install -r updater/requirements-build.txt
- py -3.11 updater/app.py

## Keamanan dan batasan

- Executable ini tidak melakukan koneksi VPN maupun login SSO otomatis.
- Aplikasi memuat file Python lokal tepercaya pilihan operator. Jangan memilih script yang tidak dikenal.
- Tidak menyimpan password SSO dan tidak menyebarkan cookie antar komputer.
- Menulis ke Sheets sesuai hak akses konfigurasi lokal.
- Build sukses belum membuktikan Selenium dapat dipakai di FASIH. Uji Chrome, SSO, VPN, dan penulisan spreadsheet wajib sebelum produksi.
- Pada versi sekarang config_survei.json masih lokal; integrasi langsung dengan konfigurasi survei online merupakan pengembangan tahap berikutnya.
