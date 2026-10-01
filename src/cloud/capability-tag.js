export const CLOUD_API_META_TAG = '<meta name="rallypath-cloud-api" content="v1">';

/** Sites serves the built HTML directly; Pages must receive an unmarked copy. */
export function setCloudBackendCapability(html, enabled) {
  const unmarked = html.replaceAll(CLOUD_API_META_TAG, "");
  if (!enabled) return unmarked;
  if (!/<head\b[^>]*>/i.test(unmarked)) throw new Error("Cloud app HTML is missing its head");
  return unmarked.replace(/<head\b[^>]*>/i, head => head + CLOUD_API_META_TAG);
}
