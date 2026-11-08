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
    "openid", "email", "profile",
    "https://www.googleapis.com/auth/spreadsheets",
]


class OperatorAuthError(RuntimeError):
    pass


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
            success_message="Login operator berhasil. Kembali ke BOLO INPEK Updater.",
            prompt="select_account",
            timeout_seconds=180,
        )
    except Exception as exc:
        raise OperatorAuthError(
            "Login Google operator gagal. Pastikan izin Google Sheets disetujui "
            "pada pengaturan OAuth BPS."
        ) from exc

    token = getattr(credentials, "id_token", None)
    if not token:
        token = (getattr(flow.oauth2session, "token", None) or {}).get("id_token")
    if not token:
        raise OperatorAuthError("Google tidak mengembalikan ID token untuk akses Firebase.")

    return OperatorSession(
        google_id_token=str(token),
        spreadsheet_client=gspread.authorize(credentials),
    )
