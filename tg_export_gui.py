#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tg_export_gui.py
================
رابط گرافیکی سادهٔ استخراج پست‌های کانال تلگرام به CSV.
نیازی به Telegram API نیست — از tgstat و پیش‌نمایش وب t.me استفاده می‌کند.

اجرا:
    python tg_export_gui.py
"""

import queue
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from tg_channel_export import export_posts, parse_user_date, write_csv


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("استخراج پست‌های کانال تلگرام → CSV")
        self.geometry("560x520")
        self.minsize(520, 480)
        self.log_queue = queue.Queue()
        self.worker = None
        self._build_ui()
        self.after(150, self._drain_log)

    # ------------------------------------------------------------------ UI
    def _build_ui(self):
        pad = {"padx": 12, "pady": 6}
        frm = ttk.Frame(self)
        frm.pack(fill="x", **pad)

        ttk.Label(frm, text="نام یا لینک کانال:").grid(
            row=0, column=1, sticky="e", pady=4)
        self.channel_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.channel_var, width=34,
                  justify="left").grid(row=0, column=0, sticky="we", pady=4)

        ttk.Label(frm, text="تاریخ شروع:").grid(
            row=1, column=1, sticky="e", pady=4)
        self.from_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.from_var, width=34,
                  justify="left").grid(row=1, column=0, sticky="we", pady=4)

        ttk.Label(frm, text="تاریخ پایان:").grid(
            row=2, column=1, sticky="e", pady=4)
        self.to_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.to_var, width=34,
                  justify="left").grid(row=2, column=0, sticky="we", pady=4)

        hint = ("تاریخ را شمسی (1405-04-01) یا میلادی (2026-06-22) وارد کنید — "
                "با اعداد فارسی هم می‌شود.")
        ttk.Label(frm, text=hint, foreground="#666",
                  wraplength=500, justify="right").grid(
            row=3, column=0, columnspan=2, sticky="e", pady=(0, 4))

        ttk.Label(frm, text="منبع داده:").grid(
            row=4, column=1, sticky="e", pady=4)
        self.source_var = tk.StringVar(value="tgstat (با فال‌بک خودکار به t.me)")
        ttk.Combobox(
            frm, textvariable=self.source_var, state="readonly", width=32,
            values=["tgstat (با فال‌بک خودکار به t.me)",
                    "فقط t.me (پیش‌نمایش وب تلگرام)"],
        ).grid(row=4, column=0, sticky="we", pady=4)

        frm.columnconfigure(0, weight=1)

        self.run_btn = ttk.Button(self, text="⬇  استخراج و ذخیره CSV",
                                  command=self.start)
        self.run_btn.pack(fill="x", padx=12, pady=(8, 4))

        self.progress = ttk.Progressbar(self, mode="indeterminate")
        self.progress.pack(fill="x", padx=12, pady=(0, 4))

        log_frame = ttk.LabelFrame(self, text="گزارش کار")
        log_frame.pack(fill="both", expand=True, padx=12, pady=(4, 12))
        self.log_box = tk.Text(log_frame, height=12, state="disabled",
                               wrap="word", font=("Tahoma", 9))
        self.log_box.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(log_frame, command=self.log_box.yview)
        sb.pack(side="right", fill="y")
        self.log_box.configure(yscrollcommand=sb.set)

    # ------------------------------------------------------------- logging
    def log(self, msg: str):
        """Thread-safe: worker threads push, main loop drains."""
        self.log_queue.put(str(msg))

    def _drain_log(self):
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self.log_box.configure(state="normal")
                self.log_box.insert("end", msg + "\n")
                self.log_box.see("end")
                self.log_box.configure(state="disabled")
        except queue.Empty:
            pass
        self.after(150, self._drain_log)

    # --------------------------------------------------------------- logic
    def start(self):
        if self.worker and self.worker.is_alive():
            return

        channel = self.channel_var.get().strip()
        if not channel:
            messagebox.showwarning("ورودی ناقص", "نام کانال را وارد کنید.")
            return
        try:
            date_from = parse_user_date(self.from_var.get())
            date_to = parse_user_date(self.to_var.get())
        except ValueError as e:
            messagebox.showerror("تاریخ نامعتبر", str(e))
            return
        if date_from > date_to:
            messagebox.showerror("تاریخ نامعتبر",
                                 "تاریخ شروع باید قبل از تاریخ پایان باشد.")
            return

        source = "tme" if self.source_var.get().startswith("فقط") else "tgstat"

        self.run_btn.configure(state="disabled")
        self.progress.start(12)
        self.log("شروع استخراج...")

        self.worker = threading.Thread(
            target=self._work, args=(channel, date_from, date_to, source),
            daemon=True)
        self.worker.start()

    def _work(self, channel, date_from, date_to, source):
        try:
            channel, posts = export_posts(
                channel, date_from, date_to, source=source, log=self.log)
            self.after(0, self._done, channel, posts, date_from, date_to)
        except Exception as e:
            self.after(0, self._failed, str(e))

    def _failed(self, err: str):
        self.progress.stop()
        self.run_btn.configure(state="normal")
        self.log(f"✗ خطا: {err}")
        messagebox.showerror("خطا", err)

    def _done(self, channel, posts, date_from, date_to):
        self.progress.stop()
        self.run_btn.configure(state="normal")
        if not posts:
            self.log("در این بازه پستی پیدا نشد.")
            messagebox.showinfo("نتیجه", "در این بازه پستی پیدا نشد.")
            return

        self.log(f"✓ {len(posts)} پست پیدا شد. محل ذخیره را انتخاب کنید...")
        default = f"{channel}_{date_from:%Y-%m-%d}_{date_to:%Y-%m-%d}.csv"
        path = filedialog.asksaveasfilename(
            title="ذخیره فایل CSV",
            defaultextension=".csv",
            initialfile=default,
            filetypes=[("CSV", "*.csv")])
        if not path:
            self.log("ذخیره لغو شد.")
            return
        try:
            write_csv(posts, path)
        except OSError as e:
            self._failed(f"ذخیره فایل ممکن نشد: {e}")
            return
        self.log(f"✓ فایل ذخیره شد: {path}")
        messagebox.showinfo("تمام شد",
                            f"{len(posts)} پست در فایل زیر ذخیره شد:\n{path}")


if __name__ == "__main__":
    App().mainloop()
