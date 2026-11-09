"""Uji offline: hanya Google, Firebase dan pembacaan dua spreadsheet."""
from pathlib import Path
from types import SimpleNamespace
import json
import tempfile
import unittest

from google_diagnostic import load_diagnostic_settings, run_read_only_google_test
from cloud_config import OnlineConfigError


class ReadOnlyGoogleDiagnosticTests(unittest.TestCase):
    def test_disabled_production_switch_does_not_block_read_only_diagnostic(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "updater-settings.json"
            path.write_text(json.dumps({
                "enabled": False,
                "firebase_project_id": "bolo-test-project",
                "firebase_api_key": "safe-firebase-public-api-key",
                "google_oauth_desktop_client_id": "test-desktop.apps.googleusercontent.com"
            }), encoding="utf-8")
            settings = load_diagnostic_settings(path)
            self.assertFalse(settings["enabled"])

    def test_invalid_settings_fails_before_any_login(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "updater-settings.json"
            path.write_text('{"enabled":false}', encoding="utf-8")
            with self.assertRaises(OnlineConfigError):
                load_diagnostic_settings(path)

    def test_complete_login_and_two_sheets_read_only(self):
        calls, messages = [], []
        settings = {
            "enabled": False,
            "firebase_project_id": "bolo-test-project",
            "firebase_api_key": "public-test-key",
            "google_oauth_desktop_client_id": "test-desktop.apps.googleusercontent.com"
        }
        targets = {
            "monitoring_id": "TEST_MONITORING_SPREADSHEET_ID_00000",
            "tindak_lanjut_id": "TEST_INTERNAL_SPREADSHEET_ID_00000"
        }

        def get_config(directory, client_id, *, client_path):
            calls.append("file")
            self.assertEqual(client_id, settings["google_oauth_desktop_client_id"])
            self.assertEqual(Path(client_path).name, "updater-oauth-desktop.json")
            return {"installed": {"client_id": client_id}}

        def login(config):
            calls.append("login")
            return SimpleNamespace(
                google_id_token="google-id-token",
                spreadsheet_client="google-sheets-connection",
            )

        def firebase_exchange(conf, google_id_token):
            calls.append("firebase")
            self.assertEqual(conf, settings)
            self.assertEqual(google_id_token, "google-id-token")
            return "firebase-token"

        def targets_reader(conf, token):
            calls.append("targets")
            self.assertEqual(token, "firebase-token")
            return targets

        def sheets_reader(client, ids, log):
            calls.append("sheets-read")
            self.assertEqual(client, "google-sheets-connection")
            self.assertEqual(ids, targets)
            log("Kedua Sheets bisa dibuka (uji tanpa edit).")

        run_read_only_google_test(
            Path("D:/Downloads/updater-oauth-desktop.json"),
            messages.append,
            settings_loader=lambda: settings,
            oauth_reader=get_config,
            operator_login=login,
            firebase_exchange=firebase_exchange,
            target_reader=targets_reader,
            sheets_verifier=sheets_reader,
        )
        self.assertEqual(calls, ["file", "login", "firebase", "targets", "sheets-read"])
        self.assertIn("Tidak ada scraping", messages[-1])
        self.assertFalse(any("google-id-token" in text for text in messages))

    def test_denied_firebase_access_stops_before_sheets(self):
        actions = []
        def fail_firebase(*args):
            actions.append("firebase")
            raise OnlineConfigError("Firestore tidak mengizinkan akun.")
        with self.assertRaisesRegex(OnlineConfigError, "Firestore"):
            run_read_only_google_test(
                Path("dummy.json"), lambda text: None,
                settings_loader=lambda: {
                    "google_oauth_desktop_client_id": "test.apps.googleusercontent.com"
                },
                oauth_reader=lambda *a, **kw: {},
                operator_login=lambda cfg: SimpleNamespace(
                    google_id_token="token", spreadsheet_client=object()
                ),
                firebase_exchange=fail_firebase,
                target_reader=lambda *a: actions.append("sheets-targets"),
                sheets_verifier=lambda *a: actions.append("sheets-open")
            )
        self.assertEqual(actions, ["firebase"])


if __name__ == "__main__":
    unittest.main()
