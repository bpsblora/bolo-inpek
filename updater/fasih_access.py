"""Pemeriksaan FASIH sebelum login SSO.

FortiClient VPN tetap diaktifkan manual. Pemeriksaan ini tidak mengubah
koneksi VPN, tidak memasukkan kredensial, dan tidak menggunakan data SSO.
Hasil positif hanya membuktikan portal FASIH menjawab melalui jaringan
saat itu; bukan memastikan status proses FortiClient atau hak akses survei.
"""
from __future__ import annotations

from urllib.parse import urlparse
import requests

FASIH_URL = "https://fasih-sm.bps.go.id/app"
FASIH_HOST = "fasih-sm.bps.go.id"
ACCESSIBLE = {200, 301, 302, 303, 307, 308, 401}


class FasihAccessError(RuntimeError):
    """VPN/portal FASIH belum siap; hentikan proses sebelum SSO."""


def fasih_failure_notice(reason: str = "") -> str:
    """Tunjukkan kategori masalah yang aman tanpa menebak VPN telah mati.

    Alasan selalu dibuat dari string internal di verify_fasih_access;
    jangan mengutip exception mentah yang mungkin berisi kredensial proxy.
    """
    main = (
        "Pemeriksaan akses FASIH belum berhasil.\n\n"
        + (reason or "Penyebab belum diketahui. Periksa koneksi VPN BPS.")
        + "\n\nUji juga melalui Chrome pada PC yang sama: "
        + "https://fasih-sm.bps.go.id/app"
        + "\nJika Chrome berhasil membuka FASIH tetapi Updater gagal, "
        + "kemungkinan ada perbedaan konfigurasi sertifikat, proxy, "
        + "atau pembatasan permintaan Python."
    )
    return main


def verify_fasih_access(*, get=requests.get, url=FASIH_URL) -> None:
    """Periksa portal melalui HTTPS terverifikasi tanpa follow redirect.

    Redirect login SSO menandakan portal dapat dijangkau. Tidak melakukan
    login, tidak mengirim data rahasia, dan tidak menyimpan sesi/cookie.
    """
    address = urlparse(url)
    if address.scheme != "https" or address.hostname != FASIH_HOST:
        raise FasihAccessError("Alamat portal FASIH tidak sesuai konfigurasi resmi.")
    try:
        response = get(
            url, timeout=(6, 12),
            allow_redirects=False,
        )
    except requests.exceptions.SSLError as exc:
        raise FasihAccessError(
            "Sertifikat HTTPS FASIH tidak dapat diverifikasi oleh Python. "
            "Jika Chrome dapat membukanya, periksa CA Windows/proxy "
            "bersama pengelola TI BPS; jangan menonaktifkan verifikasi HTTPS."
        ) from exc
    except requests.exceptions.ProxyError as exc:
        raise FasihAccessError(
            "Koneksi HTTPS Python tertahan atau ditolak oleh proxy. "
            "Periksa pengaturan proxy jaringan BPS."
        ) from exc
    except requests.exceptions.ConnectTimeout as exc:
        raise FasihAccessError(
            "Koneksi TCP ke portal FASIH melewati batas waktu. "
            "Periksa rute jaringan VPN BPS atau firewall."
        ) from exc
    except requests.exceptions.ReadTimeout as exc:
        raise FasihAccessError(
            "Portal FASIH tidak menjawab tepat waktu setelah koneksi dibuat. "
            "Periksa kondisi server dan jaringan BPS."
        ) from exc
    except requests.exceptions.ConnectionError as exc:
        raise FasihAccessError(
            "Koneksi ke fasih-sm.bps.go.id gagal pada lapisan DNS/TCP/TLS. "
            "Periksa DNS dan rute VPN BPS; lihat apakah Chrome dapat membuka portal."
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise FasihAccessError(
            "Permintaan HTTPS ke portal FASIH gagal (" +
            type(exc).__name__ + "). Periksa koneksi dan kebijakan jaringan."
        ) from exc

    if response.status_code not in ACCESSIBLE:
        raise FasihAccessError(
            "Server FASIH dapat dijangkau, tetapi membalas HTTP "
            + str(response.status_code) + ". "
            + ("Akses ditolak atau dibatasi; tanyakan kebijakan keamanan portal."
               if response.status_code in (403, 429)
               else "Periksa status layanan dan path portal, bukan hanya VPN.")
        )
    if response.status_code in {301, 302, 303, 307, 308}:
        location = response.headers.get("Location", "")
        if location:
            target = urlparse(location)
            if target.scheme and target.scheme != "https":
                raise FasihAccessError("FASIH mengarahkan ke halaman non-HTTPS.")
    # Browser/Selenium berikutnya tetap memverifikasi hasil login sebenarnya.
