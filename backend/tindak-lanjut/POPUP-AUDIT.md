# Audit Pop-up & Konfirmasi BOLO INPEK — 14 November 2026

## Hasil pemeriksaan

| Bagian | Temuan | Perbaikan |
| --- | --- | --- |
| Monitoring utama `index.html` | 7 dialog HTML berdesain BOLO INPEK (Kelola Survei, Penanda, 3 rincian progres, Tindak Lanjut). Tidak ditemukan `window.confirm/alert/prompt`. | Dipertahankan; tidak perlu mengubah dashboard v39. |
| `dashboard-interaktif.js` | Rincian grafik PPL/PML/status memakai dialog internal, bukan konfirmasi browser. | Dipertahankan. |
| Apps Script `Index_TindakLanjutV2.html` | Pemulihan survei memakai `window.confirm` sehingga browser menampilkan alamat `googleusercontent.com`. | Diganti komponen `<dialog>` bergaya BOLO INPEK, dengan deskripsi dampak dan 2 tombol yang jelas. |
| Apps Script penutupan survei | Checklist dan tombol penutupan sudah ada, tetapi tidak ada dialog kedua yang menjelaskan pembersihan catatan aktif. | Konfirmasi kedua ditambahkan sebelum memanggil `apiTutup`. |
| Salin pesan/nomor WhatsApp | Browser menggunakan `window.prompt` saat clipboard ditolak. | Diganti panel salin manual pada halaman, teks terpilih untuk Ctrl+C. |
| Aplikasi terpisah Kelola Survei (Apps Script admin) | Frontend membuka URL aplikasi lain melalui iframe; kode sumbernya belum diaudit. | Belum diubah. Jika ada dialog native di aplikasi admin, sumbernya perlu diperiksa tersendiri. |

## Pesan konfirmasi yang digunakan

**Tampilkan kembali survei**
- Identitas lengkap **survei — periode** tampak dalam kotak biru.
- Menjelaskan survei kembali AKTIF dan dapat ditampilkan di monitoring setelah sinkronisasi.
- Menjelaskan bahwa **arsip lama tetap ada**, dan **riwayat lama tetap di berkas arsip**, bukan kembali ke tabel catatan aktif.
- Tombol `Batal` dan `Tampilkan Kembali`; Esc/batal tidak menulis apa pun.

**Arsipkan & Tutup Survei**
- Memperlihatkan identitas periode dengan warna peringatan oranye.
- Menjelaskan bahwa arsip akan dibuat dan diverifikasi sebelum periode DITUTUP.
- Menginformasikan bahwa catatan aktif pada periode tersebut dibersihkan **setelah** verifikasi arsip, dan arsipnya tetap dapat dibuka.
- Tetap mensyaratkan *catatan penutupan* dan *checkbox persetujuan* sebelum dialog muncul.
- Tombol `Batal` dan `Arsipkan & Tutup`.

## Penerapan wajib pada Apps Script yang sudah aktif

1. **Backup** file lama `Index_TindakLanjutV2.html` di editor Apps Script.
2. Buka [HTML pengganti](./Index_TindakLanjutV2.html) di GitHub, klik **Raw**, lalu salin seluruh isinya.
3. Buka Apps Script **Tindak Lanjut BOLO INPEK** (yang saat ini juga memuat `KodeV2.gs`), **ganti isi** file `Index_TindakLanjutV2.html` (bukan `KodeV2.gs`) dengan kode dari GitHub.
4. **Save** lalu lakukan **Deploy → Manage deployments → Edit (deployment aktif) → Version: New version → Deploy** agar alamat `/exec` lama tetap sama.
5. Muat ulang halaman BOLO INPEK dan uji `Kelola Survei → Survei Selesai & Pulihkan`. Klik tombol `Tampilkan Kembali` untuk memunculkan modal; pilih **Batal** untuk menguji tampilan tanpa mengubah status. Jangan klik tombol konfirmasi pada data nyata hanya untuk pengujian.
6. Uji dialog `Arsipkan & Tutup` dengan tidak mengonfirmasikan tindakan pada data produksi. Penutupan yang menghapus catatan aktif harus diuji **hanya dengan salinan data** yang sudah dipersiapkan.

**Batas deploy:** GitHub Pages tidak bisa menerapkan perubahan UI yang berada di dalam Google Apps Script secara otomatis. Berkas GitHub adalah sumber yang sudah siap disalin; tampilan sebenarnya akan berubah **setelah deployment Apps Script lama diperbarui**.

## Keamanan dan akses

- Tombol HTML tidak mengubah autentikasi email bersama yang telah disepakati tim.
- Konfirmasi UI bukan pengganti pemeriksaan peran/otorisasi pada `apiBukaKembali` dan `apiTutup`. Backend tetap membatasi kedua fungsi untuk ADMIN.
- Kode memakai `textContent` agar nama survei dan pesan tidak dimasukkan sebagai HTML.
- Penutupan dan pemulihan tidak dijalankan saat audit maupun proses commit.
