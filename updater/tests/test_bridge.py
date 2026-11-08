"""Offline regression tests; no VPN, SSO, or spreadsheet access."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from legacy_bridge import check_files, run_legacy_scraper


class PortableUpdaterTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        root = Path(self.folder.name)
        self.root = root
        self.script = root / "ambil_data_monitoring_inpek_v2.py"
        (root / ".env").write_text(
            "GOOGLE_SPREADSHEET_ID=TEST_ONLY\n"
            "GOOGLE_CREDENTIALS_FILE=credentials.json\n"
            "FASIH_USERNAME=should_not_be_used\n"
            "FASIH_PASSWORD=should_not_be_used\n",
            encoding="utf8"
        )
        (root / "config_survei.json").write_text(
            '{"surveys":[{"code":"TEST","name":"TEST"}]}', encoding="utf8"
        )
        (root / "credentials.json").write_text('{"test":"dummy"}', encoding="utf8")

    def test_checks_missing_script(self):
        issues = check_files(self.script)
        self.assertTrue(issues)

    def test_no_external_dependencies_required_for_status_checks(self):
        self.script.write_text("pass\n", encoding="utf8")
        self.assertEqual(check_files(self.script), [])

    def test_manual_login_replaces_password_entry_and_extends_wait(self):
        self.script.write_text('''
def baca_pengaturan():
    raise AssertionError("Old SSO credential reader must not run")
def login_sso_eksternal(driver, username, password):
    raise AssertionError("Old auto-login must not run")
def tunggu_login_berhasil(driver, timeout=90):
    assert timeout >= 300, "Manual login timeout must be longer"
    print("manual login wait invoked")
def main():
    username, password = baca_pengaturan()
    login_sso_eksternal(None, username, password)
    tunggu_login_berhasil(None)
    print("test scraper completed")
''', encoding="utf8")
        log = []
        with patch.dict(os.environ, {"FASIH_USERNAME":"old", "FASIH_PASSWORD":"old"}):
            run_legacy_scraper(self.script, log.append)
            self.assertNotIn("FASIH_PASSWORD", os.environ)
            self.assertNotIn("FASIH_USERNAME", os.environ)
        self.assertTrue(any("manual login wait invoked" in line for line in log))
        self.assertTrue(any("test scraper completed" in line for line in log))
        self.assertFalse(any("should_not_be_used" in line for line in log))


if __name__ == "__main__":
    unittest.main()
