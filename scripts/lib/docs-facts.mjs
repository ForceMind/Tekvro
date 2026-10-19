import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const repoRelative = (root, from, target) => {
  const index = target.search(/[#?]/u);
  const pathPart = index === -1 ? target : target.slice(0, index);
  const suffix = index === -1 ? "" : target.slice(index);
  if (pathPart.length === 0 || /^[a-z][a-z0-9+.-]*:/iu.test(pathPart))
    return target;
  const absolute = resolve(root, dirname(from), pathPart);
  const withinRepo = relative(root, absolute);
  if (
    withinRepo === ".." ||
    withinRepo.startsWith(`..${sep}`) ||
    isAbsolute(withinRepo)
  )
    return target;
  return `${withinRepo.split(sep).join("/")}${suffix}`;
};

const readmeDestinations = (content) => [
  ...content.matchAll(/\]\(([^)\s]+)\)/gu),
  ...content.matchAll(/\b(?:src|href)="([^"]+)"/gu),
];

const requireText = (issues, path, content, expected) => {
  if (!content.includes(expected)) issues.push(`${path}: missing ${expected}`);
};

/** Check that local Markdown references travel with an installed skill bundle. */
export const skillReferenceIssues = async (skillRoot) => {
  const issues = [];
  const paths = (await readdir(skillRoot, { recursive: true }))
    .filter((path) => path.endsWith(".md"))
    .sort();
  for (const path of paths) {
    const content = await readFile(join(skillRoot, path), "utf8");
    for (const match of content.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/gu)) {
      const destination = match[1];
      if (/^(?:https?:\/\/|mailto:|#)/u.test(destination)) continue;
      const target = resolve(
        dirname(join(skillRoot, path)),
        destination.split("#")[0],
      );
      const withinBundle = relative(resolve(skillRoot), target);
      if (
        withinBundle === ".." ||
        withinBundle.startsWith(`..${sep}`) ||
        isAbsolute(withinBundle)
      ) {
        issues.push(
          `${path}: reference escapes installed skill bundle: ${destination}`,
        );
        continue;
      }
      try {
        if (!(await stat(target)).isFile())
          issues.push(`${path}: reference is not a file: ${destination}`);
      } catch (cause) {
        if (cause?.code !== "ENOENT") throw cause;
        issues.push(`${path}: missing skill reference: ${destination}`);
      }
    }
  }
  return issues;
};

/** Return every caller-visible documentation mismatch against canonical facts. */
export const documentationFactIssues = async (root, catalog) => {
  const issues = await skillReferenceIssues(
    join(root, "skills/reverse-engineer-anything"),
  );
  // Tekvro has independently authored Chinese and English entry points. They
  // share product facts, not an upstream website translation/link inventory.
  for (const path of ["README.md", "README.en.md"]) {
    const content = await readFile(join(root, path), "utf8");
    for (const target of [
      "docs/installation.md#supported-agents",
      "docs/installation.md#mcp-registry",
      "docs/mcp-contracts.md#generated-catalog",
    ])
      requireText(issues, path, content, `](${target})`);
    for (const match of readmeDestinations(content)) {
      const destination = match[1] ?? "";
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/iu.test(destination)) continue;
      const target = repoRelative(root, path, destination).split(/[#?]/u)[0];
      if (!target || isAbsolute(target) || target.startsWith("../")) {
        issues.push(`${path}: reference escapes repository: ${destination}`);
        continue;
      }
      try {
        await stat(join(root, target));
      } catch (cause) {
        if (cause?.code !== "ENOENT") throw cause;
        issues.push(`${path}: missing documentation reference: ${destination}`);
      }
    }
  }

  const installationPath = "docs/installation.md";
  const installation = await readFile(join(root, installationPath), "utf8");
  for (const client of catalog.setup_clients)
    requireText(issues, installationPath, installation, client.display_name);

  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  requireText(issues, "AGENTS.md", agents, "docs/public/product-catalog.json");

  const templatePath = ".github/pull_request_template.md";
  const template = await readFile(join(root, templatePath), "utf8");
  requireText(
    issues,
    templatePath,
    template,
    "docs/public/product-catalog.json",
  );

  return issues;
};

/** Fail once with all documentation fact mismatches. */
export const assertDocumentationFacts = async (root, catalog) => {
  const issues = await documentationFactIssues(root, catalog);
  if (issues.length > 0)
    throw new Error(`Documentation facts drifted:\n- ${issues.join("\n- ")}`);
};
