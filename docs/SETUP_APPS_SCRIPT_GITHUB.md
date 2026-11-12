# Menghubungkan BOLO INPEK ke Apps Script langsung dari GitHub

**Tujuan:** kode `Code.gs`, `Admin.html`, dan `appsscript.json` dikelola di repository **privat**, diperbarui oleh GitHub Actions, dan diterbitkan ulang ke deployment ADMIN/PUBLIK lama. Tidak perlu memasang Node.js pada PC kantor.

> **Keamanan:** repository `bpsblora/bolo-inpek` adalah **publik** dan hanya untuk dashboard GitHub Pages. Jangan simpan token Google, `.clasprc.json`, password FASIH, atau backend administratif di sini.

## A. Siapkan repository privat (sekali)

1. Login ke GitHub BPS Blora, buka [Buat repository baru](https://github.com/new).
2. Pilih owner `bpsblora`, nama `bolo-inpek-appscript`, dan **Private**. Bisa centang README.
3. Pastikan akun GitHub yang terhubung ke ChatGPT diberi akses write di repository baru. Di ChatGPT, cek koneksi GitHub apabila repository belum muncul.
4. Beri tahu asisten tautan repository privat ini. Asisten kemudian bisa menyiapkan *workflow* dan struktur kode langsung melalui GitHub, tanpa menerbitkan perubahan Apps Script dulu.

## B. Verifikasi sumber Apps Script sebelum melakukan push

1. Gunakan akun Google yang benar-benar memiliki **akses editor** ke proyek Apps Script Kelola Survei yang sekarang.
2. Aktifkan [Google Apps Script API](https://script.google.com/home/usersettings) pada akun tersebut.
3. Buka **Project settings → Script ID** pada proyek ADMIN. Catat ID untuk konfigurasi lokal, **jangan kirim token OAuth**.
4. Buka **Deploy → Manage deployments**. Simpan deployment ID ADMIN dan PUBLIK yang sedang berfungsi. Periksa apakah keduanya satu **Script ID** atau dua proyek berbeda.
5. **Cadangkan** seluruh file skrip dan `appsscript.json` versi yang sedang berjalan sebelum mendorong kode dari GitHub. Pembaruan `clasp push` mengganti isi kode, jadi jangan memulai dari template kosong.

## C. Otorisasi via browser GitHub (tanpa Node.js di laptop)

Setelah repository privat dibuat, buka **Code → Codespaces → Create codespace on main**.

Di terminal Codespaces jalankan:

```bash
npm install -g @google/clasp@3
clasp login --no-localhost
```

Ikuti tautan yang tampil, masuk menggunakan akun Google **pemilik/editor Apps Script**. Jangan kirim URL yang berisi kode otorisasi atau isi file `.clasprc.json` melalui chat.

Jika organisasi Google membatasi otorisasi aplikasi, izin admin Google Workspace mungkin diperlukan. Jika Codespaces tidak tersedia, gunakan lingkungan terminal jarak jauh resmi yang diizinkan organisasi.

Untuk memastikan pengambilan file awal dari proyek yang benar, setelah login:

```bash
clasp clone-script SCRIPT_ID
clasp list-deployments
```

Ganti `SCRIPT_ID` dengan ID dari **Project settings**. `clone-script` mengambil file dari Google dan tidak menerbitkan versi baru.

**Penting:** perintah di atas dijalankan pada folder kerja yang benar, dan hasil clone harus diaudit sebelum dijadikan sumber GitHub; jangan sampai berkas kode sebelumnya tertimpa.

## D. Secret GitHub (jangan disimpan di Git)

Di repository privat, buka **Settings → Secrets and variables → Actions**. Minimum secret untuk **satu** proyek Apps Script:

| Secret | Nilai |
|---|---|
| `CLASPRC_JSON` | Isi kredensial yang dibuat oleh `clasp login` (`~/.clasprc.json`) |
| `CLASP_JSON` | Isi konfigurasi proyek `.clasp.json` (berisi Script ID) |
| `DEPLOYMENT_ID` | Deployment ID lama yang akan diperbarui (bukan membuat URL baru) |

Jika ADMIN dan PUBLIK berada di proyek **berbeda**, siapkan satu set secret serta workflow terpisah untuk tiap proyek, atau workflow dengan target yang terisolasi. Jangan berasumsi dua URL `/exec` berarti satu Script ID.

Di Codespaces, secret dapat diisi tanpa menyalin token ke chat:

```bash
gh secret set CLASPRC_JSON < ~/.clasprc.json
gh secret set CLASP_JSON < .clasp.json
```

**Jangan commit `.clasprc.json`, OAuth client secrets, atau file password.** Tambahkan ke `.gitignore`.

## E. Workflow yang akan disiapkan setelah sumber disinkronkan

1. **Validasi:** memeriksa struktur Apps Script (`Code.gs`, `Admin.html`, `appsscript.json`), menjaga agar file penting tidak hilang.
2. **Pratinjau:** `clasp show-file-status` dan `clasp list-deployments`, tanpa menulis data.
3. **Deployment manual:** pemilik menjalankan **Actions → Deploy Apps Script → Run workflow**, memilih target dan menyetujui perubahan.
4. Runner GitHub Actions memasang Node.js dan `clasp` secara otomatis, membaca secret, menjalankan `clasp push` hanya untuk kode yang sudah diperiksa, lalu **memperbarui deployment ID lama** dengan `clasp update-deployment <DEPLOYMENT_ID>`. Hindari `clasp create-deployment` tanpa ID karena dapat membuat URL web app baru.
5. **Verifikasi:** cek endpoint ADMIN/PUBLIK, misalnya `?action=public`, dan dashboard; bila gagal, hentikan pembaruan lain serta pilih rollback versi Apps Script.

Mulai dengan mode **manual**. Setelah beberapa pembaruan berhasil, boleh ditingkatkan menjadi otomatis untuk commit yang lulus tes dan review.

## F. Pengaturan BOLO INPEK yang dipertahankan

- Website: `https://bpsblora.github.io/bolo-inpek/`
- Source dashboard: `bpsblora/bolo-inpek` (publik).
- Database: Google Spreadsheet yang sama dengan tab `konfigurasi_survei`, `periode_survei`, `monitoring`, dan `assignment_identitas`.
- Updater Windows Chrome + UC dan akses FASIH tetap terpisah: GitHub Actions **bukan pengganti VPN/SSO atau scraping FASIH**.
- ADMIN dan PUBLIK menggunakan **deployment saat ini**, bukan membuat deployment baru.

## Rujukan

- [Google resmi: clasp dan CI/CD GitHub Actions](https://developers.google.com/apps-script/guides/clasp)
- [clasp 3.x: daftar perintah / cara update-deployment](https://github.com/google/clasp)
- [GitHub: repository secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)

**Status saat dokumen dibuat:** panduan bootstrap disiapkan; repository privat, otorisasi Google dan workflow deployment **belum dibuat/diaktifkan**. Tidak ada tindakan pada Apps Script produksi.
