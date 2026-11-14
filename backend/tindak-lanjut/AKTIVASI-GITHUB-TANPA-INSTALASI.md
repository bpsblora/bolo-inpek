# BOLO INPEK — Aktifkan HTML Tindak Lanjut langsung dari GitHub (tanpa PowerShell)

**Pilihan utama untuk pengembangan Tindak Lanjut.** Setup hanya sekali di editor Google Apps Script melalui browser. Setelah itu, tampilan HTML Tindak Lanjut otomatis mengikuti commit `main` di GitHub, tanpa `clasp`, GitHub Actions, OAuth token tambahan, atau instalasi aplikasi Windows.

**Cakupan:** hanya **antarmuka `Index_TindakLanjutV2.html`**. Backend `KodeV2.gs`, database Google Sheets, arsip, autentikasi email bersama, dan endpoint status `?action=closed` tetap seperti sebelumnya. Modifikasi backend Apps Script tetap memerlukan penerapan tersendiri.

## Sebelum mulai

Buka proyek Apps Script **Tindak Lanjut BOLO INPEK** yang sudah berjalan; pastikan ada file `KodeV2.gs` dan `Index_TindakLanjutV2.html`. Buat cadangan kedua file atau catat versi deployment produksi. Jangan membuat proyek Apps Script baru karena URL `/exec` produksi harus tetap digunakan.

### 1. Tambahkan satu file GAS (sekali saja)

1. Dari editor Apps Script, klik ikon **+** → **Script**.
2. Beri nama file **`TindakLanjut_GitHubLoader`**.
3. Buka [kode loader dari GitHub](./TindakLanjut_GitHubLoader.gs), klik **Raw**, salin seluruh kode, lalu tempel ke file baru.
4. Simpan dengan **Ctrl+S**.

Loader menggunakan `UrlFetchApp` untuk membaca dua URL GitHub yang dikenal (raw GitHub dan GitHub Pages). Jika jaringan GitHub bermasalah atau HTML tidak valid, loader akan menggunakan HTML lokal lama. Kode loader **tidak menyimpan informasi pribadi ke GitHub**.

### 2. Jalankan uji koneksi dari editor

Pilih fungsi `ujiKoneksiGithubTindakLanjut` pada dropdown Apps Script → klik **Jalankan**. Karena akses URL luar memerlukan izin `script.external_request`, Google dapat meminta izin sekali kepada pemilik skrip. Setujui izin setelah memeriksa bahwa kode loader diambil dari repository yang benar.

Hasil yang diharapkan di Log Eksekusi:

```json
{
  "terhubung": true,
  "sumber": "GitHub BOLO INPEK",
  "karakter": 39519,
  "dialog_konfirmasi": true,
  "cache_detik": 180
}
```

Jumlah karakter dapat berbeda setelah ada perubahan HTML. Bila error `You do not have permission to call UrlFetchApp.fetch` dan `appsscript.json` memuat daftar `oauthScopes` eksplisit, **tambahkan** scope `https://www.googleapis.com/auth/script.external_request` ke daftar yang sudah ada. **Jangan menghapus scope lain**, karena backend tetap membutuhkan izin Sheets, Drive, dan layanan lainnya.

Jika pemeriksaan masih gagal, jangan lanjutkan ke tahap 3. Periksa akses URL GitHub terlebih dahulu.

### 3. Ubah hanya satu blok di `doGet(e)`

Di file `KodeV2.gs`, cari blok tepat setelah penanganan `if (p.action === 'closed')`, yang semula:

```javascript
  const t = HtmlService.createTemplateFromFile(
    'Index_TindakLanjutV2'
  );

  t.modeAwal = p.mode === 'selesai' ? 'selesai' : '';
  t.surveiAwal = text_(p.survei).slice(0, 200);
  t.periodeAwal = text_(p.survey_period_id).slice(0, 100);

  return t.evaluate()
    .setTitle('Tindak Lanjut BOLO INPEK')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

Ganti **hanya blok di atas** menjadi:

```javascript
  return boloTlOutputGithub_(p)
    .setTitle('Tindak Lanjut BOLO INPEK')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
```

Bagian `if (p.action === 'closed')` di atasnya, kurung kurawal `doGet(e)`, serta fungsi backend lain tidak diubah.

### 4. Terapkan satu kali menggunakan deployment yang sudah ada

Simpan file, lalu buka **Terapkan → Kelola penerapan → edit ikon pensil pada deployment aktif → Versi: Versi baru → Terapkan**.

**Jangan memilih Penerapan baru**, sebab itu dapat menghasilkan URL berbeda. Dengan memperbarui deployment aktif, alamat `/exec` pada dashboard BOLO INPEK tetap sama.

### 5. Pengujian tanpa mengubah data operasional

1. Buka dashboard BOLO INPEK → **Kelola Survei → Survei Selesai & Pulihkan**.
2. Login dengan akun tim seperti biasa.
3. Klik **Tampilkan Kembali** pada salah satu survei selesai untuk mengecek **tampilan konfirmasi berwarna biru BPS**.
4. Pilih **Batal**, bukan konfirmasi, agar status survei tidak berubah.
5. Periksa bahwa `?action=closed` dan jumlah pengingat masih berjalan normal. Tidak perlu mengarsipkan atau menghapus data untuk mengetes tampilan.

## Setelah aktif

Untuk setiap revisi HTML, pengembang (ChatGPT) cukup mengubah berkas
[**`backend/tindak-lanjut/Index_TindakLanjutV2.html`**](./Index_TindakLanjutV2.html) lalu commit ke GitHub. Server Apps Script akan memuatnya kembali saat halaman dibuka setelah cache maksimal sekitar **3 menit**. Pengguna dapat menutup dan membuka lagi pop-up Tindak Lanjut untuk melihat perubahan.

**Perhatian keamanan:** hanya berikan akses tulis GitHub kepada pengelola tepercaya. HTML GitHub merupakan kode yang berjalan di aplikasi Tindak Lanjut serta dapat memanggil fungsi backend yang sudah tersedia. Loader menolak scriptlet server baru pada HTML, mengganti tiga placeholder menjadi teks aman, dan **tidak pernah mengeksekusi kode server dari GitHub**. Backend tetap wajib melakukan validasi peran.

Jika GitHub tidak dapat diakses, halaman lama dari file `Index_TindakLanjutV2.html` di proyek Apps Script tetap digunakan. Jadi popup tidak menjadi kosong hanya karena gangguan GitHub.

## Opsi alternatif

Berkas [SINKRONISASI-GITHUB-APPS-SCRIPT.md](./SINKRONISASI-GITHUB-APPS-SCRIPT.md) mendokumentasikan GitHub Actions + `clasp`, yang membutuhkan OAuth. **Tidak wajib untuk sinkronisasi tampilan HTML** ini. Gunakan hanya jika suatu saat perlu mengelola **backend** Apps Script lewat GitHub Actions dan bersedia mengatur credential secara terpisah.
