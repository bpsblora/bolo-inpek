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
    surveys: [], employees: [], message: '', error: '',
    cloud: null, unsubscribeEmployees: null,
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
    } catch (error) {
      state.surveys = []; state.employees = [];
      state.error = 'Penyimpanan pratinjau tidak dapat dibaca. Data uji ditampilkan kosong.';
    }
  }
  function previewWrite() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      surveys: state.surveys, employees: state.employees
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
        endDate: s.endDate || '', note: '', active: true, imported: true
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
        '</td><td>' + esc(s.startDate || '—') + ' s.d. ' + esc(s.endDate || '—') +
        '</td><td><span class="bolo-state ' + (s.active === false ? 'off' : '') + '">' +
        (s.active === false ? 'Nonaktif' : 'Aktif') + '</span></td><td class="bolo-actions">' +
        btn('Edit', 'edit-survey', 'data-id="' + esc(s.id) + '"') +
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
      '</div>';
    const surveys = '<div class="bolo-admin-section-title"><div><h3>Kelola Survei</h3>' +
      '<p>Survei baru langsung ditampilkan dalam dashboard. Data assignment tetap mengikuti sinkronisasi resmi FASIH.</p></div>' +
      btn('+ Tambah Survei', 'new-survey', 'class="bolo-primary"') + '</div>' + surveyRows();
    const employees = '<div class="bolo-admin-section-title"><div><h3>Kelola Pegawai dan Petugas</h3>' +
      '<p>Direktori internal BOLO INPEK; belum mengubah akun, assignment, atau daftar WhatsApp di FASIH/Apps Script.</p></div>' +
      '<div class="bolo-actionbar">' + btn('Impor Nama Monitoring', 'import-employees', 'class="bolo-minor"') +
      btn('+ Tambah Pegawai', 'new-employee', 'class="bolo-primary"') + '</div></div>' + employeeRows();
    body.innerHTML = (state.authorized ? renderGate() : '') +
      (state.message ? '<div class="bolo-success" role="status">' + esc(state.message) + '</div>' : '') +
      (state.error ? '<div class="bolo-error" role="alert">' + esc(state.error) + '</div>' : '') +
      tabs + (state.tab === 'surveys' ? surveys : employees);
    body.querySelectorAll('button').forEach(button => { button.disabled = state.busy; });
  }

  function entryForm(type, item = null) {
    activeEdit = {type, id: item?.id || null};
    const d = $('#bolo-entry-dialog');
    $('#bolo-entry-title').textContent = (item ? 'Edit ' : 'Tambah ') +
      (type === 'survey' ? 'Survei' : 'Pegawai');
    const isSurvey = type === 'survey';
    const name = esc(item?.name || '');
    $('#bolo-entry-fields').innerHTML = isSurvey ?
      '<label>Nama Survei<input name="name" required maxlength="100" value="' + name +
      '" ' + (item ? 'readonly' : '') + ' placeholder="Contoh: IMK Triwulan IV 2026"></label>' +
      '<label>Kode/Identitas Survei FASIH<input name="sourceCode" maxlength="100" value="' +
      esc(item?.sourceCode || '') + '" placeholder="Opsional, mengikuti FASIH"></label>' +
      '<div class="bolo-form-grid"><label>Tanggal Mulai<input type="date" name="startDate" value="' +
      esc(item?.startDate || '') + '"></label><label>Tanggal Selesai<input type="date" name="endDate" value="' +
      esc(item?.endDate || '') + '"></label></div>' +
      '<label>Catatan<textarea name="note" rows="2" maxlength="600">' + esc(item?.note || '') + '</textarea></label>' :
      '<label>Nama Lengkap<input name="name" required maxlength="120" value="' + name + '"></label>' +
      '<label>Email<input type="email" name="email" maxlength="200" value="' + esc(item?.email || '') + '"></label>' +
      '<label>Nomor WhatsApp<input name="phone" maxlength="24" inputmode="tel" value="' +
      esc(item?.phone || '') + '" placeholder="Contoh: 62812..."></label>' +
      '<label>Peran<select name="role">' +
      ['PPL','PML','PPL/PML','Pegawai','Admin'].map(r =>
        '<option value="' + r + '"' + ((item?.role || 'PPL') === r ? ' selected' : '') + '>' + r + '</option>'
      ).join('') + '</select></label>' +
      '<label>Catatan<textarea name="note" rows="2" maxlength="600">' + esc(item?.note || '') + '</textarea></label>';
    $('#bolo-entry-active').checked = item?.active !== false;
    $('#bolo-entry-error').textContent = '';
    d.showModal();
  }
  async function persist(kind, value) {
    if (state.mode === 'preview') {
      const name = kind === 'surveys' ? 'surveys' : 'employees';
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
    const kind = activeEdit.type === 'survey' ? 'surveys' : 'employees';
    const pool = kind === 'surveys' ? allSurveys() : state.employees;
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
      note: String(raw.note || '').trim(), active: $('#bolo-entry-active').checked
    } : {
      id: old?.id || uid(), name, email: String(raw.email || '').trim(),
      phone: String(raw.phone || '').trim(), role: raw.role || 'PPL',
      note: String(raw.note || '').trim(), active: $('#bolo-entry-active').checked
    };
    state.busy = true;
    try {
      await persist(kind, value);
      $('#bolo-entry-dialog').close();
      setMessage((kind === 'surveys' ? 'Survei' : 'Pegawai') + ' berhasil disimpan' +
        (state.mode === 'preview' ? ' pada browser ini.' : ' di database online.'));
    } catch (error) {
      $('#bolo-entry-error').textContent = error.message || 'Penyimpanan gagal.';
    } finally {
      state.busy = false; render();
    }
  }
  async function toggleItem(kind, id) {
    const pool = kind === 'surveys' ? allSurveys() : state.employees;
    const current = pool.find(s => s.id === id);
    if (!current || state.busy) return;
    state.busy = true;
    try {
      await persist(kind, {...current, imported: false, active: current.active === false});
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
      '<button type="submit" class="bolo-primary">Simpan</button></div></form></dialog>';
    while (root.firstChild) document.body.appendChild(root.firstChild);
    $('#bolo-entry-form').addEventListener('submit', saveEntry);
    document.body.addEventListener('click', async event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action, id = button.dataset.id;
      if (action === 'close-admin') $('#bolo-admin-dialog').close();
      else if (action === 'close-entry') $('#bolo-entry-dialog').close();
      else if (action === 'tab-surveys') {state.tab = 'surveys'; render();}
      else if (action === 'tab-employees') {state.tab = 'employees'; render();}
      else if (action === 'new-survey') entryForm('survey');
      else if (action === 'new-employee') entryForm('employee');
      else if (action === 'edit-survey') entryForm('survey', allSurveys().find(x => x.id === id));
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
        signOut: authModule.signOut, signInWithPopup: authModule.signInWithPopup,
        GoogleAuthProvider: authModule.GoogleAuthProvider};
      dbModule.onSnapshot(dbModule.collection(db, 'surveys'), snapshot => {
        state.surveys = snapshot.docs.map(doc => doc.data());
        publishSurveys(); render();
      }, error => setMessage('Tidak dapat membaca konfigurasi survei: ' + error.message, true));
      authModule.onAuthStateChanged(auth, async user => {
        state.user = user; state.authorized = false;
        if (state.unsubscribeEmployees) {state.unsubscribeEmployees(); state.unsubscribeEmployees = null;}
        state.employees = [];
        if (user) {
          try {
            const access = await dbModule.getDoc(dbModule.doc(db, 'admins', user.uid));
            if (auth.currentUser?.uid !== user.uid) return;
            state.authorized = access.exists() && access.data()?.active === true;
            if (state.authorized) {
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
