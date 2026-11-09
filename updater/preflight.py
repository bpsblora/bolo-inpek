"""Pemeriksaan aman sebelum scraper BOLO INPEK mengubah Google Sheets.

- Validasi lokal .env, dua spreadsheet ID berbeda, service account JSON.
- Pastikan tab wajib pada spreadsheet monitoring ada, dan sumber tindak lanjut
  dapat dibuka. Tidak ada penulisan pada tahap pemeriksaan.
- Tidak pernah mencetak atau menyimpan isi password / private key.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

REQUIRED_MONITORING_TABS = ("monitoring", "periode_survei", "db_petugas")
INTERNAL_SOURCE_TABS = ("sumber_assignment", "sumber_petugas", "sumber_survei")


class PreflightError(RuntimeError):
    pass


def read_shared_sso_setup(script_dir: Path) -> None:
    """Hanya akun SSO bersama yang diperlukan di PC untuk mode OAuth Google."""
    from dotenv import dotenv_values
    env = Path(script_dir) / ".env"
    if not env.is_file():
        raise PreflightError(
            "Konfigurasi SSO bersama belum tersedia di komputer operator."
        )
    values = dotenv_values(env)
    if not all((values.get(k) or "").strip() for k in (
        "FASIH_USERNAME", "FASIH_PASSWORD"
    )):
        raise PreflightError(
            "Akun SSO bersama belum dikonfigurasi secara privat pada PC ini."
        )


def read_local_setup(script_dir: Path, *, require_sso: bool = True) -> dict[str, str]:
    from dotenv import dotenv_values

    script_dir = Path(script_dir).expanduser().resolve()
    env_path = script_dir / ".env"
    if not env_path.is_file():
        raise PreflightError("File .env privat tidak ditemukan di folder scraper.")
    values = dotenv_values(env_path)
    required = ["GOOGLE_SPREADSHEET_ID", "TINDAK_LANJUT_SPREADSHEET_ID"]
    if require_sso:
        required.extend(["FASIH_USERNAME", "FASIH_PASSWORD"])
    missing = [
        key for key in required if not isinstance(values.get(key), str)
        or not values[key].strip()
    ]
    if missing:
        raise PreflightError(
            "Lengkapi variabel berikut di .env lokal: " + ", ".join(missing)
        )

    public_id = values["GOOGLE_SPREADSHEET_ID"].strip()
    private_id = values["TINDAK_LANJUT_SPREADSHEET_ID"].strip()
    if public_id == private_id:
        raise PreflightError(
            "Spreadsheet monitoring dan sumber tindak lanjut harus berbeda."
        )

    credentials_name = (values.get("GOOGLE_CREDENTIALS_FILE") or "credentials.json").strip()
    cred_path = (script_dir / credentials_name).resolve()
    try:
        cred_path.relative_to(script_dir)
    except ValueError as exc:
        raise PreflightError("Google credentials harus disimpan di folder scraper.") from exc
    if not cred_path.is_file():
        raise PreflightError("File kredensial Google Sheets tidak ditemukan.")

    try:
        credentials = json.loads(cred_path.read_text(encoding="utf-8-sig"))
    except (ValueError, OSError, UnicodeError) as exc:
        raise PreflightError("JSON kredensial Google tidak valid.") from exc
    if (not isinstance(credentials, dict)
        or credentials.get("type") != "service_account"
        or not credentials.get("client_email")
        or not credentials.get("private_key")):
        raise PreflightError("Kredensial Google bukan service account yang valid.")

    return {
        "script_dir": str(script_dir),
        "credentials_path": str(cred_path),
        "monitoring_id": public_id,
        "internal_id": private_id,
    }


def preflight_google_sheets(
    script_dir: Path, log: Callable[[str], None], *, connect=True, gspread_module=None
) -> None:
    """Cek akses baca dua Sheets; kegagalan membatalkan scraping.

    Validasi akses Editor tetap harus dilakukan dalam uji operasional, karena
    read-only preflight tidak melakukan modifikasi yang berisiko.
    """
    settings = read_local_setup(script_dir, require_sso=False)
    log("Konfigurasi privat dan dua tujuan Google Sheets telah diperiksa.")

    if not connect:
        return

    if gspread_module is None:
        import gspread as gspread_module

    try:
        client = gspread_module.service_account(
            filename=settings["credentials_path"]
        )
    except Exception as exc:
        raise PreflightError(
            "Kredensial service account tidak dapat digunakan untuk Google Sheets."
        ) from exc

    verify_google_sheets_client(
        client, {
            "monitoring_id": settings["monitoring_id"],
            "tindak_lanjut_id": settings["internal_id"]
        }, log
    )


def verify_google_sheets_client(client, targets: dict, log: Callable[[str], None]) -> None:
    """Akses baca kedua spreadsheet dengan akun Google yang login di Updater.

    Tidak menyimpan token dan tidak menulis data. Scope Sheets memerlukan
    izin editor untuk operasi scraping yang akan berlangsung setelahnya.
    """
    monitoring_id = targets.get("monitoring_id")
    internal_id = targets.get("tindak_lanjut_id")
    if not monitoring_id or not internal_id or monitoring_id == internal_id:
        raise PreflightError("Konfigurasi dua spreadsheet belum lengkap atau identik.")
    try:
        monitoring = client.open_by_key(monitoring_id)
        internal = client.open_by_key(internal_id)
    except Exception as exc:
        raise PreflightError(
            "Akun Google operator tidak dapat membuka kedua spreadsheet. "
            "Periksa izin akses dan Google Sheets API."
        ) from exc

    monitoring_tabs = {ws.title for ws in monitoring.worksheets()}
    missing = sorted(set(REQUIRED_MONITORING_TABS) - monitoring_tabs)
    if missing:
        raise PreflightError(
            "Tab wajib spreadsheet monitoring belum ada: " + ", ".join(missing)
        )

    internal_tabs = {ws.title for ws in internal.worksheets()}
    new_tabs = sorted(set(INTERNAL_SOURCE_TABS) - internal_tabs)
    if new_tabs:
        log(
            "Catatan: tab sumber tindak lanjut belum ada: "
            + ", ".join(new_tabs)
            + ". Script lama akan membuatnya saat pertama kali upload jika memiliki izin Editor."
        )
    log(
        "Kedua spreadsheet dapat dibuka. Pastikan akun Google/operator mempunyai "
        "izin Editor; pemeriksaan ini tidak melakukan perubahan data."
    )
