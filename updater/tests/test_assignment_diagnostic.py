"""Offline tests for one-page FASIH read-only assignment diagnostics."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from assignment_diagnostic import (
    ASSIGNMENT_URL, MAX_SAMPLE, AssignmentReadError,
    list_test_surveys, query_assignment_sample, test_assignment_readonly,
)


def survey():
    return {
        "code": "STPIM", "name": "STPIM",
        "survey_id": "test-survey-id",
        "survey_period_id": "test-period-id",
    }


class FakeResponse:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self.data = (
            data if data is not None
            else {
                "searchData": [
                    {"id": "private-id-1", "assignmentStatusAlias": "OPEN"},
                    {"id": "private-id-2", "assignmentStatusAlias": "APPROVED"},
                    {"id": "private-id-3", "assignmentStatusAlias": "PRIVATE_ASSIGNEE_NAME"},
                ],
                "recordsTotal": 55,
            }
        )

    def json(self):
        return self.data


class FakeSession:
    verify = True

    def __init__(self, response=None):
        self.cookies = {"cookie": "SECRET_SESSION_COOKIE"}
        self.response = response or FakeResponse()
        self.calls = []

    def post(self, *args, **kwargs):
        self.calls.append(("POST", args, kwargs))
        return self.response

    def put(self, *args, **kwargs):
        raise AssertionError("PUT forbidden in read-only test")

    def patch(self, *args, **kwargs):
        raise AssertionError("PATCH forbidden in read-only test")

    def delete(self, *args, **kwargs):
        raise AssertionError("DELETE forbidden in read-only test")


class AssignmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "config_survei.json").write_text(
            json.dumps({"surveys": [survey(), {**survey(), "code": "SKTH", "name": "SKTH"}]}),
            encoding="utf-8",
        )

    def test_reads_only_local_config(self):
        entries = list_test_surveys(self.root)
        self.assertEqual([x["code"] for x in entries], ["STPIM", "SKTH"])
        self.assertEqual(entries[0]["survey_period_id"], "test-period-id")

    def test_returns_anonymized_count_and_exact_datatable_payload(self):
        fake = FakeSession()
        report = []
        result = query_assignment_sample(fake, survey(), report.append)
        self.assertEqual(result["sample_count"], 3)
        self.assertEqual(result["total_reported"], 55)
        self.assertEqual(result["field_valid_count"], 3)
        self.assertEqual(len(fake.calls), 1)
        method, args, opts = fake.calls[0]
        self.assertEqual(method, "POST")
        self.assertEqual(args, (ASSIGNMENT_URL,))
        self.assertEqual(opts["json"]["start"], 0)
        self.assertEqual(opts["json"]["length"], MAX_SAMPLE)
        self.assertEqual(opts["json"]["assignmentExtraParam"]["surveyPeriodId"], "test-period-id")
        self.assertFalse(opts["allow_redirects"])
        self.assertTrue(any("Status OPEN: 1" in x for x in report))
        self.assertTrue(any("Status lain/belum dikenali: 1" in x for x in report))
        self.assertFalse(any("PRIVATE_ASSIGNEE_NAME" in x for x in report))
        self.assertFalse(any("private-id" in x for x in report))
        self.assertFalse(any("SECRET_SESSION_COOKIE" in x for x in report))

    def test_unauthorized_and_redirects_are_rejected(self):
        for status in (401, 403, 302, 307, 500):
            with self.subTest(status=status):
                fake = FakeSession(FakeResponse(status=status))
                with self.assertRaises(AssignmentReadError):
                    query_assignment_sample(fake, survey(), lambda _: None)
                self.assertEqual(len(fake.calls), 1)

    def test_invalid_data_and_more_than_limit_are_rejected(self):
        for payload in (
            {"searchData": "not-list"},
            {"unexpected": []},
            {"searchData": [{"id": str(x)} for x in range(MAX_SAMPLE+1)]},
            {"searchData": ["not-object"]},
        ):
            with self.subTest(payload=str(payload)[:40]):
                with self.assertRaises(AssignmentReadError):
                    query_assignment_sample(
                        FakeSession(FakeResponse(data=payload)),
                        survey(), lambda _: None,
                    )

    def test_invalid_tls_or_no_auth_cookie_does_not_request_data(self):
        for verify, cookies in ((False, {"x": "secret"}), (True, {})):
            fake = FakeSession()
            fake.verify = verify
            fake.cookies = cookies
            with self.assertRaises(AssignmentReadError):
                query_assignment_sample(fake, survey(), lambda _: None)
            self.assertEqual(fake.calls, [])

    def test_orchestrator_runs_chrome_sso_callback_only_once(self):
        script = self.root / "ambil_data_monitoring_inpek_v2.py"
        script.write_text("pass", encoding="utf8")
        session = FakeSession()
        called = []

        def mocked_sso(script_arg, browser, username, password, report, *,
                       browser_factory=None, after_login=None):
            self.assertEqual(script_arg, script)
            self.assertEqual(browser, "Google Chrome")
            self.assertEqual(username, "test@example.invalid")
            self.assertEqual(password, "not-a-real-password")
            self.assertIsNotNone(after_login)
            called.append("login")
            after_login(session)

        with patch("assignment_diagnostic.test_sso_login", mocked_sso):
            messages = []
            result = test_assignment_readonly(
                script, "test@example.invalid", "not-a-real-password",
                "STPIM", messages.append,
            )
        self.assertEqual(called, ["login"])
        self.assertEqual(result["survey"], "STPIM")
        self.assertEqual(len(session.calls), 1)
        self.assertFalse(any("not-a-real-password" in msg for msg in messages))

    def test_rejects_unlisted_survey_before_sso(self):
        script = self.root / "ambil_data_monitoring_inpek_v2.py"
        script.write_text("pass", encoding="utf8")
        with patch("assignment_diagnostic.test_sso_login") as login:
            with self.assertRaisesRegex(AssignmentReadError, "Survei tidak ditemukan"):
                test_assignment_readonly(
                    script, "test@example.invalid", "password",
                    "not-in-config", lambda _: None
                )
            login.assert_not_called()


if __name__ == "__main__":
    unittest.main()
