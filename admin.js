/* BOLO INPEK 2.0 — Panel Pengaturan, terisolasi dari monitoring lama.
 * Tanpa konfigurasi Firebase: mode pratinjau per-browser (BUKAN database bersama).
 * Dengan Firebase: Firestore + autentikasi Google, izin edit diverifikasi di server oleh security rules.
 */
(() => {
  'use strict';

  const DEFAULT_SURVEYS = ['MINERBA', 'MIGAS', 'STPIM', 'SKTH', 'SIBSTR II', 'CAPTIVE POWER'];
  const LOCAL_KEY = 'bolo-inpek-admin-preview-v2';
  const config = window.BOLO_FIREBASE_CONFIG;
  const configured = Boolean(config && config.apiKey && config.projectId && config.appId && config.authDomain);
  const state = {
    mode: configured ? 'cloud' : 'preview',
    tab: 'surveys', user: null, authorized: false, busy: false,
    surveys: [], employees: [], scraperConfigs: [], sheetsTargets: null, message: '', error: '',
    cloud: null, unsubscribeEmployees: null, unsubscribeConfigs: null, unsubscribeTargets: null,
    monitoring: window.BOLO_MONITORING_CONTEXT || {surveys: [], employees: []}
  };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const keyFor = (name) => String(name || '').trim().toLocaleUpperCase('id-ID');
  const slug = (value) => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 85);
  const uid = () => 'p-' + (globalThis.crypto && crypto.randomUUID ?
    crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
  const $ = (selector) => document.querySelector(selector);
  let activeEdit = null;

  function previewRead() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
      state.surveys = Array.isArray(parsed.surveys) ? parsed.surveys : [];
      state.employees = Array.isArray(parsed.employees) ? parsed.employees : [];
      state.scraperConfigs = Array.isArray(parsed.scraperConfigs) ? parsed.scraperConfigs : [];
    } catch (error) {
      state.surveys = []; state.employees = []; state.scraperConfigs = [];
      state.error = 'Penyimpanan pratinjau tidak dapat dibaca. Data uji ditampilkan kosong.';
    }
  }
  function previewWrite() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      surveys: state.surveys, employees: state.employees,
      scraperConfigs: state.scraperConfigs
    }));
  }
  function monitoringSurveyDefaults() {
    const items = [...DEFAULT_SURVEYS.map(name => ({name}))];
    (state.monitoring.surveys || []).forEach(s => {
      if (typeof s === 'string') items.push({name:s});
      else if (s && s.name) items.push(s);
    });
    const unique = new Map();
    items.forEach(s => {
      const k = keyFor(s.name);
      if (k && !unique.has(k)) unique.set(k, {
        id: 'survey-' + slug(s.name), name: String(s.name).trim(),
        sourceCode: '', startDate: s.startDate || '',
        endDate: s.endDate || '', active: true, imported: true
      });
    });
    return [...unique.values()];
  }
  function allSurveys() {
    const map = new Map();
    monitoringSurveyDefaults().forEach(s => map.set(keyFor(s.name), s));
    state.surveys.forEach(s => {
      if (s && s.name) map.set(keyFor(s.name), {...s, imported: false});
    });
    return [...map.values()].sort((a,b) => a.name.localeCompare(b.name, 'id'));
  }
  function publishSurveys() {
    const surveys = allSurveys().map(s => ({
      id: s.id, name: s.name, active: s.active !== false,
      startDate: s.startDate || '', endDate: s.endDate || ''
    }));
    window.dispatchEvent(new CustomEvent('bolo:survey-registry', {detail: {surveys}}));
  }
  function setMessage(message, error = false) {
    state.message = error ? '' : message; state.error = error ? message : '';
    render();
  }
  function btn(label, action, extra = '') {
    return '<button type="button" data-action="' + esc(action) + '" ' + extra + '>' + label + '</button>';
  }
  function renderGate() {
    if (state.mode === 'preview') return '';
    if (state.authorized) {
      return '<div class="bolo-admin-user"><span>' + esc(state.user?.email || '') +
        '</span>' + btn('Keluar', 'logout', 'class="bolo-minor"') + '</div>';
    }
    return '<div class="bolo-admin-gate"><h3>Login Administrator</h3>' +
      '<p>Gunakan akun Google yang telah diberi akses admin pada Firebase. Login Gmail saja tidak otomatis memberikan izin mengubah data.</p>' +
      btn('Masuk dengan Google', 'login', 'class="bolo-primary"') +
      (state.user ? '<p class="bolo-error">Akun ' + esc(state.user.email || '') +
      ' belum terdaftar sebagai admin BOLO INPEK.</p>' : '') + '</div>';
  }
  function surveyRows() {
    const surveys = allSurveys();
    if (!surveys.length) return '<p class="bolo-empty">Belum ada survei.</p>';
    return '<div class="bolo-admin-table-wrap"><table class="bolo-admin-table"><thead><tr>' +
      '<th>Survei</th><th>Periode</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>' +
      surveys.map(s => '<tr><td><strong>' + esc(s.name) + '</strong>' +
        (s.sourceCode ? '<small>Kode FASIH: ' + esc(s.sourceCode) + '</small>' : '') +
        (s.imported ? '<small>Terbaca dari monitoring; belum disimpan sebagai konfigurasi</small>' : '') +
        (state.scraperConfigs.some(c => c.id === s.id) ? '<small>ID FASIH tersedia</small>' : '<small>ID FASIH belum diisi</small>') +
        '</td><td>' + esc(s.startDate || '—') + ' s.d. ' + esc(s.endDate || '—') +
        '</td><td><span class="bolo-state ' + (s.active === false ? 'off' : '') + '">' +
        (s.active === false ? 'Nonaktif' : 'Aktif') + '</span></td><td class="bolo-actions">' +
        btn('Edit', 'edit-survey', 'data-id="' + esc(s.id) + '"') +
        btn('ID FASIH', 'edit-config', 'data-id="' + esc(s.id) + '"') +
        btn(s.active === false ? 'Aktifkan' : 'Nonaktifkan', 'toggle-survey',
          'data-id="' + esc(s.id) + '" class="bolo-minor"') +
        '</td></tr>').join('') + '</tbody></table></div>';
  }
  function employeeRows() {
    if (!state.employees.length) return '<p class="bolo-empty">Direktori pegawai belum diisi. Tambahkan pegawai atau impor nama dari monitoring.</p>';
    return '<div class="bolo-admin-table-wrap"><table class="bolo-admin-table"><thead><tr>' +
      '<th>Nama</th><th>Peran</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>' +
      [...state.employees].sort((a,b)=>a.name.localeCompare(b.name,'id')).map(s =>
        '<tr><td><strong>' + esc(s.name) + '</strong><small>' + esc(s.email || 'Email belum diisi') +
        '</small></td><td>' + esc(s.role || 'Petugas') +
        '</td><td><span class="bolo-state ' + (s.active === false ? 'off' : '') + '">' +
        (s.active === false ? 'Nonaktif' : 'Aktif') + '</span></td><td class="bolo-actions">' +
        btn('Edit', 'edit-employee', 'data-id="' + esc(s.id) + '"') +
        btn(s.active === false ? 'Aktifkan' : 'Nonaktifkan', 'toggle-employee',
          'data-id="' + esc(s.id) + '" class="bolo-minor"') +
        '</td></tr>'
      ).join('') + '</tbody></table></div>';
  }
  function render() {
    const body = $('#bolo-admin-content');
    if (!body) return;
    const preview = state.mode === 'preview';
    const canEdit = preview || state.authorized;
    $('#bolo-admin-mode').textContent = preview ?
      'PRATINJAU LOKAL — perubahan hanya tersimpan pada browser ini, belum online bersama' :
      'DATABASE ONLINE — Firebase Firestore';
    $('#bolo-admin-mode').classList.toggle('bolo-preview', preview);
    if (!canEdit) { body.innerHTML = renderGate(); return; }
    const tabs = '<div class="bolo-admin-tabs" role="tablist">' +
      btn('Kelola Survei', 'tab-surveys', 'class="' + (state.tab === 'surveys' ? 'selected' : '') + '"') +
      btn('Kelola Pegawai', 'tab-employees', 'class="' + (state.tab === 'employees' ? 'selected' : '') + '"') +
      btn('Integrasi Google Sheets', 'tab-sheets', 'class="' + (state.tab === 'sheets' ? 'selected' : '') + '"') +
      '</div>';
    const surveys = '<div class="bolo-admin-section-title"><div><h3>Kelola Survei</h3>' +
      '<p>Survei baru langsung ditampilkan dalam dashboard. Data assignment tetap mengikuti sinkronisasi resmi FASIH.</p></div>' +
      '<div class="bolo-actionbar">' + btn('Impor Config FASIH', 'import-config', 'class="bolo-minor"') +
      btn('Unduh Config Updater', 'export-config', 'class="bolo-minor"') +
      btn('+ Tambah Survei', 'new-survey', 'class="bolo-primary"') + '</div></div>' + surveyRows();
    const sheets = '<div class="bolo-admin-section-title"><div><h3>Integrasi Google Sheets</h3>' +
      '<p>Kedua tujuan disimpan pada database internal Firebase dan dipakai bersama oleh Updater pada semua PC.</p></div>' +
      '<div class="bolo-actionbar">' +
      (state.mode === 'cloud' ? btn('Atur Spreadsheet', 'edit-sheets', 'class="bolo-primary"') : '') +
      '</div></div>' +
      '<div class="bolo-sheet-summary"><div><strong>Spreadsheet Monitoring</strong><small>' +
      (state.sheetsTargets?.monitoring_id ? 'Terhubung melalui konfigurasi privat' : 'Belum dikonfigurasi') +
      '</small></div><div><strong>Spreadsheet Sumber Tindak Lanjut</strong><small>' +
      (state.sheetsTargets?.tindak_lanjut_id ? 'Terhubung melalui konfigurasi privat' : 'Belum dikonfigurasi') +
      '</small></div></div>' +
      (state.mode !== 'cloud' ? '<p>Konfigurasi Google Sheets hanya disimpan dalam mode online setelah login admin.</p>' : '');
    const employees = '<div class="bolo-admin-section-title"><div><h3>Kelola Pegawai dan Petugas</h3>' +
      '<p>Direktori internal BOLO INPEK; belum mengubah akun, assignment, atau daftar WhatsApp di FASIH/Apps Script.</p></div>' +
      '<div class="bolo-actionbar">' + btn('Impor Nama Monitoring', 'import-employees', 'class="bolo-minor"') +
      btn('+ Tambah Pegawai', 'new-employee', 'class="bolo-primary"') + '</div></div>' + employeeRows();
    body.innerHTML = (state.authorized ? renderGate() : '') +
      (state.message ? '<div class="bolo-success" role="status">' + esc(state.message) + '</div>' : '') +
      (state.error ? '<div class="bolo-error" role="alert">' + esc(state.error) + '</div>' : '') +
      tabs + (state.tab === 'surveys' ? surveys : state.tab === 'sheets' ? sheets : employees);
    body.querySelectorAll('button').forEach(button => { button.disabled = state.busy; });
  }

  function spreadsheetIdFromInput(value) {
    const text = String(value || '').trim();
    const match = text.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$|\?)/);
    const id = match ? match[1] : text;
    if (!/^[A-Za-z0-9_-]{20,150}$/.test(id)) {
      throw new Error('Masukkan link Google Sheets yang benar atau Spreadsheet ID.');
    }
    return id;
  }

  function openSheetsForm() {
    if (state.mode !== 'cloud' || !state.authorized) return;
    $('#bolo-monitoring-url').value = state.sheetsTargets?.monitoring_id || '';
    $('#bolo-tindak-url').value = state.sheetsTargets?.tindak_lanjut_id || '';
    $('#bolo-sheets-error').textContent = '';
    $('#bolo-sheets-dialog').showModal();
  }

  async function saveSheetTargets(event) {
    event.preventDefault();
    if (!state.authorized || !state.cloud || state.busy) return;
    try {
      const monitoring_id = spreadsheetIdFromInput($('#bolo-monitoring-url').value);
      const tindak_lanjut_id = spreadsheetIdFromInput($('#bolo-tindak-url').value);
      if (monitoring_id === tindak_lanjut_id) {
        throw new Error('Monitoring dan sumber tindak lanjut harus menggunakan dua spreadsheet berbeda.');
      }
      state.busy = true;
      await state.cloud.setDoc(
        state.cloud.doc(state.cloud.db, 'system_config', 'sheets'),
        {monitoring_id, tindak_lanjut_id}
      );
      $('#bolo-sheets-dialog').close();
      setMessage('Dua spreadsheet berhasil disimpan ke konfigurasi online.');
    } catch (error) {
      $('#bolo-sheets-error').textContent = error.message || 'Konfigurasi spreadsheet gagal disimpan.';
    } finally {state.busy = false; render();}
  }

  function entryForm(type, item = null) {
    activeEdit = {type, id: item?.id || null};
    const d = $('#bolo-entry-dialog');
    $('#bolo-entry-title').textContent = (item ? 'Edit ' : 'Tambah ') +
      (type === 'survey' ? 'Survei' : type === 'config' ? 'Konfigurasi FASIH' : 'Pegawai');
    const isSurvey = type === 'survey';
    const isConfig = type === 'config';
    const name = esc(item?.name || '');
    const configItem = state.scraperConfigs.find(s => s.id === item?.id) || {};
    const configField = (label, key, hint = '') =>
      '<label>' + label + '<input name="' + key + '" required maxlength="140" value="' +
      esc(configItem[key] || '') + '" placeholder="' + esc(hint) + '"></label>';
    $('#bolo-entry-fields').innerHTML = isConfig ?
      '<p class="bolo-config-note">ID FASIH disimpan hanya untuk admin, bukan untuk tampilan publik.</p>' +
      '<label>Nama Survei<input name="name" value="' + esc(item?.name || '') + '" readonly></label>' +
      configField('Kode Survei', 'code', 'Contoh: SIBSTR') +
      configField('Survey ID', 'survey_id') +
      configField('Survey Period ID', 'survey_period_id') +
      configField('Role Pencacah ID', 'role_pencacah_id') +
      configField('Role Pengawas ID', 'role_pengawas_id') +
      configField('Field Nama Assignment', 'nama_assignment_field', 'data1 / data2 / data3') : isSurvey ?
      '<label>Nama Survei<input name="name" required maxlength="100" value="' + name +
      '" ' + (item ? 'readonly' : '') + ' placeholder="Contoh: IMK Triwulan IV 2026"></label>' +
      '<label>Kode/Identitas Survei FASIH<input name="sourceCode" maxlength="100" value="' +
      esc(item?.sourceCode || '') + '" placeholder="Opsional, mengikuti FASIH"></label>' +
      '<div class="bolo-form-grid"><label>Tanggal Mulai<input type="date" name="startDate" value="' +
      esc(item?.startDate || '') + '"></label><label>Tanggal Selesai<input type="date" name="endDate" value="' +
      esc(item?.endDate || '') + '"></label></div>' +
      '<p class="bolo-config-note">Nama survei, tanggal, dan status ditampilkan pada dashboard publik.</p>' :
      '<label>Nama Lengkap<input name="name" required maxlength="120" value="' + name + '"></label>' +
      '<label>Email<input type="email" name="email" maxlength="200" value="' + esc(item?.email || '') + '"></label>' +
      '<label>Nomor WhatsApp<input name="phone" maxlength="24" inputmode="tel" value="' +
      esc(item?.phone || '') + '" placeholder="Contoh: 62812..."></label>' +
      '<label>Peran<select name="role">' +
      ['PPL','PML','PPL/PML','Pegawai'].map(r =>
        '<option value="' + r + '"' + ((item?.role || 'PPL') === r ? ' selected' : '') + '>' + r + '</option>'
      ).join('') + '</select></label>' +
      '<label>Catatan<textarea name="note" rows="2" maxlength="600">' + esc(item?.note || '') + '</textarea></label>';
    $('#bolo-entry-active').checked = item?.active !== false;
    $('#bolo-entry-active').closest('label').hidden = isConfig;
    $('#bolo-entry-error').textContent = '';
    d.showModal();
  }
  async function persist(kind, value) {
    if (state.mode === 'preview') {
      const name = kind === 'surveys' ? 'surveys' : kind === 'scraper_configs' ? 'scraperConfigs' : 'employees';
      state[name] = [...state[name].filter(s => s.id !== value.id), value];
      previewWrite();
    } else {
      if (!state.authorized) throw new Error('Sesi administrator tidak aktif.');
      await state.cloud.setDoc(state.cloud.doc(state.cloud.db, kind, value.id), value);
      // onSnapshot akan menyegarkan daftar bersama otomatis.
    }
    if (kind === 'surveys') publishSurveys();
  }
  async function saveEntry(event) {
    event.preventDefault();
    if (!activeEdit || state.busy) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const raw = Object.fromEntries(new FormData(form).entries());
    const kind = activeEdit.type === 'survey' ? 'surveys' :
      activeEdit.type === 'config' ? 'scraper_configs' : 'employees';
    const pool = kind === 'surveys' ? allSurveys() :
      kind === 'scraper_configs' ? state.scraperConfigs : state.employees;
    const old = pool.find(s => s.id === activeEdit.id);
    const name = String(raw.name || '').trim();
    if (!name) return;
    if (kind === 'surveys' && pool.some(s => keyFor(s.name) === keyFor(name) && s.id !== activeEdit.id)) {
      $('#bolo-entry-error').textContent = 'Nama survei ini sudah digunakan.'; return;
    }
    if (kind === 'surveys' && raw.startDate && raw.endDate && raw.startDate > raw.endDate) {
      $('#bolo-entry-error').textContent = 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'; return;
    }
    if (kind === 'employees' && raw.phone && !/^\+?[0-9()\s-]{6,24}$/.test(raw.phone)) {
      $('#bolo-entry-error').textContent = 'Nomor WhatsApp harus berupa nomor telepon yang valid.'; return;
    }
    const value = kind === 'surveys' ? {
      id: old?.id || 'survey-' + slug(name), name,
      sourceCode: String(raw.sourceCode || '').trim(),
      startDate: raw.startDate || '', endDate: raw.endDate || '',
      active: $('#bolo-entry-active').checked
    } : kind === 'scraper_configs' ? {
      id: activeEdit.id, name,
      code: String(raw.code || '').trim(),
      survey_id: String(raw.survey_id || '').trim(),
      survey_period_id: String(raw.survey_period_id || '').trim(),
      role_pencacah_id: String(raw.role_pencacah_id || '').trim(),
      role_pengawas_id: String(raw.role_pengawas_id || '').trim(),
      nama_assignment_field: String(raw.nama_assignment_field || '').trim()
    } : {
      id: old?.id || uid(), name, email: String(raw.email || '').trim(),
      phone: String(raw.phone || '').trim(), role: raw.role || 'PPL',
      note: String(raw.note || '').trim(), active: $('#bolo-entry-active').checked
    };
    state.busy = true;
    try {
      await persist(kind, value);
      $('#bolo-entry-dialog').close();
      setMessage((kind === 'surveys' ? 'Survei' : kind === 'scraper_configs' ? 'Konfigurasi FASIH' : 'Pegawai') + ' berhasil disimpan' +
        (state.mode === 'preview' ? ' pada browser ini.' : ' di database online.'));
    } catch (error) {
      $('#bolo-entry-error').textContent = error.message || 'Penyimpanan gagal.';
    } finally {
      state.busy = false; render();
    }
  }
  async function importUpdaterConfig(file) {
    if (state.mode !== 'preview' && !state.authorized) {
      throw new Error('Hanya administrator yang boleh mengimpor konfigurasi FASIH.');
    }
    if (!file || file.size > 1024 * 1024) {
      throw new Error('Pilih file config_survei.json berukuran maksimal 1 MB.');
    }
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw new Error('File bukan JSON yang valid.'); }
    const rows = parsed?.surveys;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) {
      throw new Error('Daftar surveys tidak valid atau jumlahnya terlalu banyak.');
    }
    const keys = [
      'code', 'name', 'survey_id', 'survey_period_id',
      'role_pencacah_id', 'role_pengawas_id', 'nama_assignment_field'
    ];
    const oldNames = new Map(allSurveys().map(row => [keyFor(row.name), row]));
    const names = new Set(), incomingSurveys = [], incomingConfigs = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object' ||
          keys.some(k => typeof row[k] !== 'string' || !row[k].trim() || row[k].length > 140) ||
          row.name.length > 100) {
        throw new Error('Ada survei dengan ID FASIH belum lengkap atau terlalu panjang.');
      }
      const name = row.name.trim(), normalized = keyFor(name);
      if (names.has(normalized)) throw new Error('Nama survei ganda dalam file impor.');
      names.add(normalized);
      const prior = oldNames.get(normalized);
      const id = prior?.id || 'survey-' + slug(name);
      const clean = prior || {};
      incomingSurveys.push({
        id, name,
        sourceCode: clean.sourceCode || row.code,
        startDate: clean.startDate || '', endDate: clean.endDate || '',
        active: clean.active !== false
      });
      incomingConfigs.push({
        id, ...Object.fromEntries(keys.map(k => [k, row[k].trim()]))
      });
    }
    if (state.mode === 'preview') {
      const replace = (old, updates) => [
        ...old.filter(x => !updates.some(u => u.id === x.id)), ...updates
      ];
      state.surveys = replace(state.surveys, incomingSurveys);
      state.scraperConfigs = replace(state.scraperConfigs, incomingConfigs);
      previewWrite(); publishSurveys();
    } else {
      const batch = state.cloud.writeBatch(state.cloud.db);
      incomingSurveys.forEach((survey, i) => {
        batch.set(state.cloud.doc(state.cloud.db, 'surveys', survey.id), survey);
        batch.set(state.cloud.doc(state.cloud.db, 'scraper_configs', survey.id), incomingConfigs[i]);
      });
      await batch.commit();
    }
    setMessage(incomingConfigs.length + ' konfigurasi FASIH berhasil diimpor.' +
      (state.mode === 'preview' ? ' Tersimpan hanya di browser ini.' : ' Tersimpan untuk administrator.'));
  }
  function exportUpdaterConfig() {
    if (state.mode !== 'preview' && !state.authorized) {
      setMessage('Hanya admin yang bisa mengunduh konfigurasi FASIH.', true); return;
    }
    const active = allSurveys().filter(s => s.active !== false);
    const required = [
      'code', 'name', 'survey_id', 'survey_period_id',
      'role_pencacah_id', 'role_pengawas_id', 'nama_assignment_field'
    ];
    const missing = active.filter(s => {
      const config = state.scraperConfigs.find(c => c.id === s.id);
      return !config || required.some(key => !String(config[key] || '').trim());
    });
    if (missing.length) {
      setMessage('Lengkapi ID FASIH dahulu: ' + missing.map(s => s.name).join(', '), true);
      return;
    }
    const surveys = active.map(s => {
      const config = state.scraperConfigs.find(c => c.id === s.id);
      return Object.fromEntries(required.map(k => [k, config[k]]));
    });
    const blob = new Blob([JSON.stringify({surveys}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url; a.download = 'config_survei.json';
      document.body.appendChild(a); a.click(); a.remove();
      setMessage('Konfigurasi diunduh. Simpan hanya pada komputer operator yang berwenang.');
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  async function toggleItem(kind, id) {
    const pool = kind === 'surveys' ? allSurveys() : state.employees;
    const current = pool.find(s => s.id === id);
    if (!current || state.busy) return;
    state.busy = true;
    try {
      const {imported, note, ...saved} = current;
      await persist(kind, {...saved, active: current.active === false});
      setMessage('Status berhasil diperbarui.');
    } catch (error) { setMessage(error.message || 'Gagal mengubah status.', true); }
    finally { state.busy = false; render(); }
  }
  async function importEmployees() {
    const items = state.monitoring.employees || [];
    const known = new Map(state.employees.map(s => [keyFor(s.name), s]));
    const adds = items.filter(s => s?.name && !known.has(keyFor(s.name))).map(s => ({
      id: uid(), name: s.name, role: s.role || 'PPL', email: '', phone: '', note: '',
      active: true
    }));
    if (!adds.length) { setMessage('Tidak ada nama petugas baru yang bisa diimpor.'); return; }
    state.busy = true;
    try {
      for (const item of adds) await persist('employees', item);
      setMessage(adds.length + ' petugas berhasil diimpor. Lengkapi informasi kontak melalui menu Edit.');
    } catch (error) { setMessage('Impor sebagian atau seluruhnya gagal: ' + (error.message || error), true); }
    finally { state.busy = false; render(); }
  }
  async function signIn() {
    if (!state.cloud) return;
    try {
      const provider = new state.cloud.GoogleAuthProvider();
      provider.setCustomParameters({prompt: 'select_account'});
      await state.cloud.signInWithPopup(state.cloud.auth, provider);
    } catch (error) { setMessage('Login gagal: ' + (error.message || error), true); }
  }
  async function signOutAdmin() {
    if (state.cloud) await state.cloud.signOut(state.cloud.auth);
  }
  function createShell() {
    const trigger = document.createElement('button');
    trigger.id = 'bolo-admin-launch';
    trigger.type = 'button';
    trigger.textContent = 'Pengaturan Admin';
    trigger.addEventListener('click', () => { state.message = ''; state.error = ''; render(); $('#bolo-admin-dialog').showModal(); });
    $('.header-inner')?.appendChild(trigger);
    const root = document.createElement('div');
    root.innerHTML = '<dialog id="bolo-admin-dialog" aria-labelledby="bolo-admin-title">' +
      '<div class="bolo-admin-head"><div><h2 id="bolo-admin-title">Pengaturan BOLO INPEK</h2>' +
      '<p id="bolo-admin-mode"></p></div><button type="button" class="bolo-close" data-action="close-admin" aria-label="Tutup pengaturan">×</button></div>' +
      '<div id="bolo-admin-content"></div></dialog>' +
      '<dialog id="bolo-entry-dialog" aria-labelledby="bolo-entry-title">' +
      '<form id="bolo-entry-form"><div class="bolo-entry-head"><h3 id="bolo-entry-title"></h3>' +
      '<button type="button" class="bolo-close" data-action="close-entry" aria-label="Tutup formulir">×</button></div>' +
      '<div id="bolo-entry-fields"></div>' +
      '<label class="bolo-check"><input type="checkbox" id="bolo-entry-active" checked> Aktif</label>' +
      '<p id="bolo-entry-error" class="bolo-error" role="alert"></p>' +
      '<div class="bolo-form-buttons"><button type="button" data-action="close-entry" class="bolo-minor">Batal</button>' +
      '<button type="submit" class="bolo-primary">Simpan</button></div></form></dialog>' +
      '<dialog id="bolo-sheets-dialog" aria-labelledby="bolo-sheets-title">' +
      '<form id="bolo-sheets-form"><div class="bolo-entry-head"><h3 id="bolo-sheets-title">Integrasi Google Sheets</h3>' +
      '<button type="button" class="bolo-close" data-action="close-sheets" aria-label="Tutup pengaturan">×</button></div>' +
      '<p class="bolo-config-note">Pengaturan ini tersimpan satu kali di Firebase untuk seluruh PC operator. Tidak perlu menyalin ID ke tiap komputer.</p>' +
      '<label>Link Spreadsheet Monitoring<input id="bolo-monitoring-url" required type="text" placeholder="https://docs.google.com/spreadsheets/d/..."></label>' +
      '<label>Link Spreadsheet Sumber Tindak Lanjut<input id="bolo-tindak-url" required type="text" placeholder="https://docs.google.com/spreadsheets/d/..."></label>' +
      '<p id="bolo-sheets-error" class="bolo-error" role="alert"></p>' +
      '<div class="bolo-form-buttons"><button type="button" data-action="close-sheets" class="bolo-minor">Batal</button>' +
      '<button type="submit" class="bolo-primary">Simpan Integrasi</button></div></form></dialog>' +
      '<input id="bolo-import-config" type="file" accept=".json,application/json" hidden>';
    while (root.firstChild) document.body.appendChild(root.firstChild);
    $('#bolo-entry-form').addEventListener('submit', saveEntry);
    $('#bolo-sheets-form').addEventListener('submit', saveSheetTargets);
    $('#bolo-import-config').addEventListener('change', async e => {
      const file = e.currentTarget.files?.[0];
      e.currentTarget.value = '';
      if (!file || state.busy) return;
      state.busy = true; render();
      try { await importUpdaterConfig(file); }
      catch (error) { setMessage(error.message || 'Impor konfigurasi gagal.', true); }
      finally { state.busy = false; render(); }
    });
    document.body.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action, id = button.dataset.id;
      if (action === 'close-admin') $('#bolo-admin-dialog').close();
      else if (action === 'close-entry') $('#bolo-entry-dialog').close();
      else if (action === 'tab-surveys') {state.tab = 'surveys'; render();}
      else if (action === 'tab-employees') {state.tab = 'employees'; render();}
      else if (action === 'tab-sheets') {state.tab = 'sheets'; render();}
      else if (action === 'edit-sheets') openSheetsForm();
      else if (action === 'close-sheets') $('#bolo-sheets-dialog').close();
      else if (action === 'new-survey') entryForm('survey');
      else if (action === 'new-employee') entryForm('employee');
      else if (action === 'edit-survey') entryForm('survey', allSurveys().find(x => x.id === id));
      else if (action === 'edit-config') entryForm('config', allSurveys().find(x => x.id === id));
      else if (action === 'export-config') exportUpdaterConfig();
      else if (action === 'import-config') $('#bolo-import-config').click();
      else if (action === 'edit-employee') entryForm('employee', state.employees.find(x => x.id === id));
      else if (action === 'toggle-survey') await toggleItem('surveys', id);
      else if (action === 'toggle-employee') await toggleItem('employees', id);
      else if (action === 'import-employees') await importEmployees();
      else if (action === 'login') await signIn();
      else if (action === 'logout') await signOutAdmin();
    });
    $('#bolo-admin-dialog').addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.close();
    });
    render();
  }
  function receiveMonitoring(data) {
    state.monitoring = {
      surveys: Array.isArray(data?.surveys) ? data.surveys : [],
      employees: Array.isArray(data?.employees) ? data.employees : []
    };
    publishSurveys();
    render();
  }
  window.BoloAdmin = {setMonitoringData: receiveMonitoring};
  window.addEventListener('bolo:monitoring-loaded', event => receiveMonitoring(event.detail));

  async function initializeCloud() {
    try {
      const version = '10.14.1';
      const appModule = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-app.js');
      const authModule = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-auth.js');
      const dbModule = await import('https://www.gstatic.com/firebasejs/' + version + '/firebase-firestore.js');
      const app = appModule.initializeApp(config);
      const db = dbModule.getFirestore(app);
      const auth = authModule.getAuth(app);
      state.cloud = {db, auth, doc: dbModule.doc, setDoc: dbModule.setDoc,
        writeBatch: dbModule.writeBatch,
        signOut: authModule.signOut, signInWithPopup: authModule.signInWithPopup,
        GoogleAuthProvider: authModule.GoogleAuthProvider};
      dbModule.onSnapshot(dbModule.collection(db, 'surveys'), snapshot => {
        state.surveys = snapshot.docs.map(doc => doc.data());
        publishSurveys(); render();
      }, error => setMessage('Tidak dapat membaca konfigurasi survei: ' + error.message, true));
      authModule.onAuthStateChanged(auth, async user => {
        state.user = user; state.authorized = false;
        if (state.unsubscribeEmployees) {state.unsubscribeEmployees(); state.unsubscribeEmployees = null;}
        if (state.unsubscribeConfigs) {state.unsubscribeConfigs(); state.unsubscribeConfigs = null;}
        if (state.unsubscribeTargets) {state.unsubscribeTargets(); state.unsubscribeTargets = null;}
        state.employees = [];
        state.scraperConfigs = [];
        state.sheetsTargets = null;
        if (user) {
          try {
            const access = await dbModule.getDoc(dbModule.doc(db, 'admins', user.uid));
            if (auth.currentUser?.uid !== user.uid) return;
            state.authorized = access.exists() && access.data()?.active === true;
            if (state.authorized) {
              state.unsubscribeTargets = dbModule.onSnapshot(
                dbModule.doc(db, 'system_config', 'sheets'),
                snapshot => { state.sheetsTargets = snapshot.exists() ? snapshot.data() : null; render(); },
                error => setMessage('Gagal membaca tujuan Google Sheets: ' + error.message, true)
              );
              state.unsubscribeConfigs = dbModule.onSnapshot(dbModule.collection(db, 'scraper_configs'),
                snapshot => { state.scraperConfigs = snapshot.docs.map(d => d.data()); render(); },
                error => setMessage('Gagal membaca ID FASIH: ' + error.message, true));
              state.unsubscribeEmployees = dbModule.onSnapshot(dbModule.collection(db, 'employees'),
                snapshot => { state.employees = snapshot.docs.map(d => d.data()); render(); },
                error => setMessage('Gagal membaca pegawai: ' + error.message, true));
            }
          } catch (error) { state.error = 'Verifikasi admin gagal: ' + error.message; }
        }
        render();
      });
    } catch (error) { setMessage('Firebase gagal diinisialisasi: ' + (error.message || error), true); }
  }

  function start() {
    createShell();
    if (state.mode === 'preview') {
      previewRead(); publishSurveys(); render();
    } else {
      initializeCloud();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
