import { useEffect, useRef, useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { BottomSheet, KeyboardTextarea, useKeyboard } from "../mobile";
import { newBoardId, type BoardDocument } from "../board/model";
import type { BoardResult } from "../board/validate";
import { BOARD_DISCOVERY_EVENT, readBoardDiscovery, saveBoardDiscoveryIfUnchanged, type BoardDiscovery } from "./discovery";
import { BOARD_FOLLOW_UP_EVENT, readBoardFollowUp, saveBoardFollowUpIfUnchanged, type BoardFollowUp } from "./followUp";
import { FIXED_SKILLS, fixedSkillById, type FixedSkillId } from "./model";
import "./discovery-editor.css";

export type DiscoveryKind = "point" | "practice";
export type DiscoveryRecord = BoardDiscovery | BoardFollowUp;

type DiscoveryEditorProps = {
  open: boolean;
  kind: DiscoveryKind;
  board: BoardDocument;
  frameId: string;
  skillId?: FixedSkillId;
  progress?: number;
  prepareBoard: () => BoardResult<BoardDocument>;
  onOpenChange: (open: boolean) => void;
  onSaved: (record: DiscoveryRecord, kind: DiscoveryKind) => void;
};

/** Optional learning notes are linked to the saved board, never court marks. */
export function DiscoveryEditor({ open, kind, board, frameId, skillId, progress, prepareBoard, onOpenChange, onSaved }: DiscoveryEditorProps) {
  const keyboard = useKeyboard();
  const expectedRef = useRef<DiscoveryRecord | undefined>(undefined);
  const [note, setNote] = useState("");
  const [nextTry, setNextTry] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState(frameId);
  const [selectedSkillId, setSelectedSkillId] = useState<FixedSkillId | "">(skillId ?? "");
  const [error, setError] = useState("");
  const [readFailed, setReadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Capture the record once when this sheet opens. A concurrent tab must not
  // silently become the new expected value while the child is editing.
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) { sessionRef.current = null; return; }
    const session = `${board.id}:${kind}`;
    if (sessionRef.current === session) return;
    sessionRef.current = session;
    const result = kind === "point" ? readBoardDiscovery(board.id) : readBoardFollowUp(board.id);
    const existing = result.ok ? result.value : undefined;
    expectedRef.current = existing;
    setNote(existing?.note ?? "");
    setNextTry(existing && "nextTry" in existing ? existing.nextTry : "");
    setUncertain(existing?.uncertain ?? false);
    setSelectedFrameId(existing?.frameId ?? frameId);
    setSelectedSkillId(existing && "skillId" in existing ? existing.skillId : skillId ?? "");
    setError(result.ok ? "" : result.error);
    setReadFailed(!result.ok);
    setSaving(false);
  }, [open, board.id, kind, frameId, skillId]);

  const title = kind === "point" ? "一分的发现" : "练后发现";
  const selectedSkill = fixedSkillById(selectedSkillId || undefined);
  const frameExists = board.frames.some(frame => frame.id === selectedFrameId);
  const hasContent = uncertain || Boolean(note.trim()) || kind === "point" && Boolean(nextTry.trim());
  const canSave = !readFailed && !saving && frameExists && hasContent && (kind === "point" || Boolean(selectedSkill));
  const close = () => { keyboard.hide(); onOpenChange(false); };

  const save = () => {
    if (!canSave) return;
    const expected = expectedRef.current;
    setSaving(true); setError("");
    // Checking the expected note before saving the board also avoids changing
    // a previously untouched board when another tab has changed this note.
    const latest = kind === "point" ? readBoardDiscovery(board.id) : readBoardFollowUp(board.id);
    if (!latest.ok || JSON.stringify(latest.value) !== JSON.stringify(expected)) {
      setError(latest.ok ? "这条发现已在另一页改变，未覆盖。请关闭后重新打开查看。" : latest.error);
      setSaving(false); return;
    }
    const prepared = prepareBoard();
    if (!prepared.ok) { setError(prepared.error); setSaving(false); return; }
    if (prepared.value.id !== board.id || !prepared.value.frames.some(frame => frame.id === selectedFrameId)) {
      setError("这一拍已改变，未保存发现。请关闭后重新打开查看。"); setSaving(false); return;
    }
    const now = new Date().toISOString();
    const rememberedProgress = expected?.frameId === selectedFrameId ? expected.progress : expected ? undefined : progress;
    const common = {
      version: 1 as const,
      id: expected?.id ?? newBoardId(kind === "point" ? "discovery" : "follow-up"),
      boardId: prepared.value.id,
      frameId: selectedFrameId,
      ...(rememberedProgress === undefined ? {} : { progress: rememberedProgress }),
      note: note.trim(), uncertain,
      createdAt: expected?.createdAt ?? now, updatedAt: now,
    };
    const result = kind === "point"
      ? saveBoardDiscoveryIfUnchanged({ ...common, nextTry: nextTry.trim() }, expected as BoardDiscovery | undefined)
      : saveBoardFollowUpIfUnchanged({ ...common, skillId: selectedSkill!.id, skillLabel: selectedSkill!.label, question: selectedSkill!.question }, expected as BoardFollowUp | undefined);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    expectedRef.current = result.value;
    window.dispatchEvent(new Event(kind === "point" ? BOARD_DISCOVERY_EVENT : BOARD_FOLLOW_UP_EVENT));
    keyboard.hide();
    onSaved(result.value, kind);
    onOpenChange(false);
  };

  return <BottomSheet open={open} onOpenChange={value => { if (!value) keyboard.hide(); onOpenChange(value); }} title={title} description="可选，不写也能继续。保存后可从这块画板找回。" snap={.625}>
    <form className="discovery-editor" data-testid="discovery-editor" onSubmit={event => { event.preventDefault(); save(); }}>
      <button className="discovery-close" type="button" aria-label={`关闭${title}`} onClick={close}><Cross2Icon/></button>
      <p className="discovery-board-context">{board.title}</p>
      <label className="discovery-field"><span>记录在哪一拍</span><select aria-label="记录在哪一拍" value={selectedFrameId} onChange={event => setSelectedFrameId(event.currentTarget.value)}>
        {!frameExists && <option value={selectedFrameId}>原来那一拍已删除，请重新选择</option>}
        {board.frames.map((frame, index) => <option key={frame.id} value={frame.id}>{`第 ${index + 1} 拍 · ${frame.label || "未命名"}`}</option>)}
      </select></label>
      {kind === "practice" && <>
        <label className="discovery-field"><span>这次练的技能</span><select aria-label="这次练的技能" value={selectedSkillId} onChange={event => setSelectedSkillId(event.currentTarget.value as FixedSkillId | "")}>
          <option value="">选择这次练的一项</option>
          {FIXED_SKILLS.map(skill => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
        </select></label>
        {selectedSkill && <p className="discovery-practice-question">{selectedSkill.question}</p>}
      </>}
      <label className="discovery-field"><span>{kind === "point" ? "发现了什么" : "练后发现了什么"}</span><KeyboardTextarea aria-label={kind === "point" ? "发现了什么" : "练后发现了什么"} value={note} maxLength={240} rows={3} placeholder={kind === "point" ? "例如：对手回位前，另一边有空当" : "例如：接发更深，下一拍有时间回位"} onChange={event => setNote(event.currentTarget.value)}/></label>
      {kind === "point" && <label className="discovery-field"><span>下次想试</span><KeyboardTextarea aria-label="下次想试" value={nextTry} maxLength={240} rows={2} placeholder="也可以先留空" onChange={event => setNextTry(event.currentTarget.value)}/></label>}
      <label className="discovery-uncertain"><input type="checkbox" checked={uncertain} onChange={event => setUncertain(event.currentTarget.checked)}/><span>还不确定，下次再看</span></label>
      {error && <p className="discovery-error" role="alert">{error}</p>}
      <div className="discovery-actions"><button type="button" onClick={close}>先不记</button><button type="submit" disabled={!canSave}>{saving ? "保存中…" : "保存发现"}</button></div>
    </form>
  </BottomSheet>;
}
