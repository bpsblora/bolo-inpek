"""BOLO INPEK Updater — aplikasi portable Windows, tanpa server scraping.

Workflow: pengguna mengaktifkan FortiClient VPN secara manual, memilih script
scraper lokal, menggunakan satu akun SSO bersama dari .env privat, serta memperbarui Sheets.
Kredensial tidak ditanam ke EXE, diunggah, atau ditampilkan oleh aplikasi.
"""
from __future__ import annotations

from pathlib import Path
from queue import Empty, Queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import webbrowser

from legacy_bridge import check_files, run_legacy_scraper
from cloud_config import synchronize_online, read_public_settings, read_desktop_oauth_client, find_desktop_oauth_file
from preflight import preflight_google_sheets, verify_google_sheets_client, read_local_setup, PreflightError
from operator_google import login_operator
from google_diagnostic import run_read_only_google_test, load_diagnostic_settings
from run_lock import local_update_lock
from fasih_access import FasihAccessError, fasih_failure_notice
from browser_driver import (
    AUTO_BROWSER, BROWSER_CHOICES, FasihBrowserError,
    resolve_browser, verify_fasih_in_browser,
)

DASHBOARD_URL = "https://bpsblora.github.io/bolo-inpek/"
APP_TITLE = "BOLO INPEK Updater"


def application_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


