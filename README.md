# SPAK Figma Toolkit
<img width="473" height="619" alt="image" src="https://github.com/user-attachments/assets/18342881-f224-4e1b-962a-6c95c7ce7525" />
<img width="929" height="634" alt="image" src="https://github.com/user-attachments/assets/93a8e65c-5013-4687-8488-23973c8b4626" />


A Figma plugin with tools for bulk operations: icon importing, mass constraint editing, and bulk icon variant updates.

### INSTALLATION
1. Download the project as a ZIP archive and extract it to a folder on your computer.
2. In the desktop version of Figma: Plugins → Development → Import plugin from manifest
3. Run the plugin from the Plugins menu.

---

## Icon Importer

Bulk import `.png` icons into Figma as components with properties (theme & state).

### How it works
The plugin expects a folder with icons named according to this format:

```
[category][sep][name][sep][theme][sep][state].png
```

Example with `___` as separator:

```
ico___contacts___dark___black.png
ico___contacts___dark___blue.png
ico___contacts___light___default.png
emoji___1F471-1F3FC-200D-2642-FE0F___default___36.png
...
```

### Options

**Parse emoji names**: convert `1F600` or `1F471-1F3FC-200D-2642-FE0F` to the corresponding emoji

**Detect on/off variants**: icons whose name ends with `_off` are automatically paired with their base (on) version and combined into a single component with `state=on` / `state=off` variants using the `light` theme only.

### Component structure

Each icon group becomes a Figma Component Set with variants arranged in a grid:

- **Columns** — themes (`light`, `dark`, `dark1`, `dark2`, …)
- **Rows** — states (`on`, `off`, `default`, `blue`, `darkblue`, …)

Icons that already exist on the page are skipped. Missing or corrupted files are replaced with a `#F700FF` placeholder. Component Sets are outlined in purple (normal) or yellow (has issues).

---

## Constraints

### Mass Constraints Edit

Bulk edit constraints (X and Y) on the deepest-level children of selected elements.

---

## Icons

### Mass Icon Props Edit

Bulk edit icon variant properties (`theme` and `state`) on nested icon instances inside the current selection.

### How it works

- The plugin scans the current selection and all descendants.
- Only instances whose source component name starts with the `Include` prefix are considered.
- Instances whose source component name starts with any `Exclude` prefix are skipped.
- `Exclude` accepts multiple comma-separated prefixes.

Default filters:

```text
Include: Icon /
Exclude: Icon / Head /, Icon / Emoji
```

