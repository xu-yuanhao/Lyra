#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(docsRoot, "..");
const generatedRoot = path.join(docsRoot, "generated");
const checkOnly = process.argv.includes("--check");
const verifiedDate = "2026-07-28";

const relative = (value) => path.relative(repoRoot, value).split(path.sep).join("/");
const read = (value) => fs.readFileSync(value, "utf8");

const listDirectories = (root) =>
  fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort()
    : [];

const walkFiles = (root, predicate) => {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (predicate(absolute)) {
        files.push(absolute);
      }
    }
  };
  visit(root);
  return files.sort();
};

const markdownHeader = (title, sources) => [
  `# ${title}`,
  "",
  "Audience: Internal",
  "Status: Generated",
  `Last verified: ${verifiedDate}`,
  "",
  "> Generated file. Do not edit by hand.",
  ">",
  `> Sources: ${sources.map((source) => `\`${source}\``).join(", ")}.`,
  "> Regenerate with `node docs/scripts/generate-inventories.mjs`.",
  "",
];

const parseCargoMembers = () => {
  const cargoPath = path.join(repoRoot, "Cargo.toml");
  const cargo = read(cargoPath);
  const membersBlock = cargo.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]\s*\n/)?.[1];
  if (membersBlock === undefined) {
    throw new Error("Could not parse Cargo workspace members");
  }
  return [...membersBlock.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
};

const cargoPackageName = (member) => {
  const manifest = path.join(repoRoot, member, "Cargo.toml");
  const content = read(manifest);
  const packageBlock = content.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? "";
  return packageBlock.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? path.basename(member);
};

const jsPackages = () => {
  const roots = ["apps", "services", "packages", "web"];
  const packages = [];
  for (const rootName of roots) {
    const root = path.join(repoRoot, rootName);
    for (const directory of listDirectories(root)) {
      const packagePath = path.join(root, directory, "package.json");
      if (!fs.existsSync(packagePath)) {
        continue;
      }
      const manifest = JSON.parse(read(packagePath));
      packages.push({
        name: typeof manifest.name === "string" ? manifest.name : `${rootName}/${directory}`,
        location: relative(path.dirname(packagePath)),
        private: manifest.private === true ? "yes" : "no",
      });
    }
  }
  return packages.sort((left, right) => left.location.localeCompare(right.location));
};

const modulesMarkdown = () => {
  const cargoMembers = parseCargoMembers().map((location) => ({
    name: cargoPackageName(location),
    location,
  }));
  const packages = jsPackages();
  const mainModules = listDirectories(path.join(repoRoot, "apps/desktop/src/main"));
  const workbenchModules = listDirectories(
    path.join(repoRoot, "apps/desktop/src/modules/workbench"),
  );

  if (
    cargoMembers.length < 20
    || packages.length < 5
    || mainModules.length < 20
    || workbenchModules.length < 20
  ) {
    throw new Error("Module inventory parser returned an implausibly small result");
  }

  return [
    ...markdownHeader("Generated module index", [
      "Cargo.toml",
      "apps/*/package.json",
      "services/*/package.json",
      "packages/*/package.json",
      "web/*/package.json",
      "apps/desktop/src/main",
      "apps/desktop/src/modules/workbench",
    ]),
    "This index lists build workspaces and first-level Desktop ownership modules.",
    "It does not define a public package API.",
    "",
    `## Rust workspace (${cargoMembers.length})`,
    "",
    "| Package | Location |",
    "| --- | --- |",
    ...cargoMembers.map(({ name, location }) => `| \`${name}\` | \`${location}\` |`),
    "",
    `## JavaScript workspaces (${packages.length})`,
    "",
    "| Package | Location | Private |",
    "| --- | --- | --- |",
    ...packages.map(
      ({ name, location, private: isPrivate }) =>
        `| \`${name}\` | \`${location}\` | ${isPrivate} |`,
    ),
    "",
    `## Electron main service directories (${mainModules.length})`,
    "",
    mainModules.map((name) => `\`${name}\``).join(", "),
    "",
    `## Workbench business modules (${workbenchModules.length})`,
    "",
    workbenchModules.map((name) => `\`${name}\``).join(", "),
    "",
  ].join("\n");
};

