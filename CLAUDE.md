# CLAUDE.md — jacobconlanshields.com

## Agent Configuration

Read the jcs-agent-dna files in this order before starting work:

1. .jcs-agent-dna/constitutional/IDENTITY.md
2. .jcs-agent-dna/constitutional/VOICE.md
3. .jcs-agent-dna/strategic/SOUL.md
4. .jcs-agent-dna/tactical/MEMORY.md
5. .jcs-agent-dna/strategic/GOALS.md
6. .jcs-agent-dna/strategic/AGENTS.md
7. .jcs-agent-dna/strategic/USER.md
8. .jcs-agent-dna/tactical/PROJECTS.md
9. .jcs-agent-dna/tactical/CONTEXT.md
10. .jcs-agent-dna/tactical/CANON.md

If the submodule is missing, clone it:
```bash
git submodule add https://github.com/JacobConlanShields/jcs-agent-dna.git .jcs-agent-dna
```

Then read Agents.MD in this repo for project-specific context.

## Project Summary

Static personal portfolio on Cloudflare Pages. No build step. No
frameworks. Plain HTML/CSS/JS. Style guide: JCS v1.4 (Playfair
Display, EB Garamond, DM Sans, DM Mono, #FFBCD9 pink accent).

Cloudflare Pages Functions handle APIs. D1 for metadata. R2 for
media storage. Cloudflare Access protects admin routes.

## Key Constraints

- Never introduce a build step or framework dependency
- Never break existing navigation or page rendering
- Keep README.md and Agents.MD accurate after changes
- Admin routes are protected by Cloudflare Access, not tokens
- HEIC uploads convert to JPEG client-side before upload
- R2 presigned URLs target r2.cloudflarestorage.com, never r2.dev
