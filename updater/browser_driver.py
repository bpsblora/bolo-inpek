"""Browser-based FASIH reachability for Windows VPN connections.

Some office networks route Edge/Firefox differently from Python requests and
Chrome. This module tests the actual selected browser, not an unauthenticated
Python HTTP request. It never bypasses TLS checks or VPN requirements.
"""
from __future__ import annotations

from urllib.parse import urlsplit
from time import monotonic, sleep
from typing import Callable

FASIH_URL = "https://fasih-sm.bps.go.id/app"
FASIH_HOST = "fasih-sm.bps.go.id"
AUTO_BROWSER = "Otomatis (Default Windows)"
SUPPORTED_BROWSERS = ("Microsoft Edge", "Mozilla Firefox", "Google Chrome")
BROWSER_CHOICES = (AUTO_BROWSER,) + SUPPORTED_BROWSERS


class FasihBrowserError(RuntimeError):
    """Tidak dapat membuka FASIH dengan browser yang dipilih."""


def _default_https_progid() -> str | None:
    """Read Windows user's HTTPS app association, without changing it.

    Newer Windows 11 builds may store the latest choice in UserChoiceLatest.
    Read it before the older UserChoice key to avoid a stale Edge association.
    """
    try:
        import winreg
    except ImportError:
        return None
    root = (
        r"Software\Microsoft\Windows\Shell\Associations"
        r"\UrlAssociations\https"
    )
    for subkey in ("UserChoiceLatest", "UserChoice"):
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, root + "\\" + subkey
            ) as handle:
                value, _ = winreg.QueryValueEx(handle, "ProgId")
            if isinstance(value, str) and value.strip():
                return value.strip()
        except OSError:
            continue
    return None


def _browser_from_progid(progid: str) -> str | None:
    name = progid.strip().casefold()
    if name.startswith("msedge") and "htm" in name:
        return "Microsoft Edge"
    if name.startswith("firefoxurl") or name.startswith("firefoxhtml"):
        return "Mozilla Firefox"
    if name.startswith("chromehtml"):
        return "Google Chrome"
    return None


def resolve_browser(browser: str) -> str:
    """Choose the exact Windows HTTPS default, or honor a manual override.

    Unsupported defaults are never silently replaced by Edge/Chrome. Doing so
    could resurrect the browser already failing on the operator's PC.
    """
    if browser in SUPPORTED_BROWSERS:
        return browser
    if browser != AUTO_BROWSER:
        raise FasihBrowserError("Pilihan browser FASIH tidak dikenali.")
    progid = _default_https_progid()
    if not progid:
        raise FasihBrowserError(
            "Browser default HTTPS Windows belum dapat dibaca. "
            "Pilih Edge, Firefox, atau Chrome secara manual."
        )
    resolved = _browser_from_progid(progid)
    if not resolved:
        raise FasihBrowserError(
            "Browser default Windows saat ini belum didukung untuk otomasi FASIH. "
            "Pilih Edge, Firefox, atau Chrome secara manual di Updater."
        )
    return resolved


def open_fasih_browser(browser: str, *, diagnostic: bool = False):
    """Start an isolated browser session using the installed browser.

    Edge and Firefox use official Selenium WebDriver + Selenium Manager; a
    compatible driver may be downloaded on first use depending on the PC.
    For diagnostic checks, do not block on third-party page assets: return
    from navigation immediately and check actual page readiness separately.
    """
    browser = resolve_browser(browser)
    try:
        if browser == "Microsoft Edge":
            from selenium import webdriver
            options = webdriver.EdgeOptions()
            options.page_load_strategy = "none" if diagnostic else "eager"
            options.add_argument("--start-maximized")
            options.add_argument("--disable-notifications")
            driver = webdriver.Edge(options=options)
        elif browser == "Mozilla Firefox":
            from selenium import webdriver
            options = webdriver.FirefoxOptions()
            options.page_load_strategy = "none" if diagnostic else "eager"
            driver = webdriver.Firefox(options=options)
            driver.maximize_window()
        else:
            import undetected_chromedriver as uc
            options = uc.ChromeOptions()
            options.page_load_strategy = "none" if diagnostic else "eager"
            options.add_argument("--start-maximized")
            options.add_argument("--disable-notifications")
            driver = uc.Chrome(options=options, use_subprocess=False, version_main=None)
    except Exception as exc:
        raise FasihBrowserError(
            "Tidak dapat memulai " + browser + " untuk FASIH ("
            + type(exc).__name__ + "). Periksa browser sudah terpasang, "
            "driver Selenium yang sesuai tersedia, dan akses unduh driver "
            "jika diperlukan."
        ) from exc
    driver.set_page_load_timeout(50)
    return driver


