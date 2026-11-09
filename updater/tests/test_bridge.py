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
            "FASIH_USERNAME=shared_sso_test\n"
            "FASIH_PASSWORD=test-private-password\n",
            encoding="utf8"
        )
        (root / "config_survei.json").write_text(
            '{"surveys":[{"code":"TEST","name":"TEST",'
            + '"survey_id":"survey-demo","survey_period_id":"period-demo",'
            + '"role_pencacah_id":"ppl-demo","role_pengawas_id":"pml-demo",'
            + '"nama_assignment_field":"data3"}]}', encoding="utf8"
        )
        (root / "credentials.json").write_text('{"test":"dummy"}', encoding="utf8")

    def test_checks_missing_script(self):
        issues = check_files(self.script)
        self.assertTrue(issues)

    def test_no_external_dependencies_required_for_status_checks(self):
        self.script.write_text("pass\n", encoding="utf8")
        self.assertEqual(check_files(self.script), [])

    def test_rejects_incomplete_survey_configuration(self):
        self.script.write_text("pass\\n", encoding="utf8")
        (self.root / "config_survei.json").write_text(
            '{"surveys":[{"code":"TEST","name":"TEST"}]}',
            encoding="utf8"
        )
        self.assertTrue(any("ID dan field" in x for x in check_files(self.script)))

    def test_online_oauth_overrides_stale_sheet_ids_from_legacy_env(self):
        self.script.write_text('''
import os
from types import SimpleNamespace
gspread = SimpleNamespace(service_account=lambda filename=None: None)
def baca_pengaturan():
    os.environ["GOOGLE_SPREADSHEET_ID"] = "STALE_FROM_LEGACY_ENV"
    os.environ["TINDAK_LANJUT_SPREADSHEET_ID"] = "STALE_INTERNAL"
    return "shared_sso_test", "test-private-password"
def login_sso_eksternal(driver, username, password):
    assert username == "shared_sso_test"
def tunggu_login_berhasil(driver, timeout=90):
    return None
def main():
    baca_pengaturan()
    assert os.getenv("GOOGLE_SPREADSHEET_ID") == "MONITORING_FROM_CLOUD"
    assert os.getenv("TINDAK_LANJUT_SPREADSHEET_ID") == "INTERNAL_FROM_CLOUD"
    assert gspread.service_account() is not None
    assert len(baca_database_nama_petugas()) == 1
''', encoding="utf8")
        class FakeSheet:
            def get_all_records(self):
                return [{"email": "staff@example.invalid", "nama": "Test Staff"}]
        class FakeWorkbook:
            def worksheet(self, name):
                self_last = name
                assert self_last == "db_petugas"
                return FakeSheet()
        class FakeGspread:
            def open_by_key(self, key):
                assert key == "MONITORING_FROM_CLOUD"
                return FakeWorkbook()
        log = []
        run_legacy_scraper(
            self.script, log.append,
            authorized_client=FakeGspread(),
            spreadsheet_targets={
                "monitoring_id": "MONITORING_FROM_CLOUD",
                "tindak_lanjut_id": "INTERNAL_FROM_CLOUD"
            }
        )
        self.assertTrue(any("selesai" in item.lower() for item in log))

    def test_sso_username_and_password_from_form_without_env_file(self):
        (self.root / ".env").unlink()
        self.script.write_text('''
from types import SimpleNamespace
gspread = SimpleNamespace(service_account=lambda filename=None: None)
def baca_pengaturan():
    raise AssertionError("Must not read .env for SSO")
def login_sso_eksternal(driver, username, password):
    assert username == "operator@example.invalid"
    assert password == "TEST_PASSWORD_DO_NOT_LOG"
    print("SSO=" + username + " pw=" + password)
def tunggu_login_berhasil(driver, timeout=90):
    return None
def main():
    username, password = baca_pengaturan()
    login_sso_eksternal(None, username, password)
''', encoding="utf8")
        class FakeSheet:
            def get_all_records(self):
                return [{"email": "staff@example.invalid", "nama": "Test Staff"}]
        class FakeWorkbook:
            def worksheet(self, name):
                return FakeSheet()
        class FakeGspread:
            def open_by_key(self, key):
                return FakeWorkbook()
        logs = []
        self.assertEqual(check_files(
            self.script, require_google_credentials=False, require_sso_env=False
        ), [])
        run_legacy_scraper(
            self.script, logs.append,
            authorized_client=FakeGspread(),
            spreadsheet_targets={
                "monitoring_id": "SHEET_EXAMPLE_MONITORING",
                "tindak_lanjut_id": "SHEET_EXAMPLE_INTERNAL",
            },
            sso_credentials=("operator@example.invalid", "TEST_PASSWORD_DO_NOT_LOG"),
        )
        self.assertTrue(any("Scraping selesai" in line for line in logs))
        self.assertFalse(any("TEST_PASSWORD_DO_NOT_LOG" in line for line in logs))
        self.assertFalse(any("operator@example.invalid" in line for line in logs))
        self.assertTrue(any("[RAHASIA]" in line for line in logs))

    def test_chrome_uc_replaces_legacy_launcher_and_rechecks_portal(self):
        self.script.write_text('''
FASIH_URL = "https://fasih-sm.bps.go.id/app"
def baca_pengaturan():
    raise AssertionError("Form should provide credentials")
def login_sso_eksternal(driver, username, password):
    pass
def tunggu_login_berhasil(driver, timeout=90):
    pass
def cek_koneksi_fasih():
    raise AssertionError("Legacy requests check should not be invoked")
def buka_chrome():
    raise AssertionError("Legacy hard-coded launcher should not be invoked")
def main():
    assert cek_koneksi_fasih() is True
    driver = buka_chrome()
    assert driver is not None
''', encoding="utf8")
        with patch("browser_driver.verify_fasih_in_browser",
                   return_value="Google Chrome") as checker, patch(
                   "browser_driver.open_fasih_browser"
                   ) as factory:
            run_legacy_scraper(
                self.script, lambda line: None,
                sso_credentials=("sso@example.invalid", "TEST_PASSWORD"),
                browser="Google Chrome",
            )
        checker.assert_called_once_with("Google Chrome")
        factory.assert_called_once()
        self.assertEqual(factory.call_args.args[0], "Google Chrome")
        self.assertIn("on_progress", factory.call_args.kwargs)

    def test_rejects_non_chrome_browser_before_launching_scraper(self):
        self.script.write_text('''
FASIH_URL = "https://fasih-sm.bps.go.id/app"
def baca_pengaturan(): return "", ""
def login_sso_eksternal(driver, username, password): pass
def tunggu_login_berhasil(driver, timeout=90): pass
def main(): raise AssertionError("Must not run scraper")
''', encoding="utf8")
        for choice in ("Mozilla Firefox", "Microsoft Edge", "Otomatis (Default Windows)"):
            with self.subTest(browser=choice):
                with self.assertRaisesRegex(Exception, "hanya mendukung Google Chrome"):
                    run_legacy_scraper(
                        self.script, lambda line: None,
                        sso_credentials=("sso@example.invalid", "TEST_PASSWORD"),
                        browser=choice,
                    )

    def test_shared_sso_credentials_required(self):
        self.script.write_text("pass\n", encoding="utf8")
        (self.root / ".env").write_text(
            "GOOGLE_SPREADSHEET_ID=TEST_ONLY\n"
            "GOOGLE_CREDENTIALS_FILE=credentials.json\n",
            encoding="utf8"
        )
        issues = check_files(self.script)
        self.assertTrue(any("Username akun SSO bersama" in x for x in issues))
        self.assertTrue(any("Password akun SSO bersama" in x for x in issues))

    def test_portal_unreachable_stops_before_shared_sso_login(self):
        self.script.write_text('''
FASIH_URL = "https://fasih-sm.bps.go.id/app"
def baca_pengaturan():
    return "shared_sso_test", "test-private-password"
def login_sso_eksternal(driver, username, password):
    raise AssertionError("SSO login must not start without VPN access")
def tunggu_login_berhasil(driver, timeout=90):
    return None
def cek_koneksi_fasih():
    return False
def main():
    cek_koneksi_fasih()
    login_sso_eksternal(None, "shared_sso_test", "test-private-password")
''', encoding="utf8")
        from fasih_access import FasihAccessError
        with patch("fasih_access.verify_fasih_access",
                   side_effect=FasihAccessError("FortiClient disconnected")):
            with self.assertRaisesRegex(FasihAccessError, "FortiClient"):
                run_legacy_scraper(self.script, lambda _: None)

    def test_original_shared_sso_login_used_without_logging_password(self):
        self.script.write_text('''
from pathlib import Path
from dotenv import dotenv_values
def baca_pengaturan():
    values = dotenv_values(Path(__file__).with_name(".env"))
    return values["FASIH_USERNAME"], values["FASIH_PASSWORD"]
def login_sso_eksternal(driver, username, password):
    assert username == "shared_sso_test"
    assert password == "test-private-password"
    print("Shared SSO login was called")
def tunggu_login_berhasil(driver, timeout=90):
    assert timeout >= 300
    print("SSO completed")
def buat_session_dari_chrome(driver):
    class MockSession:
        verify = False
    return MockSession()
def main():
    username, password = baca_pengaturan()
    login_sso_eksternal(None, username, password)
    tunggu_login_berhasil(None)
    session = buat_session_dari_chrome(None)
    assert session.verify is True, "FASIH session must verify HTTPS certificates"
    print("scraper completed")
''', encoding="utf8")
        lines = []
        run_legacy_scraper(self.script, lines.append)
        self.assertTrue(any("Shared SSO login was called" in line for line in lines))
        self.assertTrue(any("scraper completed" in line for line in lines))
        self.assertFalse(any("test-private-password" in line for line in lines))
        self.assertFalse(any("shared_sso_test" in line for line in lines))


if __name__ == "__main__":
    unittest.main()
