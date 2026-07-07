# مراحل انتشار پروژه در GitHub

## 1. آماده‌سازی پوشه پروژه

فایل‌های زیر باید داخل یک پوشه باشند:

```text
tg_channel_export.py
tg_export_gui.py
requirements.txt
README.md
LICENSE
.gitignore
```

## 2. اصلاح LICENSE

فایل `LICENSE` را باز کنید و این بخش را تغییر دهید:

```text
Copyright (c) 2026 YOUR NAME
```

مثلاً:

```text
Copyright (c) 2026 your-github-username
```

## 3. ساخت Repository در GitHub

1. وارد GitHub شوید.
2. روی دکمه `New repository` بزنید.
3. نام پیشنهادی:

```text
telegram-channel-csv-exporter
```

4. توضیح پیشنهادی:

```text
Export public Telegram channel posts to CSV without Telegram API, with GUI, CLI, Jalali dates, and automatic t.me fallback.
```

5. حالت ریپو را انتخاب کنید:
   - Public اگر می‌خواهید همه ببینند.
   - Private اگر فعلاً شخصی باشد.
6. گزینه‌های README / License / .gitignore را در سایت GitHub فعال نکنید، چون فایل‌هایشان را آماده دارید.
7. روی `Create repository` بزنید.

## 4. آپلود با Git در ترمینال

داخل پوشه پروژه این دستورها را بزنید:

```bash
git init
git add .
git commit -m "Initial release: Telegram channel CSV exporter"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/telegram-channel-csv-exporter.git
git push -u origin main
```

`YOUR_USERNAME` را با نام کاربری GitHub خودتان عوض کنید.

## 5. اگر قبلاً remote اضافه شده بود

اگر خطای `remote origin already exists` گرفتید:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/telegram-channel-csv-exporter.git
git push -u origin main
```

## 6. Topics پیشنهادی برای GitHub

در صفحه ریپو، از بخش About این تاپیک‌ها را اضافه کنید:

```text
python
telegram
csv
web-scraping
tkinter
jalali-calendar
telegram-channel
beautifulsoup
```

## 7. Release پیشنهادی

بعد از آپلود، از بخش Releases یک نسخه بسازید:

Tag:

```text
v1.0.0
```

Title:

```text
Initial release
```

Description:

```text
First public release of Telegram Channel CSV Exporter.

Features:
- CLI mode
- GUI mode
- Interactive terminal mode
- Jalali and Gregorian date support
- tgstat source with automatic t.me fallback
- CSV output with Persian-friendly encoding
```
