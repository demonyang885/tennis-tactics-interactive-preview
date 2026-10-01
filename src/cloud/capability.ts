/** The server adds this hint only to pages with the account API available. */
export const CLOUD_API_META_TAG = '<meta name="rallypath-cloud-api" content="v1">';

export function hasCloudBackend(document: Pick<Document, "querySelector">): boolean {
  return document.querySelector('meta[name="rallypath-cloud-api"]')?.getAttribute("content") === "v1";
}
