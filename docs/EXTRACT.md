# Extract status (this repository)

This repository is the standalone Circles extract from the private 181hacks monorepo (`apps/paylink-nimiq`).

Completed:

- Fresh git history (not the monorepo history)
- Only the Circles app; MIT helpers vendored under `lib/vendor/paylink-core/`
- Outfit (SIL OFL 1.1) in `app/fonts/` with `OFL.txt`; no commercial typefaces
- `Dockerfile` and `next.config.ts` `outputFileTracingRoot` point at this repo root
- Fresh lockfile generated here
- Deploy script requires an explicit SSH host; no private host aliases
- No `.env`, secrets, or `data/` directory
- Leave **private** until Khalil confirms publishing. Do not submit competition forms from this step.
