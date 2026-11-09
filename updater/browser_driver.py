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


def open_fasih_browser(
    browser: str, *, diagnostic: bool = False,
    on_progress: Callable[[str], None] | None = None,
):
    """Start an isolated browser session using the installed browser.

    Edge and Firefox use official Selenium WebDriver + Selenium Manager; a
    compatible driver may be downloaded on first use depending on the PC.
    For diagnostic checks, do not block on third-party page assets: return
    from navigation immediately and check actual page readiness separately.
    """
    browser = resolve_browser(browser)
    report = on_progress or (lambda _message: None)
    driver = None
    report("Menyiapkan WebDriver " + browser + "...")
    try:
        if browser == "Microsoft Edge":
            from selenium import webdriver
            options = webdriver.EdgeOptions()
            options.page_load_strategy = "none" if diagnostic else "eager"
            options.add_argument("--start-maximized")
            options.add_argument("--disable-notifications")
            report("Menjalankan Microsoft Edge melalui EdgeDriver...")
            driver = webdriver.Edge(options=options)
        elif browser == "Mozilla Firefox":
            from selenium import webdriver
            options = webdriver.FirefoxOptions()
            options.page_load_strategy = "none" if diagnostic else "eager"
            report("Menjalankan Mozilla Firefox melalui GeckoDriver...")
            driver = webdriver.Firefox(options=options)
            driver.maximize_window()
        else:
            import undetected_chromedriver as uc
            options = uc.ChromeOptions()
            options.page_load_strategy = "none" if diagnostic else "eager"
            options.add_argument("--start-maximized")
            options.add_argument("--disable-notifications")
            # Original FASIH scraper used UC's subprocess launcher. Restore
            # that behavior for Chrome only, with auto version detection.
            # This does not modify or replace the Firefox/Edge WebDrivers.
            report(
                "Menjalankan Google Chrome melalui undetected_chromedriver "
                "(UC, deteksi versi otomatis)..."
            )
            driver = uc.Chrome(
                options=options, use_subprocess=True, version_main=None,
            )
        driver.set_page_load_timeout(50)
        report("WebDriver " + browser + " berhasil dibuat.")
        return driver
    except Exception as exc:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        if browser == "Google Chrome":
            guidance = (
                "UC tidak berhasil membuat sesi Chrome. Buka Chrome secara "
                "manual untuk memeriksa apakah browser dapat dijalankan. "
                "Jika Chrome bermasalah di PC ini, pilih Firefox yang sudah "
                "terbukti dapat membuka portal. Jangan ubah pengaturan VPN."
            )
        else:
            guidance = (
                "Periksa browser terpasang, ketersediaan driver Selenium "
                "dan akses jaringan pengunduhan driver di PC BPS."
            )
        raise FasihBrowserError(
            "Tidak dapat memulai " + browser + " ("
            + type(exc).__name__ + "). " + guidance
        ) from exc


def verify_fasih_in_browser(
    browser: str,
    *,
    driver_factory=None,
    on_progress: Callable[[str], None] | None = None,
    timeout_seconds: float = 25,
) -> str:
    """Verify the real HTTPS FASIH login landing page without authentication.

    Firefox may show the official OAuth login page while innerText and
    readyState are not yet accessible. Recognize the *exact official*
    /oauth_login.html URL with a matching browser-tab title as an additional
    readiness signal. Do NOT count merely opening a browser, hosting on BPS,
    or a path without an actual title as success. Never bypass TLS or VPN.
    """
    browser = resolve_browser(browser)
    driver = None
    report = on_progress or (lambda _message: None)
    try:
        report("Menjalankan " + browser + " melalui Selenium...")
        driver = (
            driver_factory(browser) if driver_factory is not None
            else open_fasih_browser(
                browser, diagnostic=True, on_progress=report,
            )
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
            if host == FASIH_HOST and address.scheme == "http":
                raise FasihBrowserError(
                    "Browser diarahkan ke FASIH non-HTTPS. Pemeriksaan dibatalkan."
                )
            if approved:
                last_host = host
                # FASIH routes /app to its own official OAuth landing page.
                # On Firefox, innerText/readyState can remain unavailable while
                # the visible login page has already rendered.  Confirm the
                # exact HTTPS hostname/path AND an independently readable page
                # title; never accept a URL alone or an arbitrary BPS-like site.
                if (host == FASIH_HOST
                    and address.path.lower().rstrip("/") == "/oauth_login.html"):
                    try:
                        title = str(driver.title or "").casefold()
                    except Exception:
                        title = ""
                    if "fasih" in title or "badan pusat statistik" in title:
                        report(
                            "Halaman OAuth FASIH resmi terverifikasi dari "
                            "alamat HTTPS dan judul tab melalui " + browser + "."
                        )
                        return browser

                try:
                    state = driver.execute_script("return document.readyState")
                    page_text = driver.execute_script(
                        "return (document.body && "
                        "(document.body.innerText || document.body.textContent) "
                        "|| '').slice(0, 4000)"
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
                    # Do not declare success until page evidence is verified.
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
            report("Menutup tab Firefox/Edge/Chrome khusus pemeriksaan (normal setelah tes)...")
            try:
                driver.quit()
            except Exception:
                pass
