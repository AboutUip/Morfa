# Internationalization (i18n) Guidelines

> 中文原文：[i18n.md](i18n.md)
>
> Status: Base implemented (`zh-CN` / `en-US`) · Last updated: 2026-11-25

## Locale strategy

| Language | BCP 47 | Role |
| --- | --- | --- |
| Simplified Chinese | `zh-CN` | Default language, primary authoring language |
| English | `en-US` | Secondary language, full UI coverage |

- The default UI language is `zh-CN`; on first visit the browser language is matched, and `zh-CN` is used as the fallback when nothing matches.
- The locale preference is stored in `localStorage` under `morfa.locale` and synced with user settings after sign-in.
- Missing copy falls back to `zh-CN` and logs a warning in development.
- Adding a language only requires a new resource directory and language metadata; business components do not change.

## Technical approach

**i18next + react-i18next** is used:

- Mature ecosystem with support for namespaces, interpolation, plurals, context, and lazy loading.
- Good React integration; the language can switch at runtime without a refresh.
- `Intl` handles dates, numbers, and relative time.

The current initialization logic lives in `apps/web/src/lib/i18n.ts`; `main.tsx` loads the resources before rendering. Locale detection uses local storage and the browser language, without an additional detection plugin.

## Resource organization

```text
apps/web/src/locales/
├─ zh-CN/
│  └─ common.json       # Currently: navigation, loading, workspace copy
├─ en-US/
│  └─ common.json       # Mirrors zh-CN
```

All UI copy currently lives in `common` (covering loading, projects, and auth). As copy grows, it can be split into namespaces such as `editor` (canvas and property panel), `agent` (conversation and run status), `settings`, and `auth`; a new namespace must be created in both languages at the same time and registered in `src/lib/i18n.ts`.

Rules:

- Directories and files use BCP 47 language tags with consistent casing (`zh-CN`, `en-US`).
- Namespaces and keys must match across languages; CI validates that the key sets are aligned.
- Keys use semantic names; avoid using Chinese or English source text as keys.
- Nesting is no more than three levels deep, grouped by page or component.

Example:

```json
{
  "actions": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除"
  },
  "project": {
    "create": "新建项目",
    "empty": "还没有项目，先创建一个吧",
    "count": "共 {{count}} 个项目"
  }
}
```

## Writing copy

- Write complete sentences; avoid splitting one sentence into concatenated fragments. Word-order differences belong in the translation resources.
- Use double-brace interpolation for variables: `{{name}}`, and keep the placeholders in the resources.
- Use i18next's `count` / `context` capabilities for plurals, gender, and context; Chinese has no plural inflection, but English must handle it correctly.
- Use the `<Trans>` component for rich text; do not write HTML strings in translations.
- Prefer verb-first short copy for buttons and labels; error messages should explain the cause and the next step.
- Do not concatenate punctuation, units, or parentheses in code; put complete sentences in the resources.
- Insert spaces between Chinese and English text according to the product typography guidelines; keep proper nouns consistently capitalized (such as GitHub, SQLite, Agent).

## Formatting

- Dates and times: `Intl.DateTimeFormat(locale, ...)`; storage is always UTC.
- Numbers and percentages: `Intl.NumberFormat`.
- Relative time ("3 minutes ago"): `Intl.RelativeTimeFormat`.
- Currency: `Intl.NumberFormat` + ISO 4217 code; do not hard-code symbols.
- File sizes, keyboard shortcuts, and other displays that vary by region are centralized in `lib/format`.

## Runtime behavior

1. At startup, read the preference (local storage → user settings → browser language → `zh-CN`).
2. Initialize i18next and load the default namespace; other namespaces are lazy-loaded by route or panel.
3. When switching languages, update the i18next language, `<html lang>`, page title, and `dir` (both current languages are LTR).
4. The top bar uses a "globe icon + current language" button; clicking it opens a dropdown menu, and selecting an option switches immediately and persists. Theme and language controls sit in the same action area and behave consistently.

```ts
// Simplified illustration; see apps/web/src/lib/i18n.ts for the full implementation
await i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { common: zhCN },
    "en-US": { common: enUS },
  },
  lng: detectLocale(), // localStorage -> navigator -> zh-CN
  fallbackLng: "zh-CN",
  supportedLngs: ["zh-CN", "en-US"],
  ns: ["common"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
});
```

## Pages and share links

- Signed-in apps such as the editor do not use a language prefix by default; the preference determines the language.
- Whether public share pages need a `/{locale}/share/...` form will be decided after evaluating SEO and the sharing experience.
- When generating a share link, record the creator's language only as a reference for the recipient's default; never force it as an override.

## Test checklist

- The key sets for `zh-CN` and `en-US` are exactly the same, with no missing or extra keys.
- After switching languages, the UI copy, dates, and numbers update without a refresh.
- `<html lang>` and the stored preference are correct.
- Long English copy does not overflow in buttons, tables, or narrow screens.
- Missing keys warn in development and fall back to Chinese in production without crashing.
- Agent output, error messages, and empty states all have corresponding copy.
