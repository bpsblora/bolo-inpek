# Kelola Survei BOLO INPEK — Google Sheets (V6)

**Sumber tunggal:** tab `konfigurasi_survei` pada Spreadsheet Monitoring. **Tidak perlu GitHub Token.**

## Alur
1. Admin klik **Kelola Survei** pada dashboard, lalu tambah/edit/nonaktifkan dan Simpan.
2. Backend Apps Script menyimpan konfigurasi privat di `konfigurasi_survei`, memperbarui `periode_survei`, serta mencatat `riwayat_konfigurasi`.
3. Dashboard membaca **nama, tanggal, status aktif, dan urutan** survei dari endpoint publik Apps Script (atau API `periode_survei` selama belum terhubung). ID teknis FASIH **tidak** dipublikasikan.
4. Pada Updater Portable V6, klik **Perbarui Survei**; login Google berizin, lalu `config_survei.json` lokal diperbarui secara atomik dengan cadangan versi sebelumnya.
5. Chrome + UC dan pembacaan FASIH tetap memakai sistem V4.2 yang telah berhasil diuji pengguna.

## Instalasi backend sekali
Paket V6 menyediakan `backend_google_sheets/Code.gs` dan `Admin.html`. Unggah keduanya ke proyek Apps Script. Tambahkan **Script Properties**:
- `SPREADSHEET_ID`: ID Spreadsheet Monitoring
- `ADMIN_EMAILS`: email admin BPS yang diizinkan, pisahkan koma

Deploy proyek sebagai **dua Web App**:
- **ADMIN_URL**: Execute as *User accessing the web app*, akses domain/akun BPS sesuai kebijakan kantor.
- **PUBLIC_URL**: Execute as *Me*, akses *Anyone* hanya untuk metadata tidak sensitif melalui `?action=public`. Gunakan hanya bila kebijakan instansi mengizinkan.

Setelah deployment, isi `kelola-survei-link.json` sekali dengan:
```json
{
  "admin_webapp_url": "https://script.google.com/macros/s/ADMIN_DEPLOYMENT/exec",
  "public_config_url": "https://script.google.com/macros/s/PUBLIC_DEPLOYMENT/exec",
  "setup_required": false,
  "source": "google_sheets"
}
```
**Jangan isi contoh URL di atas sebelum mendapat URL riil dari Apps Script.**

## Keamanan dan batasan
- Tab `konfigurasi_survei` privat; jangan publish/share ke publik.
- Aksi tambah/edit/nonaktifkan diverifikasi email admin di Apps Script, bukan hanya menyembunyikan tombol.
- Tidak menaruh token GitHub, password SSO, atau ID teknis FASIH di HTML publik.
- Tombol sinkronisasi `status_asli` V4.2/V6 hanya menulis monitoring kolom F; pembaruan assignment baru A:E memerlukan proses sinkronisasi data penuh yang terpisah.
- **Status saat ini:** kode dashboard dan updater telah disiapkan. Deployment Apps Script, pengujian SSO/VPN di Windows dan verifikasi data Google Sheets asli masih diperlukan dengan akses kantor.

## Penyempurnaan V6.3 — Periode FASIH dan Kelola Survei dalam satu Apps Script

**Tidak ada Apps Script atau Spreadsheet baru.** Perbarui `Code.gs` pada proyek Apps Script Kelola Survei yang sudah dipakai. Paket V6.3 memuat `backend_google_sheets/Code.gs` yang tetap kompatibel dengan dua deployment ADMIN dan PUBLIK lama. Sesudah menyimpan kode, perbarui **New version** pada masing-masing deployment (jangan membuat URL baru).

- Updater membuka Chrome + UC melalui VPN/SSO FASIH yang sah dan mengambil `startDate`, `endDate`, serta nama periode berdasarkan `survey_period_id` dari FASIH.
- Google Sheets `konfigurasi_survei` hanya memperoleh pembaruan `tanggal_mulai` dan `tanggal_selesai`; `periode_survei` hanya pembaruan tanggal dan `nama_periode`. Kolom `monitoring` **tidak disentuh** oleh sinkronisasi periode.
- Apps Script yang direvisi tidak mengembalikan tanggal atau `nama_periode` FASIH menjadi nilai lama ketika administrator menyimpan edit survei. Kode juga menjaga formula dan kolom tambahan pada tab `periode_survei` agar tidak ditulis ulang.
- Bila admin mengganti `survey_period_id`, tanggal lama tidak boleh mengikuti periode baru. Tanggal periode baru masih kosong sampai proses sinkronisasi FASIH berhasil.
- Dashboard memperoleh nama survei dan tanggal lewat `public_config_url` Apps Script dan mengurutkan kartu berdasarkan deadline terdekat (tanggal mulai sebagai penentu kedua; survei tanpa tanggal akhir berada di belakang).

