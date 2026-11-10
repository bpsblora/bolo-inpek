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
