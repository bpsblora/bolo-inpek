"""Offline tests: SSO diagnostics never call scraper main or write Sheets."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sso_diagnostic import SSOTestError, test_sso_login


class FakeDriver:
    def __init__(self):
        self.current_url = "https://sso.bps.go.id/realms/bps"
        self.closed = False

    def set_page_load_timeout(self, _seconds):
        pass

    def quit(self):
        self.closed = True


class SSOTestIsolation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.script = Path(self.temp.name) / "ambil_data_monitoring_inpek_v2.py"
        self.script.write_text(
            '''
FASIH_URL = "https://fasih-sm.bps.go.id/app"
called = []
def klik_sso_eksternal(driver):
    called.append("open_sso")
def login_sso_eksternal(driver, username, password):
    assert username == "test@example.invalid"
    assert password == "SECRET_TEST_VALUE"
    called.append("submitted")
    print("SECRET_TEST_VALUE should never reach user-visible log")
def tunggu_login_berhasil(driver, timeout=90):
    assert timeout == 120
    driver.current_url = "https://fasih-sm.bps.go.id/app"
    return True
def main():
    raise AssertionError("main() SCRAPER MUST NEVER RUN")
''',
            encoding="utf-8",
        )

    def test_ssologin_only_and_zero_scrape(self):
        fake = FakeDriver()
        logs = []
        test_sso_login(
            self.script, "Mozilla Firefox",
            "test@example.invalid", "SECRET_TEST_VALUE",
            logs.append, browser_factory=lambda name: fake,
        )
        self.assertTrue(fake.closed)
        self.assertTrue(any("Tidak ada scraping" in x for x in logs))
        self.assertFalse(any("SECRET_TEST_VALUE" in x for x in logs))
        self.assertFalse(any("test@example.invalid" in x for x in logs))

    def test_wrong_credential_rejected_without_logging(self):
        fake = FakeDriver()
        with self.assertRaisesRegex(SSOTestError, "Formulir SSO Eksternal"):
            test_sso_login(
                self.script, "Mozilla Firefox",
                "user@example.invalid", "WRONG",
                lambda _: None, browser_factory=lambda _: fake,
            )
        self.assertTrue(fake.closed)

    def test_redirect_to_external_site_rejected_before_sending_password(self):
        fake = FakeDriver()
        fake.current_url = "https://untrusted.example.invalid/submit"
        with self.assertRaisesRegex(SSOTestError, "domain login SSO resmi"):
            test_sso_login(
                self.script, "Mozilla Firefox",
                "test@example.invalid", "SECRET_TEST_VALUE",
                lambda _: None, browser_factory=lambda _: fake,
            )
        self.assertTrue(fake.closed)

    def test_stepwise_diagnostics_do_not_echo_password(self):
        logs = []
        fake = FakeDriver()
        test_sso_login(
            self.script, "Mozilla Firefox",
            "test@example.invalid", "SECRET_TEST_VALUE",
            logs.append, browser_factory=lambda browser: fake,
        )
        for index in (1, 2, 3, 4):
            self.assertTrue(any("[SSO " + str(index) + "/4]" in line for line in logs))
        self.assertFalse(any("SECRET_TEST_VALUE" in line for line in logs))
        self.assertFalse(any("test@example.invalid" in line for line in logs))

    def test_new_tab_with_official_sso_is_supported(self):
        class TabDriver(FakeDriver):
            def __init__(self):
                super().__init__()
                self.window_handles = ["fasih", "sso"]
                self.switch_to = self
                self.current_url = "https://fasih-sm.bps.go.id/oauth_login.html"
            def window(self, handle):
                if handle == "sso":
                    self.current_url = "https://sso.bps.go.id/realms/bps"
        fake = TabDriver()
        test_sso_login(
            self.script, "Mozilla Firefox",
            "test@example.invalid", "SECRET_TEST_VALUE",
            lambda line: None, browser_factory=lambda _: fake,
        )
        self.assertTrue(fake.closed)

    def test_unknown_bps_domain_blocks_automatic_password_submission(self):
        fake = FakeDriver()
        fake.current_url = "https://unexpected-login.bps.go.id/form"
        with self.assertRaisesRegex(SSOTestError, "belum dikenali"):
            test_sso_login(
                self.script, "Mozilla Firefox",
                "test@example.invalid", "SECRET_TEST_VALUE",
                lambda _: None, browser_factory=lambda _: fake,
            )
        self.assertTrue(fake.closed)

    def test_requires_private_script_and_credentials(self):
        with self.assertRaises(SSOTestError):
            test_sso_login(
                self.script.with_name("other.py"),
                "Mozilla Firefox", "user@example.invalid", "pw",
                lambda _: None, browser_factory=lambda _: FakeDriver(),
            )
        with self.assertRaises(SSOTestError):
            test_sso_login(
                self.script, "Mozilla Firefox", "", "",
                lambda _: None, browser_factory=lambda _: FakeDriver(),
            )

    def test_unsafe_fasih_domain_stops_before_browser_is_opened(self):
        source = self.script.read_text(encoding="utf-8")
        self.script.write_text(
            source.replace(
                'FASIH_URL = "https://fasih-sm.bps.go.id/app"',
                'FASIH_URL = "https://untrusted.example.invalid/app"',
            ),
            encoding="utf-8",
        )
        opened = []
        with self.assertRaisesRegex(SSOTestError, "HTTPS FASIH resmi"):
            test_sso_login(
                self.script, "Mozilla Firefox",
                "test@example.invalid", "SECRET_TEST_VALUE",
                lambda _: None,
                browser_factory=lambda browser: opened.append(browser),
            )
        self.assertEqual(opened, [])


if __name__ == "__main__":
    unittest.main()
