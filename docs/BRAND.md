# CampusOS brand

| Piece | Where |
|---|---|
| Logo component | `src/components/brand/CampusLogo.tsx`: `CampusLogo` (variants `full`, `horizontal`, `icon`, `wordmark`; theme `auto`, `light`, `dark`; sizes `sm` to `xl`), plus `CampusMark` and `CampusWordmark` |
| Mark artwork | `src/components/brand/mark.ts`: pixel grids, with `full` at 32×24 and `small` at 16×15 (used below 26px) |
| Tokens | `--logo-word`, `--logo-outline`, `--logo-o`, `--logo-s`, `--logo-accent` in `src/app/globals.css` |
| Favicon | `src/app/icon.svg` (the small mark) |
| Apple touch icon | `src/app/apple-icon.png` |
| PWA icons | `public/branding/*` |

**Palette:**

- indigo `#1E1B4B`
- lavender `#A78BFA` (the "O")
- green `#22C55E` (the "S")
- blue `#60A5FA`
- yellow `#FBBF24`
- coral `#FB7185`
- cream `#FDF7E9`
- dark `#0F172A`

**Rules:**

- The wordmark is always live text in the display font.
- The tagline "Your Campus. All in One." appears only in large areas, such as sign-in.
- Use the mark alone at 24px and below.

**Regenerating assets** after editing `mark.ts`:

```bash
npm run brand:assets                  # SVGs (tests/brand.test.ts checks they match)
node scripts/brand/rasterise-icons.mjs # PNG app icons (needs Playwright's Chromium)
```
