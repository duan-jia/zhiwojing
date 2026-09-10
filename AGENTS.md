# Repository Guidelines

## Project Structure & Module Organization

This MVP lets a mock user discover Zhihu questions, search for material, and generate Zhihu-style drafts through a shared capability registry. Read `docs/PROJECT_STATUS.md` before larger changes; it is the source of truth for the current architecture, capabilities, and phase boundaries.

- `backend/app/main.py`: FastAPI routes, SQLModel user model, SQLite setup, and OAuth placeholders.
- `backend/app/zhihu/`: shared models, Tool Registry, errors, and HTTP/MCP/draft providers.
- `backend/tests/`: API, provider, and registry tests.
- `backend/requirements.txt`: pinned Python dependencies.
- `frontend/src/standalone.ts`: login-gated RPGJS entry point; `frontend/src/login.ts` and `login.css`: guest/OAuth-status login shell; `frontend/src/server.ts`: in-browser RPG server setup.
- `frontend/src/config/`: RPGJS client configuration, controls, spritesheets, and Tiled map provider.
- `frontend/src/modules/`: player and map definitions; `frontend/src/tiled/`: the continuous runtime map, four source quadrants, and tilesets.
- `frontend/public/spritesheets/`: player sprite assets and reserved character sheets.
- `frontend/index.html`, `vite.config.ts`, and `tsconfig.json`: frontend shell and RPGJS/Vite configuration.
- `docs/PROJECT_STATUS.md`: concise current-state documentation for humans and AI collaborators.
- `material/`: local reference materials, ignored by Git. No dedicated public asset directory currently exists.

## Build, Test, and Development Commands

Use Python 3.11+ and Node.js 22.12+, as documented in `README.md`.

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
npm ci
npm run dev
```

Open `http://localhost:5173`. Run `npm run build:map` after editing a source quadrant, `npm run build` to generate the production bundle in `dist/`, and `npm test` to verify the world layout plus maps and UI assets at root and subpath deployments.

## Coding Style & Naming Conventions

Use four-space indentation and snake_case for Python functions and variables. Follow the surrounding RPGJS starter style for TypeScript and CanvasEngine components; use camelCase for variables and explicit types for new public contracts. Preserve existing API field names. Tiled tilesets use the `.tsx` XML extension and are not React TypeScript files. No formatter or linter is configured. Keep edits focused and preserve the Chinese interface copy.

## Testing Guidelines

Run `cd backend && .venv/bin/python -m unittest discover -s tests -v` for backend coverage, then run `cd frontend && npm run build && npm test`. For map or UI changes, also verify keyboard movement, continuous passage between all four landscape quadrants, loading, and narrow-screen behavior in a browser. Document validation in the pull request.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects such as `Add draft error handling`. Explain the change, link relevant issues, and record validation results. Include screenshots for visible UI changes.

## Security & Configuration

Keep future Zhihu OAuth credentials and integration logic in the FastAPI backend. Never commit secrets, virtual environments, generated databases, or licensed vendor asset archives. Starting the backend from `backend/` creates `backend/avatar.db`. Treat RPGJS gameplay state and FastAPI business capabilities as separate boundaries until an integration contract is explicitly designed.
