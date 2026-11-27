import {
  deleteAccountComponent,
  importAccountComponent,
  listAccountComponents,
  publishAccountComponent,
} from "../../services/accountComponents.js";
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

const COMPONENT_ID_SCHEMA = {
  type: "string" as const,
  description: "Account component id.",
  minLength: 1,
  maxLength: 120,
};

const CONTROL_ID_SCHEMA = {
  type: "string" as const,
  description: "Project control id.",
  minLength: 1,
  maxLength: 120,
};

export function accountComponentCapabilities(): McpCapability[] {
  return [
    {
      name: "list_account_components",
      title: {
        "zh-CN": "列出账号组件库",
        "en-US": "List account components",
      },
      description: {
        "zh-CN":
          "列出当前账号保存的跨项目控件组件，包括名称、状态数、节点数与来源项目。",
        "en-US":
          "List reusable account-level control components with name, state/node counts, and source project.",
      },
      usage: {
        "zh-CN": "无需参数，返回当前账号全部组件。",
        "en-US": "No arguments; returns every component in the account.",
      },
      returns: {
        "zh-CN": "组件摘要数组与数量。",
        "en-US": "Component summaries and count.",
      },
      category: "components",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      examples: [{ arguments: {} }],
      async execute(context) {
        const components = listAccountComponents(context.user.id);
        return { components, count: components.length };
      },
    },
    {
      name: "publish_account_component",
      title: {
        "zh-CN": "保存控件到账号组件库",
        "en-US": "Publish account component",
      },
      description: {
        "zh-CN":
          "把一个已编译控件及其全部状态、子节点和嵌套控件依赖保存到账号组件库；同一来源再次保存会更新原组件。",
        "en-US":
          "Publish a compiled control with all states, nodes, and nested control dependencies to the account library. Republishing the same source updates it.",
      },
      usage: {
        "zh-CN":
          "传入 projectId 与 controlId；name/description 可覆盖组件显示信息。",
        "en-US":
          "Pass projectId and controlId; optional name/description override display metadata.",
      },
      returns: {
        "zh-CN": "组件摘要与是否更新已有组件。",
        "en-US": "The component summary and whether an existing entry was updated.",
      },
      category: "components",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          name: {
            type: "string",
            description: "Optional library name.",
            maxLength: 160,
          },
          description: {
            type: "string",
            description: "Optional library description.",
            maxLength: 500,
          },
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            name: "More actions",
          },
        },
      ],
      async execute(context, args) {
        return publishAccountComponent({
          userId: context.user.id,
          projectId: String(args.projectId ?? ""),
          controlId: String(args.controlId ?? ""),
          name:
            typeof args.name === "string" ? args.name : undefined,
          description:
            typeof args.description === "string"
              ? args.description
              : undefined,
        });
      },
    },
    {
      name: "import_account_component",
      title: {
        "zh-CN": "导入账号组件",
        "en-US": "Import account component",
      },
      description: {
        "zh-CN":
          "把账号组件库中的控件导入项目，自动重建 ID、依赖关系与编译签名，并保持已编译可直接使用。",
        "en-US":
          "Import an account component into a project, rebuilding ids, dependencies, and compiled signatures so it is ready to use.",
      },
      usage: {
        "zh-CN":
          "传入 componentId 与目标 projectId。返回新控件 id 与导入的控件/节点数量。",
        "en-US":
          "Pass componentId and target projectId. Returns the new control id and imported control/node counts.",
      },
      returns: {
        "zh-CN": "组件摘要、新控件 id、全部导入控件 id 与数量。",
        "en-US":
          "Component summary, new root control id, all imported control ids, and counts.",
      },
      category: "components",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          componentId: COMPONENT_ID_SCHEMA,
        },
        required: ["projectId", "componentId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            componentId: "component-uuid",
          },
        },
      ],
      async execute(context, args) {
        return importAccountComponent({
          userId: context.user.id,
          projectId: String(args.projectId ?? ""),
          componentId: String(args.componentId ?? ""),
        });
      },
    },
    {
      name: "delete_account_component",
      title: {
        "zh-CN": "删除账号组件",
        "en-US": "Delete account component",
      },
      description: {
        "zh-CN": "从账号组件库删除一个组件；已导入项目中的控件不受影响。",
        "en-US":
          "Delete a component from the account library; controls already imported into projects are unaffected.",
      },
      usage: {
        "zh-CN": "传入 componentId。",
        "en-US": "Pass componentId.",
      },
      returns: {
        "zh-CN": "删除结果。",
        "en-US": "Deletion result.",
      },
      category: "components",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          componentId: COMPONENT_ID_SCHEMA,
        },
        required: ["componentId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { componentId: "component-uuid" } },
      ],
      async execute(context, args) {
        return deleteAccountComponent(
          context.user.id,
          String(args.componentId ?? ""),
        );
      },
    },
  ];
}
