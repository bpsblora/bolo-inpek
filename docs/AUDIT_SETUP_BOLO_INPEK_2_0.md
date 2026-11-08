# Audit Kesiapan BOLO INPEK 2.0
Status: BELUM SIAP UAT FASIH ASLI — kode disiapkan pada branch dev-admin-v2, main tetap produksi.

## Arsitektur yang disepakati
Admin mengelola daftar survei aktif dan tujuh ID FASIH via panel website. Firebase menyimpan metadata publik dan konfigurasi scraper privat pada koleksi berbeda. Updater portable di PC operator mengambil konfigurasi aktif tiap kali tombol Perbarui ditekan, lalu Python lama login FASIH menggunakan akun SSO bersama. FortiClient VPN tetap dinyalakan manual; data disimpan ke dua Google Sheets lama, dashboard GitHub Pages menampilkan hasil.

## Status audit
| Aspek | Status | Syarat sebelum UAT |
|---|---|---|
| Dashboard GitHub Pages lama | Dipertahankan | Uji regresi, jangan merge main |
| Panel Kelola Survei/Pegawai | Kode siap, preview lokal | Aktifkan Firebase Auth/Firestore resmi |
| Tujuh ID survei FASIH | UI impor/edit/ekspor ada | Impor enam survei awal sebagai data private |
| Firebase rules | File tersedia | Deploy dan uji hak akses nyata |
| Auth admin/operator | Alur disiapkan | Daftarkan UID admin dan operator yang sah |
| OAuth Desktop untuk updater | Kode PKCE dan contoh ada | Buat client di Google Cloud resmi, sediakan JSON lokal |
| Updater portable Windows | Build/tes otomatis | Tes antivirus, Chrome, VPN, SSO pada PC BPS |
| Akun SSO bersama | Alur login lama dipertahankan | Beri akses seluruh survei aktif |
| Dua Google Sheets | Preflight baca disiapkan | Pastikan kedua spreadsheet, backup, izin Editor |
| HTTPS FASIH | Bridge memaksa verifikasi TLS | Jika perlu CA internal, mintakan dari IT |
| Parallel updater 1 PC | Kunci lokal disiapkan | Uji mutex saat UAT |
| Parallel updater 2 PC | BELUM terblokir secara global | Tetapkan satu operator saat UAT; wajib lock/koordinasi sebelum rilis luas |
| Firebase produksi | BELUM aktif | Template sengaja disabled untuk mencegah salah sambung |

## A. Setup Firebase dan otorisasi Google (tanggung jawab admin TI)
- [ ] Gunakan Firebase project yang disetujui BPS. Hindari memakai project aplikasi lain tanpa izin dan pemisahan akses.
- [ ] Aktifkan Cloud Firestore di lokasi yang sesuai ketentuan data instansi.
- [ ] Aktifkan Firebase Authentication provider Google.
- [ ] Tambahkan bpsblora.github.io sebagai Authorized Domain untuk aplikasi yang nanti dirilis.
- [ ] Buat Firebase Web App. Isi firebase-config.js: apiKey, authDomain, projectId, appId. Ini hanya konfigurasi publik.
- [ ] Terapkan firestore.rules dari branch dev-admin-v2 ke project yang benar.
- [ ] Buat dokumen admins/{FirebaseUID} dengan active=true untuk pengelola website.
- [ ] Buat dokumen operators/{FirebaseUID} dengan active=true untuk pengguna updater: operator hanya bisa membaca ID FASIH, tidak mengedit survei.
- [ ] Uji anonymous/nonadmin DITOLAK baca scraper_configs; operator diizinkan baca tapi ditolak tulis; admin diizinkan kelola.
- [ ] Konfigurasikan consent screen Google Cloud, lalu buat OAuth 2.0 Client bertipe Desktop App. Simpan hasil unduhan privat sebagai updater-oauth-desktop.json pada PC operator.
- [ ] Aktifkan nilai di updater-settings.json hanya setelah setup lengkap: enabled=true, firebase_project_id, firebase_api_key, google_oauth_desktop_client_id.
- [ ] Selama development branch belum dipublikasikan, letakkan salinan updater-settings.json di folder script lokal untuk uji. Jangan mengaktifkan main secara prematur.

## B. FASIH dan akun SSO bersama (PJ survei dan TI)
- [ ] Konfirmasi bahwa penggunaan akun bersama Jose Dummy untuk pengambilan data diizinkan sesuai kebijakan BPS.
- [ ] Akun tersebut mendapat akses tiap survei aktif dan periode yang benar. Jika menambah survei di website, undang akun yang sama di FASIH juga.
- [ ] Siapkan tujuh field per survei: code, name, survey_id, survey_period_id, role_pencacah_id, role_pengawas_id, nama_assignment_field.
- [ ] Impor konfigurasi enam survei yang benar melalui Pengaturan Admin; simpan ID FASIH hanya pada koleksi scraper_configs admin/operator-only.
- [ ] VPN FortiClient aktif manual di PC operator; Chrome terbaru tersedia. OTP/MFA tetap manual jika muncul; jangan melewati autentikasi.
- [ ] Login SSO di Python membaca FASIH_USERNAME/FASIH_PASSWORD dari file .env privat PC, bukan dari GitHub, EXE, ataupun Firebase.
- [ ] Jika jaringan menggunakan CA internal, minta file sertifikat resmi untuk REQUESTS_CA_BUNDLE. Jangan mengizinkan verify=False.

