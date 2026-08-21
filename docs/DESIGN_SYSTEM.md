# Zephyr CRM Design System

Phase 2 establishes the reusable visual and layout foundation for later feature work.

## Source of truth

- Semantic tokens live in `src/lib/styles/tokens.css`.
- Shared primitive styles live in `src/lib/components/ui/ui.css`.
- Application-shell styles live in `src/lib/components/shell/shell.css`.
- Branding configuration is represented by `src/lib/config/brand.ts` and the `data-brand` token override.
- The lightweight visual check route is `/system`.

## Primitive inventory

The component lab renders Button, IconButton, Input, Textarea, Select, Checkbox, Badge, Card, StatCard, DataTable, FilterBar, Modal, Drawer, PageHeader, SectionHeader, EmptyState, LoadingState, and ErrorState. Each primitive keeps business data and API calls outside the component layer.

## Token contract

Components consume semantic typography, spacing, radius, surface, border, text, brand, status, overlay, shadow, and pipeline variables. Literal brand colours are confined to the token file. `bun run tokens:check` verifies required semantic variables and rejects literal colours or business API references in the design-system scope.

## Shell contract

`AppShell` composes `Sidebar` and `Topbar`, exposes primary navigation, supports the mobile navigation control, keeps the main content frame fluid, and respects reduced-motion preferences. The sidebar includes future feature destinations as navigation placeholders only; feature screens are deliberately deferred to later phases.

## Validation evidence

P2 browser coverage verifies default/disabled/error/loading states, dialog primitives, keyboard/mobile navigation, mobile overflow, form labels, and runtime brand swapping. The P2 closure gate also requires the prior project quality commands, token compliance, Cloudflare build, public-bundle secret scan, isolated Supabase lifecycle, and `git diff --check`.
