import { getProjectCanvas } from "../../services/canvasDocuments.js";
import { collectSubtreeIds } from "../../services/canvasFrames.js";
import { lintCanvas } from "../../services/canvasLint.js";
import { getProject } from "../../services/projects.js";
import {
  PAGE_ID_SCHEMA,
  PROJECT_ID_SCHEMA,
  findPage,
  readPageIdArgument,
} from "./canvasSupport.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  type McpCapability,
} from "../types.js";

export function lintCapabilities(): McpCapability[] {
  return [
    {
      name: "get_lint",
      title: {
        "zh-CN": "检查画布问题",
        "en-US": "Lint canvas",
      },
      description: {
        "zh-CN":
          "检查布局、父级、关联线与行为图，返回带 severity/code/pageId/message 的问题列表与汇总计数。",
        "en-US":
          "Validate layout, hierarchy, links, and behavior graphs and return issues with severity/code/pageId/message plus summary counts.",
      },
      usage: {
        "zh-CN":
          "传入 projectId；可选 pageId 只返回该页面及其子树的问题。跨页面变量冲突会保留为项目级警告。",
        "en-US":
          "Pass projectId. Optionally pass pageId to scope issues to that page and its subtree. Cross-page variable conflicts remain project-level warnings.",
      },
      returns: {
        "zh-CN":
          "items、summary（errors/warnings/total/byCode）与 updatedAt。",
        "en-US":
          "items, summary (errors/warnings/total/byCode), and updatedAt.",
      },
      category: "lint",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid" } },
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const document = getProjectCanvas(
          context.user.id,
          projectId,
        );

        let pageId: string | undefined;
        let scope: Set<string> | undefined;
        if (args.pageId !== undefined) {
          pageId = readPageIdArgument(args.pageId, "pageId");
          findPage(document, pageId);
          scope = collectSubtreeIds(document.pages, pageId);
        }

        const result = lintCanvas(document, {
          ...(scope ? { pageIds: scope } : {}),
        });

        return {
          projectId,
          ...(pageId ? { pageId } : {}),
          updatedAt: document.updatedAt,
          items: result.items,
          summary: result.summary,
        };
      },
    },
    {
      name: "validate_project",
      title: {
        "zh-CN": "校验项目",
        "en-US": "Validate project",
      },
      description: {
        "zh-CN":
          "校验项目元数据与完整画布文档，返回是否通过以及全部错误、警告和数量统计。",
        "en-US":
          "Validate project metadata and the complete canvas document, returning whether it passes along with all errors, warnings, and counts.",
      },
      usage: {
        "zh-CN":
          "传入 projectId。只能校验当前账号拥有或已加入的项目；项目不存在或无权限时返回 404。",
        "en-US":
          "Pass projectId. Only owned or joined projects can be validated; a missing or inaccessible project returns 404.",
      },
      returns: {
        "zh-CN":
          "ok、project 摘要、errors、warnings、counts（页数、关联线数与问题计数）与 updatedAt。",
        "en-US":
          "ok, project summary, errors, warnings, counts (pages, links, issue counts), and updatedAt.",
      },
      category: "lint",
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
        const document = getProjectCanvas(
          context.user.id,
          projectId,
        );
        const result = lintCanvas(document);

        return {
          projectId,
          updatedAt: document.updatedAt,
          ok: result.errors.length === 0,
          project,
          errors: result.errors,
          warnings: result.warnings,
          counts: {
            pages: document.pages.length,
            links: document.links.length,
            errors: result.summary.errors,
            warnings: result.summary.warnings,
            total: result.summary.total,
          },
          summary: result.summary,
        };
      },
    },
  ];
}