Langkah operasional: **Kelola Survei → Simpan → Perbarui Survei (EXE) → Sinkronkan Periode FASIH (EXE) → Muat Ulang dashboard**. Pelaksanaan perlu akun VPN/SSO berizin serta izin tulis ke Spreadsheet Monitoring yang sama. Jika salah satu periode tidak dapat dibaca dengan valid, updater membatalkan penulisan.

**Pengujian:** parser/penulis tanggal lulus simulasi; kode Apps Script lulus simulasi pelestarian data historis, pergantian ID periode, dan deteksi duplikasi. Belum diuji langsung terhadap FASIH/Google Sheets produksi. Versi Apps Script belum dapat dideploy langsung melalui akses percakapan ini; deployment perlu dilakukan oleh pengelola proyek yang memiliki izin.

## V6.4 — Sinkronkan Semua Assignment dari FASIH ke monitoring

Updater Portable V6.4 menambahkan **Sinkronkan Semua Assignment**. Fitur ini berjalan sesudah **Perbarui Survei**, menggunakan daftar survei aktif dari `konfigurasi_survei` (Sheets yang sama) dan Chrome + UC/SOO FASIH yang sudah berjalan pada V6.3.

- Membaca seluruh assignment dari API FASIH dengan pagination terverifikasi, beserta daftar PPL/PML dan riwayat tanggung jawab.
- Membangun kolom `monitoring` **A:F**: `survei`, `nama_assignment`, `status`, `ppl`, `pml`, `status_asli`.
- Baris lama yang identitasnya cocok diperbarui **pada baris yang sama**. Assignment baru ditambahkan di bagian paling bawah rentang terpakai. Kolom **G dan seterusnya** tidak disentuh.
- Assignment dari survei yang telah diarsipkan dipertahankan; tidak ada penghapusan otomatis.
- Bila ada assignment lama survei aktif yang hilang pada hasil FASIH, nama assignment ganda, konflik perubahan Google Sheets, atau formula A:F, program **membatalkan** penulisan untuk mencegah kerusakan data.
- Jika FASIH tidak mengembalikan nama petugas yang dapat dipastikan untuk assignment yang sudah ada, nama lama dipertahankan dan jumlahnya dijelaskan dalam pratinjau.
- Membuat backup privat monitoring dan info_update di folder `%LOCALAPPDATA%\\BOLO_INPEK\\backup_monitoring_penuh`, menampilkan **pratinjau serta konfirmasi kedua**, lalu menulis dalam satu permintaan nilai batch dan membaca balik hasilnya untuk verifikasi.
- Waktu `info_update!B2` dan jumlah `info_update!B4` diperbarui setelah penulisan. **Tidak** memodifikasi tab `konfigurasi_survei`, `periode_survei`, `db_petugas`, atau basis data tindak lanjut.
- Spreadsheet ID paket V6.4 menggunakan ID yang telah diverifikasi oleh operator setelah memperbaiki kekeliruan satu karakter pada V6.3.
- Tombol **Uji Baca**, **Sinkronkan Status Asli**, dan **Sinkronkan Periode FASIH** tetap tersedia.

**Tidak memerlukan redeploy Apps Script Kelola Survei** untuk fitur penulisan assignment ke tab monitoring. Setelah verifikasi sukses, muat ulang dashboard BOLO INPEK.

**Status validasi:** 17 pengujian logika lokal lulus, tampilan GUI diuji dengan virtual display pada lebar 760 dan 1130 px, ZIP diperiksa, dan hash EXE/runtime dipertahankan dari V6.3. **Belum diuji end-to-end pada Windows/VPN/Sheets produksi**, sehingga operator harus memeriksa hasil pratinjau sebelum klik YA dan mengonfirmasi nilai monitoring setelah sinkronisasi pertama.

## V6.5 — Perbaikan nama assignment ganda memakai ID FASIH

