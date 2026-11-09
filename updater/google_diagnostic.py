"""Pengujian OAuth dan Google Sheets TANPA VPN, SSO, scraping, atau penulisan.

Dokumen settings publik disertakan di EXE sebagai data, bukan disalin per PC.
Flag enabled=false sengaja diabaikan HANYA untuk uji koneksi baca. Jalur
Perbarui Data FASIH tetap memakai read_public_settings() yang menolak
enabled=false sehingga sinkronisasi produksi tidak terbuka lewat tes ini.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Callable

from cloud_config import (
    OnlineConfigError, read_desktop_oauth_client, _firebase_id_token,
    fetch_sheet_targets,
)
from operator_google import login_operator
from preflight import verify_google_sheets_client


def load_diagnostic_settings(settings_path: Path | None = None) -> dict:
    if settings_path is None:
        if getattr(sys, "frozen", False):
            settings_path = Path(sys._MEIPASS) / "updater-settings.json"
        else:
            settings_path = Path(__file__).resolve().parent.parent / "updater-settings.json"
    try:
        settings = json.loads(Path(settings_path).read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, ValueError) as exc:
        raise OnlineConfigError(
            "Konfigurasi publik untuk uji Google belum dibundel pada Updater."
        ) from exc
    for field in ("firebase_project_id", "firebase_api_key", "google_oauth_desktop_client_id"):
        value = settings.get(field) if isinstance(settings, dict) else None
        if not isinstance(value, str) or not value.strip():
            raise OnlineConfigError("Pengaturan uji Google belum lengkap: " + field)
    if not re.fullmatch(r"[a-z][a-z0-9-]{5,80}", settings["firebase_project_id"]):
        raise OnlineConfigError("Project Firebase untuk tes tidak valid.")
    if not settings["google_oauth_desktop_client_id"].endswith(".apps.googleusercontent.com"):
        raise OnlineConfigError("OAuth Desktop Client ID untuk tes tidak valid.")
    # Jangan mengaktifkan mode online scraping lewat tombol tes.
    return settings


def run_read_only_google_test(
    oauth_file: Path,
    report: Callable[[str], None],
    *,
    settings_loader=load_diagnostic_settings,
    oauth_reader=read_desktop_oauth_client,
    operator_login=login_operator,
    firebase_exchange=_firebase_id_token,
    target_reader=fetch_sheet_targets,
    sheets_verifier=verify_google_sheets_client,
) -> None:
    """Membuktikan Google -> Firebase -> dua Sheets secara baca saja.

    Tidak memanggil check_files, verify_fasih_access, synchronize_online,
    run_legacy_scraper, ataupun API tulis Google Sheets.
    """
    settings = settings_loader()
    report("Memvalidasi OAuth Desktop resmi pada PC...")
    client_config = oauth_reader(
        Path(oauth_file).parent,
        settings["google_oauth_desktop_client_id"],
        client_path=oauth_file,
    )
    report("Membuka login Google operator untuk uji izin baca...")
    session = operator_login(client_config)

    report("Memeriksa akses Firebase ke konfigurasi spreadsheet privat...")
    id_token = firebase_exchange(settings, session.google_id_token)
    targets = target_reader(settings, id_token)
    report("Firebase mengizinkan akun ini membaca konfigurasi tujuan.")

    report("Memeriksa akses baca kedua Google Sheets dan tab wajib...")
    sheets_verifier(session.spreadsheet_client, targets, report)
    report("UJI BERHASIL: login Google, Firebase, dan kedua Google Sheets.")
    report("Tidak ada scraping, login FASIH, perubahan spreadsheet, atau file lokal yang ditulis.")
