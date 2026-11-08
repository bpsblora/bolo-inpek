"""Tests for the local preflight (no real Sheets access, no secrets)."""
import json
from pathlib import Path
import tempfile
import unittest

from preflight import (
    PreflightError, preflight_google_sheets, read_local_setup,
    REQUIRED_MONITORING_TABS, INTERNAL_SOURCE_TABS
)


class FakeSheet:
    def __init__(self, tabs):
        self.tabs = tabs
    def worksheets(self):
        return [type("Tab", (), {"title": x})() for x in self.tabs]


class FakeGspread:
    def __init__(self, sheets):
        self.sheets = sheets
        self.opens = []
    def service_account(self, filename):
        assert Path(filename).is_file()
        return self
    def open_by_key(self, key):
        self.opens.append(key)
        return self.sheets[key]


class PreflightTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        (self.folder / ".env").write_text(
            "FASIH_USERNAME=shared_account_test\n"
            "FASIH_PASSWORD=never_print_this\n"
            "GOOGLE_SPREADSHEET_ID=monitoring-test-sheet\n"
            "TINDAK_LANJUT_SPREADSHEET_ID=internal-test-sheet\n"
            "GOOGLE_CREDENTIALS_FILE=credentials.json\n",
            encoding="utf8"
        )
        (self.folder / "credentials.json").write_text(json.dumps({
            "type": "service_account",
            "client_email": "demo@example.invalid",
            "private_key": "DUMMY-KEY-NOT-REAL"
        }), encoding="utf8")

    def test_setup_is_checked_without_exposing_secrets(self):
        settings = read_local_setup(self.folder)
        self.assertEqual(settings["monitoring_id"], "monitoring-test-sheet")
        self.assertNotIn("FASIH_PASSWORD", settings)
        self.assertNotIn("DUMMY-KEY", str(settings))

    def test_both_sheets_are_verified_before_scraping(self):
        backend = FakeGspread({
            "monitoring-test-sheet": FakeSheet(REQUIRED_MONITORING_TABS),
            "internal-test-sheet": FakeSheet(INTERNAL_SOURCE_TABS)
        })
        log = []
        preflight_google_sheets(self.folder, log.append, gspread_module=backend)
        self.assertEqual(backend.opens, ["monitoring-test-sheet", "internal-test-sheet"])
        self.assertFalse(any("never_print_this" in row for row in log))

    def test_missing_tab_prevents_scraping(self):
        backend = FakeGspread({
            "monitoring-test-sheet": FakeSheet(("monitoring",)),
            "internal-test-sheet": FakeSheet(INTERNAL_SOURCE_TABS)
        })
        with self.assertRaisesRegex(PreflightError, "periode_survei"):
            preflight_google_sheets(self.folder, lambda _:None, gspread_module=backend)

    def test_missing_internal_id_is_rejected(self):
        env = self.folder / ".env"
        content = env.read_text(encoding="utf8")
        env.write_text(content.replace(
            "TINDAK_LANJUT_SPREADSHEET_ID=internal-test-sheet\n", ""
        ), encoding="utf8")
        with self.assertRaisesRegex(PreflightError, "TINDAK_LANJUT_SPREADSHEET_ID"):
            read_local_setup(self.folder)

    def test_same_id_for_public_and_internal_is_rejected(self):
        env = self.folder / ".env"
        content = env.read_text(encoding="utf8")
        env.write_text(content.replace(
            "TINDAK_LANJUT_SPREADSHEET_ID=internal-test-sheet",
            "TINDAK_LANJUT_SPREADSHEET_ID=monitoring-test-sheet"
        ), encoding="utf8")
        with self.assertRaisesRegex(PreflightError, "berbeda"):
            read_local_setup(self.folder)

    def test_bad_service_account_rejected(self):
        (self.folder / "credentials.json").write_text(
            '{"type": "authorized_user"}', encoding="utf8"
        )
        with self.assertRaises(PreflightError):
            read_local_setup(self.folder)


if __name__ == "__main__":
    unittest.main()
