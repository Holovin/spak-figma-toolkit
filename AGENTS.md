# AGENTS

## Project overview

This repository contains a plain Figma plugin with no build step.

- `manifest.json` is the plugin entry manifest.
- `code.js` contains the Figma-side logic.
- `ui.html` contains the UI, styling, and browser-side orchestration.
- `docs/` contains per-tab behavior notes.

## Main tabs

- `Icon Importer`: bulk-import PNG icons into component sets.
- `Constraints`: bulk-edit constraints on deepest descendants of the selection.
- `Icons`: bulk-edit `theme` and `state` on matched icon instances using `Include` / `Exclude` filters.

## Editing guidance

- Keep the plugin build-free. Do not introduce package tooling unless explicitly requested.
- Prefer small, direct changes in `code.js` and `ui.html`.
- Keep the shared bottom console visible across tabs.
- Log important preview, apply, cancel, error, and completion events through the existing log pattern.
- Reuse the existing preview/apply/cancel interaction style for new utilities.
- When editing the `Icons` tab, preserve the current flow:
- auto-scan on selection and filter changes
- `Include` first, then comma-separated `Exclude`
- `(partial)` for non-common values
- `(current)` for a single common current value
- scan logs use `Available themes/states` and `Selected themes/states`
- names shown in grouped logs should omit the matched `Include` prefix

## Verification

Useful local checks:

```bash
node --check code.js
node -e "const fs=require('fs'); const html=fs.readFileSync('ui.html','utf8'); const match=html.match(/<script>([\s\S]*)<\/script>/); if(!match) throw new Error('script not found'); new Function(match[1]);"
```

## Figma assumptions

- The plugin is loaded through `Plugins -> Development -> Import plugin from manifest`.
- Variant-based icon updates target editable `INSTANCE` nodes, not detached nodes or component definitions.
- Variant property names may differ by case, so matching should remain case-insensitive for `theme` and `state`.
