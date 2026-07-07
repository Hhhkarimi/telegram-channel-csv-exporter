#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tg_channel_export.py
====================
Export posts of a *public* Telegram channel between two dates to a CSV file,
WITHOUT using the Telegram API.

Two data sources (both are plain web scraping):

  1. "tgstat"  -> https://tgstat.com/channel/@<channel>   (default, per request)
  2. "tme"     -> https://t.me/s/<channel>                (Telegram web preview,
                                                           very reliable fallback)

If tgstat blocks the request (captcha / 403 — it is quite aggressive with
bots), the script automatically falls back to the t.me web preview, which
contains exactly the same public posts.

Usage
-----
    python tg_channel_export.py irancurrency --from 2026-06-01 --to 2026-06-30
    python tg_channel_export.py https://t.me/irancurrency --from 2026-06-01 --to 2026-06-30 -o posts.csv
    python tg_channel_export.py irancurrency --from 2026-06-01 --to 2026-06-30 --source tme

Output CSV columns:
    message_id, datetime_utc, text, views, link
"""

import argparse
import csv
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

try:  # optional: Jalali (Shamsi) date support
    import jdatetime
except ImportError:
    jdatetime = None


def _log_stderr(msg):
    print(msg, file=sys.stderr)


# Persian/Arabic digits -> Latin
_DIGIT_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def parse_user_date(s: str) -> datetime:
    """
    Accept a date in YYYY-MM-DD (or YYYY/MM/DD) form, in either Gregorian
    or Jalali (Shamsi) calendar. Years below 1700 are treated as Jalali
    (e.g. 1405-04-15). Persian digits are accepted too.
    Returns a UTC-aware datetime at 00:00.
    """
    s = s.strip().translate(_DIGIT_MAP).replace("/", "-").replace(".", "-")
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if not m:
        raise ValueError(f"تاریخ نامعتبر: {s} (قالب درست: 1405-04-15 یا 2026-07-06)")
    y, mo, d = map(int, m.groups())
    if y < 1700:  # Jalali
        if jdatetime is None:
            raise ValueError(
                "برای تاریخ شمسی باید کتابخانه jdatetime نصب باشد: pip install jdatetime"
            )
        g = jdatetime.date(y, mo, d).togregorian()
        y, mo, d = g.year, g.month, g.day
    return datetime(y, mo, d, tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def normalize_channel(raw: str) -> str:
    """Accept 'irancurrency', '@irancurrency' or a full t.me / tgstat URL."""
    raw = raw.strip()
    m = re.search(r"(?:t\.me/(?:s/)?|tgstat\.\w+/channel/@?)([A-Za-z0-9_]+)", raw)
    if m:
        return m.group(1)
    return raw.lstrip("@")


def parse_views(s: str):
    """'12.3K' -> 12300, '1.1M' -> 1100000, '532' -> 532."""
    if not s:
        return None
    s = s.strip().replace(",", "").replace("\u202f", "").replace(" ", "")
    m = re.match(r"^([\d.]+)([KkMm]?)$", s)
    if not m:
        return None
    val = float(m.group(1))
    suf = m.group(2).lower()
    if suf == "k":
        val *= 1_000
    elif suf == "m":
        val *= 1_000_000
    return int(val)


def clean_text(el) -> str:
    return el.get_text("\n", strip=True) if el else ""


# --------------------------------------------------------------------------- #
# Source 1: t.me/s/<channel>  (Telegram public web preview)
# --------------------------------------------------------------------------- #
def fetch_tme(channel: str, date_from: datetime, date_to: datetime,
              delay: float = 1.0, max_pages: int = 2000, log=_log_stderr):
    """
    Walk backwards through https://t.me/s/<channel>?before=<msg_id>
    (20 posts per page) until we pass `date_from`.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT,
                            "Accept-Language": "en-US,en;q=0.9"})
    posts = {}
    before = None

    for page in range(max_pages):
        url = f"https://t.me/s/{channel}"
        params = {"before": before} if before else None

        resp = None
        for attempt in range(3):  # retry transient errors, don't truncate
            try:
                resp = session.get(url, params=params, timeout=30)
                if resp.status_code == 200:
                    break
                log(f"  [t.me] HTTP {resp.status_code}؛ تلاش مجدد ...")
            except requests.RequestException as e:
                log(f"  [t.me] خطای شبکه ({e})؛ تلاش مجدد ...")
            time.sleep(2 * (attempt + 1))
        if resp is None or resp.status_code != 200:
            raise RuntimeError(
                f"t.me پاسخ نداد (HTTP "
                f"{resp.status_code if resp is not None else '—'})")

        soup = BeautifulSoup(resp.text, "html.parser")
        messages = soup.select("div.tgme_widget_message[data-post]")
        if not messages:
            if page == 0:
                raise RuntimeError(
                    "No posts found. The channel may be private, "
                    "restricted, or the username is wrong."
                )
            break

        min_id = None
        reached_older = False

        for msg in messages:
            try:
                msg_id = int(msg["data-post"].split("/")[-1])
            except (KeyError, ValueError):
                continue
            min_id = msg_id if min_id is None else min(min_id, msg_id)

            time_el = msg.select_one("time[datetime]")
            if not time_el:
                continue
            dt = datetime.fromisoformat(time_el["datetime"])
            dt_utc = dt.astimezone(timezone.utc)

            if dt_utc < date_from:
                reached_older = True
                continue
            if dt_utc > date_to:
                continue

            text = clean_text(msg.select_one(".tgme_widget_message_text"))
            views = parse_views(
                clean_text(msg.select_one(".tgme_widget_message_views"))
            )
            posts[msg_id] = {
                "message_id": msg_id,
                "datetime_utc": dt_utc.strftime("%Y-%m-%d %H:%M:%S"),
                "text": text,
                "views": views if views is not None else "",
                "link": f"https://t.me/{channel}/{msg_id}",
            }

        log(f"  [t.me] صفحه {page + 1}: تاکنون {len(posts)} پست جمع شد...")

        if reached_older or min_id is None or min_id <= 1 or before == min_id:
            break
        before = min_id
        time.sleep(delay)

    return sorted(posts.values(), key=lambda p: p["message_id"])


