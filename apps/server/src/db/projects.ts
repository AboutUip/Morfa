import { randomUUID } from "node:crypto";

import { db } from "./connection.js";

export interface ProjectRow {
  id: string;
  name: string;
  data: string;
  created_at: number;
  updated_at: number;
}

export interface ImportedProject {
  name: string;
  data: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectType = "software" | "website";
export type ProjectVisibility = "public" | "private" | "shared";

export interface ProjectCardRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  project_type: ProjectType;
  visibility: ProjectVisibility;
  icon_path: string | null;
  share_code: string | null;
  owner_nickname: string;
  member_role: string | null;
  created_at: number;
  updated_at: number;
}

export function listProjectsForUser(userId: string): ProjectRow[] {
  return db
    .prepare(
      `SELECT id, name, data, created_at, updated_at
       FROM projects WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .all(userId) as unknown as ProjectRow[];
}

export function insertProjectsForUser(
  userId: string,
  projects: ImportedProject[],
) {
  const statement = db.prepare(
    `INSERT INTO projects (id, user_id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const project of projects) {
    statement.run(
      randomUUID(),
      userId,
      project.name,
      project.data,
      project.createdAt,
      project.updatedAt,
    );
  }
}

const PROJECT_CARD_SELECT = `
  SELECT p.id, p.user_id, p.name, p.description, p.project_type,
         p.visibility, p.icon_path, p.share_code,
         p.created_at, p.updated_at,
         u.nickname AS owner_nickname, pm.role AS member_role
  FROM projects p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN project_members pm
    ON pm.project_id = p.id AND pm.user_id = ?
`;

export function listProjectCardsForUser(
  userId: string,
): ProjectCardRow[] {
  return db
    .prepare(
      `${PROJECT_CARD_SELECT}
       WHERE p.user_id = ? OR pm.user_id = ?
       ORDER BY p.updated_at DESC, p.created_at DESC`,
    )
    .all(userId, userId, userId) as unknown as ProjectCardRow[];
}

export function findProjectCardForUser(
  userId: string,
  projectId: string,
): ProjectCardRow | undefined {
  return db
    .prepare(
      `${PROJECT_CARD_SELECT}
       WHERE p.id = ? AND (p.user_id = ? OR pm.user_id = ?)
       LIMIT 1`,
    )
    .get(userId, projectId, userId, userId) as unknown as
    | ProjectCardRow
    | undefined;
}

export function findProjectCardByShareCode(
  userId: string,
  shareCode: string,
): ProjectCardRow | undefined {
  return db
    .prepare(
      `${PROJECT_CARD_SELECT}
       WHERE p.share_code = ?
         AND p.visibility IN ('public', 'shared')
         AND p.user_id <> ?
       LIMIT 1`,
    )
    .get(userId, shareCode, userId) as unknown as
    | ProjectCardRow
    | undefined;
}

export function findPublicProjectCard(
  userId: string,
  projectId: string,
): ProjectCardRow | undefined {
  return db
    .prepare(
      `${PROJECT_CARD_SELECT}
       WHERE p.id = ? AND p.visibility = 'public'
       LIMIT 1`,
    )
    .get(userId, projectId) as unknown as
    | ProjectCardRow
    | undefined;
}

export function findProjectCardByRequestId(
  userId: string,
  requestId: string,
): ProjectCardRow | undefined {
  return db
    .prepare(
      `${PROJECT_CARD_SELECT}
       WHERE p.user_id = ? AND p.client_request_id = ?
       LIMIT 1`,
    )
    .get(userId, userId, requestId) as unknown as
    | ProjectCardRow
    | undefined;
}

export function countOwnedProjects(userId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM projects WHERE user_id = ?",
    )
    .get(userId) as { count: number };
  return row.count;
}

export function insertProjectRecord(input: {
  id: string;
  userId: string;
  name: string;
  description: string;
  projectType: ProjectType;
  visibility: ProjectVisibility;
  iconPath: string | null;
  shareCode: string | null;
  clientRequestId: string | null;
  data: string;
  now: number;
}) {
  db.prepare(
    `INSERT INTO projects
      (id, user_id, name, data, project_type, description, visibility,
       icon_path, share_code, client_request_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.name,
    input.data,
    input.projectType,
    input.description,
    input.visibility,
    input.iconPath,
    input.shareCode,
    input.clientRequestId,
    input.now,
    input.now,
  );
}

export function addProjectMember(
  projectId: string,
  userId: string,
  now: number,
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO project_members
        (project_id, user_id, role, joined_at)
       VALUES (?, ?, 'member', ?)`,
    )
    .run(projectId, userId, now);
  return Number(result.changes) === 1;
}
