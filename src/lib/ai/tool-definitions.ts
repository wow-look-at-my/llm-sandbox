export const tools = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description:
        "Read the contents of a file at the given absolute path. Use this to inspect existing files before making changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path of the file to read." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file at the given absolute path with the provided content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path of the file to write." },
          content: { type: "string", description: "Full content to write to the file." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_file",
      description:
        "Replace an exact substring in a file. The old_string must appear exactly once in the file. Read the file first to get the exact text.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path of the file to edit." },
          old_string: { type: "string", description: "Exact text to find and replace." },
          new_string: { type: "string", description: "Replacement text." },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description:
        "List the files and subdirectories at the given absolute path. Returns names with a trailing slash for directories.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path of the directory to list." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_files",
      description:
        "Search for files whose content matches a text pattern. Optionally restrict the search to a directory subtree.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Text pattern to search for in file contents." },
          path: {
            type: "string",
            description: "Optional directory to scope the search. Defaults to the root.",
          },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
]
