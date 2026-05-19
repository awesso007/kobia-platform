# KOBIA Locks Referenced in This Codebase

The KOBIA master roadmap (v5.2.3, 226 decisions across 83 named Locks) lives at:
`/home/user/workspace/KOBIA_AI_Master_Strategy_Roadmap.md`
And on Google Drive (auto-backed up weekly).

This file maps the codebase back to the locks it implements.

## Locks implemented in Cycle 1 scaffold

### Lock EEEE — Per-tenant login URLs + tier-gated KOBIA branding
- Implemented in: `src/middleware.ts` (subdomain routing)
- `src/lib/tenant.ts` (`shouldShowKobiaBrand`)
- `src/components/branding/PoweredByKobia.tsx`
- `src/app/[tenant]/login/page.tsx` (tenant-branded login)
- DB: `Tenant.hideKobiaBrand`, `Tenant.customDomain`

### Lock HHH — Anti-intimidation UI Philosophy (role-aware home)
- Implemented in: `prisma/schema.prisma` (`Role` enum + `Membership.role`)
- `src/lib/auth.ts` (`hasRole` helper)
- Will expand in Cycle 2 (role-aware sidebar visibility)

## Locks coming in later cycles

| Lock | Description | Cycle |
|---|---|---|
| Lock GGG | Tenant Feature Request Hub | Cycle 5 |
| Lock FFFF | AI Video Studio (Tier 2/3) | Cycle 5 lite, Year 2 full |
| Lock A-DDDD | All other locks | Various — see master roadmap |

## Decision protocol

Per Section 54 of the master roadmap: every new feature added must be checked
against the 226 existing decisions to prevent duplicates. The agent is committed
to flagging duplicates before any new lock is added.
