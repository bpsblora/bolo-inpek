/* BOLO INPEK 2.0 — konfigurasi Firebase client.
 * Untuk mengaktifkan penyimpanan ONLINE BERSAMA, isi konfigurasi dari
 * Firebase Console > Project settings > Your apps (Web app).
 *
 * Firebase web config bukan kunci rahasia. KEAMANAN ada pada Firebase Auth
 * dan firestore.rules. JANGAN isi token API FASIH, password, atau service-account!
 *
 * PENTING: selama bernilai null, UI berjalan dalam PRATINJAU LOKAL saja.
 */
window.BOLO_FIREBASE_CONFIG = null;

/* Contoh struktur (jangan mengaktifkan nilai palsu):
window.BOLO_FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'project-id.firebaseapp.com',
  projectId: 'project-id',
  appId: '1:...:web:...'
};
*/
