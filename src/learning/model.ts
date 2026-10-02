export const FIXED_SKILLS = [
  { id: "serve-placement", label: "发球落点", question: "这次先看：能不能把发球落到画出的区域？" },
  { id: "return-depth", label: "接发深度", question: "这次先看：接发能不能越过对方发球线？" },
  { id: "crosscourt-control", label: "斜线稳定", question: "这次先看：斜线能不能连续落进安全区域？" },
  { id: "direction-change", label: "变线控制", question: "这次先看：站稳以后，能不能把球改到另一边？" },
  { id: "recovery", label: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？" },
  { id: "next-ball", label: "连上下一拍", question: "这次先看：打完这一拍，能不能及时准备下一拍？" },
] as const;

export type FixedSkillId = (typeof FIXED_SKILLS)[number]["id"];

export type BoardLearningChoice = {
  version: 1;
  boardId: string;
  route: "tactic" | "skill";
  tacticId?: string;
  skillId?: FixedSkillId;
  updatedAt: string;
};

const fixedSkillIds = new Set<string>(FIXED_SKILLS.map((skill) => skill.id));
const MAX_ID_LENGTH = 160;

export function fixedSkillById(skillId: string | undefined) {
  return FIXED_SKILLS.find((skill) => skill.id === skillId);
}

export function validateLearningChoice(value: unknown): BoardLearningChoice | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.boardId !== "string" || !candidate.boardId.trim() || candidate.boardId.length > MAX_ID_LENGTH) return null;
  if (typeof candidate.updatedAt !== "string" || !Number.isFinite(Date.parse(candidate.updatedAt))) return null;

  if (candidate.route === "tactic") {
    if (typeof candidate.tacticId !== "string" || !candidate.tacticId.trim() || candidate.tacticId.length > MAX_ID_LENGTH) return null;
    return {
      version: 1,
      boardId: candidate.boardId,
      route: "tactic",
      tacticId: candidate.tacticId,
      updatedAt: candidate.updatedAt,
    };
  }

  if (candidate.route === "skill" && typeof candidate.skillId === "string" && fixedSkillIds.has(candidate.skillId)) {
    return {
      version: 1,
      boardId: candidate.boardId,
      route: "skill",
      skillId: candidate.skillId as FixedSkillId,
      updatedAt: candidate.updatedAt,
    };
  }

  return null;
}
