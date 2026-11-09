"""Offline tests: FASIH VPN readiness must pass before SSO can start."""
import unittest

import requests
from fasih_access import FasihAccessError, verify_fasih_access, fasih_failure_notice


class FakeResponse:
    def __init__(self, status_code, location=""):
        self.status_code = status_code
        self.headers = {"Location": location} if location else {}


class FasihVPNTests(unittest.TestCase):
    def test_portal_accessible_without_sso(self):
        calls = []
        def get(url, **kwargs):
            calls.append((url, kwargs))
            return FakeResponse(200)
        verify_fasih_access(get=get)
        self.assertEqual(len(calls), 1)
        self.assertFalse(calls[0][1]["allow_redirects"])
        self.assertNotIn("verify", calls[0][1])
        self.assertEqual(calls[0][1]["timeout"], (6, 12))

    def test_sso_redirect_means_portal_reachable(self):
        verify_fasih_access(
            get=lambda url, **kwargs: FakeResponse(
                302, "https://sso.bps.go.id/realms/bps"
            )
        )

    def test_vpn_disconnected_blocks(self):
        def disconnected(url, **kwargs):
            raise requests.exceptions.ConnectTimeout("offline")
        with self.assertRaisesRegex(FasihAccessError, "VPN BPS"):
            verify_fasih_access(get=disconnected)

    def test_untrusted_https_certificate_blocks(self):
        def invalid_ca(url, **kwargs):
            raise requests.exceptions.SSLError("unverified")
        with self.assertRaisesRegex(FasihAccessError, "sertifikat"):
            verify_fasih_access(get=invalid_ca)

    def test_bad_http_status_blocks(self):
        with self.assertRaisesRegex(FasihAccessError, "HTTP 503"):
            verify_fasih_access(get=lambda url, **kwargs: FakeResponse(503))

    def test_plain_http_redirect_blocks(self):
        with self.assertRaisesRegex(FasihAccessError, "non-HTTPS"):
            verify_fasih_access(
                get=lambda url, **kwargs: FakeResponse(
                    302, "http://example.invalid/"
                )
            )

    def test_failed_fasih_notice_mentions_vpn_and_computer_internet(self):
        notice = fasih_failure_notice("Portal FASIH belum dapat dijangkau")
        self.assertIn("VPN BPS", notice)
        self.assertIn("koneksi internet komputer yang digunakan", notice)
        self.assertIn("ulangi pemeriksaan", notice)

    def test_ssl_failure_notice_keeps_certificate_guidance(self):
        notice = fasih_failure_notice("sertifikat HTTPS gagal")
        self.assertIn("pengelola jaringan BPS", notice)

    def test_reject_fake_fasih_url(self):
        with self.assertRaisesRegex(FasihAccessError, "resmi"):
            verify_fasih_access(
                url="https://example.com/app",
                get=lambda *args, **kwargs: FakeResponse(200)
            )


if __name__ == "__main__":
    unittest.main()
