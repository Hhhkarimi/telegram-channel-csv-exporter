# AGENTS.md: Frontend Project Blueprint

This file serves as the single source of truth for the coding agent. It dictates the architecture, style, and constraints for all client-only, backend-free projects.

---

## 1. Project Identity & Architecture
- **Framework:** Next.js (App Router). APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (of the installed nextjs on the system) before writing any code. Heed deprecation notices.
- **Deployment:** Static Export (`output: 'export'` in `next.config.ts`). No backend/SSR.
- **Rendering:** SPA-like behavior; static assets only.
- **PWA:** Implement PWA support (manifest + service worker) for installable experiences.
- **Language:** TypeScript (`strict: true`).

## 2. Styling & Design
- **Core:** Tailwind CSS (utility-first). No redundant native CSS.
- **Theming:** Use CSS variables (e.g., `--color-primary`, `--color-secondary`) defined in `globals.css` for easy brand identity swaps.
- **Dark/Light Mode:** Must implement a toggle button with three states: [System | Dark | Light]. Use `lucide-react` for icons.
- **Responsiveness:** Mobile-first approach using Tailwind breakpoints.

## 3. State & Networking
- **State:** `localStorage` for persistence. Standard React hooks (`useState`, `useReducer`) for local state.
- **Networking:** Native `fetch` API. Agent MUST ask before implementing any authentication or API integration.

## 4. Documentation & Maintenance
- **README.md:** Standard project overview for visitors.
- **DEVELOPER.md:** High-detail technical guide including:
  - File/component map (use Mermaid diagrams).
  - Component responsibilities.
  - MUST be kept updated as the project structure evolves.
- **Component Docs:** Handled via descriptive code comments and the `DEVELOPER.md` map.

## 5. Development Workflow & Tooling
- **Package Manager:** `npm`.
- **Linting:** Standard Next.js ESLint configuration.
- **Formatting:** NO formatter configuration files (e.g., no `.prettierrc`) to avoid cross-device conflicts.
- **CI/CD:** Github Actions workflow located in `.github/workflows/deploy.yml` that builds and deploys to `gh-pages` on every push.
- **Git:** No git initialization by the agent.

## 6. Best Practices & Defaults (Agent-Selected)
- **Component Architecture:** "Feature-based" organization. Components are collocated with their specific logic/styles in `src/components/feature-name/`.
- **Accessibility:** Use semantic HTML elements. Implement `focus-visible` for keyboard navigation.
- **Animation:** Use `framer-motion` for transitions. Always respect `prefers-reduced-motion` media queries.
- **Images:** Lazy loading is default. In `public/` assets, add a comment/README hint about the target file size for each image.
- **Error Handling:** Use a simple `console` wrapper for logging in client-only environments.
- **Dependency Policy:** Prefer native Web APIs. Avoid large third-party dependencies unless strictly necessary for complexity reduction. Audit dependencies with `npm audit`.
- **Testing:** Start with simple component-level unit tests using `Vitest` when logic complexity grows.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