**Masalah nyata 11 November 2026:** V6.4 membaca tujuh survei dan total **391 assignment** (STPIM 65, SKTH 27, SIBSTR II 19, CAPTIVE POWER 4, MINERBA 1, MIGAS 2, VIMK_TH26 264). Penulisan dibatalkan sebelum pratinjau karena beberapa assignment STPIM mempunyai nama sama, misalnya `JP DECAL FACTORY STICKER`.

**Perbaikan Updater Portable V6.5:**
- Gunakan identitas **`(survey_period_id, assignment_id)` dari FASIH**, bukan kombinasi nama survei dan nama usaha. Duplikat nama dengan ID berbeda merupakan assignment sah.
- Sesudah pratinjau disetujui, buat tab internal tersembunyi **`assignment_identitas`** pada **Spreadsheet Monitoring yang sama**, berisi `survei`, `survey_period_id`, `assignment_id`, `nama_assignment`, dan `monitoring_row`. **Jangan mengurutkan/menyisipkan baris `monitoring` secara manual** setelah pemetaan, karena nomor baris dipakai sebagai rujukan dan akan divalidasi.
- Saat migrasi pertama dari `monitoring!A:F` yang belum memiliki ID, cocokkan dengan nama/status/status asli/PPL/PML; bila beberapa ID masih ambigu dan nilainya berbeda, **blokir penulisan** untuk mencegah tertukarnya status/petugas. Jika kandidat identik pada A:F, ID dapat dipasangkan deterministik, lalu disimpan untuk sinkronisasi berikutnya.
- Setelah pemetaan, **Sinkronkan Semua Assignment** memakai ID, mempertahankan nama aslinya dan kolom `G+`; baris baru ditambah tanpa menghapus baris lama. **Sinkronkan Status Asli** (F) juga memakai peta ID bila tersedia.
- Backup, pratinjau operator, pemeriksaan perubahan saat pratinjau, dan verifikasi pascatulis tetap wajib. **Tidak ada perubahan Apps Script atau URL deployment**.
- **Pengujian:** 23 tes simulasi lulus, ZIP CRC dan berkas executable diverifikasi; **belum diuji end-to-end** terhadap Google Sheets produksi/VPN pada komputer Windows pengguna.

## V6.6 — Normalisasi status FASIH Admin Provinsi

Bug yang teridentifikasi dari `monitoring` produksi, 11 November 2026:
- `COMPLETED BY Admin Provinsi` (dua MIGAS dan satu MINERBA) masuk `LAINNYA`, karena tidak ada di kamus status Updater V6.5.
- `REJECTED BY Admin Provinsi` keliru dimasukkan `COMPLETE`.

Updater V6.6 memperbaiki **dua jalur pemetaan** pada `reader_core.py` dan `ambil_data_monitoring_inpek_v2.py`:
- `COMPLETED BY Admin Provinsi` (termasuk variasi `COMPLETE BY`) → `COMPLETE`.
- `REJECTED BY Admin Provinsi` → `REJECT`.
- `APPROVED BY Admin Provinsi` tetap `COMPLETE`.
- Variasi kapital dan spasi berlebih ditoleransi.

**Kolom F `status_asli` tetap mempertahankan teks asli FASIH**; kolom C `status` diperbarui melalui **Sinkronkan Semua Assignment** menggunakan peta ID unik V6.5. Tidak perlu mengubah Apps Script Kelola Survei atau menambah kategori visual.

**Distribusi:** `Bolo_Inpek_V6_6.zip` portable lengkap dan `Patch_Bolo_V6_6.zip` untuk mengganti tiga berkas sumber `.py` pada folder V6.5 yang ditutup. Keduanya memelihara runtime Chrome+UC lama.

**Pengujian:** 38 kasus normalisasi untuk dua jalur fungsi lulus; ZIP/CRC sukses. Belum diuji ulang langsung pada FASIH/Google Sheets produksi, jadi verifikasi pratinjau dan log penulisan terlebih dahulu.

## V6.7 — **Status FASIH apa adanya, kapital semua** (menggantikan kebijakan V6.6)

Permintaan pengguna 11 November 2026: **JANGAN** gabungkan status Kabupaten dan Provinsi pada kode `COMPLETE` atau `REJECT` generik. Satu status FASIH = satu status BOLO INPEK, semuanya dirapikan dengan kapital dan spasi tunggal.

