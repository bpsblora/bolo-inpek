"""Sinkronisasi konfigurasi survei BOLO INPEK dari Firestore (akses operator).

Alur keamanan:
- Konfigurasi PUBLIC updater-settings.json tidak berisi password atau ID FASIH.
- Operator login Google lewat OAuth Desktop (loopback/PKCE), kemudian token
  Google ditukar menjadi Firebase Auth ID token.
- Firestore Security Rules memastikan akun masuk daftar admins / operators.
- Hanya survei active=true yang diambil, dipasangkan dengan scraper_configs
  yang private. Kegagalan online MENGHENTIKAN scraping (tanpa fallback diam-diam).
- SSO FASIH tetap akun bersama dari .env pada PC dan TIDAK terlibat di sini.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
from typing import Callable
from urllib.parse import urlencode

import requests

SETTINGS_URL = "https://bpsblora.github.io/bolo-inpek/updater-settings.json"
REQUIRED = (
    "code", "name", "survey_id", "survey_period_id",
    "role_pencacah_id", "role_pengawas_id", "nama_assignment_field"
)
HOSTS = {
    "https://identitytoolkit.googleapis.com",
    "https://firestore.googleapis.com",
}


class OnlineConfigError(RuntimeError):
    """Kesalahan konfigurasi, autentikasi atau pembacaan registry online."""


def read_public_settings(script_dir: Path, request_get=requests.get) -> dict:
    """Untuk testing bisa gunakan updater-settings.json lokal.

    Saat produksi, file diunduh dari URL GitHub Pages resmi. Tidak menerima
    alamat server bebas atau URL HTTP.
    """
    local = script_dir / "updater-settings.json"
    if local.exists():
        try:
            settings = json.loads(local.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as exc:
            raise OnlineConfigError("updater-settings.json lokal tidak valid.") from exc
    else:
        try:
            response = request_get(SETTINGS_URL, timeout=15, allow_redirects=False)
            if response.status_code != 200:
                raise OnlineConfigError(
                    "Konfigurasi online belum diterbitkan di website BOLO INPEK."
                )
            settings = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise OnlineConfigError("Gagal mengunduh konfigurasi publik updater.") from exc

    if not isinstance(settings, dict) or settings.get("enabled") is not True:
        raise OnlineConfigError(
            "Sinkronisasi online belum diaktifkan oleh admin BOLO INPEK."
        )
    for key in ("firebase_project_id", "firebase_api_key", "google_oauth_desktop_client_id"):
        val = settings.get(key)
        if not isinstance(val, str) or not val.strip():
            raise OnlineConfigError("Konfigurasi updater belum lengkap: " + key)
    if not all(c.isascii() and (c.isalnum() or c in "-") for c in settings["firebase_project_id"]):
        raise OnlineConfigError("Firebase project ID tidak valid.")
    return settings


def _get_google_credentials(client_id: str):
    """Login interaktif Google BPS untuk otorisasi membaca konfigurasi.

    Ini login admin/operator Updater, terpisah dari akun bersama SSO FASIH.
    Refresh token tidak disimpan. Pengguna login sekali tiap sesi Updater.
    """
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:
        raise OnlineConfigError("Library OAuth Google belum tersedia pada updater.") from exc
    flow = InstalledAppFlow.from_client_config(
        {"installed": {
            "client_id": client_id,
            "client_secret": "",
            "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"]
        }},
        scopes=["openid", "email", "profile"],
    )
    try:
        credentials = flow.run_local_server(
            host="127.0.0.1",
            port=0,
            open_browser=True,
            authorization_prompt_message="",
            success_message="Login Updater berhasil. Kembali ke BOLO INPEK Updater.",
            prompt="select_account",
            timeout_seconds=180,
        )
    except Exception as exc:
        raise OnlineConfigError(
            "Login Google gagal atau dibatalkan. Periksa izin OAuth aplikasi BPS."
        ) from exc
    if not credentials.id_token:
        raise OnlineConfigError("Login Google tidak menghasilkan ID token.")
    return credentials.id_token


def _firebase_id_token(settings: dict, google_id_token: str,
                       request_post=requests.post) -> str:
    body = {
        "postBody": urlencode({
            "id_token": google_id_token,
            "providerId": "google.com"
        }),
        "requestUri": "http://localhost",
        "returnSecureToken": True,
        "returnIdpCredential": False,
    }
    try:
        response = request_post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp",
            params={"key": settings["firebase_api_key"]},
            json=body, timeout=25,
        )
    except requests.RequestException as exc:
        raise OnlineConfigError("Server autentikasi Firebase tidak dapat dihubungi.") from exc
    if response.status_code != 200:
        raise OnlineConfigError(
            "Autentikasi Firebase ditolak (HTTP " + str(response.status_code) + ")."
        )
    token = response.json().get("idToken")
    if not isinstance(token, str) or not token:
        raise OnlineConfigError("Firebase tidak mengirim token akses.")
    return token


def _field_value(value):
    if "stringValue" in value:
        return value["stringValue"]
    if "booleanValue" in value:
        return value["booleanValue"]
    raise OnlineConfigError("Tipe nilai konfigurasi Firestore tidak dikenali.")


def _list_collection(settings: dict, collection: str, token: str,
                     request_get=requests.get) -> list[dict]:
    if collection not in ("surveys", "scraper_configs"):
        raise OnlineConfigError("Koleksi konfigurasi tidak diizinkan.")
    base = (
        "https://firestore.googleapis.com/v1/projects/"
        + settings["firebase_project_id"]
        + "/databases/(default)/documents/" + collection
    )
    docs, page_token = [], None
    for _ in range(20):
        params = {"pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
        try:
            response = request_get(
                base,
                headers={"Authorization": "Bearer " + token},
                params=params, timeout=25
            )
        except requests.RequestException as exc:
            raise OnlineConfigError("Gagal membaca konfigurasi online.") from exc
        if response.status_code == 403:
            raise OnlineConfigError(
                "Akun Google belum diberi izin membaca ID FASIH. "
                "Admin perlu menambahkan akun ke daftar operator updater."
            )
        if response.status_code != 200:
            raise OnlineConfigError(
                "Pembacaan " + collection + " gagal (HTTP " +
                str(response.status_code) + ")."
            )
        payload = response.json()
        for document in payload.get("documents", []):
            fields = document.get("fields", {})
            if not isinstance(fields, dict):
                raise OnlineConfigError("Struktur dokumen Firestore tidak valid.")
            docs.append({name: _field_value(value) for name, value in fields.items()})
        page_token = payload.get("nextPageToken")
        if not page_token:
            return docs
    raise OnlineConfigError("Konfigurasi survei melebihi batas halaman yang aman.")


def create_active_config(surveys: list[dict],
                         configs: list[dict]) -> dict:
    """Gabungkan metadata aktif dengan tujuh ID internal, tanpa data parsial."""
    lookup = {}
    for config in configs:
        key = config.get("id")
        if not isinstance(key, str) or not key or key in lookup:
            raise OnlineConfigError("Identitas konfigurasi FASIH duplikat/tidak valid.")
        lookup[key] = config

    result, used_names = [], set()
    for survey in surveys:
        if survey.get("active") is False:
            continue
        sid = survey.get("id")
        row = lookup.get(sid)
        if not row:
            raise OnlineConfigError(
                "Survei aktif belum memiliki ID FASIH lengkap: " +
                str(survey.get("name", "Tidak dikenal"))[:100]
            )
        name = survey.get("name")
        if row.get("name") != name:
            raise OnlineConfigError("Nama survei di dashboard dan FASIH tidak cocok.")
        record = {}
        for key in REQUIRED:
            item = row.get(key)
            if not isinstance(item, str) or not item.strip() or len(item) > 140:
                raise OnlineConfigError(
                    "ID FASIH belum lengkap untuk survei " + str(name)[:100]
                )
            record[key] = item.strip()
        normalized = name.casefold()
        if normalized in used_names:
            raise OnlineConfigError("Nama survei aktif ganda.")
        used_names.add(normalized)
        result.append(record)
    if not result:
        raise OnlineConfigError("Tidak ada survei aktif untuk diperbarui.")
    if len(result) > 500:
        raise OnlineConfigError("Jumlah survei melampaui batas keamanan.")
    return {"surveys": result}


def _save_atomic(script_dir: Path, config: dict) -> Path:
    """Tulis JSON lengkap secara atomik, jangan mengubah file saat gagal."""
    path = script_dir / "config_survei.json"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=script_dir,
            prefix=".bolo-config-", suffix=".tmp", delete=False
        ) as fp:
            temp_path = Path(fp.name)
            json.dump(config, fp, ensure_ascii=False, indent=2)
            fp.write("\n")
        if os.name != "nt":
            os.chmod(temp_path, 0o600)
        os.replace(temp_path, path)
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()
    return path


def synchronize_online(script_dir: Path, log: Callable[[str], None],
                       get_credentials=_get_google_credentials,
                       request_get=requests.get,
                       request_post=requests.post) -> int:
    """Ambil konfigurasi TERBARU di awal setiap pembaruan data.

    Kesalahan Firestore/Google akan membatalkan scraping; tidak menggunakan
    konfigurasi kemarin secara diam-diam.
    """
    settings = read_public_settings(script_dir, request_get=request_get)
    log("Menghubungkan Google untuk memeriksa izin operator updater...")
    google_token = get_credentials(settings["google_oauth_desktop_client_id"])
    token = _firebase_id_token(settings, google_token, request_post=request_post)
    log("Membaca daftar survei aktif dan identitas FASIH terbaru...")
    surveys = _list_collection(settings, "surveys", token, request_get=request_get)
    internal = _list_collection(
        settings, "scraper_configs", token, request_get=request_get
    )
    current = create_active_config(surveys, internal)
    _save_atomic(script_dir, current)
    log("Konfigurasi online siap: " + str(len(current["surveys"])) + " survei aktif.")
    return len(current["surveys"])
