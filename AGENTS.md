# Repository Guidelines

## Project Structure & Module Organization

This MVP lets a mock user discover Zhihu questions, search for material, and generate Zhihu-style drafts through a shared capability registry. Read `docs/PROJECT_STATUS.md` before larger changes; it is the source of truth for the current architecture, capabilities, and phase boundaries.

- `backend/app/main.py`: FastAPI routes, SQLModel user model, SQLite setup, and OAuth placeholders.
- `backend/app/zhihu/`: shared models, Tool Registry, errors, and HTTP/MCP/draft providers.
- `backend/tests/`: API, provider, and registry tests.
- `backend/requirements.txt`: pinned Python dependencies.
- `frontend/src/main.tsx`: React interface and API calls; `frontend/src/style.css`: styling and responsive layout.
- `frontend/index.html`, `vite.config.ts`, and `tsconfig.json`: frontend entry point and configuration.
- `docs/PROJECT_STATUS.md`: concise current-state documentation for humans and AI collaborators.
- `material/`: local reference materials, ignored by Git. No dedicated public asset directory currently exists.

## Build, Test, and Development Commands

Use Python 3.11+ and Node.js 18+, as documented in `README.md`.

Backend setup and development server:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend setup and development server, in a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Run `npm run build` from `frontend/` to perform the TypeScript check and generate the production bundle in `dist/`.

## Coding Style & Naming Conventions

Use four-space indentation and snake_case for Python functions and variables; use PascalCase for models and React components. For new multiline TypeScript and CSS, use two-space indentation and camelCase for JavaScript variables. Preserve existing API field names. TypeScript strict mode is enabled; prefer explicit types over additional `any` usage. No formatter or linter is configured. Keep edits focused and preserve the Chinese interface copy.

## Testing Guidelines

Run `cd backend && .venv/bin/python -m unittest discover -s tests -v` for backend coverage, then run `cd frontend && npm run build`. For UI changes, also verify loading and error states plus the narrow-screen layout. Document validation in the pull request.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects such as `Add draft error handling`. Explain the change, link relevant issues, and record validation results. Include screenshots for visible UI changes.

## Security & Configuration

Keep future Zhihu OAuth credentials and integration logic in the backend. Never commit secrets, virtual environments, or generated databases. Starting the backend from `backend/` creates `backend/avatar.db`; the frontend API URL and backend CORS origin currently assume the local ports above.
