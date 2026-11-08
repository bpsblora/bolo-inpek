"""Uji offline: registry online, hak baca, validasi ID FASIH, atomic save.

Semua jaringan dimock: tidak mengakses Google, Firebase, FASIH, atau Sheets.
"""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from cloud_config import (
    OnlineConfigError, create_active_config, synchronize_online
)


def survey(index, active=True):
    return {"id": f"survey-{index}", "name": f"SURVEI {index}", "active": active}


def config(index):
    return {
        "id": f"survey-{index}", "name": f"SURVEI {index}",
        "code": f"CODE{index}", "survey_id": f"survey-id-{index}",
        "survey_period_id": f"period-{index}",
        "role_pencacah_id": f"ppl-{index}",
        "role_pengawas_id": f"pml-{index}",
        "nama_assignment_field": "data3",
    }


class FakeResponse:
    status_code = 200
    def __init__(self, data, code=200):
        self.data = data
        self.status_code = code
    def json(self):
        return self.data


def firestore_doc(entry):
    values = {}
    for key, value in entry.items():
        if isinstance(value, bool):
            values[key] = {"booleanValue": value}
        else:
            values[key] = {"stringValue": value}
    return {"fields": values}


class CloudConfigTests(unittest.TestCase):
    def test_only_active_surveys_and_all_seven_fields(self):
        rows = create_active_config(
            [survey(1), survey(2, active=False), survey(3)],
            [config(1), config(2), config(3)]
        )["surveys"]
        self.assertEqual([s["name"] for s in rows], ["SURVEI 1", "SURVEI 3"])
        self.assertEqual(len(rows[0]), 7)
        self.assertNotIn("id", rows[0])

    def test_no_partial_config_on_missing_ids(self):
        with self.assertRaises(OnlineConfigError):
            create_active_config([survey(1), survey(2)], [config(1)])

    def test_duplicate_survey_name_rejected(self):
        with self.assertRaises(OnlineConfigError):
            create_active_config(
                [survey(1), {"id": "survey-x", "name": "SURVEI 1", "active": True}],
                [config(1), {**config(2), "id": "survey-x", "name": "SURVEI 1"}]
            )

    def test_online_sync_reads_and_replaces_only_when_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text(
                "BOLO_UPDATER_USE_LOCAL_SETTINGS=1\n", encoding="utf8"
            )
            (root / "updater-oauth-desktop.json").write_text(json.dumps({
                "installed": {
                    "client_id": "oauth-test-id", "client_secret": "test-only-public-client",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token"
                }
            }), encoding="utf8")
            (root / "updater-settings.json").write_text(json.dumps({
                "enabled": True, "firebase_project_id": "bolo-test",
                "firebase_api_key": "firebase-test-key",
                "google_oauth_desktop_client_id": "oauth-test-id"
            }), encoding="utf8")
            (root / "config_survei.json").write_text(
                '{"surveys":[{"name":"OLD CONFIG"}]}', encoding="utf8"
            )
            registry = [survey(1), survey(2), survey(3)]
            secrets = [config(1), config(2), config(3)]
            calls = []
            def mock_get(url, **kwargs):
                calls.append(url)
                data = registry if url.endswith("/surveys") else secrets
                return FakeResponse({"documents": [firestore_doc(s) for s in data]})
            def mock_post(url, **kwargs):
                self.assertEqual(url,
                    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
                return FakeResponse({"idToken": "fire-auth-test-id-token"})
            messages = []
            count = synchronize_online(
                root, messages.append,
                get_credentials=lambda _: "google-id-token",
                request_get=mock_get, request_post=mock_post,
            )
            self.assertEqual(count, 3)
            self.assertTrue(any("/scraper_configs" in x for x in calls))
            config_file = root / "config_survei.json"
            result = json.loads(config_file.read_text(encoding="utf8"))
            self.assertEqual(len(result["surveys"]), 3)
            self.assertEqual(result["surveys"][2]["name"], "SURVEI 3")

            # Menambahkan survei di UI harus otomatis menambah saat run berikutnya.
            registry.append(survey(4))
            secrets.append(config(4))
            count = synchronize_online(
                root, messages.append,
                get_credentials=lambda _: "google-id-token",
                request_get=mock_get, request_post=mock_post,
            )
            self.assertEqual(count, 4)

            # Konfigurasi tidak lengkap: scraping harus batal dan file tetap valid.
            registry.append(survey(5))
            before = config_file.read_text(encoding="utf8")
            with self.assertRaises(OnlineConfigError):
                synchronize_online(
                    root, messages.append,
                    get_credentials=lambda _: "google-id-token",
                    request_get=mock_get, request_post=mock_post,
                )
            self.assertEqual(config_file.read_text(encoding="utf8"), before)

    def test_denied_operator_does_not_use_cached_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text(
                "BOLO_UPDATER_USE_LOCAL_SETTINGS=1\n", encoding="utf8"
            )
            (root / "updater-oauth-desktop.json").write_text(json.dumps({
                "installed": {
                    "client_id": "oauth-test-id", "client_secret": "test-only-public-client",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token"
                }
            }), encoding="utf8")
            (root / "updater-settings.json").write_text(json.dumps({
                "enabled": True, "firebase_project_id": "bolo-test",
                "firebase_api_key": "firebase-test-key",
                "google_oauth_desktop_client_id": "oauth-test-id"
            }), encoding="utf8")
            def denied_get(url, **kwargs):
                return FakeResponse({}, code=403)
            with self.assertRaisesRegex(OnlineConfigError, "izin"):
                synchronize_online(
                    root, lambda _: None,
                    get_credentials=lambda _: "google-id-token",
                    request_post=lambda *args, **kwargs: FakeResponse(
                        {"idToken": "firebase-test"}
                    ),
                    request_get=denied_get
                )
            self.assertFalse((root / "config_survei.json").exists())


if __name__ == "__main__":
    unittest.main()
