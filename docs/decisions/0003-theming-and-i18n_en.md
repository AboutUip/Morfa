# ADR 0003: Theming and Internationalization as First-Class Capabilities

> 中文原文：[0003-theming-and-i18n.md](0003-theming-and-i18n.md)

- Status: Accepted
- Date: 2026-11-25
- Decision makers: Project maintainers

## Context

Many products add dark mode and additional languages late, which leads to:

- Colors scattered across components, with dark mode implemented by overriding styles, resulting in high maintenance cost;
- Hard-coded copy that requires global search-and-replace during translation;
- Inconsistent date and number formats, with Chinese punctuation appearing in English interfaces;
- Theme-switch flicker, and language switches that require a refresh.

Morfa targets cross-platform users, so themes and languages must be settled during the architecture and design phase.

## Decision

1. **Theming**
   - Support three modes, `system / light / dark`, defaulting to `system`.
   - Provide all colors, spacing, typography, and similar values through design tokens and CSS Variables; components must not hard-code colors.
   - Inline an initialization script in `<head>` so the first paint does not flicker.
   - Decouple the application UI theme from the theme of user design content.

2. **Internationalization**
   - Default to `zh-CN` with built-in `en-US`; organize resources by namespace.
   - All user-visible copy must come from the i18n layer; hard-coding in components is forbidden.
   - Use `Intl` for dates, numbers, currencies, and relative time.
   - Persist language and theme preferences and keep `<html lang>` and `data-theme` in sync.

3. **Engineering constraints**
   - New UI copy must include both Chinese and English resources in the same change.
   - New semantic color tokens must provide values for both themes.
   - CI validates language key-set consistency and missing keys.
   - Theme and i18n switching are covered by E2E smoke tests.

## Rationale

- Theming and language are cross-cutting concerns; retrofitting costs far more than designing them up front.
- Tokenization and resource extraction let visual adjustments and translations proceed independently of business code.
- Establishing constraints early prevents code review from repeatedly correcting hard-coded values.

## Consequences

Positive:

- Both themes and both languages can be verified from the first runnable version.
- Visual and copy changes are managed centrally, reducing regressions.
- Lays the groundwork for adding languages or brand themes later.

Negative / limitations:

- Token and resource files must be maintained from the start, and even short copy must go through i18n.
- Translation-key alignment and screenshot reviews add a small process cost.
- Edge cases such as first load, persistence, and system preference changes must be handled.

## Alternatives

| Option | Reason not adopted |
| --- | --- |
| CSS media queries only, with no manual switch | Does not meet the need for explicit user control and complicates screenshots and testing |
| Per-component dark styles | Scattered and easy to miss; consistency cannot be guaranteed |
| Write copy in Chinese first and extract it later | Pollutes components and makes later replacement costly |
| Third-party theme / i18n platform | Unnecessary early on; adds external dependencies and data-leak risk |

## Follow-up actions

- Implement the theme provider, token files, and initialization script in M1.
- Integrate i18n in M1, creating `zh-CN` / `en-US` resources and a key-validation script.
- Add theme and language switching to Playwright smoke cases.
