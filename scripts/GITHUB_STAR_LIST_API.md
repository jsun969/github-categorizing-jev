# GitHub Star List API

APIs used by [verify-star-list.mjs](verify-star-list.mjs) and [read-star-lists.mjs](read-star-lists.mjs).

## Endpoint

- **URL:** `POST https://api.github.com/graphql`
- **Authentication:** `Authorization: Bearer <GITHUB_TOKEN>`
- **Content type:** `application/json`
- **Request body:** `query` (GraphQL operation string) and `variables` (object).

## Queries

| Field | Arguments used | Returned fields used |
| --- | --- | --- |
| `viewer` | None | `login` — authenticated account |
| `repository` | `owner: String!`, `name: String!` | `id`, `nameWithOwner`, `viewerHasStarred` |
| `viewer.lists` | `first: Int`, `after: String` | List nodes: `id`, `name`, `slug`, `description`, `isPrivate`; `pageInfo` |
| `node` → `UserList.items` | `node(id: ID!)`; `items(first: Int, after: String)` | Repository nodes: `id` for verification, or `nameWithOwner` and `url` for export; `pageInfo` for pagination |

- Use `... on UserList` to select list fields from `node`, and `... on Repository` to select repository fields from list items.
- Paginate lists and their items separately using `pageInfo.hasNextPage` and `pageInfo.endCursor`. The reader requests 100 entries per page; verification reads the first item of the newly created list.
- List links are constructed as `https://github.com/stars/{login}/lists/{slug}`; they are not returned as a `UserList.url` field.

## Mutations

| Mutation | Input fields used | Returned fields used |
| --- | --- | --- |
| `createUserList` | `name: String!`, `isPrivate: Boolean` (the script sends `false`) | `list { id name slug }` |
| `updateUserListsForItem` | `itemId: ID!`, `listIds: [ID!]!` | `lists { id }` |

- IDs are GraphQL node IDs, not numeric REST repository IDs.
- **`updateUserListsForItem` replaces the repository's entire list membership set.** To preserve existing memberships, include their IDs alongside the new list ID. The current verification script sends only the new list ID after confirmation.
- These scripts do not call APIs to star/unstar repositories or delete lists.

## Errors

GraphQL can return HTTP 200 with an `errors` array. Check both HTTP status and GraphQL errors. Organization token-lifetime and SAML SSO policies may deny access even when the token is valid.

## Official References

- [Users: lists and list mutations](https://docs.github.com/en/graphql/reference/users)
- [Repositories: repository queries and fields](https://docs.github.com/en/graphql/reference/repos)
