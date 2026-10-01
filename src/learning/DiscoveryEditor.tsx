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
  const editorRef = useRef<HTMLFormElement>(null);
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
    if (!open) return;
    const editor = editorRef.current;
    const sheet = editor?.closest<HTMLElement>(".bottom-sheet");
    const screen = sheet?.closest<HTMLElement>(".device-screen");
    const visual = window.visualViewport;
    if (!editor || !sheet || !screen || !visual) return;
    const properties = ["--discovery-sheet-bottom", "--discovery-sheet-max-height", "--discovery-field-height", "--discovery-sheet-left", "--discovery-sheet-width"];
    const previous = properties.map(property => [property, sheet.style.getPropertyValue(property), sheet.style.getPropertyPriority(property)]);
    const previousCompact = sheet.getAttribute("data-discovery-compact");
    const previousViewport = sheet.getAttribute("data-discovery-viewport");
    let animation = 0;
    const update = () => {
      // Native keyboard focus, browser zoom and panning all change the visible
      // viewport independently of the layout viewport. Fit the sheet to their
      // intersection; never reset the user's zoom or freeze pre-zoom geometry.
      if (!window.matchMedia("(max-width:600px), (any-pointer:coarse)").matches) return;
      const bounds = screen.getBoundingClientRect();
      const top = Math.max(bounds.top, visual.offsetTop);
      const bottom = Math.min(bounds.bottom, visual.offsetTop + visual.height);
      const left = Math.max(bounds.left, visual.offsetLeft);
      const right = Math.min(bounds.right, visual.offsetLeft + visual.width);
      if (bottom <= top || right <= left) return;
      sheet.setAttribute("data-discovery-viewport", "true");
      sheet.style.setProperty(properties[0], `${Math.max(0, bounds.bottom - bottom)}px`);
      sheet.style.setProperty(properties[1], `${Math.max(0, bottom - top - 8)}px`);
      sheet.style.setProperty(properties[3], `${left - bounds.left}px`);
      sheet.style.setProperty(properties[4], `${right - left}px`);
      sheet.setAttribute("data-discovery-compact", String(bottom - top < 320));
      const active = document.activeElement;
      const content = editor.closest<HTMLElement>(".sheet-content");
      if (!(active instanceof HTMLElement) || !editor.contains(active) || !active.matches("textarea, input, select") || !content) return;
      const visible = content.getBoundingClientRect();
      const actions = editor.querySelector<HTMLElement>(".discovery-actions")?.getBoundingClientRect();
      const visibleBottom = Math.min(visible.bottom, (actions?.top ?? visible.bottom) - 8);
      // In the smallest keyboard viewports the native textarea scrolls its
      // text internally so its box and the actions can remain visible.
      sheet.style.setProperty(properties[2], `${Math.max(44, Math.min(72, visibleBottom - visible.top))}px`);
      const field = active.getBoundingClientRect();
      if (field.bottom > visibleBottom) content.scrollTop += field.bottom - visibleBottom;
      const shifted = active.getBoundingClientRect();
      if (shifted.top < visible.top) content.scrollTop -= visible.top - shifted.top;
    };
    const schedule = () => { window.cancelAnimationFrame(animation); animation = window.requestAnimationFrame(update); };
    schedule();
    visual.addEventListener("resize", schedule);
    visual.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    editor.addEventListener("focusin", schedule);
    return () => {
      window.cancelAnimationFrame(animation);
      visual.removeEventListener("resize", schedule);
      visual.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      editor.removeEventListener("focusin", schedule);
      for (const [property, value, priority] of previous) {
        if (value) sheet.style.setProperty(property, value, priority);
        else sheet.style.removeProperty(property);
      }
      if (previousCompact === null) sheet.removeAttribute("data-discovery-compact");
      else sheet.setAttribute("data-discovery-compact", previousCompact);
      if (previousViewport === null) sheet.removeAttribute("data-discovery-viewport");
      else sheet.setAttribute("data-discovery-viewport", previousViewport);
    };
  }, [open]);

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
    <form ref={editorRef} className="discovery-editor" data-testid="discovery-editor" onSubmit={event => { event.preventDefault(); save(); }}>
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
