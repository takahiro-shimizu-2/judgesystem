#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "miyabi-integration", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

function run(command) {
  try {
    return {
      success: true,
      output: execSync(`npx miyabi ${command}`, {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe",
        maxBuffer: 10 * 1024 * 1024,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
    };
  }
}

function projectStatus() {
  const cwd = process.cwd();
  const packagePath = join(cwd, "package.json");
  const hasClaude = existsSync(join(cwd, ".claude"));
  const hasMiyabi = existsSync(join(cwd, ".miyabi.yml"));

  let packageInfo = null;
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    packageInfo = {
      name: pkg.name,
      version: pkg.version,
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
    };
  }

  return {
    workingDirectory: cwd,
    hasClaude,
    hasMiyabi,
    packageInfo,
  };
}

function textResult(ok, successText, failureText, result) {
  return {
    content: [
      {
        type: "text",
        text: ok
          ? `${successText}\n\n${result.output}`
          : `${failureText}\n\nエラー: ${result.error}\n\n${result.stderr || result.stdout}`,
      },
    ],
    isError: !ok,
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "miyabi__init",
      description: "新しい Miyabi プロジェクトを初期化します。",
      inputSchema: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          private: { type: "boolean", default: false },
          skipInstall: { type: "boolean", default: false },
        },
        required: ["projectName"],
      },
    },
    {
      name: "miyabi__install",
      description: "既存プロジェクトに Miyabi をインストールします。",
      inputSchema: {
        type: "object",
        properties: {
          dryRun: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "miyabi__status",
      description: "Miyabi のステータスを表示します。",
      inputSchema: {
        type: "object",
        properties: {
          watch: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "miyabi__agent_run",
      description: "Miyabi agent run を呼び出します。",
      inputSchema: {
        type: "object",
        properties: {
          issueNumber: { type: "number" },
          issueNumbers: { type: "array", items: { type: "number" } },
          concurrency: { type: "number", default: 2 },
          dryRun: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "miyabi__auto",
      description: "Miyabi auto を起動します。",
      inputSchema: {
        type: "object",
        properties: {
          maxIssues: { type: "number", default: 5 },
          interval: { type: "number", default: 60 },
        },
      },
    },
    {
      name: "miyabi__todos",
      description: "TODO スキャンを実行します。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", default: "./src" },
          autoCreate: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "miyabi__config",
      description: "Miyabi config を呼び出します。",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "set", "list"], default: "list" },
          key: { type: "string" },
          value: { type: "string" },
        },
      },
    },
    {
      name: "miyabi__get_status",
      description: "現在のプロジェクト統合状態を取得します。",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case "miyabi__init": {
      const flags = [args.private ? "--private" : "", args.skipInstall ? "--skip-install" : ""].filter(Boolean);
      const result = run(`init ${args.projectName} ${flags.join(" ")}`.trim());
      return textResult(result.success, `✅ プロジェクト "${args.projectName}" を作成しました`, "❌ プロジェクト作成に失敗しました", result);
    }
    case "miyabi__install": {
      const result = run(`install ${args.dryRun ? "--dry-run" : ""}`.trim());
      return textResult(result.success, "✅ Miyabi をインストールしました", "❌ インストールに失敗しました", result);
    }
    case "miyabi__status": {
      const result = run(`status ${args.watch ? "--watch" : ""}`.trim());
      return textResult(result.success, "📊 Miyabi ステータス", "❌ ステータス取得に失敗しました", result);
    }
    case "miyabi__agent_run": {
      const issuesFlag = args.issueNumber
        ? `--issue ${args.issueNumber}`
        : Array.isArray(args.issueNumbers) && args.issueNumbers.length > 0
          ? `--issues ${args.issueNumbers.join(",")}`
          : "";
      const flags = [
        "agent run",
        issuesFlag,
        args.concurrency ? `--concurrency ${args.concurrency}` : "",
        args.dryRun ? "--dry-run" : "",
      ].filter(Boolean);
      const result = run(flags.join(" "));
      return textResult(result.success, "🤖 Agent 実行完了", "❌ Agent 実行に失敗しました", result);
    }
    case "miyabi__auto": {
      const flags = ["auto", args.maxIssues ? `--max-issues ${args.maxIssues}` : "", args.interval ? `--interval ${args.interval}` : ""].filter(Boolean);
      const result = run(flags.join(" "));
      return textResult(result.success, "🕷 Miyabi auto 起動", "❌ auto 起動に失敗しました", result);
    }
    case "miyabi__todos": {
      const flags = ["todos", args.path ? `--path ${args.path}` : "", args.autoCreate ? "--auto-create" : ""].filter(Boolean);
      const result = run(flags.join(" "));
      return textResult(result.success, "📝 TODO スキャン完了", "❌ TODO スキャンに失敗しました", result);
    }
    case "miyabi__config": {
      let command = "config";
      if (args.action === "get" && args.key) {
        command += ` --get ${args.key}`;
      } else if (args.action === "set" && args.key && args.value) {
        command += ` --set ${args.key}=${args.value}`;
      }
      const result = run(command);
      return textResult(result.success, "⚙️ Miyabi 設定", "❌ 設定操作に失敗しました", result);
    }
    case "miyabi__get_status": {
      const status = projectStatus();
      const pkg = status.packageInfo;
      const text = [
        "📊 プロジェクト状態",
        "",
        `作業ディレクトリ: ${status.workingDirectory}`,
        `Miyabi 統合: ${status.hasMiyabi ? "✅ あり" : "❌ なし"}`,
        `Claude Code 統合: ${status.hasClaude ? "✅ あり" : "❌ なし"}`,
        pkg ? `パッケージ: ${pkg.name}@${pkg.version}` : "package.json: なし",
        pkg ? `依存関係: ${Object.keys(pkg.dependencies).length}個` : "",
        pkg ? `開発依存: ${Object.keys(pkg.devDependencies).length}個` : "",
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text", text }],
      };
    }
    default:
      return {
        content: [{ type: "text", text: `❌ 未知のツールです: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Miyabi MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