const ipcMarkdown = () => {
  const source = "apps/desktop/src/shared/desktop-bridge.ts";
  const content = read(path.join(repoRoot, source));
  const object = content.match(/export const LYRA_CHANNELS\s*=\s*\{([\s\S]*?)\}\s*as const;/)?.[1];
  if (object === undefined) {
    throw new Error("Could not locate LYRA_CHANNELS");
  }
  const channels = [...object.matchAll(
    /^\s*([A-Za-z0-9_]+):\s*(?:\r?\n\s*)?"(lyra:[^"]+)"/gm,
  )].map((match) => ({
    key: match[1],
    channel: match[2],
    group: match[2].slice("lyra:".length).split("/")[0],
  }));
  channels.sort((left, right) =>
    left.group.localeCompare(right.group) || left.channel.localeCompare(right.channel)
  );
  if (channels.length < 100) {
    throw new Error(`IPC inventory found only ${channels.length} channels`);
  }

  const grouped = new Map();
  for (const channel of channels) {
    grouped.set(channel.group, (grouped.get(channel.group) ?? 0) + 1);
  }

  return [
    ...markdownHeader("Generated Desktop IPC index", [source]),
    "This is a private Electron/preload inventory, not an extension API.",
    "",
    `Total channels: **${channels.length}**.`,
    "",
    "## Groups",
    "",
    "| Group | Count |",
    "| --- | ---: |",
    ...[...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, count]) => `| \`${group}\` | ${count} |`),
    "",
    "## Channels",
    "",
    "| Shared key | Channel | Group |",
    "| --- | --- | --- |",
    ...channels.map(
      ({ key, channel, group }) => `| \`${key}\` | \`${channel}\` | \`${group}\` |`,
    ),
    "",
  ].join("\n");
};

const toolsMarkdown = () => {
  const catalogRoot = path.join(repoRoot, "crates/lyra-tool-fs-core/src/catalog");
  const catalogSources = [
    path.join(repoRoot, "crates/lyra-tool-fs-core/src/catalog.rs"),
    ...walkFiles(catalogRoot, (value) => value.endsWith(".rs")),
  ];
  const adapterSource = path.join(
    repoRoot,
    "crates/lyra-agent-runtime/src/native_backend/tools/tool_fs/target.rs",
  );
  const byPath = new Map();

  for (const source of [...catalogSources, adapterSource]) {
    const sourceType = source === adapterSource ? "runtime adapter" : "manifest catalog";
    for (const match of read(source).matchAll(/"(\/tools\/[a-zA-Z0-9_./:-]+)"/g)) {
      const toolPath = match[1].replace(/\/+$/, "");
      const parts = toolPath.split("/").filter(Boolean);
      if (parts.length < 3 || parts[0] !== "tools") {
        continue;
      }
      const entry = byPath.get(toolPath) ?? {
        path: toolPath,
        domain: parts[1],
        sources: new Set(),
        types: new Set(),
      };
      entry.sources.add(relative(source));
      entry.types.add(sourceType);
      byPath.set(toolPath, entry);
    }
  }

  const tools = [...byPath.values()].sort((left, right) =>
    left.domain.localeCompare(right.domain) || left.path.localeCompare(right.path)
  );
  if (tools.length < 50) {
    throw new Error(`Tool inventory found only ${tools.length} paths`);
  }

  const grouped = new Map();
  for (const tool of tools) {
    grouped.set(tool.domain, (grouped.get(tool.domain) ?? 0) + 1);
  }

  return [
    ...markdownHeader("Generated Tool-FS index", [
      "crates/lyra-tool-fs-core/src/catalog.rs",
      "crates/lyra-tool-fs-core/src/catalog/*.rs",
      "crates/lyra-agent-runtime/src/native_backend/tools/tool_fs/target.rs",
    ]),
    "This static index records production source references. The runtime registry",
    "and its validation tests remain authoritative for callable manifests.",
    "Tool-FS is internal and is not a public developer contract.",
    "",
    `Total referenced paths: **${tools.length}**.`,
    "",
    "## Domains",
    "",
    "| Domain | Count |",
    "| --- | ---: |",
    ...[...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, count]) => `| \`${domain}\` | ${count} |`),
    "",
    "## Paths",
    "",
    "| Path | Domain | Evidence |",
    "| --- | --- | --- |",
    ...tools.map(({ path: toolPath, domain, types }) =>
      `| \`${toolPath}\` | \`${domain}\` | ${[...types].sort().join(", ")} |`
    ),
    "",
  ].join("\n");
};

const parseRuntimeFamilies = () => {
  const source = "crates/lyra-runtime-protocol/src/methods.rs";
  const content = read(path.join(repoRoot, source));
  const block = content.match(
    /pub const RUNTIME_METHOD_FAMILIES:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/,
  )?.[1];
  if (block === undefined) {
    throw new Error("Could not locate RUNTIME_METHOD_FAMILIES");
  }
  const families = [...block.matchAll(/"([a-z]+\.)"/g)].map((match) => match[1]);
  if (families.length < 6) {
    throw new Error(`Runtime family inventory found only ${families.length} families`);
  }
  return { source, families };
};

