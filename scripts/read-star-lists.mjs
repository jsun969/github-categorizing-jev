#!/usr/bin/env node
// Node.js >= 20; no dependencies. Uses only GraphQL queries, never mutations.
// API schema: https://docs.github.com/en/graphql/reference/users

const usage = `Usage: node read-star-lists.mjs

Set GITHUB_TOKEN to your existing GitHub token, then run this script.
Prints JSON containing all visible Star Lists and their repositories.
Both lists and repositories are paginated. Nothing on GitHub is modified.

Exit code 0: complete. Exit code 1: failed or incomplete; inspect the error fields.
Organization SSO/token policies may prevent some repositories from being read.`;

const token = process.env.GITHUB_TOKEN?.trim();

function errorMessage(error) {
  const message = error.cause ? `${error.message}: ${error.cause.message}` : error.message;
  return token ? message.replaceAll(token, "[REDACTED]") : message;
}

async function graphql(query, variables = {}) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "User-Agent": "star-list-reader",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`GitHub HTTP ${response.status}: response was not JSON.`);
  }
  if (!response.ok || payload.errors?.length) {
    const detail = payload.errors
      ?.map((error) => `${error.type || "GraphQL"}: ${error.message}`)
      .join("\n") || payload.message || response.statusText;
    throw new Error(`GitHub HTTP ${response.status}: ${detail}`);
  }
  if (!payload.data) throw new Error("GitHub returned no GraphQL data.");
  return payload.data;
}

async function readRepositories(list) {
  let after = null;
  do {
    const { node } = await graphql(`
      query ListItems($listId: ID!, $after: String) {
        node(id: $listId) {
          ... on UserList {
            items(first: 100, after: $after) {
              nodes { ... on Repository { nameWithOwner url } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `, { listId: list.id, after });
    if (!node?.items) throw new Error("List is no longer available or cannot be read.");
    for (const repo of node.items.nodes) {
      if (!repo?.nameWithOwner) throw new Error("A repository in this list could not be read.");
      list.repositories.push(repo);
    }
    if (!node.items.pageInfo.hasNextPage) break;
    after = node.items.pageInfo.endCursor;
    if (!after) throw new Error("Missing pagination cursor for list items.");
  } while (after);
  list.complete = true;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length) throw new Error(usage);
  if (!token) throw new Error("Set GITHUB_TOKEN first. Do not put the token in this file.");

  const result = { user: null, complete: false, lists: [] };
  let after = null;
  try {
    do {
      const { viewer } = await graphql(`
        query ViewerLists($after: String) {
          viewer {
            login
            lists(first: 100, after: $after) {
              nodes { id name slug description isPrivate }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `, { after });
      result.user = viewer.login;
      for (const list of viewer.lists.nodes) {
        if (!list) throw new Error("A Star List could not be read.");
        result.lists.push({
          ...list,
          url: `https://github.com/stars/${viewer.login}/lists/${encodeURIComponent(list.slug)}`,
          complete: false,
          repositories: [],
        });
      }
      if (!viewer.lists.pageInfo.hasNextPage) break;
      after = viewer.lists.pageInfo.endCursor;
      if (!after) throw new Error("Missing pagination cursor for user lists.");
    } while (after);
  } catch (error) {
    result.error = errorMessage(error);
  }

  // An inaccessible list must not prevent reading the remaining lists.
  // Keep earlier successful pages, but never report partial data as complete.
  for (const list of result.lists) {
    try {
      await readRepositories(list);
    } catch (error) {
      list.error = errorMessage(error);
    }
  }
  result.complete = !result.error && result.lists.every((list) => list.complete);
  console.log(JSON.stringify(result, null, 2));
  if (!result.complete) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`ERROR: ${errorMessage(error)}`);
  process.exitCode = 1;
});
