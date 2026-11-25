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