# --------------------------------------------------------------------------- #
# Source 2: tgstat.com
# --------------------------------------------------------------------------- #
_TGSTAT_DATE_FORMATS = ("%d %b %Y, %H:%M", "%d %b, %H:%M",
                        "%d.%m.%Y %H:%M", "%d.%m.%Y")


def _parse_tgstat_date(text: str):
    text = re.sub(r"\s+", " ", text).strip()
    now = datetime.now(timezone.utc)
    for fmt in _TGSTAT_DATE_FORMATS:
        try:
            dt = datetime.strptime(text, fmt)
            if dt.year == 1900:  # format without year -> assume recent
                dt = dt.replace(year=now.year)
                if dt.replace(tzinfo=timezone.utc) > now + timedelta(days=1):
                    dt = dt.replace(year=now.year - 1)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _parse_tgstat_posts(soup, channel: str):
    """Best-effort parsing of tgstat post cards."""
    out = {}
    for card in soup.select("div.post-container, div[id^=post-]"):
        msg_id = None
        link_el = card.select_one(f'a[href*="t.me/{channel}/"]') or \
                  card.select_one(f'a[href*="/channel/@{channel}/"]')
        if link_el:
            m = re.search(r"/(\d+)(?:\D|$)", link_el.get("href", ""))
            if m:
                msg_id = int(m.group(1))
        if msg_id is None:
            m = re.search(r"post-(\d+)", card.get("id", ""))
            if m:
                msg_id = int(m.group(1))
        if msg_id is None:
            continue

        dt = None
        for small in card.select("small, .text-muted"):
            dt = _parse_tgstat_date(small.get_text(" ", strip=True))
            if dt:
                break

        text_el = card.select_one(".post-text, .post-body, .text")
        views = None
        views_el = card.find(string=re.compile(r"views", re.I))
        if views_el is None:
            v = card.select_one(".post-views, [data-views]")
            if v:
                views = parse_views(v.get_text(strip=True))

        out[msg_id] = {
            "message_id": msg_id,
            "datetime": dt,
            "text": clean_text(text_el) or clean_text(card),
            "views": views if views is not None else "",
            "link": f"https://t.me/{channel}/{msg_id}",
        }
    return out


