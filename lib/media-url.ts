// The download URL of an item does not change when its file is replaced, so a
// browser that already cached the old bytes keeps showing them. The stored
// object key carries a fresh UUID after every replacement, so a short slice of
// it makes the URL change exactly when the file does.
export function mediaFileUrl(
  itemId: string,
  filePath?: string | null,
  opts: { inline?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (opts.inline) params.set("inline", "1");
  if (filePath) params.set("v", filePath.slice(-12));
  const query = params.toString();
  return `/api/v1/media/${itemId}/download${query ? `?${query}` : ""}`;
}
