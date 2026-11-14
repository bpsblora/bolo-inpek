/**
 * BOLO INPEK — Admin kelola biodata petugas (file TAMBAHAN Apps Script).
 * Menggunakan tab petugas lama; tidak mengubah sumber_petugas, sumber_assignment,
 * kontak, tindak_lanjut, arsip, atau ID historis.
 * Memerlukan helper yang sudah ada pada KodeV2.gs: db_, read_, patch_, append_,
 * lock_, session_, text_, uid_. Semua endpoint memerlukan token ADMIN.
 */
function tlPetugasNormalisasiNomor_(value) {
  var raw = text_(value);
  if (!raw) return '';
  if (!/^[+\d\s().-]+$/.test(raw)) throw Error('Nomor WhatsApp hanya boleh berisi angka, spasi, +, (), titik, atau tanda hubung.');
  var digit = raw.replace(/\D/g, '');
  if (digit.indexOf('0') === 0) digit = '62' + digit.slice(1);
  else if (digit.indexOf('8') === 0) digit = '62' + digit;
  if (!/^62\d{8,13}$/.test(digit)) throw Error('Nomor WhatsApp tidak valid. Gunakan 08xxxxxxxxxx atau 628xxxxxxxxxx.');
  return digit;
}
function tlPetugasEmail_(value) {
  var email = text_(value).toLowerCase();
  if (email.length > 150 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw Error('Email petugas tidak valid (maksimal 150 karakter).');
  }
  return email;
}
function tlPetugasNama_(value) {
  var name = text_(value).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 140) {
    throw Error('Nama petugas wajib diisi (2–140 karakter).');
  }
  if (/[\r\n<>]/.test(name)) throw Error('Nama petugas mengandung karakter tidak diizinkan.');
  return name;
}
function tlPetugasId_(value) {
  var id = text_(value);
  if (!/^[a-zA-Z0-9_.:-]{8,100}$/.test(id)) {
    throw Error('ID Petugas tidak valid. Gunakan ID FASIH asli (atau biarkan kosong untuk ID internal baru).');
  }
  return id;
}
function tlPetugasPetaAssignment_(db) {
  var stat = new Map();
  read_(db, 'sumber_assignment').forEach(function (a) {
    [a.ppl_id, a.pml_id].forEach(function (id) {
      if (id) stat.set(id, (stat.get(id) || 0) + 1);
    });
  });
  return stat;
}
function tlPetugasView_(p, assignmentCount, source) {
  return {
    petugas_id: p.petugas_id,
    nama: p.nama,
    email: p.email,
    nomor_whatsapp: p.nomor_whatsapp,
    aktif: text_(p.aktif).toUpperCase() === 'TRUE',
    jumlah_assignment: assignmentCount || 0,
    ada_di_fasih: !!source,
    nama_fasih: source ? source.nama : ''
  };
}
/**
 * Menampilkan semua petugas termasuk nonaktif, dan kandidat sumber FASIH
 * yang belum didaftarkan. Tidak mengirim row index ke frontend.
 */
function apiDaftarPetugasAdmin(token) {
  session_(token, true);
  var db = db_();
  var saved = read_(db, 'petugas').filter(function (p) { return !!p.petugas_id; });
  var source = read_(db, 'sumber_petugas').filter(function (p) { return !!p.petugas_id; });
  var count = tlPetugasPetaAssignment_(db);
  var lookup = new Map(source.map(function (p) {return [p.petugas_id,p];}));
  var known = new Set(saved.map(function (p) {return p.petugas_id;}));
  var all = saved.map(function (p) {
    return tlPetugasView_(p, count.get(p.petugas_id), lookup.get(p.petugas_id));
  }).sort(function(a,b) { return a.nama.localeCompare(b.nama,'id');});
  var candidates = source.filter(function (p) {return !known.has(p.petugas_id);})
    .map(function (p) {
      return {petugas_id:p.petugas_id,nama:p.nama,email:p.email,
        jumlah_assignment:count.get(p.petugas_id)||0};
    }).sort(function(a,b){return a.nama.localeCompare(b.nama,'id');});
  return {petugas:all,kandidat_fasih:candidates,
    total:all.length,aktif:all.filter(function(p){return p.aktif;}).length,
    nonaktif:all.filter(function(p){return !p.aktif;}).length};
}
/**
 * Tambah dan ubah. ID immutable; penghapusan tidak disediakan agar arsip dan
 * riwayat yang mengacu ke petugas_id tetap valid.
 * expected adalah snapshot biodata awal untuk mencegah overwrite oleh dua admin.
 */
