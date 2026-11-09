"""Read-only SSO authentication check for the internal FASIH scraper.

Only calls the original scraper's three browser-login functions; never calls
main(), any FASIH API, Google/Firebase code, or a Sheets write. It validates
the script location and FASIH target before creating a session.
"""
from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit
import io
import sys

from browser_driver import FASIH_HOST, open_fasih_browser, resolve_browser
from legacy_bridge import check_files


class SSOTestError(RuntimeError):
    """Login diagnostik belum selesai atau tidak berhasil."""


class _SafeLog(io.TextIOBase):
    def __init__(self, report: Callable[[str], None], secrets: tuple[str, ...]):
        self.report = report
        self.secrets = tuple(v for v in secrets if len(v) > 2)

    def write(self, data: str) -> int:
        if data:
            for line in str(data).splitlines():
                if line.strip():
                    safe = line.strip()
                    for secret in self.secrets:
                        safe = safe.replace(secret, "[RAHASIA]")
                    self.report(safe)
        return len(data)

    def flush(self):
        pass


def test_sso_login(
    script: Path, browser: str, username: str, password: str,
    report: Callable[[str], None],
    *,
    browser_factory: Callable[[str], object] = open_fasih_browser,
) -> None:
    """Login once to authorized SSO, confirm FASIH, close ephemeral browser.

    Password is held only while the test runs; it is never written to .env,
    logs, ZIP, Google Sheets, Firebase, or the scraper module.
    """
    script = Path(script).expanduser().resolve()
    errors = check_files(
        script, require_config=False, require_google_credentials=False,
        require_sso_env=False,
    )
    if errors:
        raise SSOTestError("Script FASIH belum siap untuk pengujian.")
    if not username.strip() or not password:
        raise SSOTestError("Isi email/username dan password SSO pada aplikasi.")

    try:
        browser = resolve_browser(browser)
    except Exception as exc:
        raise SSOTestError("Browser FASIH belum dipilih secara benar.") from exc

    spec = spec_from_file_location("bolo_sso_diagnostic_readonly", str(script))
    if spec is None or spec.loader is None:
        raise SSOTestError("Script FASIH tidak dapat dibaca.")
    mod = module_from_spec(spec)
    driver = None
    original_path = list(sys.path)
    output = _SafeLog(report, (username, password))
    try:
        sys.path.insert(0, str(script.parent))
        # Importing the internal module does not execute its __main__ block.
        # No call to module.main() is permitted in this diagnostic.
        with redirect_stdout(output), redirect_stderr(output):
            spec.loader.exec_module(mod)
        target = urlsplit(str(getattr(mod, "FASIH_URL", "")))
        if target.scheme != "https" or target.hostname != FASIH_HOST:
            raise SSOTestError("Script tidak menggunakan portal HTTPS FASIH resmi.")
        for name in (
            "klik_sso_eksternal", "login_sso_eksternal", "tunggu_login_berhasil",
        ):
            if not callable(getattr(mod, name, None)):
                raise SSOTestError("Versi script belum mendukung uji SSO terpisah.")

        report("Membuka " + browser + " untuk uji SSO FASIH (tanpa scraping)...")
        driver = browser_factory(browser)
        driver.set_page_load_timeout(50)
        with redirect_stdout(output), redirect_stderr(output):
            mod.klik_sso_eksternal(driver)
            report("Mengisi login SSO Eksternal pada halaman resmi BPS...")
            mod.login_sso_eksternal(driver, username, password)
            report("Memeriksa apakah SSO mengembalikan sesi ke FASIH...")
            success = mod.tunggu_login_berhasil(driver, timeout=120)
        if success is not True:
            raise SSOTestError("SSO belum memberikan konfirmasi login berhasil.")
        current = urlsplit(str(driver.current_url or ""))
        if current.scheme != "https" or current.hostname != FASIH_HOST:
            raise SSOTestError("Login belum kembali ke alamat HTTPS FASIH resmi.")
        report("Login SSO FASIH berhasil. Tidak ada scraping atau perubahan Sheets.")
    except SSOTestError:
        raise
    except Exception as exc:
        safe_kind = type(exc).__name__
        raise SSOTestError(
            "Uji login SSO belum berhasil (" + safe_kind + "). "
            "Periksa akun, OTP/MFA dan tampilan browser FASIH."
        ) from None
    finally:
        sys.path[:] = original_path
        if driver is not None:
            report("Menutup sesi Firefox/Edge/Chrome untuk uji login SSO...")
            try:
                driver.quit()
            except Exception:
                pass