def fetch_tgstat(channel: str, date_from: datetime, date_to: datetime,
                 domain: str = "tgstat.com", delay: float = 2.0,
                 max_pages: int = 300, log=_log_stderr):
    """
    Scrape post cards from tgstat channel page + its AJAX 'load more'
    endpoint. tgstat is protected against bots, so this may raise —
    the caller then falls back to the t.me preview.
    """
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"https://{domain}/",
    })

    base = f"https://{domain}/channel/@{channel}"
    resp = session.get(base, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"tgstat returned HTTP {resp.status_code}")
    low = resp.text.lower()
    if "captcha" in low or "cloudflare" in low and "challenge" in low:
        raise RuntimeError("tgstat is asking for a captcha (bot protection)")

    soup = BeautifulSoup(resp.text, "html.parser")
    collected = _parse_tgstat_posts(soup, channel)
    if not collected:
        raise RuntimeError("Could not parse any posts from the tgstat page")

    csrf = session.cookies.get("_tgstat_csrk", "")

    covered = False    # did we paginate back past date_from?
    exhausted = False  # did we reach the very beginning of the channel?

    for page in range(1, max_pages):
        dated = [p for p in collected.values() if p["datetime"]]
        if dated and min(p["datetime"] for p in dated) < date_from:
            covered = True
            break  # we already went past the start date

        oldest_id = min(collected)
        try:
            r = session.post(
                f"{base}/posts",
                data={"page": page, "before": oldest_id,
                      "q": "", "_tgstat_csrk": csrf},
                headers={"X-Requested-With": "XMLHttpRequest"},
                timeout=30,
            )
            payload = r.json()
            html = payload.get("html", "")
        except Exception:
            break  # AJAX endpoint changed/blocked -> incomplete coverage
        if not html.strip():
            exhausted = True  # no more posts: reached channel beginning
            break

        new = _parse_tgstat_posts(BeautifulSoup(html, "html.parser"), channel)
        before = len(collected)
        collected.update(new)
        log(f"  [tgstat] صفحه {page}: تاکنون {len(collected)} پست جمع شد...")
        if len(collected) == before:
            exhausted = True
            break
        time.sleep(delay)

    # CRITICAL: if we could not paginate back past the start date and the
    # channel wasn't exhausted, coverage is INCOMPLETE (this is what caused
    # the "only 20 posts" bug). Raise so the caller falls back to t.me,
    # which paginates reliably over the whole range.
    if not covered and not exhausted:
        raise RuntimeError(
            "tgstat only returned its first page (load-more blocked); "
            "coverage of the date range is incomplete"
        )

    posts = []
    for p in sorted(collected.values(), key=lambda x: x["message_id"]):
        dt = p["datetime"]
        if dt is None or not (date_from <= dt <= date_to):
            continue
        posts.append({
            "message_id": p["message_id"],
            "datetime_utc": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "text": p["text"],
            "views": p["views"],
            "link": p["link"],
        })
    if not posts:
        raise RuntimeError("tgstat parsing yielded no posts inside the date range")
    return posts


# --------------------------------------------------------------------------- #
# CSV writer
# --------------------------------------------------------------------------- #
def write_csv(posts, path: str):
    fields = ["message_id", "datetime_utc", "text", "views", "link"]
    # utf-8-sig so Excel opens Persian text correctly
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(posts)


