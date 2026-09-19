export type BoardSurface = "hard" | "clay" | "grass";

export type BoardDisplayPreferences = {
  surface: BoardSurface;
  showZones: boolean;
  showZoneLabels: boolean;
};

export const BOARD_DISPLAY_STORAGE_KEY = "rallypath:board-display:v1";
export const BOARD_DISPLAY_EVENT = "rallypath-board-display-change";

export const DEFAULT_BOARD_DISPLAY_PREFERENCES: BoardDisplayPreferences = {
  surface: "hard",
  showZones: true,
  showZoneLabels: false,
};

let cachedPreferences: BoardDisplayPreferences | null = null;

function isSurface(value: unknown): value is BoardSurface {
  return value === "hard" || value === "clay" || value === "grass";
}

function normalizePreferences(value: unknown): BoardDisplayPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_BOARD_DISPLAY_PREFERENCES };
  }
  const source = value as Record<string, unknown>;
  return {
    surface: isSurface(source.surface) ? source.surface : DEFAULT_BOARD_DISPLAY_PREFERENCES.surface,
    showZones: typeof source.showZones === "boolean" ? source.showZones : DEFAULT_BOARD_DISPLAY_PREFERENCES.showZones,
    showZoneLabels: typeof source.showZoneLabels === "boolean" ? source.showZoneLabels : DEFAULT_BOARD_DISPLAY_PREFERENCES.showZoneLabels,
  };
}

export function getBoardDisplayPreferences(): BoardDisplayPreferences {
  if (cachedPreferences) return { ...cachedPreferences };
  if (typeof window === "undefined") {
    cachedPreferences = { ...DEFAULT_BOARD_DISPLAY_PREFERENCES };
    return { ...cachedPreferences };
  }
  try {
    const stored = window.localStorage.getItem(BOARD_DISPLAY_STORAGE_KEY);
    cachedPreferences = stored ? normalizePreferences(JSON.parse(stored)) : { ...DEFAULT_BOARD_DISPLAY_PREFERENCES };
  } catch {
    cachedPreferences = { ...DEFAULT_BOARD_DISPLAY_PREFERENCES };
  }
  return { ...cachedPreferences };
}

export function setBoardDisplayPreferences(
  patch: Partial<BoardDisplayPreferences>,
): BoardDisplayPreferences {
  const next = normalizePreferences({ ...getBoardDisplayPreferences(), ...patch });
  cachedPreferences = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(BOARD_DISPLAY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Display preferences are optional and must never block board editing.
    }
    window.dispatchEvent(new CustomEvent<BoardDisplayPreferences>(BOARD_DISPLAY_EVENT, { detail: next }));
  }
  return { ...next };
}

export function resetBoardDisplayPreferencesCache() {
  cachedPreferences = null;
}
