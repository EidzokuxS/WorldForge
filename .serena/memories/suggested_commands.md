# Suggested Commands

## Development
```bash
# Start both frontend and backend concurrently
npm run dev

# Start only backend (port 3001)
cd backend && npm run dev
# or: npm run dev:backend

# Start only frontend (port 3000)
cd frontend && npm run dev
# or: npm run dev:frontend
```

## Type Checking & Linting
```bash
# Backend type check
npm --prefix backend run typecheck

# Frontend lint (ESLint)
npm --prefix frontend run lint

# Combined
npm run typecheck
```

## Testing (Vitest)
```bash
# Backend tests
cd backend && npm test

# Backend tests (watch mode)
cd backend && npm run test:watch

# Frontend tests (if configured)
cd frontend && npm test
```

## Database
```bash
# Regenerate Drizzle migrations
cd backend && npm run db:generate

# Push schema to DB
cd backend && npm run db:push
```

## Build
```bash
# Build both
npm run build

# Build shared package (needed after changes)
cd shared && npm run build
```

## System Utilities (Windows with bash/Git Bash)
```bash
ls          # list files
git status  # git status
git log --oneline -20  # recent commits
```

## Important Notes
- After editing shared/ types, run `cd shared && npm run build` for changes to propagate
- Campaign data lives in `campaigns/` (gitignored)
- Settings file: `settings.json` (gitignored, root level)
