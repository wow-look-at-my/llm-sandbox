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
  {
    type: "function" as const,
    function: {
      name: "git_clone",
      description:
        "Clone a remote Git repository into the browser sandbox filesystem. The remote server must support browser CORS for Git HTTP requests.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Remote repository HTTPS URL." },
          dir: { type: "string", description: "Absolute sandbox path to clone into, such as /repo." },
          ref: { type: "string", description: "Optional branch, tag, or ref to clone." },
          depth: { type: "number", description: "Optional shallow clone depth. Defaults to 1." },
          singleBranch: { type: "boolean", description: "Whether to clone only one branch. Defaults to true." },
          username: { type: "string", description: "Optional Git HTTP username." },
          password: { type: "string", description: "Optional Git HTTP password." },
          token: { type: "string", description: "Optional Git HTTP token." },
        },
        required: ["url", "dir"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "git_status",
      description: "Show the current branch, local branches, and changed files for a Git repository.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Absolute sandbox path of the Git repository." },
        },
        required: ["dir"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "git_switch_branch",
      description:
        "Switch branches in a Git repository, optionally creating the branch before checkout.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Absolute sandbox path of the Git repository." },
          branch: { type: "string", description: "Branch name to switch to." },
          create: { type: "boolean", description: "Create the branch if true." },
          remote: { type: "string", description: "Optional remote name when checking out a remote branch." },
        },
        required: ["dir", "branch"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "git_commit",
      description:
        "Stage changes and create a Git commit in the sandbox repository. Defaults to staging all changes.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Absolute sandbox path of the Git repository." },
          message: { type: "string", description: "Commit message." },
          authorName: { type: "string", description: "Optional commit author name." },
          authorEmail: { type: "string", description: "Optional commit author email." },
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Optional repository-relative file paths to stage before committing.",
          },
        },
        required: ["dir", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "git_push",
      description:
        "Push a branch to a remote Git repository. This always requires explicit user approval unless the user previously selected Allow always for the exact same sandbox dir, remote, branch, URL, and force setting.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Absolute sandbox path of the Git repository." },
          remote: { type: "string", description: "Remote name. Defaults to origin." },
          branch: { type: "string", description: "Branch to push. Defaults to the current branch." },
          force: { type: "boolean", description: "Whether to force push. Defaults to false." },
          username: { type: "string", description: "Optional Git HTTP username." },
          password: { type: "string", description: "Optional Git HTTP password." },
          token: { type: "string", description: "Optional Git HTTP token." },
        },
        required: ["dir"],
        additionalProperties: false,
      },
    },
  },
]
