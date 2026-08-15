# AI‑SIGHT.md – Project Catch‑List & Guard‑Rails

This document consolidates every **catch** derived from `AGENTS.md` and the feature request in `BUILD-PLAN.md`.  Treat it as a living checklist; any item marked **✅** is considered addressed.  Before merging new code, run through the list to ensure we stay within the project constraints.

---

## 1️⃣ Architecture & Build‑time Constraints (Next.js static export)

| # | Catch | Why it matters | Status |
|---|-------|----------------|--------|
| 1 | **Static‑export only** – `output: 'export'` in `next.config.ts` | No SSR or API routes; everything must run in the browser. | ☐ |
| 2 | **Read the Next.js App‑Router guide** (line 8 of `AGENTS.md`) | Guarantees correct file layout (`app/` directory, client‑only components). | ☐ |
| 3 | **PWA support** (manifest + service‑worker) | Required for installable experience on static‑host. | ☐ |
| 4 | **Tailwind‑CSS only** – utility‑first styling, no native CSS files. | Enforces the dependency‑policy. | ☐ |
| 5 | **Three‑state theme toggle** (system | dark | light) with `lucide-react` icons | Used throughout UI; must persist via `localStorage`. | ☐ |
| 6 | **Local‑storage persistence** for UI state (channel, dates, theme). | No backend storage; keeps state across reloads. | ☐ |
| 7 | **No large third‑party dependencies** – add only if it truly reduces effort (e.g., `shadcn/ui`). | Keeps bundle size small and respects the policy. | ☐ |
| 8 | **Framer‑Motion for animations** – respect `prefers‑reduced‑motion`. | Required animation library; must be optional for users with reduced motion. | ☐ |
| 9 | **Strict TypeScript (`strict: true`) & ESLint** (standard Next.js config). | Guarantees type safety and code quality. | ☐ |
|10| **No formatter config files** (`.prettierrc` disallowed). | Avoids cross‑device formatting conflicts. | ☐ |
|11| **Vitest testing** when logic becomes non‑trivial. | Provides unit‑test safety net. | ☐ |

---

## 2️⃣ Feature‑level Catches (Frontend GUI & HTML Export)

| # | Catch | Required Action | Status |
|---|-------|----------------|--------|
| 1 | **Port Python scraping to the browser** (fetch tgstat / t.me, pagination, retry, captcha detection). | Re‑implement as pure client‑side TypeScript using `fetch`. | ☐ |
| 2 | **CAPTCHA / rate‑limit handling** – auto‑fallback to t.me when tgstat blocks. | Detect captcha text in response; switch source. | ☐ |
| 3 | **HTML parsing in the browser** – replace BeautifulSoup with `DOMParser` and query selectors. | Write helper functions mirroring the Python selectors. | ☐ |
| 4 | **Jalali date support (optional)** – accept Persian digits and convert to Gregorian. | Use a lightweight conversion lib or custom mapping. | ☐ |
| 5 | **HTML export feature** – render messages into a self‑contained HTML file (styles inline, CSS variables present). | Provide “Download HTML” button that creates a Blob. | ☐ |
| 6 | **Export size limit** – keep generated HTML ≤ 16 MB (GitHub Artifact limit). | Warn user if channel exceeds threshold, suggest CSV. | ☐ |
| 7 | **Lazy pagination / infinite scroll** – avoid loading all posts into memory. | Load next batch on user action; keep only current page in state. | ☐ |
| 8 | **Error handling** – simple console wrapper (no UI alerts). | Use a `log` utility that prefixes source tags. | ☐ |
| 9 | **Accessibility** – semantic HTML, `focus-visible` styling, ARIA labels. | Apply to all interactive components. | ☐ |
|10 | **Service‑worker caching** – cache fetched tgstat/t.me pages for offline use. | Add `sw.js` with stale‑while‑revalidate strategy. | ☐ |
|11 | **CORS considerations** – direct fetch may be blocked; only use a proxy after explicit user consent. | Prefer t.me (usually CORS‑open). | ☐ |
|12 | **Bundle‑size guard** – total JS < 200 KB gzipped (excluding Tailwind). | Verify with `next-bundle-analyzer`. | ☐ |
|13 | **Testing parsers** – unit tests for `normalizeChannel`, `parseViews`, forwarding detection, etc. | Vitest tests under `src/lib/__tests__`. | ☐ |
|14 | **Theme‑aware export** – exported HTML should retain the current theme via CSS variables. | Inline `:root { --color-primary: … }` in the generated file. | ☐ |
|15 | **Download buttons must be `type="button"` and prevent navigation**. | Use `e.preventDefault()` in click handler. | ☐ |

---

## 3️⃣ Project‑wide Checklist

| # | Item | Status |
|---|------|--------|
| 1 | **Create Tailwind config** (`tailwind.config.cjs`) with CSS‑variable theme definitions. | ☐ |
| 2 | **Add `manifest.json` & `sw.js` in `public/`** and register them in a client component. | ☐ |
| 3 | **Implement three‑state theme toggle** (`ThemeProvider` + `lucide-react` icons). | ☐ |
| 4 | **Write scraper helpers** (`src/lib/scraper.ts`) – pure functions, fully tested. | ☐ |
| 5 | **Build UI pages** – `app/page.tsx` (home) and `app/channel/[slug]/page.tsx` (results). | ☐ |
| 6 | **Add “Download CSV” & “Download HTML”** actions. | ☐ |
| 7 | **Update `DEVELOPER.md`** with component map + Mermaid diagram. | ☐ |
| 8 | **Add GitHub Actions workflow** (`.github/workflows/deploy.yml`) that runs lint, tests, builds, and deploys to `gh-pages`. | ☐ |
| 9 | **Run lint & build locally** (`npm run lint && npm run build`). | ☐ |
|10| **Verify bundle size** with `next-bundle-analyzer`. | ☐ |
|11| **Manual HTML export test** – ensure file opens offline and respects theme. | ☐ |

---

## 4️⃣ Immediate Next Action

Create the scaffold files (Tailwind config, PWA manifest, basic scraper helpers) and tick the first few items on the checklist.  Once the groundwork is in place, we can iterate on the UI and the HTML‑export feature while continuously referencing **AI‑SIGHT.md**.

---

*This file lives only in the repository; it is **not** stored in any global Claude history or skill.  It will be version‑controlled like any other source file.*