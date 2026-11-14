/**
 * BOLO INPEK / Tindak Lanjut: pemeriksaan integrasi backend V1.
 *
 * Tambahkan file ini pada proyek Apps Script Tindak Lanjut yang SUDAH ADA.
 * Tidak mendefinisikan doGet / doPost agar tidak menimpa deployment saat ini.
 * Tidak melakukan penulisan, pembuatan sheet, perubahan status, atau arsip.
 *
 * Konfigurasi di Project Settings -> Script properties:
 *   TL_DB_SPREADSHEET_ID : ID Spreadsheet "Database Tindak Lanjut BOLO INPEK"
 *   TL_ARCHIVE_FOLDER_ID: ID folder Drive "Arsip Penutupan Survei"
 *
 * Jalankan: boloTlPeriksaIntegrasi()
 */
function boloTlPeriksaIntegrasi() {
  const required =   {
    "operator": [
      "email",
      "nama",
      "peran",
      "aktif"
    ],
    "petugas": [
      "petugas_id",
      "nama",
      "email",
      "nomor_whatsapp",
      "aktif"
    ],
    "survei": [
      "survey_id",
      "survey_period_id",
      "kode_survei",
      "nama_survei",
      "nama_periode",
      "tanggal_mulai",
      "tanggal_selesai",
      "status_operasional",
      "waktu_ditutup",
      "ditutup_oleh",
      "catatan_penutupan"
    ],
    "kontak": [
      "kontak_id",
      "waktu_dibuat",
      "operator_email",
      "petugas_id",
      "nama_petugas",
      "nomor_whatsapp",
      "isi_pesan",
      "waktu_data_monitoring",
      "status_pengiriman",
      "waktu_kirim"
    ],
    "tindak_lanjut": [
      "riwayat_id",
      "tindak_lanjut_id",
      "kontak_id",
      "waktu_catat",
      "operator_email",
      "survey_id",
      "survey_period_id",
      "nama_survei",
      "petugas_id",
      "peran_petugas",
      "cakupan",
      "assignment_id",
      "nama_assignment",
      "status_assignment",
      "status_tindak_lanjut",
      "catatan_konfirmasi",
      "rencana_perbaikan",
      "target_selesai",
      "pengingat_pada"
    ],
    "arsip": [
      "arsip_id",
      "survey_id",
      "survey_period_id",
      "nama_survei",
      "nama_periode",
      "versi",
      "arsip_file_id",
      "arsip_url",
      "waktu_arsip",
      "operator_email",
      "jumlah_assignment",
      "jumlah_riwayat",
      "status_arsip",
      "catatan_penutupan"
    ],
    "sumber_assignment": [
      "survey_id",
      "survey_period_id",
      "assignment_id",
      "survei",
      "nama_assignment",
      "status",
      "status_asli",
      "ppl_id",
      "ppl",
      "pml_id",
      "pml",
      "waktu_data_monitoring"
    ],
    "sumber_petugas": [
      "petugas_id",
      "nama",
      "email",
      "waktu_data_monitoring"
    ],
    "sumber_survei": [
      "survey_id",
      "survey_period_id",
      "kode_survei",
      "nama_survei",
      "nama_periode",
      "tanggal_mulai",
      "tanggal_selesai",
      "waktu_data_monitoring"
    ]
  };
  const props = PropertiesService.getScriptProperties();
  const databaseId = String(props.getProperty("TL_DB_SPREADSHEET_ID") || "").trim();
  const folderId = String(props.getProperty("TL_ARCHIVE_FOLDER_ID") || "").trim();
  const report = {
    versi: "setup-backend-v1",
    waktu_pemeriksaan: new Date().toISOString(),
    database: {terhubung:false, tabs:[]},
    arsip: {terhubung:false},
    error:[],
    peringatan:[]
  };

  if (!databaseId) {
    report.error.push("Script property TL_DB_SPREADSHEET_ID belum diisi.");
  } else {
    try {
      const book = SpreadsheetApp.openById(databaseId);
      report.database.terhubung = true;
      report.database.nama = book.getName();
      Object.keys(required).forEach(function(sheetName) {
        const expected = required[sheetName];
        const sheet = book.getSheetByName(sheetName);
        const result = {nama:sheetName,ada:!!sheet,header_sesuai:false,baris_data:0};
        if (!sheet) {
          report.error.push("Tab wajib belum ditemukan: "+sheetName);
        } else {
          const headers = sheet.getRange(1,1,1,expected.length).getDisplayValues()[0]
            .map(function(value){return String(value||"").trim();});
          const mismatches = expected.map(function(name,index) {
            return headers[index]===name?"":(index+1)+": "+name;
          }).filter(Boolean);
          result.header_sesuai = mismatches.length===0;
          result.baris_data = Math.max(0,sheet.getLastRow()-1);
          if (mismatches.length)
            report.error.push("Header "+sheetName+" tidak sesuai di kolom "+mismatches.join(", "));
        }
        report.database.tabs.push(result);
      });
    } catch (err) {
      report.error.push("Database tidak bisa diakses: "+String(err.message||err));
    }
  }

  if (!folderId) {
    report.error.push("Script property TL_ARCHIVE_FOLDER_ID belum diisi.");
  } else {
    try {
      const folder = DriveApp.getFolderById(folderId);
      report.arsip.terhubung = true;
      report.arsip.nama = folder.getName();
    } catch(err) {
      report.error.push("Folder arsip tidak bisa diakses: "+String(err.message||err));
    }
  }
  report.siap = report.error.length===0;
  if (report.siap) {
    report.peringatan.push(
      "Struktur siap. Ini hanya pengecekan; login, simpan catatan, pengingat, penutupan, dan deploy harus diuji pada Apps Script aktif."
    );
  }
  // Tidak mencetak kontak, email operator, pesan WhatsApp, atau isi catatan.
  Logger.log(JSON.stringify(report,null,2));
  return report;
}
