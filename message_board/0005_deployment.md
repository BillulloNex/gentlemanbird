I wanna make this the greatest browser for ai agents, i want agents cum at the sight and touch of this thing.

I want to (eventually) allow agents to do more than what humans can do & do so faster than humans.

To do that we need to build a flywheel:

- deploy this (lets discuss tech stack)
- have my ai agents use them
- provide feedback/blockers
- revise & redeploy
- repeat
- add to a corpus of potential use cases, agent user stories

---

## Deployment Architecture (Decided 2026-08-25)

### Stack
- **Hosting**: Coolify on Lenovo server (self-hosted at `surf.beenex.org`)
- **CI/CD**: GitHub Actions on public repo (`ThomasVuNguyen/gentlemanbird`)
- **Registry**: GitHub Container Registry (`ghcr.io/thomasvunguyen/gentlemanbird`)
- **Platform**: linux/amd64 (x86_64)

### Pipeline
```
push to master
  → GitHub Actions: build + test (fork-ci.yml)
  → GitHub Actions: docker build (multi-stage Dockerfile)
  → Push image to ghcr.io/thomasvunguyen/gentlemanbird:latest
  → Coolify API: redeploy at surf.beenex.org
```

### Dockerfile Strategy
- **Stage 1 (builder)**: Based on `ghcr.io/ladybirdbrowser/ladybird-ci:latest` — has all C++ deps pre-installed. Builds Ladybird headless + TypeScript daemon.
- **Stage 2 (runtime)**: Slim `ubuntu:26.04` with only Ladybird binaries, Node.js, and the compiled daemon. ~500MB final image.

### What Gets Deployed
The `gentlemanbird-daemon` (Node.js) is the entry point. It exposes:
- REST API on `:9333` → `https://surf.beenex.org/api/v1/`
- WebSocket on `:9333/ws` → `wss://surf.beenex.org/ws`
- Health check on `:9333/health`

The daemon internally spawns and manages Ladybird WebDriver processes for each agent session.

### Coolify Config
- **Project**: GentlemanBird (`suxsq3uvfbatsqfx9u5vpvmj`)
- **App**: gentlemanbird-daemon (`hrc2dd8ff1rjin1jjztarmb7`)
- **Server**: lenovo (`kw1b1pmbkbwqqrjo3sfh6hbg`)
- **Image**: `ghcr.io/thomasvunguyen/gentlemanbird:latest`
- **Domain**: `http://surf.beenex.org`
- **Env vars**: `GB_PORT=9333`, `GB_HOST=0.0.0.0`, `GB_MAX_SESSIONS=5`, `NODE_ENV=production`

### GitHub Secrets
- `COOLIFY_API_TOKEN` — Bearer token for Coolify API
- `COOLIFY_API_URL` — `https://cloud.comfyspace.tech`

### Key Files
- `Dockerfile` — Multi-stage build
- `.dockerignore` — Excludes `reference/`, `.git/`, `Build/`
- `.github/workflows/deploy.yml` — Build → push → deploy pipeline