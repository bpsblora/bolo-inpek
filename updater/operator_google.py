"""OAuth operator Windows untuk Firestore dan dua Google Sheets.

Satu login Google memberi:
- ID token Google -> Firebase Authentication untuk membaca konfigurasi privat.
- Google OAuth access token (scope Sheets) -> gspread untuk mengakses dua
  spreadsheet sebagai akun operator, tanpa private key service account.

Token hanya digunakan di memori selama proses berjalan, tidak disimpan
permanen atau dicetak ke log. Persetujuan scope Sheets mungkin memerlukan
konfigurasi Google Auth Platform/Workspace dan verifikasi aplikasi.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/spreadsheets",
]


class OperatorAuthError(RuntimeError):
    pass


def _explain_oauth_failure(error: Exception) -> str:
    """Hanya kode/kelas error yang aman, tidak pernah mencetak URL OAuth atau token."""
    import requests
    from oauthlib.oauth2 import OAuth2Error

    detail = str(error).lower()
    if "scope has changed" in detail:
        return (
            "Google mengembalikan cakupan izin (scope) berbeda saat pertukaran token. "
            "Updater menggunakan nama scope resmi Google pada versi terbaru. "
            "Pastikan izin Google Sheets benar-benar disetujui."
        )
    if isinstance(error, requests.exceptions.SSLError):
        return "Gagal menghubungi server token Google: verifikasi sertifikat HTTPS gagal. Periksa konfigurasi SSL/proxy PC."
    if isinstance(error, requests.exceptions.ProxyError):
        return "Gagal menghubungi server token Google karena proxy jaringan. Periksa konfigurasi jaringan kantor."
    if isinstance(error, requests.exceptions.Timeout) or "timed out" in detail:
        return "Koneksi ke server token Google terlalu lama. Periksa internet dan coba uji login lagi."
    if isinstance(error, OAuth2Error):
        code = str(getattr(error, "error", "") or "")
        if code == "invalid_client":
            return "OAuth Client ID/secret Desktop ditolak Google. Periksa updater-oauth-desktop.json yang baru."
        if code == "invalid_grant":
            return "Kode otorisasi Google kedaluwarsa atau tidak cocok. Tutup tab sebelumnya dan ulangi Uji Login Google."
        if code in ("access_denied", "admin_policy_enforced", "org_internal"):
            return "Google atau kebijakan Workspace menolak izin akun. Minta administrator BPS memeriksa akses aplikasi."
        return "Server OAuth Google menolak pertukaran token (" + (code if code.replace("_", "").isalnum() else "oauth_error") + ")."
    if "mismatching_state" in detail or "state mismatch" in detail:
        return "Status keamanan OAuth (state) tidak cocok. Ulangi login tanpa membuka beberapa proses Uji Login Google."
    return "Pertukaran kode login menjadi token Google gagal (" + type(error).__name__ + "). Periksa koneksi internet, proxy, dan izin OAuth BPS."


@dataclass(frozen=True)
class OperatorSession:
    google_id_token: str
    spreadsheet_client: Any


def login_operator(client_config: dict) -> OperatorSession:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        import gspread
    except ImportError as exc:
        raise OperatorAuthError("Library Google OAuth atau Google Sheets belum tersedia.") from exc

    flow = InstalledAppFlow.from_client_config(
        client_config, scopes=GOOGLE_SCOPES, autogenerate_code_verifier=True
    )
    try:
        credentials = flow.run_local_server(
            host="127.0.0.1",
            port=0,
            open_browser=True,
            authorization_prompt_message="",
            success_message="Izin Google diterima. Kembali ke BOLO INPEK Updater untuk melihat hasil pemeriksaan token, Firebase, dan Sheets.",
            prompt="select_account",
            timeout_seconds=180,
        )
    except Exception as exc:
        raise OperatorAuthError(_explain_oauth_failure(exc)) from exc

    token = getattr(credentials, "id_token", None)
    if not token:
        token = (getattr(flow.oauth2session, "token", None) or {}).get("id_token")
    if not token:
        raise OperatorAuthError("Google tidak mengembalikan ID token untuk akses Firebase.")

    # Tolak izin parsial; jangan pernah mengabaikan scope yang hilang.
    granted_scopes = getattr(credentials, "granted_scopes", None)
    if not granted_scopes:
        granted_scopes = (getattr(flow.oauth2session, "token", None) or {}).get("scope")
    if granted_scopes:
        granted = set(granted_scopes.split() if isinstance(granted_scopes, str) else granted_scopes)
        if not set(GOOGLE_SCOPES).issubset(granted):
            missing = set(GOOGLE_SCOPES) - granted
            if "https://www.googleapis.com/auth/spreadsheets" in missing:
                raise OperatorAuthError(
                    "Login Google diterima, tetapi izin Google Sheets belum diberikan. "
                    "Tinjau layar persetujuan OAuth dan izin Workspace BPS."
                )
            raise OperatorAuthError(
                "Login Google diterima tetapi izin identitas belum lengkap. "
                "Ulangi persetujuan login menggunakan akun operator BPS."
            )

    try:
        client = gspread.authorize(credentials)
    except Exception as exc:
        raise OperatorAuthError(
            "Token Google berhasil diperoleh, tetapi inisialisasi Google Sheets gagal "
            "(" + type(exc).__name__ + ")."
        ) from exc
    return OperatorSession(
        google_id_token=str(token),
        spreadsheet_client=client,
    )