| Tahap dari FASIH | `monitoring!C` / dashboard |
|---|---|
| `Completed by Admin Kabupaten` | `COMPLETED BY ADMIN KABUPATEN` |
| `Completed by Admin Provinsi` | `COMPLETED BY ADMIN PROVINSI` |
| `Approved by Admin Provinsi` | `APPROVED BY ADMIN PROVINSI` |
| `Rejected by Admin Provinsi` | `REJECTED BY ADMIN PROVINSI` |
| `Rejected by Pengawas` | `REJECTED BY PENGAWAS` |
| `Submitted by Pencacah` | `SUBMITTED BY PENCACAH` |
| `Open` / `Draft` | `OPEN` / `DRAFT` |

Tidak ada lagi kategori ringkas `COMPLETE` pada data baru. Status lain yang resmi dikembalikan FASIH tetap tampil menggunakan nama status asli (kapital semua); status kosong menjadi `STATUS TIDAK TERSEDIA`, bukan COMPLETE. `status_asli` kolom F **tetap menyimpan string asli FASIH**, untuk jejak audit (boleh mengandung kapitalisasi sumber yang berbeda).

**Pelaksanaan:** Dashboard `index.html` sudah diperbarui pada GitHub agar membaca status dinamis yang ada di tiap survei (kartu, donat, tabel PPL/PML, rincian, Excel, PNG). Selanjutnya pasang Updater V6.7 (paket lengkap `Bolo_Inpek_V6_7.zip` atau patch `Patch_Bolo_V6_7.zip`) lalu **Perbarui Survei → Sinkronkan Semua Assignment**. Operator harus memeriksa pratinjau dan log `TERVERIFIKASI`. Proses ini mengubah kolom C berdasarkan FASIH; kolom F tidak ditimpa oleh normalisasi dan peta ID assignment dipertahankan. **Tidak perlu Apps Script Kelola Survei baru.** Namun, API Apps Script **Monitoring** yang dibaca dashboard wajib mengirim kolom C tanpa memaksa enam kode lama; jika API punya whitelist status lama, kode API tersebut juga harus disesuaikan.

**Penting:** Kebijakan di bagian V6.6 di atas berlaku untuk updater V6.6 saja dan **tidak digunakan lagi** pada V6.7. Jangan jalankan V6.6 setelah mulai menggunakan V6.7, sebab status rinci dapat berubah kembali menjadi kategori ringkas.

**Validasi:** 34 pemeriksaan normalisasi Python pada dua jalur, uji idempotensi peta ID, pemeriksaan CRC ZIP, parser JavaScript kedua script dashboard, dan simulasi empat status yang berbeda telah lulus. Belum dilakukan uji langsung end-to-end terhadap FASIH atau Google Sheets produksi menggunakan V6.7.

## V6.8 — Cakupan survei otomatis tanpa dropdown

Updater V6.8 menghapus pemilihan survei manual dari bagian **3. Cakupan Pembaruan Otomatis**. **Semua operasi** (Uji Baca, Sinkronkan Semua Assignment, Sinkronkan Status Asli, dan Sinkronkan Periode FASIH) selalu menyertakan **seluruh survei aktif** dari registry `konfigurasi_survei`. Perbarui Survei secara manual atau saat startup tetap membaca konfigurasi online dan memperbarui cache `config_survei.json`.

Bagian cakupan sekarang menunjukkan daftar seluruh survei aktif, jumlah survei dan dua kelompok:
- **Baru Ditambahkan**: identitas `code + survey_period_id` yang baru ditemukan relatif terhadap riwayat lokal dan belum berhasil disinkronkan penuh.
- **Sudah Terdaftar Sebelumnya**: identitas yang ada pada cache awal atau yang sudah menjalani satu sinkronisasi assignment penuh dan diverifikasi.

Riwayat cakupan disimpan privat pada `%LOCALAPPDATA%\\BOLO_INPEK\\riwayat_cakupan_survei.json`, bukan di spreadsheet baru. Isinya hanya identitas teknis survei tanpa password/assignment. Status *baru* bertahan saat aplikasi ditutup atau konfigurasi diperbarui berulang kali. Sesudah sinkronisasi penuh berhasil, status berubah menjadi *sebelumnya*. Survei baru untuk periode berbeda tetap terdeteksi meskipun kodenya sama.

**Distribusi:** `Patch_Bolo_V6_8.zip` cukup menimpa **`bolo_updater_gui.py`** di folder V6.7 (bukan `_runtime`), atau gunakan `Bolo_Inpek_V6_8.zip` sebagai folder baru. **V6.7 status FASIH rinci kapital dipertahankan** tanpa perubahan backend, Apps Script, maupun Chrome + UC.

