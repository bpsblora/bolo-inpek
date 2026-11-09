"""Offline Chrome-only UC regression and FASIH portal checks."""
import unittest
from unittest.mock import patch

from browser_driver import (
    CHROME_BROWSER, SUPPORTED_BROWSERS, BROWSER_CHOICES,
    FasihBrowserError, resolve_browser, verify_fasih_in_browser,
    open_fasih_browser,
)


class FakeBrowser:
    def __init__(self, url="https://fasih-sm.bps.go.id/app/"):
        self.current_url = url
        self.urls = []
        self.closed = False
        self.title = ""

    def get(self, url):
        self.urls.append(url)

    def set_script_timeout(self, seconds):
        self.script_timeout = seconds

    def execute_script(self, script):
        if "readyState" in script:
            return "interactive"
        if "innerText" in script:
            return "Badan Pusat Statistik - Login SSO Eksternal"
        return None

    def quit(self):
        self.closed = True


class ChromeOnlyBrowserTests(unittest.TestCase):
    def test_only_chrome_is_supported(self):
        self.assertEqual(CHROME_BROWSER, "Google Chrome")
        self.assertEqual(SUPPORTED_BROWSERS, ("Google Chrome",))
        self.assertEqual(BROWSER_CHOICES, ("Google Chrome",))
        self.assertEqual(resolve_browser("Google Chrome"), "Google Chrome")
        for other in ("Mozilla Firefox", "Microsoft Edge",
                      "Otomatis (Default Windows)", "", "chromium"):
            with self.subTest(browser=other):
                with self.assertRaisesRegex(FasihBrowserError, "hanya mendukung Google Chrome"):
                    resolve_browser(other)
                with self.assertRaises(FasihBrowserError):
                    open_fasih_browser(other)
                with self.assertRaises(FasihBrowserError):
                    verify_fasih_in_browser(other, driver_factory=lambda _: FakeBrowser())

    def test_uc_subprocess_auto_version(self):
        with patch("undetected_chromedriver.Chrome") as constructor:
            messages = []
            driver = open_fasih_browser(CHROME_BROWSER, on_progress=messages.append)
            self.assertIs(driver, constructor.return_value)
            self.assertTrue(constructor.call_args.kwargs["use_subprocess"])
            self.assertIsNone(constructor.call_args.kwargs["version_main"])
            self.assertTrue(any("UC" in line for line in messages))

    def test_uc_failure_redacts_internal_error(self):
        with patch("undetected_chromedriver.Chrome",
                   side_effect=RuntimeError("PRIVATE_SESSION_TOKEN")):
            with self.assertRaisesRegex(FasihBrowserError, "UC tidak dapat dijalankan") as err:
                open_fasih_browser(CHROME_BROWSER)
        self.assertNotIn("PRIVATE_SESSION_TOKEN", str(err.exception))

    def test_navigation_to_official_login_succeeds(self):
        browser = FakeBrowser()
        progress = []
        result = verify_fasih_in_browser(
            CHROME_BROWSER, driver_factory=lambda _: browser, on_progress=progress.append,
        )
        self.assertEqual(result, CHROME_BROWSER)
        self.assertEqual(browser.urls, ["https://fasih-sm.bps.go.id/app"])
        self.assertTrue(browser.closed)
        self.assertTrue(any("berhasil dimuat" in line for line in progress))

    def test_oauth_login_title_on_official_https_is_valid(self):
        browser = FakeBrowser("https://fasih-sm.bps.go.id/oauth_login.html")
        browser.title = "FASIH | Badan Pusat Statistik"
        browser.execute_script = lambda _script: (_ for _ in ()).throw(RuntimeError("loading"))
        result = verify_fasih_in_browser(
            CHROME_BROWSER, driver_factory=lambda _: browser,
            timeout_seconds=0.1,
        )
        self.assertEqual(result, CHROME_BROWSER)
        self.assertTrue(browser.closed)

    def test_invalid_login_title_not_accepted(self):
        browser = FakeBrowser("https://fasih-sm.bps.go.id/oauth_login.html")
        browser.title = "Loading..."
        browser.execute_script = lambda _script: ""
        with self.assertRaisesRegex(FasihBrowserError, "belum dapat dikonfirmasi"):
            verify_fasih_in_browser(
                CHROME_BROWSER, driver_factory=lambda _: browser, timeout_seconds=0.01,
            )
        self.assertTrue(browser.closed)

    def test_foreign_https_domain_is_rejected(self):
        browser = FakeBrowser("https://unknown.example.invalid/login")
        with self.assertRaisesRegex(FasihBrowserError, "di luar FASIH"):
            verify_fasih_in_browser(CHROME_BROWSER, driver_factory=lambda _: browser)
        self.assertTrue(browser.closed)

    def test_insecure_http_is_rejected(self):
        browser = FakeBrowser("http://fasih-sm.bps.go.id/app")
        with self.assertRaisesRegex(FasihBrowserError, "non-HTTPS"):
            verify_fasih_in_browser(CHROME_BROWSER, driver_factory=lambda _: browser)
        self.assertTrue(browser.closed)

    def test_failed_navigation_does_not_expose_errors(self):
        browser = FakeBrowser()
        def fail(_url):
            raise RuntimeError("PRIVATE_URL")
        browser.get = fail
        with self.assertRaises(FasihBrowserError) as err:
            verify_fasih_in_browser(CHROME_BROWSER, driver_factory=lambda _: browser)
        self.assertNotIn("PRIVATE_URL", str(err.exception))
        self.assertTrue(browser.closed)


if __name__ == "__main__":
    unittest.main()
