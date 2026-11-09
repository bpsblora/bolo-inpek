"""Read-only test: one page of FASIH assignment data, no spreadsheet writes.

This module uses an existing authenticated SSO cookie session only to query
the known official FASIH datatable endpoint. It never calls scraper.main(),
any upload function, Firebase, Google Sheets, file writes or other FASIH API.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit
import json

from browser_driver import CHROME_BROWSER, FASIH_HOST
from sso_diagnostic import SSOTestError, test_sso_login

ASSIGNMENT_URL = (
    "https://fasih-sm.bps.go.id/app/api/analytic/api/v2/"
    "assignment/datatable-all-user-survey-periode"
)
MAX_SAMPLE = 20
REQUIRED_KEYS = ("code", "name", "survey_id", "survey_period_id")


class AssignmentReadError(SSOTestError):
    """A safe, no-sensitive-data error for read-only FASIH diagnostics."""


def list_test_surveys(script_dir: Path) -> list[dict[str, str]]:
    """Load local config (never fetch/update it), returning survey labels/IDs."""
    path = Path(script_dir).resolve() / "config_survei.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        surveys = data["surveys"]
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise AssignmentReadError(
            "config_survei.json tidak ditemukan atau tidak valid."
        ) from None
    if not isinstance(surveys, list):
        raise AssignmentReadError("Daftar surveys pada config_survei.json tidak valid.")
    valid = []
    seen = set()
    for item in surveys:
        if not isinstance(item, dict) or any(
            not isinstance(item.get(k), str) or not item[k].strip()
            for k in REQUIRED_KEYS
        ):
            continue
        key = item["code"].strip().upper()
        if key in seen:
            continue
        valid.append({k: item[k].strip() for k in REQUIRED_KEYS})
        seen.add(key)
    if not valid:
        raise AssignmentReadError("Tidak ada survei yang siap diuji pada konfigurasi lokal.")
    return valid


def _assignment_payload(period_id: str) -> dict:
    """Exactly follow the legacy scraper's POST-based DataTables *search*."""
    return {
        "start": 0,
        "length": MAX_SAMPLE,
        "columns": [
            {"data": field, "orderable": True}
            for field in (
                "id", "codeIdentity", *(f"data{x}" for x in range(1, 11))
            )
        ],
        "order": [],
        "search": {"value": "", "regex": False},
        "assignmentExtraParam": {
            "surveyPeriodId": period_id,
            "assignmentErrorStatusType": -1,
            "filterTargetType": "TARGET_ONLY",
        },
    }


