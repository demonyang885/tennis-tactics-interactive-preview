/** The cloud build adds this hint only to pages with the account API available. */
export { CLOUD_API_META_TAG } from "./capability-tag.js";

export function hasCloudBackend(document: Pick<Document, "querySelector">): boolean {
  return document.querySelector('meta[name="rallypath-cloud-api"]')?.getAttribute("content") === "v1";
}
