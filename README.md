# SPAK Figma Toolkit
<img width="929" height="634" alt="image" src="https://github.com/user-attachments/assets/93a8e65c-5013-4687-8488-23973c8b4626" />


A Figma plugin with tools for bulk operations: icon importing and mass constraint editing.

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

## Utils

### Mass Constraints Edit

Bulk edit constraints (X and Y) on the deepest-level children of selected elements.

---

### TODO
- [x] Basic import
- [x] Component groups & auto layout for same icons
- [x] Bad/Corrupted/Missed icons highlighting
- [x] Logging & Progressbar
- [x] Small delay for prevent rate limit error
- [x] Prioritization of themes and colors
- [ ] Read & update already existing icons
- [ ] Full filename customization