def query_assignment_sample(session, survey: dict[str, str], report: Callable[[str], None]) -> dict:
    """Make one HTTPS datatable-search request and aggregate anonymized stats.

    The FASIH endpoint is POST for searching; this is not a write endpoint.
    No assignment content, cookies, IDs, or PII are saved or printed.
    """
    parsed = urlsplit(ASSIGNMENT_URL)
    if parsed.scheme != "https" or parsed.hostname != FASIH_HOST or not parsed.path.endswith(
        "/assignment/datatable-all-user-survey-periode"
    ):
        raise AssignmentReadError("Alamat API FASIH tidak sesuai endpoint resmi.")
    if any(not survey.get(k) for k in REQUIRED_KEYS):
        raise AssignmentReadError("Konfigurasi survei yang dipilih belum lengkap.")
    if getattr(session, "verify", None) is not True:
        raise AssignmentReadError("Verifikasi HTTPS pada sesi FASIH belum aktif.")
    if not getattr(session, "cookies", None):
        raise AssignmentReadError("Cookie sesi FASIH tidak tersedia.")
    report("Mengirim satu permintaan POST pencarian DataTables FASIH (hanya baca)...")
    try:
        response = session.post(
            ASSIGNMENT_URL,
            json=_assignment_payload(survey["survey_period_id"]),
            timeout=(8, 35),
            allow_redirects=False,
        )
    except Exception as exc:
        raise AssignmentReadError(
            "Endpoint pencarian assignment tidak merespons ("
            + type(exc).__name__ + "). Periksa VPN dan sesi API."
        ) from None
    status = response.status_code
    if status in (401, 403):
        raise AssignmentReadError(
            "API FASIH menolak akses (HTTP " + str(status)
            + "). Login SSO berhasil, tetapi izin/sesi API belum diterima."
        )
    if status in (301, 302, 303, 307, 308):
        raise AssignmentReadError(
            "API FASIH mengalihkan ke halaman lain (HTTP " + str(status)
            + "). Kemungkinan sesi belum dapat mengakses endpoint assignment."
        )
    if status != 200:
        raise AssignmentReadError(
            "API FASIH merespons HTTP " + str(status)
            + ". Pengujian berhenti tanpa mengubah data."
        )
    try:
        payload = response.json()
    except ValueError:
        raise AssignmentReadError("API FASIH tidak mengembalikan JSON assignment.") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("searchData"), list):
        raise AssignmentReadError(
            "Struktur respons API FASIH berbeda: searchData bukan daftar."
        )
    records = payload["searchData"]
    if len(records) > MAX_SAMPLE or any(not isinstance(row, dict) for row in records):
        raise AssignmentReadError("Struktur atau batas jumlah assignment tidak sesuai.")
    statuses = Counter(
        str(row.get("assignmentStatusAlias") or "TIDAK TERISI").strip()
        for row in records
    )
    total = None
    for key in ("recordsFiltered", "recordsTotal"):
        value = payload.get(key)
        if isinstance(value, int) and value >= 0:
            total = value
            break
        if isinstance(value, str) and value.isdigit():
            total = int(value)
            break
    required_field_count = sum(
        bool(row.get("id")) and bool(row.get("assignmentStatusAlias"))
        for row in records
    )
    report("API FASIH dapat dibaca: " + str(len(records))
           + " assignment sampel untuk " + survey["code"] + ".")
    for name, count in sorted(statuses.items()):
        # The server's original status label may be untrusted text; display
        # only known fixed statuses, otherwise aggregate without echoing it.
        cleaned = name.upper().strip()
        known = (
            "OPEN", "SUBMITTED", "APPROVED", "REJECTED", "COMPLETED",
            "SUBMITTED BY PENCACAH", "APPROVED BY PENGAWAS",
            "REJECTED BY PENGAWAS", "COMPLETED BY ADMIN KABUPATEN",
            "APPROVED BY ADMIN",
        )
        if cleaned in known:
            report("Status " + cleaned + ": " + str(count))
    report("Assignment sampel dengan ID dan Status tersedia: "
           + str(required_field_count) + "/" + str(len(records)) + ".")
    if total is not None:
        report("Total yang dilaporkan API: " + str(total)
               + " (tidak seluruhnya diunduh).")
    else:
        report("Total semua assignment belum tersedia dari metadata respons.")
    return {
        "survey": survey["code"], "sample_count": len(records),
        "total_reported": total, "status_count": dict(statuses),
        "field_valid_count": required_field_count,
    }


def test_assignment_readonly(
    script: Path, username: str, password: str, survey_code: str,
    report: Callable[[str], None],
    *,
    browser_factory=None,
) -> dict:
    """Login via UC, query one sample page, destroy the in-memory session."""
    available = list_test_surveys(Path(script).resolve().parent)
    chosen = next(
        (s for s in available if s["code"].upper() == survey_code.upper()), None
    )
    if chosen is None:
        raise AssignmentReadError(
            "Survei tidak ditemukan pada config_survei.json di folder EXE."
        )
    result = {}
    report("Survei uji: " + chosen["name"]
           + ". Batas pengambilan: " + str(MAX_SAMPLE) + " assignment.")
    report("Tidak akan memanggil scraper utama atau menulis Google Sheets.")
    def read_on_authenticated_session(session):
        result.update(query_assignment_sample(session, chosen, report))
    test_sso_login(
        script, CHROME_BROWSER, username, password, report,
        browser_factory=browser_factory, after_login=read_on_authenticated_session,
    )
    if not result:
        raise AssignmentReadError("Uji assignment belum menghasilkan hasil yang valid.")
    return result