# --------------------------------------------------------------------------- #
# High-level API (used by CLI and the GUI)
# --------------------------------------------------------------------------- #
def export_posts(channel, date_from, date_to, source="tgstat",
                 domain="tgstat.com", delay=1.0, log=_log_stderr):
    """Fetch posts (tgstat first, auto-fallback to t.me) and return them."""
    channel = normalize_channel(channel)
    date_to = date_to.replace(hour=23, minute=59, second=59)
    if date_from > date_to:
        raise ValueError("تاریخ شروع باید قبل از تاریخ پایان باشد")

    posts = None
    if source == "tgstat":
        try:
            log("در حال تلاش با tgstat ...")
            posts = fetch_tgstat(channel, date_from, date_to,
                                 domain=domain, delay=delay, log=log)
        except Exception as e:
            log(f"tgstat جواب نداد ({e})")
            log("رفتیم سراغ پیش‌نمایش وب تلگرام (t.me) ...")
    if posts is None:
        posts = fetch_tme(channel, date_from, date_to, delay=delay, log=log)
    return channel, posts


# --------------------------------------------------------------------------- #
# Interactive mode (no arguments given)
# --------------------------------------------------------------------------- #
def interactive_main():
    print("=" * 52)
    print("   استخراج پست‌های کانال تلگرام → فایل CSV")
    print("=" * 52)
    channel = input("\nنام یا لینک کانال (مثلاً irancurrency): ").strip()
    while not channel:
        channel = input("نام کانال نمی‌تواند خالی باشد. دوباره وارد کنید: ").strip()

    def ask_date(label):
        while True:
            raw = input(f"{label} (شمسی مثل 1405-04-01 یا میلادی مثل 2026-06-22): ")
            try:
                return parse_user_date(raw)
            except ValueError as e:
                print(f"  ✗ {e}")

    date_from = ask_date("تاریخ شروع")
    date_to = ask_date("تاریخ پایان")

    out = input("نام فایل خروجی [Enter = پیش‌فرض]: ").strip()
    print()
    try:
        channel, posts = export_posts(channel, date_from, date_to, log=print)
    except Exception as e:
        print(f"\n✗ خطا: {e}")
        sys.exit(1)

    if not posts:
        print("\nدر این بازه پستی پیدا نشد.")
        sys.exit(1)

    if not out:
        out = (f"{channel}_{date_from:%Y-%m-%d}_{date_to:%Y-%m-%d}.csv")
    write_csv(posts, out)
    print(f"\n✓ تمام شد: {len(posts)} پست در فایل «{out}» ذخیره شد.")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    if len(sys.argv) == 1:          # no arguments -> friendly interactive mode
        interactive_main()
        return
    ap = argparse.ArgumentParser(
        description="Export public Telegram channel posts between two dates "
                    "to CSV (no Telegram API needed).")
    ap.add_argument("channel",
                    help="Channel username or URL, e.g. irancurrency or "
                         "https://t.me/irancurrency")
    ap.add_argument("--from", dest="date_from", required=True,
                    help="Start date, YYYY-MM-DD (inclusive)")
    ap.add_argument("--to", dest="date_to", required=True,
                    help="End date, YYYY-MM-DD (inclusive)")
    ap.add_argument("-o", "--output", default=None,
                    help="Output CSV file (default: <channel>_<from>_<to>.csv)")
    ap.add_argument("--source", choices=["tgstat", "tme"], default="tgstat",
                    help="Data source (default: tgstat, auto-fallback to tme)")
    ap.add_argument("--tgstat-domain", default="tgstat.com",
                    help="tgstat domain (tgstat.com or tgstat.ru)")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="Delay between page requests in seconds")
    args = ap.parse_args()

    try:
        date_from = parse_user_date(args.date_from)
        date_to = parse_user_date(args.date_to)
    except ValueError as e:
        ap.error(str(e))

    try:
        channel, posts = export_posts(
            args.channel, date_from, date_to, source=args.source,
            domain=args.tgstat_domain, delay=args.delay)
    except Exception as e:
        print(f"خطا: {e}", file=sys.stderr)
        sys.exit(1)

    if not posts:
        print("در این بازه پستی پیدا نشد.", file=sys.stderr)
        sys.exit(1)

    out = args.output or (f"{channel}_{date_from:%Y-%m-%d}_"
                          f"{date_to:%Y-%m-%d}.csv")
    write_csv(posts, out)
    print(f"\n✓ {len(posts)} پست در فایل «{out}» ذخیره شد.")


if __name__ == "__main__":
    main()