function apiSimpanPetugasAdmin(token, request) {
  return lock_(function () {
    var admin = session_(token,true);
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw Error('Data biodata petugas tidak valid.');
    }
    var mode = text_(request.mode).toLowerCase();
    if (mode !== 'tambah' && mode !== 'edit') throw Error('Mode perubahan petugas tidak dikenal.');
    var name = tlPetugasNama_(request.nama);
    var email = tlPetugasEmail_(request.email);
    var nomor = tlPetugasNormalisasiNomor_(request.nomor_whatsapp);
    if (!nomor) throw Error('Nomor WhatsApp wajib diisi agar pengingat dapat dikirim.');
    if (typeof request.aktif !== 'boolean') throw Error('Status aktif harus dipilih secara eksplisit.');
    var db = db_();
    var all = read_(db,'petugas');
    var ids = all.map(function(p){return p.petugas_id;});
    if (new Set(ids).size !== ids.length) throw Error('Ditemukan ID petugas ganda pada database. Perbaiki dahulu.');
    var id = text_(request.petugas_id);
    if (mode === 'tambah' && !id) id = uid_();
    id = tlPetugasId_(id);
    var row = all.find(function(p){return p.petugas_id===id;});
    if (mode === 'edit' && !row) throw Error('Petugas tidak ditemukan. Muat ulang daftar.');
    if (mode === 'tambah' && row) throw Error('ID Petugas sudah ada. Gunakan Edit Petugas untuk mengubah biodata.');
    if (all.some(function(p) {
      if (p.petugas_id===id || !text_(p.nomor_whatsapp)) return false;
      try {return tlPetugasNormalisasiNomor_(p.nomor_whatsapp) === nomor;}
      catch (_) {return false;}
    })) throw Error('Nomor WhatsApp sudah dipakai oleh petugas lain. Periksa agar pesan tidak salah tujuan.');
    if (email && all.some(function(p) {
      return p.petugas_id !== id && text_(p.email).toLowerCase()===email;
    })) throw Error('Email sudah digunakan pada biodata petugas lain.');
    if (mode === 'edit') {
      var prev=request.expected;
      if (!prev || typeof prev !== 'object') throw Error('Data awal tidak ada. Muat ulang daftar sebelum menyimpan.');
      var expected = [text_(prev.nama),text_(prev.email).toLowerCase(),
        text_(prev.nomor_whatsapp), prev.aktif===true ? 'TRUE':'FALSE'];
      var current=[row.nama,row.email.toLowerCase(),row.nomor_whatsapp,
        text_(row.aktif).toUpperCase()];
      if (JSON.stringify(expected)!==JSON.stringify(current)) {
        throw Error('Biodata sudah berubah di sesi lain. Muat ulang sebelum menyimpan.');
      }
      patch_(db,'petugas',row._row,{nama:name,email:email,nomor_whatsapp:nomor,
        aktif:request.aktif?'TRUE':'FALSE'});
    } else {
      var source = read_(db,'sumber_petugas').find(function(p){return p.petugas_id===id;});
      if (!source && request.dari_fasih === true) {
        throw Error('ID kandidat FASIH belum ditemukan pada sumber terbaru.');
      }
      append_(db,'petugas',[{petugas_id:id,nama:name,email:email,
        nomor_whatsapp:nomor,aktif:request.aktif?'TRUE':'FALSE'}]);
    }
    return {success:true,mode:mode,petugas_id:id,nama:name,
      aktif:request.aktif,oleh:admin.nama};
  });
}
