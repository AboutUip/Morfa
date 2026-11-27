import { ApiError } from "../../lib/errors.js";
import {
  MAX_CANVAS_PAGES,
  getProjectCanvas,
} from "../../services/canvasDocuments.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../../services/projects.js";
import {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

const PROJECT_ID_SCHEMA = {
  type: "string" as const,
  description: "Morfa project id.",
  minLength: 1,
  maxLength: 120,
};

export function projectCapabilities(): McpCapability[] {
  return [
    {
      name: "list_projects",
      title: {
        "zh-CN": "列出项目",
        "en-US": "List projects",
      },
      description: {
        "zh-CN":
          "列出当前账号可访问的项目，包括自己拥有和已加入的项目，以及项目角色、类型、可见性和更新时间。",
        "en-US":
          "List projects accessible to the current account, including owned and joined projects, with role, type, visibility, and timestamps.",
      },
      usage: {
        "zh-CN":
          "无需参数。只返回当前 API Key 所属账号有权限访问的项目。",
        "en-US":
          "Takes no arguments. Only projects accessible to the API key's account are returned.",
      },
      returns: {
        "zh-CN": "项目数量与项目摘要数组。",
        "en-US": "The project count and an array of project summaries.",
      },
      category: "projects",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      examples: [{ arguments: {} }],
      async execute(context) {
        const projects = listProjects(context.user.id);
        return { count: projects.length, projects };
      },
    },
    {
      name: "get_project",
      title: {
        "zh-CN": "获取项目",
        "en-US": "Get project",
      },
      description: {
        "zh-CN":
          "读取单个项目的摘要信息。只能访问自己拥有或已加入的项目。",
        "en-US":
          "Read a single project summary. Only owned or joined projects are accessible.",
      },
      usage: {
        "zh-CN": "传入 projectId。",
        "en-US": "Pass projectId.",
      },
      returns: {
        "zh-CN":
          "项目摘要，包含 id、名称、介绍、类型、可见性、角色、图标、分享码与时间。",
        "en-US":
          "The project summary with id, name, description, type, visibility, role, icon, share code, and timestamps.",
      },
      category: "projects",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { projectId: "project-uuid" } }],
      async execute(context, args) {
        return {
          project: getProject(context.user.id, args.projectId as string),
        };
      },
    },
    {
      name: "get_project_context",
      title: {
        "zh-CN": "获取项目上下文",
        "en-US": "Get project context",
      },
      description: {
        "zh-CN":
          "读取项目摘要和画布规模。不返回全部节点。看结构用 list_nodes，看指定节点用 get_nodes。",
        "en-US":
          "Read the project summary and canvas size. Nodes are not included. Use list_nodes for structure and get_nodes for specific nodes.",
      },
      usage: {
        "zh-CN": "传入 projectId。",
        "en-US": "Pass projectId.",
      },
      returns: {
        "zh-CN": "project、updatedAt、pageCount、linkCount、remaining。",
        "en-US": "project, updatedAt, pageCount, linkCount, and remaining.",
      },
      category: "projects",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { projectId: "project-uuid" } }],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const project = getProject(context.user.id, projectId);
        const canvas = getProjectCanvas(context.user.id, projectId);

        return {
          project,
          updatedAt: canvas.updatedAt,
          pageCount: canvas.pages.length,
          linkCount: canvas.links.length,
          remaining: Math.max(0, MAX_CANVAS_PAGES - canvas.pages.length),
        };
      },
    },
    {
      name: "create_project",
      title: {
        "zh-CN": "创建项目",
        "en-US": "Create project",
      },
      description: {
        "zh-CN":
          "创建一个新的 Morfa 项目。创建者成为项目所有者，默认包含空画布。",
        "en-US":
          "Create a new Morfa project. The caller becomes the owner and the project starts with an empty canvas.",
      },
      usage: {
        "zh-CN":
          "name 与 description 必填；type 为 software / website；visibility 为 private / shared / public。requestId 可用于幂等创建。",
        "en-US":
          "name and description are required. type is software or website; visibility is private, shared, or public. requestId makes creation idempotent.",
      },
      returns: {
        "zh-CN": "创建后的项目摘要，包括 id、分享码、时间和角色。",
        "en-US":
          "The created project summary including id, share code, timestamps, and role.",
      },
      category: "projects",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Project name.",
            minLength: 1,
            maxLength: 80,
          },
          description: {
            type: "string",
            description: "Project description.",
            minLength: 1,
            maxLength: 500,
          },
          type: {
            type: "string",
            description: "Project type.",
            enum: ["software", "website"],
            default: "software",
          },
          visibility: {
            type: "string",
            description: "Project visibility.",
            enum: ["private", "shared", "public"],
            default: "private",
          },
          requestId: {
            type: "string",
            description:
              "Optional idempotency key. Reusing it returns the existing project.",
            minLength: 8,
            maxLength: 80,
          },
        },
        required: ["name", "description"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            name: "Coffee Shop",
            description: "Ordering app prototype",
            type: "software",
            visibility: "private",
          },
        },
      ],
      async execute(context, args) {
        const project = await createProject(context.user, {
          name: String(args.name ?? ""),
          description: String(args.description ?? ""),
          type:
            typeof args.type === "string" ? args.type : "software",
          visibility:
            typeof args.visibility === "string"
              ? args.visibility
              : "private",
          requestId:
            typeof args.requestId === "string" ? args.requestId : null,
        });
        return { project };
      },
    },
    {
      name: "update_project",
      title: {
        "zh-CN": "更新项目",
        "en-US": "Update project",
      },
      description: {
        "zh-CN":
          "更新项目名称、介绍、类型或可见性。只有项目所有者可以修改。",
        "en-US":
          "Update a project's name, description, type, or visibility. Only the owner can modify it.",
      },
      usage: {
        "zh-CN":
          "只传入需要修改的字段。修改可见性时服务端会自动生成或清除分享码。expectedUpdatedAt 可选，不一致返回 409。",
        "en-US":
          "Only pass fields that change. Changing visibility generates or clears the share code automatically. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN": "更新后的项目摘要。",
        "en-US": "The updated project summary.",
      },
      category: "projects",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          name: {
            type: "string",
            description: "New project name.",
            minLength: 1,
            maxLength: 80,
          },
          description: {
            type: "string",
            description: "New project description.",
            minLength: 1,
            maxLength: 500,
          },
          type: {
            type: "string",
            description: "New project type.",
            enum: ["software", "website"],
          },
          visibility: {
            type: "string",
            description: "New project visibility.",
            enum: ["private", "shared", "public"],
          },
          expectedUpdatedAt: {
            type: "number",
            description:
              "Optional optimistic concurrency check. Mismatch returns 409.",
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            name: "Coffee Shop v2",
            visibility: "shared",
          },
        },
      ],
      async execute(context, args) {
        const projectId = String(args.projectId ?? "");
        const current = getProject(context.user.id, projectId);
        if (
          typeof args.expectedUpdatedAt === "number" &&
          current.updatedAt !== args.expectedUpdatedAt
        ) {
          throw new ApiError(
            409,
            "PROJECT_REVISION_CONFLICT",
            `项目已更新（当前 updatedAt=${current.updatedAt}），请重新读取后再修改`,
          );
        }
        if (
          args.name === undefined &&
          args.description === undefined &&
          args.type === undefined &&
          args.visibility === undefined
        ) {
          throw new ApiError(
            400,
            "PROJECT_PATCH_EMPTY",
            "没有需要更新的字段",
          );
        }
        const project = updateProject(context.user.id, projectId, {
          ...(typeof args.name === "string" ? { name: args.name } : {}),
          ...(typeof args.description === "string"
            ? { description: args.description }
            : {}),
          ...(typeof args.type === "string" ? { type: args.type } : {}),
          ...(typeof args.visibility === "string"
            ? { visibility: args.visibility }
            : {}),
        });
        return { project };
      },
    },
    {
      name: "delete_project",
      title: {
        "zh-CN": "删除项目",
        "en-US": "Delete project",
      },
      description: {
        "zh-CN":
          "永久删除一个项目及其画布数据。只有项目所有者可以删除，操作不可撤销。",
        "en-US":
          "Permanently delete a project and its canvas data. Only the owner can delete it; this cannot be undone.",
      },
      usage: {
        "zh-CN":
          "传入 projectId。删除后画布无法从这里恢复。",
        "en-US":
          "Pass projectId. The canvas cannot be restored from this tool after deletion.",
      },
      returns: {
        "zh-CN": "被删除的项目 id 与 deleted=true。",
        "en-US": "The deleted project id and deleted=true.",
      },
      category: "projects",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { projectId: "project-uuid" } }],
      async execute(context, args) {
        return deleteProject(
          context.user.id,
          String(args.projectId ?? ""),
        );
      },
    },
  ];
}
