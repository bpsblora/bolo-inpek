"""Offline tests for Edge/Firefox readiness without real browser/network."""
import unittest
from unittest.mock import patch, MagicMock

from browser_driver import (
    AUTO_BROWSER, BROWSER_CHOICES, FasihBrowserError, resolve_browser,
    _browser_from_progid, _default_https_progid, verify_fasih_in_browser,
)


class FakeBrowser:
    def __init__(self, url="https://fasih-sm.bps.go.id/app/"):
        self.current_url = url
        self.urls = []
        self.closed = False

    def get(self, url):
        self.urls.append(url)

    def quit(self):
        self.closed = True


class FASIHBrowserReadinessTests(unittest.TestCase):
    def test_auto_is_default_option_and_manual_browsers_supported(self):
        self.assertEqual(BROWSER_CHOICES[0], AUTO_BROWSER)
        self.assertIn("Microsoft Edge", BROWSER_CHOICES)
        self.assertIn("Mozilla Firefox", BROWSER_CHOICES)
        self.assertIn("Google Chrome", BROWSER_CHOICES)

    def test_windows_progid_matches_major_browsers(self):
        self.assertEqual(_browser_from_progid("MSEdgeHTM"), "Microsoft Edge")
        self.assertEqual(_browser_from_progid("MSEdgeBHTML"), "Microsoft Edge")
        self.assertEqual(_browser_from_progid("FirefoxURL-308046B0AF4A39CB"), "Mozilla Firefox")
        self.assertEqual(_browser_from_progid("FirefoxHTML"), "Mozilla Firefox")
        self.assertEqual(_browser_from_progid("ChromeHTML"), "Google Chrome")
        self.assertIsNone(_browser_from_progid("BraveHTML"))

    def test_automatic_selection_uses_https_default(self):
        with patch("browser_driver._default_https_progid", return_value="FirefoxURL-123"):
            self.assertEqual(resolve_browser(AUTO_BROWSER), "Mozilla Firefox")
            driver = FakeBrowser()
            result = verify_fasih_in_browser(
                AUTO_BROWSER, driver_factory=lambda browser: driver
            )
            self.assertEqual(result, "Mozilla Firefox")
            self.assertTrue(driver.closed)

    def test_userchoice_latest_is_preferred_to_stale_legacy_choice(self):
        import sys
        fake_winreg = MagicMock()
        fake_winreg.HKEY_CURRENT_USER = object()
        fake_winreg.OpenKey.return_value.__enter__.return_value = object()
        fake_winreg.QueryValueEx.return_value = ("FirefoxURL-123", 1)
        with patch.dict(sys.modules, {"winreg": fake_winreg}):
            self.assertEqual(_default_https_progid(), "FirefoxURL-123")
        self.assertIn("UserChoiceLatest", fake_winreg.OpenKey.call_args.args[1])
        self.assertEqual(fake_winreg.OpenKey.call_count, 1)

    def test_unknown_default_requires_manual_choice(self):
        with patch("browser_driver._default_https_progid", return_value="BraveHTML"):
            with self.assertRaisesRegex(FasihBrowserError, "manual"):
                resolve_browser(AUTO_BROWSER)
            self.assertEqual(resolve_browser("Mozilla Firefox"), "Mozilla Firefox")
        with patch("browser_driver._default_https_progid", return_value=None):
            with self.assertRaisesRegex(FasihBrowserError, "belum dapat dibaca"):
                resolve_browser(AUTO_BROWSER)

    def test_edge_success_confirms_only_portal_navigation(self):
        browser = FakeBrowser()
        result = verify_fasih_in_browser(
            "Microsoft Edge", driver_factory=lambda _: browser
        )
        self.assertEqual(result, "Microsoft Edge")
        self.assertEqual(browser.urls, ["https://fasih-sm.bps.go.id/app"])
        self.assertTrue(browser.closed)

    def test_firefox_sso_redirect_is_permitted_only_for_bps_https(self):
        driver = FakeBrowser("https://sso.bps.go.id/realms/bps")
        result = verify_fasih_in_browser(
            "Mozilla Firefox", driver_factory=lambda _: driver
        )
        self.assertEqual(result, "Mozilla Firefox")
        self.assertTrue(driver.closed)

    def test_external_site_not_accepted(self):
        driver = FakeBrowser("https://example.invalid/fasih")
        with self.assertRaisesRegex(FasihBrowserError, "resmi BPS"):
            verify_fasih_in_browser(
                "Microsoft Edge", driver_factory=lambda _: driver
            )
        self.assertTrue(driver.closed)

    def test_http_not_accepted(self):
        driver = FakeBrowser("http://fasih-sm.bps.go.id/app")
        with self.assertRaisesRegex(FasihBrowserError, "HTTPS"):
            verify_fasih_in_browser(
                "Microsoft Edge", driver_factory=lambda _: driver
            )
        self.assertTrue(driver.closed)

    def test_navigation_error_does_not_bypass_check(self):
        driver = FakeBrowser()
        def fail(_url):
            raise RuntimeError("SENSITIVE_PROXY_VALUE")
        driver.get = fail
        with self.assertRaises(FasihBrowserError) as error:
            verify_fasih_in_browser(
                "Microsoft Edge", driver_factory=lambda _: driver
            )
        self.assertTrue(driver.closed)
        self.assertNotIn("SENSITIVE_PROXY_VALUE", str(error.exception))

    def test_unknown_browser_rejected(self):
        with self.assertRaisesRegex(FasihBrowserError, "tidak dikenal"):
            verify_fasih_in_browser(
                "Internet Explorer", driver_factory=lambda _: FakeBrowser()
            )


if __name__ == "__main__":
    unittest.main()
