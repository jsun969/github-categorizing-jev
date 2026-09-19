export class ApiError extends Error {
  constructor(
    public readonly status:
      | 400
      | 401
      | 403
      | 404
      | 409
      | 413
      | 422
      | 429
      | 502
      | 503,
    message: string,
  ) {
    super(message);
  }
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function positiveInteger(
  value: unknown,
  name: string,
  maximum = 1000,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new ApiError(
      400,
      `${name} must be a whole number between 1 and ${maximum}.`,
    );
  }
  return value;
}

export function repositoryIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 1000 ||
    value.some((id) => typeof id !== "string" || !id || id.length > 200)
  ) {
    throw new ApiError(400, "Select between 1 and 1000 repositories.");
  }
  return [...new Set(value as string[])];
}