def verify_fasih_in_browser(
    browser: str,
    *,
    driver_factory=None,
    on_progress: Callable[[str], None] | None = None,
    timeout_seconds: float = 25,
) -> str:
    """Verify that an actual BPS HTTPS login page became interactive.

    Use a diagnostic-only nonblocking page navigation because OAuth login
    resources can keep Firefox in a 'loading' state indefinitely even while
    the page is already interactive. Do NOT count an open browser window
    alone as success. Never click SSO, read credentials, or bypass TLS.
    """
    browser = resolve_browser(browser)
    driver = None
    report = on_progress or (lambda _message: None)
    try:
        report("Menjalankan " + browser + " melalui Selenium...")
        driver = (
            driver_factory(browser) if driver_factory is not None
            else open_fasih_browser(browser, diagnostic=True)
        )
        try:
            driver.set_script_timeout(8)
        except AttributeError:
            pass
        report("Browser terbuka; memeriksa halaman login FASIH...")
        driver.get(FASIH_URL)
        deadline = monotonic() + timeout_seconds
        last_host = ""
        while monotonic() < deadline:
            current = str(driver.current_url or "")
            address = urlsplit(current)
            host = (address.hostname or "").lower()
            approved = (
                address.scheme == "https"
                and host in (
                    FASIH_HOST, "sso.bps.go.id", "sso-eksternal.bps.go.id"
                )
            )
            if approved:
                last_host = host
                try:
                    state = driver.execute_script("return document.readyState")
                    page_text = driver.execute_script(
                        "return (document.body && document.body.innerText || '').slice(0, 2500)"
                    )
                    if state in ("interactive", "complete") and isinstance(page_text, str):
                        lowered = page_text.lower()
                        if any(needle in lowered for needle in (
                            "login sso", "badan pusat statistik",
                            "masuk", "sign in", "username", "password",
                        )):
                            report("Halaman login resmi BPS berhasil dimuat melalui " + browser + ".")
                            return browser
                except Exception:
                    # The page may be transitioning between FASIH and BPS SSO.
                    # Do not declare success until the DOM is verified.
                    pass
            elif address.scheme in ("http", "https") and host not in ("", FASIH_HOST):
                raise FasihBrowserError(
                    "Browser diarahkan ke domain di luar FASIH/SSO resmi BPS. "
                    "Pemeriksaan dibatalkan."
                )
            sleep(0.5)
        if last_host:
            raise FasihBrowserError(
                browser + " membuka host BPS, tetapi halaman login belum dapat "
                "dikonfirmasi siap dalam " + str(int(timeout_seconds)) + " detik. "
                "Periksa Riwayat Proses dan kondisi Firefox/Selenium."
            )
        raise FasihBrowserError(
            browser + " terbuka, tetapi tidak mencapai halaman HTTPS FASIH/SSO "
            "resmi dalam " + str(int(timeout_seconds)) + " detik."
        )
    except FasihBrowserError:
        raise
    except Exception as exc:
        from selenium.common.exceptions import TimeoutException
        if isinstance(exc, TimeoutException):
            message = (
                browser + " gagal menyelesaikan navigasi FASIH tepat waktu "
                "meskipun browser mungkin terlihat terbuka."
            )
        else:
            message = (
                browser + " gagal memeriksa FASIH melalui Selenium ("
                + type(exc).__name__ + "). Periksa driver browser, VPN BPS, "
                "proxy dan sertifikat HTTPS."
            )
        raise FasihBrowserError(message) from exc
    finally:
        if driver is not None:
            report("Menutup sesi browser khusus pemeriksaan FASIH...")
            try:
                driver.quit()
            except Exception:
                pass
