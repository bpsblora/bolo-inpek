"""Offline tests for OAuth error messaging and canonical scope handling.

No browser, network, Firebase, or Google Sheets requests.
"""
from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from operator_google import (
    GOOGLE_SCOPES, OperatorAuthError, _explain_oauth_failure, login_operator,
)


class OperatorOAuthTests(unittest.TestCase):
    def test_request_canonical_scopes(self):
        self.assertIn("openid", GOOGLE_SCOPES)
        self.assertIn("https://www.googleapis.com/auth/userinfo.email", GOOGLE_SCOPES)
        self.assertIn("https://www.googleapis.com/auth/userinfo.profile", GOOGLE_SCOPES)
        self.assertIn("https://www.googleapis.com/auth/spreadsheets", GOOGLE_SCOPES)
        self.assertNotIn("email", GOOGLE_SCOPES)
        self.assertNotIn("profile", GOOGLE_SCOPES)

    def test_scope_change_error_has_actionable_safe_text(self):
        err = Warning('Scope has changed from "email" to "userinfo.email".')
        message = _explain_oauth_failure(err)
        self.assertIn("scope", message)
        self.assertNotIn("http://localhost", message)

    def test_proxy_error_has_specific_message(self):
        import requests
        message = _explain_oauth_failure(requests.exceptions.ProxyError("proxy"))
        self.assertIn("proxy", message.lower())

    def test_error_never_echoes_secret_or_callback_url(self):
        message = _explain_oauth_failure(
            ValueError("https://localhost:1234/?code=SECRET_DO_NOT_PRINT&state=STATE")
        )
        self.assertNotIn("SECRET_DO_NOT_PRINT", message)
        self.assertNotIn("STATE", message)

    @patch("gspread.authorize")
    @patch("google_auth_oauthlib.flow.InstalledAppFlow.from_client_config")
    def test_success_with_complete_permissions(self, make_flow, authorize):
        credentials = Mock(
            id_token="TEST_ID_TOKEN",
            granted_scopes=GOOGLE_SCOPES,
        )
        flow = make_flow.return_value
        flow.run_local_server.return_value = credentials
        authorize.return_value = "CLIENT"
        result = login_operator({"installed": {"client_id": "test"}})
        self.assertEqual(result.google_id_token, "TEST_ID_TOKEN")
        self.assertEqual(result.spreadsheet_client, "CLIENT")
        self.assertIn("Izin Google diterima", flow.run_local_server.call_args.kwargs["success_message"])

    @patch("gspread.authorize")
    @patch("google_auth_oauthlib.flow.InstalledAppFlow.from_client_config")
    def test_missing_sheets_scope_is_rejected(self, make_flow, authorize):
        credentials = Mock(
            id_token="TEST_ID_TOKEN",
            granted_scopes=[
                "openid",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
            ],
        )
        make_flow.return_value.run_local_server.return_value = credentials
        with self.assertRaisesRegex(OperatorAuthError, "Google Sheets"):
            login_operator({"installed": {"client_id": "test"}})
        authorize.assert_not_called()

    @patch("google_auth_oauthlib.flow.InstalledAppFlow.from_client_config")
    def test_token_exchange_failure_is_redacted(self, make_flow):
        make_flow.return_value.run_local_server.side_effect = ValueError(
            "https://127.0.0.1/callback?code=SECRET_DO_NOT_PRINT"
        )
        with self.assertRaises(OperatorAuthError) as caught:
            login_operator({"installed": {"client_id": "test"}})
        self.assertNotIn("SECRET_DO_NOT_PRINT", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