class Updater(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE + " • Portable")
        self.geometry("910x790")
        self.minsize(720, 680)
        self.configure(bg="#edf4ff")
        self.events: Queue[tuple[str, str]] = Queue()
        self.running = False
        self.current_operation = None
        self._missing_local_script = False
        self.selected_script = tk.StringVar()
        self.vpn_confirmed = tk.BooleanVar(value=False)
        self.fasih_browser = tk.StringVar(value=AUTO_BROWSER)
        self.sso_username = tk.StringVar()
        self.sso_password = tk.StringVar()
        self.online_mode = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value="Belum siap")
        self._style()
        self._layout()
        guessed = application_directory() / "ambil_data_monitoring_inpek_v2.py"
        if guessed.is_file():
            self.selected_script.set(str(guessed))
        else:
            self._missing_local_script = True
        self.after(150, self.update_status)
        self.after(120, self.drain_events)

    def _style(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Page.TFrame", background="#edf4ff")
        style.configure("Card.TFrame", background="white")
        style.configure("Heading.TLabel", background="#edf4ff",
                        foreground="#163a66", font=("Segoe UI", 19, "bold"))
        style.configure("Subtitle.TLabel", background="#edf4ff",
                        foreground="#556c86", font=("Segoe UI", 10))
        style.configure("Section.TLabel", background="white",
                        foreground="#173e70", font=("Segoe UI", 11, "bold"))
        style.configure("Body.TLabel", background="white",
                        foreground="#465c72", font=("Segoe UI", 9))
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"),
                        padding=(16, 9))
        style.configure("Normal.TButton", padding=(12, 8))

    def _layout(self):
        root = ttk.Frame(self, style="Page.TFrame", padding=22)
        root.pack(fill="both", expand=True)
        ttk.Label(root, text="BOLO INPEK Updater", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(root, text="Pembaruan FASIH-SM • VPN manual, akun SSO bersama",
                  style="Subtitle.TLabel").pack(anchor="w", pady=(3, 16))

        panel = ttk.Frame(root, style="Card.TFrame", padding=17)
        panel.pack(fill="x")
        ttk.Label(panel, text="1. Persiapan Akses", style="Section.TLabel").pack(anchor="w")
        ttk.Label(panel, text="Hubungkan VPN BPS sebelum mengakses FASIH.",
                  style="Body.TLabel").pack(anchor="w", pady=(6, 8))
        ttk.Checkbutton(panel, text="Saya sudah terhubung ke VPN BPS dan berwenang mengakses FASIH",
                        variable=self.vpn_confirmed, command=self.update_status).pack(anchor="w")
        browser_row = ttk.Frame(panel, style="Card.TFrame")
        browser_row.pack(fill="x", pady=(10, 0))
        ttk.Label(browser_row, text="Browser untuk FASIH:", style="Body.TLabel").pack(side="left")
        ttk.Combobox(browser_row, textvariable=self.fasih_browser,
                     values=BROWSER_CHOICES, state="readonly", width=27).pack(side="left", padx=(10, 0))
        self.browser_hint = ttk.Label(
            panel, text="", style="Body.TLabel",
        )
        self.browser_hint.pack(anchor="w", pady=(5, 0))
        self.fasih_browser.trace_add("write", lambda *_: self._update_browser_hint())
        self.after(80, self._update_browser_hint)

        account = ttk.Frame(root, style="Card.TFrame", padding=17)
        account.pack(fill="x", pady=(12, 0))
        ttk.Label(account, text="2. Akun SSO FASIH", style="Section.TLabel").pack(anchor="w")
        ttk.Label(account, text="Isi akun SSO yang berwenang. Tidak disimpan ke file atau Google Sheets.",
                  style="Body.TLabel").pack(anchor="w", pady=(3, 8))
        account_inputs = ttk.Frame(account, style="Card.TFrame")
        account_inputs.pack(fill="x")
        email_box = ttk.Frame(account_inputs, style="Card.TFrame")
        email_box.pack(side="left", fill="x", expand=True, padx=(0, 9))
        ttk.Label(email_box, text="Email / Username SSO", style="Body.TLabel").pack(anchor="w")
        ttk.Entry(email_box, textvariable=self.sso_username).pack(fill="x", pady=(4, 0))
        password_box = ttk.Frame(account_inputs, style="Card.TFrame")
        password_box.pack(side="left", fill="x", expand=True)
        ttk.Label(password_box, text="Password SSO", style="Body.TLabel").pack(anchor="w")
        ttk.Entry(password_box, textvariable=self.sso_password, show="●").pack(fill="x", pady=(4, 0))
        ttk.Label(account, text="Password dikosongkan segera setelah pembaruan dimulai.",
                  style="Body.TLabel").pack(anchor="w", pady=(7, 0))
        self.sso_username.trace_add("write", lambda *_: self.update_status())
        self.sso_password.trace_add("write", lambda *_: self.update_status())

        scripts = ttk.Frame(root, style="Card.TFrame", padding=17)
        scripts.pack(fill="x", pady=(12, 0))
        ttk.Label(scripts, text="3. Script Scraping FASIH", style="Section.TLabel").pack(anchor="w")
        ttk.Label(scripts, text="File script dari paket internal digunakan saat pembaruan FASIH. Untuk Uji Login Google, tidak perlu diisi.",
                  style="Body.TLabel").pack(anchor="w", pady=(5, 10))
        entry_row = ttk.Frame(scripts, style="Card.TFrame")
        entry_row.pack(fill="x")
        ttk.Entry(entry_row, textvariable=self.selected_script).pack(side="left", fill="x", expand=True)
        ttk.Button(entry_row, text="Pilih Script (.py)", command=self.pick_script,
                   style="Normal.TButton").pack(side="left", padx=(7, 0))
        self.file_status = ttk.Label(scripts, text="", style="Body.TLabel",
                                     wraplength=760, justify="left")
        self.file_status.pack(anchor="w", pady=(9, 0))
        modes = ttk.Frame(scripts, style="Card.TFrame")
        modes.pack(fill="x", pady=(10, 0))
        ttk.Radiobutton(
            modes, text="Online • ambil daftar survei terbaru dari BOLO INPEK",
            variable=self.online_mode, value=True, command=self.update_status
        ).pack(anchor="w")
        ttk.Radiobutton(
            modes, text="Lokal • hanya untuk pengujian dengan config_survei.json di PC",
            variable=self.online_mode, value=False, command=self.update_status
        ).pack(anchor="w", pady=(4, 0))

        controls = ttk.Frame(root, style="Page.TFrame")
        controls.pack(fill="x", pady=(16, 13))
        self.run_button = ttk.Button(controls, text="▶  Perbarui Data FASIH",
                                     style="Primary.TButton", command=self.start_update)
        self.run_button.pack(side="left")
        ttk.Button(controls, text="Periksa Persiapan", command=self.check_preparation,
                   style="Normal.TButton").pack(side="left", padx=(8, 0))
        ttk.Button(controls, text="Uji Login Google", command=self.start_google_diagnostic,
                   style="Normal.TButton").pack(side="left", padx=(8, 0))
        ttk.Button(controls, text="Buka Dashboard", command=lambda: webbrowser.open(DASHBOARD_URL),
                   style="Normal.TButton").pack(side="left", padx=9)
        ttk.Label(controls, textvariable=self.status, style="Subtitle.TLabel").pack(side="right")

        console = ttk.Frame(root, style="Card.TFrame", padding=14)
        console.pack(fill="both", expand=True)
        ttk.Label(console, text="4. Riwayat Proses (di PC Ini)",
                  style="Section.TLabel").pack(anchor="w", pady=(0, 8))
        self.log_window = scrolledtext.ScrolledText(
            console, height=11, font=("Consolas", 9), wrap="word",
            background="#f7faff", foreground="#1a3959", relief="flat",
            padx=10, pady=10, state="disabled"
        )
        self.log_window.pack(fill="both", expand=True)
        self._append_log("Uji Login Google dapat dijalankan tanpa script, VPN BPS, atau akun SSO.")
        ttk.Label(root,
                  text="Mode online: login Google untuk Sheets tanpa service-account key. SSO FASIH tetap privat.",
                  style="Subtitle.TLabel").pack(anchor="w", pady=(11, 0))

    def _update_browser_hint(self):
        try:
            chosen = resolve_browser(self.fasih_browser.get())
        except FasihBrowserError:
            chosen = None
        if chosen:
            self.browser_hint.configure(
                text=("Browser default Windows: " if self.fasih_browser.get() == AUTO_BROWSER
                      else "Browser pilihan manual: ") + chosen,
            )
        else:
            self.browser_hint.configure(
                text="Browser default belum dapat dikenali. Pilih browser manual untuk FASIH.",
            )

    def _chosen_browser(self) -> str | None:
        try:
            return resolve_browser(self.fasih_browser.get())
        except FasihBrowserError as exc:
            messagebox.showwarning("Browser FASIH", str(exc))
            return None

    def pick_script(self):
        path = filedialog.askopenfilename(
            title="Pilih script scraper BOLO INPEK yang tepercaya",
            filetypes=[("Python script", "*.py")]
        )
        if path:
            self.selected_script.set(path)
            self._missing_local_script = False
        self.update_status()

    def update_status(self):
        script = Path(self.selected_script.get() or "")
        problems = check_files(
            script,
            require_config=not self.online_mode.get(),
            require_google_credentials=not self.online_mode.get(),
            require_sso_env=False,
        )
        if not problems and not self.online_mode.get():
            try:
                read_local_setup(script.parent, require_sso=False)
            except PreflightError as exc:
                problems.append(str(exc))
        if problems:
            hint = (
                "Untuk pembaruan FASIH pilih ambil_data_monitoring_inpek_v2.py "
                "dari folder hasil ekstrak paket internal. "
                if self._missing_local_script and not self.selected_script.get() else ""
            )
            self.file_status.configure(text="Persiapan: " + hint + " | ".join(problems))
        else:
            self.file_status.configure(text=(
                "Mode online: daftar survei diperiksa saat pembaruan. "
                "Google meminta izin operator sekali per sesi."
                if self.online_mode.get() else
                "Mode uji lokal: scraper memakai config_survei.json pada PC."
            ))
        sso_ready = bool(self.sso_username.get().strip()) and bool(self.sso_password.get())
        ready = not problems and self.vpn_confirmed.get() and sso_ready and not self.running
        self.run_button.configure(state=("normal" if ready else "disabled"))
        self.status.set("Sedang memproses" if self.running else
                        "Siap diperbarui" if ready else
                        "Isi akun SSO" if not sso_ready and not problems else "Belum siap")

    def _append_log(self, line):
        self.log_window.configure(state="normal")
        self.log_window.insert("end", line.rstrip() + "\n")
        self.log_window.see("end")
        self.log_window.configure(state="disabled")

    def start_update(self):
        if self.running:
            return
        script = Path(self.selected_script.get())
        if not self.vpn_confirmed.get() or check_files(
            script,
            require_config=not self.online_mode.get(),
            require_google_credentials=not self.online_mode.get(),
            require_sso_env=False,
        ):
            messagebox.showwarning(APP_TITLE, "Periksa VPN BPS dan berkas pendukung terlebih dahulu.")
            return
        try:
            if not self.online_mode.get():
                read_local_setup(script.parent, require_sso=False)
        except PreflightError as exc:
            messagebox.showwarning(APP_TITLE, str(exc))
            return
        username = self.sso_username.get().strip()
        password = self.sso_password.get()
        if not username or not password:
            messagebox.showwarning(APP_TITLE, "Masukkan email/username dan password SSO FASIH.")
            return
        browser = self._chosen_browser()
        if not browser:
            return
        confirmed = messagebox.askyesno(
            APP_TITLE,
            "Jalankan scraper dari file lokal yang dipilih?\n\n"
            ("Updater akan mengambil daftar survei TERBARU dari BOLO INPEK online. "
             "Akun Google yang diberi izin perlu login untuk membaca ID FASIH. "
             if self.online_mode.get() else "Updater menggunakan konfigurasi uji lokal. ")
            + "Login SSO FASIH menggunakan email dan password yang baru saja "
            + "diisi pada aplikasi. Password tidak disimpan ke file. "
            + "Hasil pembaruan akan ditulis ke kedua Google Sheets."
        )
        if not confirmed:
            return
        sso_credentials = (username, password)
        self.sso_password.set("")
        password = None  # Tidak disimpan pada UI/form atau file lokal.
        self.running = True
        self.update_status()
        self.current_operation = "update"
        self._append_log("Mulai pembaruan manual dari " + script.name
                         + " dengan browser " + browser)
        threading.Thread(
            target=self._run,
            args=(script, self.online_mode.get(), sso_credentials, browser),
            daemon=True,
        ).start()

    def start_google_diagnostic(self):
        """Tombol aman: login Google + cek akses baca saja, tanpa VPN dan .env."""
        if self.running:
            return
        found = find_desktop_oauth_file(application_directory())
        if found is not None:
            oauth_path = str(found)
            self._append_log("File OAuth Desktop resmi ditemukan otomatis: " + str(found))
        else:
            oauth_path = filedialog.askopenfilename(
                title="Pilih updater-oauth-desktop.json resmi dari Google Cloud",
                initialdir=str(Path.home() / "Downloads"),
                filetypes=[("OAuth Desktop JSON", "*.json")],
            )
            if not oauth_path:
                return
        self.running = True
        self.update_status()
        self.status.set("Memeriksa Google")
        self.current_operation = "google_test"
        self._append_log("Memulai uji Google: hanya akses baca; tidak menjalankan FASIH atau scraping.")
        threading.Thread(
            target=self._google_diagnostic_worker,
            args=(Path(oauth_path),), daemon=True,
        ).start()

    def _google_diagnostic_worker(self, oauth_file: Path):
        try:
            run_read_only_google_test(
                oauth_file, lambda line: self.events.put(("log", str(line)))
            )
            self.events.put((
                "google_test_done",
                "Login Google, Firebase, dan dua Google Sheets berhasil diuji. "
                "Tidak ada data yang diubah."
            ))
        except BaseException as error:
            self.events.put(("failed", type(error).__name__ + ": " + str(error)))

    def check_preparation(self):
        """Diagnostik tanpa menjalankan scraping atau mengubah spreadsheet."""
        if self.running:
            return
        script = Path(self.selected_script.get() or "")
        if check_files(
            script,
            require_config=not self.online_mode.get(),
            require_google_credentials=not self.online_mode.get(),
            require_sso_env=False,
        ):
            messagebox.showwarning(APP_TITLE, "Pilih file Python dan lengkapi konfigurasi dulu.")
            return
        self.running = True
        self.update_status()
        self.current_operation = "preflight"
        browser = self._chosen_browser()
        if not browser:
            self.running = False
            self.current_operation = None
            self.update_status()
            return
        self._append_log("Memulai audit akses FASIH melalui " + browser
                         + " tanpa scraping atau login SSO...")
        threading.Thread(
            target=self._check_preparation_worker,
            args=(script.parent, self.online_mode.get(), browser), daemon=True
        ).start()

    def _check_preparation_worker(self, script_dir, online, browser):
        try:
            def report(line):
                self.events.put(("log", str(line)))
            if self.vpn_confirmed.get():
                report("Membuka " + browser + " untuk menguji portal FASIH setelah VPN BPS tersambung...")
                verify_fasih_in_browser(browser)
                report("Portal FASIH berhasil dibuka lewat " + browser
                       + ". Belum melakukan login SSO atau panggilan API FASIH.")
            else:
                report("Pemeriksaan FASIH dilewati: operator belum mengonfirmasi VPN BPS.")
            if online:
                settings = load_diagnostic_settings()
                read_desktop_oauth_client(
                    script_dir, settings["google_oauth_desktop_client_id"]
                )
                report("Konfigurasi Firebase dan OAuth Desktop telah valid secara struktur.")
                report("Izin Google Sheets diperiksa saat operator login sebelum scraping.")
            else:
                preflight_google_sheets(script_dir, report)
            self.events.put((
                "done",
                "Prajalankan selesai. Tidak ada scraping atau perubahan data."
            ))
        except (FasihAccessError, FasihBrowserError) as error:
            self.events.put(("fasih_unreachable", str(error)))
        except BaseException as error:
            self.events.put((
                "failed", type(error).__name__ + ": " + str(error)
            ))

    def _run(self, script, use_online, sso_credentials: tuple[str, str], browser: str):
        try:
            def report(line):
                self.events.put(("log", str(line)))
            with local_update_lock(script.parent):
                report("Memastikan portal FASIH dapat dibuka dengan " + browser
                       + " setelah VPN BPS tersambung...")
                verify_fasih_in_browser(browser)
                report("Portal FASIH terbuka melalui " + browser
                       + ". Lanjut memeriksa persiapan.")
                if use_online:
                    settings = read_public_settings(script.parent)
                    desktop_config = read_desktop_oauth_client(
                        script.parent, settings["google_oauth_desktop_client_id"]
                    )
                    report("Login Google operator untuk akses Firebase dan dua Sheets...")
                    session = login_operator(desktop_config)
                    targets = {}
                    report("Mengambil daftar survei dan dua spreadsheet dari Firebase...")
                    count = synchronize_online(
                        script.parent, report,
                        get_credentials=lambda _config: session.google_id_token,
                        on_targets=lambda value: targets.update(value),
                    )
                    report(str(count) + " survei siap diperbarui.")
                    report("Memeriksa izin akun Google operator ke kedua spreadsheet...")
                    verify_google_sheets_client(session.spreadsheet_client, targets, report)
                    run_legacy_scraper(
                        script, report,
                        authorized_client=session.spreadsheet_client,
                        spreadsheet_targets=targets,
                        sso_credentials=sso_credentials,
                        browser=browser,
                    )
                else:
                    report("Mode uji lokal: tidak menarik konfigurasi online.")
                    preflight_google_sheets(script.parent, report)
                    run_legacy_scraper(script, report, sso_credentials=sso_credentials,
                                       browser=browser)
            self.events.put(("done", "Proses selesai. Buka dashboard untuk memuat data terbaru."))
        except (FasihAccessError, FasihBrowserError) as error:
            self.events.put(("fasih_unreachable", str(error)))
        except BaseException as error:
            message = type(error).__name__ + ": " + str(error)
            # Jangan tampilkan email/password SSO bila library memasukkannya ke error.
            for value in sso_credentials:
                if len(value) >= 3:
                    message = message.replace(value, "[RAHASIA]")
            self.events.put(("failed", message))

    def drain_events(self):
        while True:
            try:
                kind, text = self.events.get_nowait()
            except Empty:
                break
            if kind == "log":
                self._append_log(text)
            elif kind in ("done", "failed", "fasih_unreachable", "google_test_done"):
                self.running = False
                operation = self.current_operation
                self.current_operation = None
                if kind == "google_test_done":
                    self._append_log("[✓] " + text)
                    self.update_status()
                    messagebox.showinfo("Uji Login Google Berhasil", text)
                elif kind == "fasih_unreachable":
                    notice = fasih_failure_notice(text)
                    self._append_log("[!] " + notice.replace("\n", " "))
                    self.update_status()
                    messagebox.showwarning("Koneksi FASIH Belum Tersambung", notice)
                else:
                    self._append_log(("[✓] " if kind == "done" else "[X] ") + text)
                    self.update_status()
                    if kind == "failed":
                        title = ("Uji Login Google Belum Berhasil" if operation == "google_test"
                                 else "Pemeriksaan Persiapan Belum Berhasil" if operation == "preflight"
                                 else "Pembaruan Data Belum Berhasil")
                        messagebox.showerror(title, text[:1200])
        self.after(120, self.drain_events)


if __name__ == "__main__":
    Updater().mainloop()
