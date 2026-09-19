#!/usr/bin/env node
// Node.js >= 20; no dependencies. Verifies one already-starred repository.
// Classic PAT: start with `user` for list management and a public repository.
// Private repositories additionally require `repo` (broad access).
// Working API/scope reference: https://github.com/eggplants/gh-starlist/blob/master/QUERIES.md
// API schema: https://docs.github.com/en/graphql/reference/users

import { createInterface } from "node:readline/promises";

const usage = `Usage: node verify-star-list.mjs OWNER/REPO [LIST_NAME]

Set GITHUB_TOKEN in your environment. Use an already-starred public repository.
Classic PAT: start with the "user" scope; private repositories also need "repo".
This script does not star/unstar repositories or delete existing lists.
Each run creates a NEW PUBLIC list and leaves it on GitHub, even if a later step fails.
After confirmation, ONLY this repository's existing list memberships are replaced.
Other repositories are not scanned or modified. Prefer a repo not already in a list.

Example: node verify-star-list.mjs octocat/Hello-World "API Test"`;

const token = process.env.GITHUB_TOKEN?.trim();
let printedScopes = false;

async function graphql(query, variables = {}) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "User-Agent": "star-list-verification",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });

  if (!printedScopes && response.headers.has("x-oauth-scopes")) {
    console.log(`Token scopes: ${response.headers.get("x-oauth-scopes") || "(none)"}`);
    printedScopes = true;
  }

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


async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length < 1 || args.length > 2 || !/^[^/\s]+\/[^/\s]+$/.test(args[0])) {
    throw new Error(usage);
  }
  const [owner, name] = args[0].split("/");
  const listName = (args[1] ?? `API Test ${new Date().toISOString()}`).trim();
  if (!listName) throw new Error("LIST_NAME must not be empty.");
  if (!token) throw new Error("Set GITHUB_TOKEN first. Do not put the token in this file.");

  console.log("1. Checking account and repository...");
  const { viewer, repository } = await graphql(`
    query Repository($owner: String!, $name: String!) {
      viewer { login }
      repository(owner: $owner, name: $name) { id nameWithOwner viewerHasStarred }
    }
  `, { owner, name });
  if (!repository) throw new Error("Repository not found or token cannot access it.");
  console.log(`Account: ${viewer.login}; repository: ${repository.nameWithOwner}`);
  if (!repository.viewerHasStarred) {
    throw new Error("Star this repository on GitHub first, then rerun. Nothing was changed.");
  }

  console.log(`\nWARNING: ${repository.nameWithOwner} will belong ONLY to the new list.`);
  console.log("If it is in other lists, it will be removed from those lists. Its star is unchanged.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await prompt.question("Type yes to create the list and replace this repo's memberships: ");
  } finally {
    prompt.close();
  }
  if (answer.trim() !== "yes") {
    console.log("Cancelled. Nothing was changed.");
    return;
  }

  console.log(`2. Creating NEW PUBLIC list: ${listName}`);
  const { createUserList } = await graphql(`
    mutation CreateList($name: String!) {
      createUserList(input: { name: $name, isPrivate: false }) {
        list { id name slug }
      }
    }
  `, { name: listName });
  const list = createUserList?.list;
  if (!list) throw new Error("GitHub did not return the created list.");
  const url = `https://github.com/stars/${viewer.login}/lists/${encodeURIComponent(list.slug)}`;
  console.log(`Created: ${url}`);
  console.log("This list will remain on GitHub even if a later step fails.");

  console.log("3. Putting the repository in the new list...");
  const { updateUserListsForItem } = await graphql(`
    mutation SetLists($itemId: ID!, $listId: ID!) {
      updateUserListsForItem(input: { itemId: $itemId, listIds: [$listId] }) {
        lists { id }
      }
    }
  `, { itemId: repository.id, listId: list.id });
  if (!updateUserListsForItem?.lists?.some((item) => item.id === list.id)) {
    throw new Error(`GitHub did not confirm the new membership. Inspect ${url}`);
  }

  console.log("4. Reading the new list back from GitHub...");
  const { node } = await graphql(`
    query ListItems($listId: ID!) {
      node(id: $listId) {
        ... on UserList {
          items(first: 1) { nodes { ... on Repository { id } } }
        }
      }
    }
  `, { listId: list.id });
  if (!node?.items?.nodes?.some((item) => item?.id === repository.id)) {
    throw new Error(`Read-back failed: repository is not in the new list. Inspect ${url}`);
  }
  console.log(`SUCCESS: ${repository.nameWithOwner} is in "${list.name}".\n${url}`);
}

main().catch((error) => {
  const message = error.cause ? `${error.message}: ${error.cause.message}` : error.message;
  console.error(`ERROR: ${token ? message.replaceAll(token, "[REDACTED]") : message}`);
  process.exitCode = 1;
});