## C. Google Sheets dan data (pengelola data)
- [ ] Siapkan GOOGLE_SPREADSHEET_ID dan TINDAK_LANJUT_SPREADSHEET_ID yang berbeda secara eksplisit pada .env privat.
- [ ] Share izin Editor ke service account yang disetujui pada **kedua** spreadsheet. Jangan memberi izin luas ke folder lain.
- [ ] Tab wajib monitoring: monitoring, periode_survei, db_petugas; siapkan juga info_update.
- [ ] Tab sumber tindak lanjut: sumber_assignment, sumber_petugas, sumber_survei; pastikan header cocok. Jangan menghapus catatan operasional/tindak lanjut yang dikelola Apps Script.
- [ ] Backup kedua spreadsheet dan Apps Script relevan sebelum menguji penulisan data.
- [ ] Gunakan salinan staging untuk UAT awal. Preflight aplikasi hanya menguji akses baca; hak Editor perlu dibuktikan saat uji terbatas.
- [ ] Evaluasi rotasi/revokasi password SSO dan private key service account yang pernah berada di ZIP asli sebelum distribusi ke PC lain.
- [ ] Dua spreadsheet tidak memiliki transaksi atomik lintas-file; gangguan upload kedua harus dicatat dan direkonsiliasi sebelum dashboard dinyatakan mutakhir.

## D. Setup PC Windows operator
- [ ] PC telah disetujui IT dan mempunyai FortiClient, Chrome, izin menjalankan EXE internal.
- [ ] Ambil file BOLO-INPEK-Updater.exe dari artifact GitHub Actions yang lulus, bukan dari sumber tidak dikenal.
- [ ] Simpan script lama ambil_data_monitoring_inpek_v2.py di folder lokal terbatas; jangan unggah script mentah ke repository publik.
- [ ] Siapkan .env, credentials.json (private key Google Sheets), updater-oauth-desktop.json (OAuth Desktop Client dari konsol resmi). Contoh kosong tersedia dalam updater/templates.
- [ ] Pastikan konfigurasi Firebase online aktif dan account Google operator masuk whitelist operators/admins; login Google operator terpisah dari SSO Jose Dummy.
- [ ] Jalankan tombol Periksa Persiapan; hasilnya hanya memeriksa struktur dan akses baca tanpa login FASIH atau mengubah data.
- [ ] Untuk UAT, satu operator mengunggah pada satu waktu. Kunci per-PC tidak mencegah pembaruan bersamaan antar-PC.

## E. Tahapan UAT SESUDAH semua persiapan
1. Uji hak akses Firebase: admin tulis; operator baca; anonim/nonaktif ditolak.
2. Impor konfigurasi enam survei; tambahkan survei ketujuh dengan tujuh ID benar, kemudian jalankan updater mode online. Daftar harus berubah tanpa modifikasi kode Python.
3. Uji deaktivasi survei, ID tidak lengkap, database/offline gagal: updater harus batal, tidak menulis hasil parsial.
4. Uji VPN manual, otomatisasi form SSO bersama, OTP bila ada, TLS, sertifikat dan kompatibilitas Chrome.
5. Jalankan scraping dari PC uji menuju dua spreadsheet staging. Verifikasi assignment, nama usaha, status, PPL/PML, periode, info_update.
6. Uji tindak lanjut WhatsApp, penutupan periode, ekspor, navigasi PML/PPL dan dashboard multi-browser.
7. Uji kegagalan upload kedua spreadsheet dan pemulihan dari backup. Catat operator, waktu, jumlah assignment, status kesuksesan.
8. Sebelum rilis luas: tentukan dan uji mutex/koordinasi lintas-PC serta rotasi/penyimpanan kredensial yang memadai.

## F. Informasi dan akses yang masih harus disediakan
Persetujuan project Firebase/Cloud; konfigurasi PUBLIK Web App (apiKey, authDomain, projectId, appId); OAuth Client Desktop yang disimpan privat pada PC; UID akun admin/operator; izin akun Jose Dummy untuk seluruh survei; dua Sheet staging beserta backup dan hak Editor; PC Windows dengan VPN yang disetujui; keputusan CA internal bila dibutuhkan. **Jangan mengirim password, isi .env, private key, cookie atau token melalui chat maupun repository publik.**

## Batasan dan release gate
- Main masih produksi, PR #1 tetap Draft.
- firebase-config.js saat ini null dan updater-settings.json enabled=false, jadi koneksi online nyata BELUM aktif.
- Build Windows dan unit test hanya membuktikan kode dasar dapat dijalankan, bukan integrasi VPN/SSO/FASIH.
- Pengujian harus memakai staging dan akses sah. Produksi baru setelah hasil UAT diterima oleh pengelola.
