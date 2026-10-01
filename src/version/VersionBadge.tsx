import { getVersionMetadata } from "./metadata";
import "./version.css";

type VersionBadgeProps = {
  showCommit?: boolean;
  className?: string;
};

export function VersionBadge({ showCommit = false, className = "" }: VersionBadgeProps) {
  const metadata = getVersionMetadata();
  return (
    <span className={`version-badge ${className}`.trim()} data-version={metadata.version}>
      <span>v{metadata.version}</span>
      {showCommit && metadata.commit && (
        <span className="version-badge-commit" title={metadata.commit} aria-label={`构建提交 ${metadata.commit}`}>
          {metadata.commit.slice(0, 7)}
        </span>
      )}
    </span>
  );
}
