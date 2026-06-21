# Luxor Event Space

These instructions apply to this entire repository.

## Repository

- GitHub: `https://github.com/powerchoosers/luxor-event-space`
- Git remote: `origin`
- Default and deployment branch: `main`
- This is the Luxor Event Space website. Do not commit or push its files to the Nodal Point CRM repository.

## Development

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

The site uses Next.js, React, TypeScript, and Tailwind CSS. The local development URL is `http://localhost:3000`.

## Commit And Push

Only commit or push when the user explicitly requests it.

1. Confirm the current branch and scope with `git status -sb`.
2. Run `npm run typecheck`, `npm run lint -- --quiet`, and `npm run build`.
3. Stage only the files belonging to the requested change.
4. Commit with a concise message describing the user-facing result.
5. Push the deployment branch with `git push origin main` when the user explicitly requests a direct main-branch push.

Never commit `.env*`, credentials, `node_modules`, `.next`, local Codex state, browser logs, or QA screenshots. The root `.gitignore` covers these files.

## Deployment

The GitHub repository is ready for a standard Vercel Next.js deployment:

- Root directory: repository root
- Build command: `npm run build`
- Output/framework detection: Next.js defaults
- No environment variables are currently required by the public website
