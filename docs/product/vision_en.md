# Product Vision

> 中文原文：[vision.md](vision.md)
>
> Status: Draft · Last updated: 2026-11-25

## One-sentence positioning

Morfa is an AI-powered online UI design platform: users express intent in natural language, the Agent performs operations on a structured design document, and the result is an interface design that can be edited directly, exported, and accessed across platforms.

## Background and problem

Existing design tools still have clear gaps in three areas:

1. **AI is bolted on rather than foundational**: most products turn generation into a side button; generated output is hard to modify precisely, and there is no way to track what the Agent did.
2. **Fragmented cross-platform experience**: desktop, browser, and tablet each go their own way; files and collaboration state fall out of sync; touch interaction is often ignored.
3. **Theming and i18n are patches**: dark mode and language switching are usually added late, leaving styles scattered, copy hardcoded, and formatting inconsistent.

Morfa intends to make the Agent, cross-platform support, theming, and i18n first-class capabilities from day one, rather than features added afterward.

## Target users

| User | Typical needs |
| --- | --- |
| Product designer | Explore multiple options quickly, hand repetitive work to the Agent while retaining fine-grained control |
| Indie developer / small team | Complete interface design and delivery in one tool, reducing the design-to-code gap |
| Product manager / founder | Turn ideas into discussable, demoable interfaces quickly with natural language |
| Design system maintainer | Make the Agent follow token and component guidelines, and audit and fix interfaces in bulk |

## Core value

1. **Agent-driven, human-controlled**: the Agent can plan and execute multi-step design operations; every change is presented as a reviewable patch that supports apply, rollback, and replay.
2. **Structured design document**: a design is versionable data (node tree + styles + tokens), not unparseable canvas pixels, so it can be queried, diffed, and exported.
3. **Consistent across platforms**: browser-first, covering desktop, tablet, and touch; project data syncs to the cloud, with a desktop client to follow.
4. **Native theming and i18n**: dark / light themes follow the system and can be overridden manually; Simplified Chinese is the default, English is built in, and formatting and copy are managed centrally.
5. **Open and portable**: design data can be exported to avoid lock-in; deployment stays as lightweight as possible, and SQLite makes self-hosted deployment a viable option.

## Product principles

- **The Agent is a collaborator, not a black box**: every tool call is recorded, and important operations require confirmation by default.
- **Design is data**: every UI element should be structurally describable, validatable, and convertible.
- **Usable by default**: basic design is possible without AI; AI is an enhancement, not a single point of dependency.
- **Progressive enhancement**: start with the web and expand to PWA, desktop, and mobile as needed, instead of doing everything at once.
- **Accessibility built in**: color contrast, keyboard operation, semantic structure, and copy length are considered from the design stage.
- **A local-first view of privacy**: user projects are private by default; use for model training must be an explicit choice.

## Non-goals (first release)

- No general image editing, video editing, or 3D modeling.
- No goal of 100% compatibility with Figma / Sketch file formats.
- No foundation model of our own; model capabilities come through replaceable providers.
- No complex enterprise permission matrix or approval flows (introduced later as needed).
- No commitment to realtime multiplayer collaborative editing in the first release.

## Success metrics

- **Activation**: median time for a new user to complete their first previewable design.
- **Agent quality**: first-pass rate of Agent tasks, user undo rate, average number of tool-call rounds.
- **Retention**: 7-day / 30-day return visits and project reuse rate.
- **Delivery**: usage of export, share, and preview links.
- **Experience**: first-screen load, canvas interaction frame rate, and the success rate of theme switching and language switching.
- **Accessibility**: keyboard reachability of core flows and WCAG AA contrast coverage.

## Open questions

- The technical approach for the first-release canvas: DOM / SVG / Canvas / WebGL — how to balance editor capability with Agent operability?
- Schema versioning and migration strategy for the design document.
- When to introduce realtime collaboration, and the trade-offs of CRDT approaches.
- Free quota, model cost, and billing model.
- Priority of the desktop client (Tauri or another approach).
