# ADR 0005: Account Authentication and Avatar Storage

> 中文原文：[0005-auth-and-avatar.md](0005-auth-and-avatar.md)

- Status: Accepted
- Date: 2026-11-25
- Decision makers: Project maintainers

## Context

The project page needs a minimal viable account system:

- Support registration and login, with automatic login after registration;
- Registration requires an avatar, nickname, login account, password, and password confirmation;
- The login account is unique within the platform;
- Avatars store only the relative file path; binary data is not written to the database;
- SQLite is currently used, with possible migration to PostgreSQL or object storage later.

## Decision

1. **Backend and database**: Fastify 5 + Node.js built-in `node:sqlite` (WAL); SQL migrations run at service startup.
2. **Login account**: Lowercased before being written to `login_account`; deduplicated at the database level with `COLLATE NOCASE UNIQUE`, and pre-checked before registration.
3. **Password**: `crypto.scrypt` + 16-byte random salt, stored as `scrypt$salt$hash`; comparison uses `timingSafeEqual`.
4. **Session**: A 32-byte random token written to an `HttpOnly; SameSite=Lax` cookie; the database stores only its SHA-256 hash; valid for 30 days.
5. **Avatar**: Upload via `multipart/form-data`, limited to PNG / JPG / WebP and 2 MB, with file signature validation; files are written to `data/uploads/avatars/`, and the database stores only `uploads/avatars/<uuid>.<ext>`.
6. **Automatic login after registration**: The registration transaction creates the user and session together, writes the cookie in the response, and the frontend updates its login state directly.
7. **Modal interaction**: Login and registration use a modal; clicking the backdrop does not close it, and only the close button in the top-right corner exits, preventing accidental dismissal.

## Rationale

- No external identity service, keeping local development and self-hosting simple.
- scrypt is a Node built-in capability, avoiding compilation and deployment issues from native password libraries.
- The database stores token hashes, so a database leak cannot directly reuse sessions.
- Account uniqueness is enforced by a database constraint, avoiding races that arise from application-level checks alone.
- Avatar paths are stored in the database while files live on disk, making a future switch to S3-compatible storage easier.

## Consequences

Positive:

- The authentication loop runs independently, without third-party services.
- Password, session, and upload each have explicit boundaries and validation.
- Avatars do not consume database space and are read through a controlled route.

Negative / limitations:

- `node:sqlite` and local file storage are suitable only for single-node deployments; multi-node deployment requires migrating the database and object storage.
- There is currently no email verification, password recovery, login rate limiting, avatar replacement, or account settings.
- Session cookies depend on same-origin deployment; cross-origin deployment requires redesign.

## Alternatives

| Option | Reason not adopted |
| --- | --- |
| JWT stateless sessions | Revocation, logout, and multi-device management are more complex; single-node SQLite is sufficient for now |
| better-sqlite3 + Drizzle | Requires native modules; use Node built-ins at startup to reduce dependencies |
| Store avatars as database BLOBs | Conflicts with the requirement to store only relative paths in the database; increases database size and backup cost |
| Third-party login (OAuth) | Not needed for the first version; adds external dependencies and configuration |
| Manual login after registration | The requirement explicitly calls for automatic login after registration |

## Follow-up actions

- Add login failure rate limiting, password reset, and email / account verification policies.
- Clean up old files when an avatar is replaced.
- Migrate to PostgreSQL and object storage before multi-node deployment.
- Add integration and end-to-end tests for the authentication API.