**Pengujian:** pemeriksaan sintaks Python, 15 skenario logika riwayat, dan smoke-test antarmuka pada resolusi 1130 serta 760 piksel lulus; CRC ZIP dan hash EXE dari V6.7 berhasil diverifikasi. Pengujian FASIH/Sheets produksi pada Windows untuk versi V6.8 belum dijalankan.

## V6.9 — Sederhanakan teks antarmuka updater

Penyempurnaan UI berdasarkan evaluasi operator setelah V6.8. Tanpa mengubah logika bisnis, pengambilan status, ID FASIH, sinkronisasi, autentikasi, maupun backup.

- Hapus banner panjang "MODE TERKONTROL" karena pratinjau/backup sudah ditegaskan ketika tindakan penulisan dimulai.
- Ringkas bagian **Akses FASIH** menjadi checkbox akses VPN, tanpa mengulang Chrome + UC.
- Ringkas bagian **Login SSO FASIH** dengan opsi password terenkripsi tetap eksplisit.
- Bagian **Survei Aktif** tetap memperlihatkan seluruh survei dan kelompok **Baru Ditambahkan** / **Sudah Terdaftar Sebelumnya**; hapus keterangan panjang dan teknis pagination.
- Bagian **Spreadsheet Monitoring** cukup menyatakan ID tersedia dan akses diverifikasi saat operasi; **ID tersimpan tidak dianggap bukti berhasil login**.
- Pendekkan label ringkasan dan hapus penjelasan redundan di Riwayat Proses dan footer.

**Distribusi**: `Patch_Bolo_V6_9.zip` (mengganti `bolo_updater_gui.py` pada folder V6.8) atau `Bolo_Inpek_V6_9.zip` (portable lengkap). EXE identik dengan V6.8, runtime Chrome + UC tidak diubah; status rinci FASIH V6.7 dan cakupan otomatis V6.8 tetap aktif.

**Validasi**: sintaks Python, GUI virtual display lebar 1130/760, label survei 6→7 dan transisi baru→sebelumnya, arsip ZIP/CRC, serta hash EXE identik; belum diuji di Windows/FASIH produksi untuk versi V6.9.

## V6.10 — Hilangkan bagian Login SSO permanen

Atas masukan pengguna, seluruh **Bagian 2. Login SSO FASIH** pada halaman utama Updater **dihapus**, bukan sekadar disembunyikan. Bagian selanjutnya bernomor ulang: **1 Akses FASIH, 2 Survei Aktif, 3 Spreadsheet Monitoring, 4 Ringkasan Hasil, 5 Riwayat Proses**.

- Kredensial SSO tersimpan tetap dibaca dari DPAPI Windows yang sama (`credential_store.py` **tidak berubah**). Login Chrome + undetected_chromedriver, sinkronisasi dan autentikasi FASIH juga **tidak berubah**.
- Dalam kartu **Akses FASIH**, hanya ada indikator **Akun SSO siap** dan tombol kecil **Ganti Akun SSO**, tanpa menampilkan username atau password di halaman utama.
- Saat akun belum tersedia, klik Uji Baca / Sinkronkan memunculkan **pop-up pengaturan akun**; jika dibatalkan, operasi tidak dimulai. Pop-up menyembunyikan password dengan karakter pengganti dan menyediakan opsi simpan terenkripsi untuk akun Windows tersebut.
- Penggantian akun tidak dapat dilakukan saat pembaruan berlangsung; penyimpanan gagal tidak akan ditandai berhasil.
- Pilih `Patch_Bolo_V6_10.zip` untuk mengganti **satu** file `bolo_updater_gui.py` pada folder Updater V6.9, atau `Bolo_Inpek_V6_10.zip` untuk paket lengkap. EXE dan modul sinkronisasi Google Sheets/FASIH identik dengan V6.9.
- Validasi: GUI virtual 1130 px dan 760 px, konfigurasi akun tidak tersimpan → pop-up, penyimpanan dan pemulihan akun, cancel → tanpa perubahan, versi dan struktur ZIP/CRC, hash EXE dan modul inti.
- **Belum diuji pada Windows/FASIH produksi**. Jika akun pernah difoto ketika password terlihat, lakukan rotasi password melalui mekanisme resmi dan perbarui melalui tombol Ganti Akun SSO.
