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

## Current Site Conventions

- Public site routes include `/`, `/events`, `/spaces`, `/gallery`, `/pricing`, `/visit`, and `/tour`. Header and footer navigation should point to these real pages, not homepage hash anchors, unless a section jump is intentional.
- Desktop heroes should feel balanced as one composition. Use the centered Luxor axis lockup with centered headline, copy, and CTAs unless the page intentionally uses a split hero with a strong visual on the other side.
- Do not wrap above-the-fold hero content in scroll-triggered `Reveal`; first viewport content must render immediately.
- Use the correct Spanish spelling: `Quinceañera` and `Quinceañeras` with `ñ` everywhere user-facing.
- The gallery page uses a custom filtered grid and lightbox. Do not add a gallery dependency unless it clearly improves the experience beyond the current custom implementation.
- Keep new packages conservative. Prefer existing Next.js, React, Tailwind, Framer Motion, and Lucide patterns unless a package solves a real interaction or accessibility problem.

## Commit And Push

Only commit or push when the user explicitly requests it.

1. Confirm the current branch and scope with `git status -sb`.
2. Run `npm run typecheck` and `npm run lint -- --quiet`.
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
