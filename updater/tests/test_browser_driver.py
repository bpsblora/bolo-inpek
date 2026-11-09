"""Offline tests for Edge/Firefox readiness without real browser/network."""
import unittest
from unittest.mock import patch

from browser_driver import (
    BROWSER_CHOICES, FasihBrowserError, verify_fasih_in_browser,
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
    def test_edge_is_default_recommended_and_supported(self):
        self.assertEqual(BROWSER_CHOICES[0], "Microsoft Edge")
        self.assertIn("Mozilla Firefox", BROWSER_CHOICES)
        self.assertIn("Google Chrome", BROWSER_CHOICES)

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