const parseQuotedMethods = (relativePath, prefix) => {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  return [...read(absolute).matchAll(new RegExp(`"(${prefix}[a-zA-Z0-9_.]+)"`, "g"))]
    .map((match) => match[1]);
};

const runtimeMethodsMarkdown = () => {
  const { source, families } = parseRuntimeFamilies();
  const methodSources = [
    "crates/lyrad/src/router.rs",
    "crates/lyrad/src/handlers.rs",
    "crates/lyra-files-core/src/json.rs",
    "crates/lyra-runtime-protocol/src/lib.rs",
  ];
  const methods = [...new Set(
    families.flatMap((family) =>
      methodSources.flatMap((methodSource) =>
        parseQuotedMethods(methodSource, family.replace(/\.$/, "\\."))
      )
    ),
  )].sort();
  if (methods.length < 20) {
    throw new Error(`Runtime method inventory found only ${methods.length} methods`);
  }

  return [
    ...markdownHeader("Generated runtime method index", [source, ...methodSources]),
    "Socket families are the waist. This list is extracted from the family table",
    "plus quoted method names in the daemon and core crates. It is not a public SDK.",
    "",
    `Families: **${families.length}**. Concrete methods found in source: **${methods.length}**.`,
    "",
    "## Families",
    "",
    ...families.map((family) => `- \`${family}*\``),
    "",
    "## Methods",
    "",
    ...methods.map((method) => `- \`${method}\``),
    "",
  ].join("\n");
};

const hostCommandsMarkdown = () => {
  const source = "apps/desktop/src/modules/workbench/workspace-apps/host-api.ts";
  const content = read(path.join(repoRoot, source));
  const parseObject = (name) => {
    const block = content.match(new RegExp(`export const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as const;`))?.[1];
    if (block === undefined) {
      throw new Error(`Could not locate ${name}`);
    }
    return [...block.matchAll(/^\s*([A-Za-z0-9_]+):\s*"([^"]+)"/gm)].map((match) => ({
      key: match[1],
      id: match[2],
    }));
  };
  const commands = parseObject("CORE_HOST_COMMANDS");
  const events = parseObject("CORE_HOST_EVENTS");
  if (commands.length < 40 || events.length < 5) {
    throw new Error(
      `Host inventory found only ${commands.length} commands and ${events.length} events`,
    );
  }

  return [
    ...markdownHeader("Generated Host command index", [source]),
    "First-party page Host. Not the socket protocol and not Electron IPC.",
    "",
    `Commands: **${commands.length}**. Events: **${events.length}**.`,
    "",
    "## Commands",
    "",
    "| Key | Command |",
    "| --- | --- |",
    ...commands.map(({ key, id }) => `| \`${key}\` | \`${id}\` |`),
    "",
    "## Events",
    "",
    "| Key | Event |",
    "| --- | --- |",
    ...events.map(({ key, id }) => `| \`${key}\` | \`${id}\` |`),
    "",
  ].join("\n");
};

const readmeMarkdown = () => [
  ...markdownHeader("Generated inventories", [
    "docs/scripts/generate-inventories.mjs",
  ]),
  "- [Module index](modules.md)",
  "- [Desktop IPC index](ipc.md)",
  "- [Runtime method index](runtime-methods.md)",
  "- [Host command index](host-commands.md)",
  "- [Tool-FS index](tools.md)",
  "",
  "These files prevent hand-maintained lists from becoming architectural",
  "folklore. They are private snapshots, not public compatibility contracts.",
  "",
  "Regenerate after workspace/package, `LYRA_CHANNELS`, Host commands,",
  "runtime families, Tool-FS catalog, or runtime adapter changes. CI should use:",
  "",
  "```sh",
  "node docs/scripts/generate-inventories.mjs --check",
  "```",
  "",
].join("\n");

const outputs = new Map([
  [path.join(generatedRoot, "README.md"), readmeMarkdown()],
  [path.join(generatedRoot, "modules.md"), modulesMarkdown()],
  [path.join(generatedRoot, "ipc.md"), ipcMarkdown()],
  [path.join(generatedRoot, "runtime-methods.md"), runtimeMethodsMarkdown()],
  [path.join(generatedRoot, "host-commands.md"), hostCommandsMarkdown()],
  [path.join(generatedRoot, "tools.md"), toolsMarkdown()],
]);

const stale = [];
for (const [target, content] of outputs) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  if (checkOnly) {
    if (!fs.existsSync(target) || read(target) !== normalized) {
      stale.push(relative(target));
    }
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, normalized);
  process.stdout.write(`generated ${relative(target)}\n`);
}

if (stale.length > 0) {
  process.stderr.write(
    `Generated documentation is stale:\n${stale.map((value) => `- ${value}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else if (checkOnly) {
  process.stdout.write("Generated documentation is current.\n");
}

