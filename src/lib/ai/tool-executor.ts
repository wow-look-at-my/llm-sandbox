import type { ToolCall } from "./types"
import * as opfs from "../opfs"

/**
 * Execute a single tool call against the OPFS virtual filesystem and return
 * a human-readable result string. Errors are caught and returned as text so
 * the agent can recover gracefully.
 */
export async function executeTool(toolCall: ToolCall): Promise<string> {
  try {
    const args = JSON.parse(toolCall.function.arguments)

    switch (toolCall.function.name) {
      case "read_file": {
        return await opfs.readFile(args.path)
      }

      case "write_file": {
        await opfs.writeFile(args.path, args.content)
        return `File written: ${args.path}`
      }

      case "edit_file": {
        const result = await opfs.editFile(args.path, args.old_string, args.new_string)
        return result.success
          ? `File edited successfully: ${args.path}`
          : `Edit failed: ${result.error ?? "old_string not found"} in ${args.path}`
      }

      case "list_directory": {
        const entries = await opfs.listDirectory(args.path)
        if (entries.length === 0) return "(empty directory)"
        return entries
          .map((e) => (e.kind === "directory" ? `${e.name}/` : e.name))
          .join("\n")
      }

      case "search_files": {
        const matches = await opfs.searchFiles(args.pattern, args.path)
        if (matches.length === 0) return "No matches found."
        return matches
          .map((m) => `${m.path}:${m.line}: ${m.content}`)
          .join("\n")
      }

      default:
        return `Unknown tool: ${toolCall.function.name}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Tool error (${toolCall.function.name}): ${message}`
  }
}
