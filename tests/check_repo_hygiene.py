"""Block accidental disclosure of raw FASIH data and credentials in public repo.

This check is intentionally conservative and runs without network access.
It does NOT replace Google/GitHub secret scanning or key rotation.
"""
from pathlib import Path
import re
import subprocess
import unittest


class PublicRepositoryHygiene(unittest.TestCase):
    def test_no_private_files_or_pem_keys_are_tracked(self):
        root = Path(__file__).resolve().parents[1]
        files = subprocess.check_output(
            ["git", "ls-files"], cwd=root, text=True
        ).splitlines()
        private_names = re.compile(
            r"(^|/)(?:"
            r"\.env(?:\..*)?|credentials[^/]*\.json|"
            r"config_survei\.json|updater-oauth-desktop\.json|"
            r"client_secret[^/]*\.json|"
            r"ambil_data_monitoring_inpek[^/]*\.py|"
            r"[^/]*_raw\.json|monitoring_inpek\.zip|"
            r"[^/]*\.(?:pem|p12|pfx|key)"
            r")$", re.IGNORECASE
        )
        bad = [name for name in files if private_names.search(name)]
        self.assertEqual(bad, [], "Private files must not be tracked")

        text_ext = {".py", ".js", ".json", ".html", ".css", ".md",
                    ".txt", ".yml", ".yaml"}
        pem_marker = "-" * 5 + "BEGIN " + "PRIVATE KEY" + "-" * 5
        leaked = []
        for name in files:
            path = root / name
            if path.suffix.lower() not in text_ext:
                continue
            if pem_marker in path.read_text(encoding="utf-8-sig"):
                leaked.append(name)
        self.assertEqual(leaked, [], "Private PEM keys found in tracked text")


if __name__ == "__main__":
    unittest.main()
