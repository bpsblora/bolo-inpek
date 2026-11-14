/**
 * BOLO INPEK — loader HTML Tindak Lanjut langsung dari GitHub.
 *
 * Pemasangan SATU KALI di Apps Script yang sudah aktif:
 *  1. Tambahkan file .gs ini tanpa mengganti KodeV2.gs.
 *  2. Pada doGet(e), hanya ganti blok template HTML lama dengan:
 *
 *     return boloTlOutputGithub_(p)
 *       .setTitle('Tindak Lanjut BOLO INPEK')
 *       .addMetaTag('viewport', 'width=device-width, initial-scale=1')
 *       .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
 *
 *     (Bagian action=closed di atasnya TIDAK diubah.)
 *
 * Sejak itu perubahan HTML GitHub otomatis tersedia pada kunjungan berikutnya,
 * sesudah cache maksimal 3 menit. Tidak memakai clasp, OAuth token, atau
 * modifikasi Apps Script API. Data Google Sheets dan backend tidak diubah.
 *
 * PENTING: hanya gunakan repo dengan penulis yang dipercaya. HTML dari GitHub
 * menjadi UI yang dapat memanggil google.script.run (dengan aturan otorisasi
 * backend seperti sebelumnya). Jangan meletakkan kode rahasia di file HTML.
 */
const TL_GITHUB_UI = Object.freeze({
  urls: [
    'https://raw.githubusercontent.com/bpsblora/bolo-inpek/main/backend/tindak-lanjut/Index_TindakLanjutV2.html',
    'https://bpsblora.github.io/bolo-inpek/backend/tindak-lanjut/Index_TindakLanjutV2.html'
  ],
  namaLokal: 'Index_TindakLanjutV2',
  cacheKey: 'bolo-tl-html-github-v1',
  cacheDetik: 180
});

function boloTlEscapeAttr_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Tolak HTML tidak lengkap dan semua skrip server selain 3 placeholder data. */
function boloTlValidasiHTMLGithub_(html) {
  if (typeof html !== 'string' || html.length < 20000 || html.length > 100000) {
    throw new Error('Ukuran HTML GitHub tidak wajar.');
  }
  const wajib = [
    '<!doctype html>',
    'id="loginForm"',
    'id="halamanSelesai"',
    'id="tlConfirmDialog"',
    'id="saveNote"',
    'google.script.run'
  ];
  for (const marker of wajib) {
    if (!html.includes(marker)) throw new Error('HTML GitHub belum lengkap: ' + marker);
  }

  // Hanya variabel yang dulu diisi doGet boleh muncul sebagai template.
  // Setelah itu semuanya diganti TEKS HTML yang di-escape secara ketat.
  // Kita TIDAK memakai HtmlService.createTemplate(remoteHTML), agar tidak
  // pernah mengeksekusi scriptlet server yang berasal dari GitHub.
  const allowed = [
    '<?= modeAwal ?>',
    '<?= surveiAwal ?>',
    '<?= periodeAwal ?>'
  ];
  const opening = (html.match(/<\?/g) || []).length;
  const closing = (html.match(/\?>/g) || []).length;
  if (opening !== 3 || closing !== 3) {
    throw new Error('HTML GitHub memiliki jumlah scriptlet yang tidak diizinkan.');
  }
  for (const scriptlet of allowed) {
    if (html.split(scriptlet).length !== 2) {
      throw new Error('Scriptlet HTML GitHub berubah: ' + scriptlet);
    }
  }
  const tokens = html.match(/<\?[\s\S]*?\?>/g) || [];
  if (tokens.length !== 3 || tokens.some(s => !allowed.includes(s))) {
    throw new Error('Ditemukan scriptlet server yang tidak diizinkan.');
  }
  return true;
}

function boloTlAmbilHTMLGithub_() {
  const cache = CacheService.getScriptCache();
  const tersimpan = cache.get(TL_GITHUB_UI.cacheKey);
  if (tersimpan) {
    try {
      boloTlValidasiHTMLGithub_(tersimpan);
      return tersimpan;
    } catch (e) {
      cache.remove(TL_GITHUB_UI.cacheKey);
    }
  }
  const errors = [];
  for (const url of TL_GITHUB_UI.urls) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) {
        throw new Error('HTTP ' + res.getResponseCode());
      }
      const html = res.getContentText('UTF-8');
      boloTlValidasiHTMLGithub_(html);
      cache.put(TL_GITHUB_UI.cacheKey, html, TL_GITHUB_UI.cacheDetik);
      return html;
    } catch (e) {
      errors.push(url.split('/')[2] + ': ' + e.message);
    }
  }
  throw new Error('Tidak dapat memuat tampilan GitHub (' + errors.join('; ') + ').');
}

/** HtmlOutput langsung: scriptlet remote TIDAK dieksekusi di server. */
function boloTlOutputGithub_(parameters) {
  const p = parameters || {};
  const fields = {
    modeAwal: p.mode === 'selesai' ? 'selesai' : '',
    surveiAwal: String(p.survei || '').trim().slice(0, 200),
    periodeAwal: String(p.survey_period_id || '').trim().slice(0, 100)
  };
  try {
    let html = boloTlAmbilHTMLGithub_();
    for (const key of ['modeAwal', 'surveiAwal', 'periodeAwal']) {
      html = html.replace('<?= ' + key + ' ?>', boloTlEscapeAttr_(fields[key]));
    }
    // Tidak ada template/scriptlet server tersisa.
    if (html.includes('<?') || html.includes('?>')) {
      throw new Error('Template HTML tidak terisi seluruhnya.');
    }
    return HtmlService.createHtmlOutput(html);
  } catch (e) {
    console.warn('BOLO INPEK: memakai HTML lokal; ' + e.message);
    const template = HtmlService.createTemplateFromFile(TL_GITHUB_UI.namaLokal);
    template.modeAwal = fields.modeAwal;
    template.surveiAwal = fields.surveiAwal;
    template.periodeAwal = fields.periodeAwal;
    return template.evaluate();
  }
}

/** Tes dari editor. Ditolak untuk pengunjung web app yang bukan pemilik. */
function ujiKoneksiGithubTindakLanjut() {
  const aktif = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const pemilik = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!aktif || !pemilik || aktif !== pemilik) {
    throw new Error('Uji koneksi hanya untuk pemilik proyek melalui editor Apps Script.');
  }
  const html = boloTlAmbilHTMLGithub_();
  const status = {
    terhubung: true,
    sumber: 'GitHub BOLO INPEK',
    karakter: html.length,
    dialog_konfirmasi: html.includes('id="tlConfirmDialog"'),
    cache_detik: TL_GITHUB_UI.cacheDetik
  };
  Logger.log(JSON.stringify(status, null, 2));
  return status;
}
