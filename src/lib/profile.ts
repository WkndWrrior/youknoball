export type NormalizedDisplayName = {
  value: string | null;
  error: string | null;
};

export function normalizeDisplayName(rawValue: string): NormalizedDisplayName {
  const value = rawValue.trim().replace(/\s+/g, " ");

  if (value.length < 3 || value.length > 24) {
    return {
      value: null,
      error: "Display name must be between 3 and 24 characters.",
    };
  }

  return {
    value,
    error: null,
  };
}
