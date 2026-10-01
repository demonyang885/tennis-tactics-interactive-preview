import packageMetadata from "../../package.json";

export type VersionMetadata = {
  product: "RallyPath";
  version: string;
  commit: string | null;
  builtAt: string | null;
};

const fallback: VersionMetadata = {
  product: "RallyPath",
  version: packageMetadata.version,
  commit: null,
  builtAt: null,
};

/** Built pages embed this record; Vite development uses the package version directly. */
export function getVersionMetadata(): VersionMetadata {
  if (typeof document === "undefined") return fallback;
  const source = document.getElementById("rallypath-version")?.textContent;
  if (!source) return fallback;
  try {
    const metadata: unknown = JSON.parse(source);
    if (!metadata || typeof metadata !== "object") return fallback;
    const candidate = metadata as Record<string, unknown>;
    if (
      candidate.product !== "RallyPath" ||
      candidate.version !== packageMetadata.version ||
      typeof candidate.commit !== "string" || !/^[a-f0-9]{40,64}$/i.test(candidate.commit) ||
      typeof candidate.builtAt !== "string" || !Number.isFinite(Date.parse(candidate.builtAt))
    ) return fallback;
    return {
      product: "RallyPath",
      version: candidate.version,
      commit: candidate.commit,
      builtAt: candidate.builtAt,
    };
  } catch {
    return fallback;
  }
}
