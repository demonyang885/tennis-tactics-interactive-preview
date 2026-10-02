import { useEffect, useRef, type CSSProperties, type PropsWithChildren, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useKeyboard, useMobileDevice, useScreenPortal } from "../mobile";
import "./text-editor-layer.css";

type BoardTextEditorLayerProps = PropsWithChildren<{
  open: boolean;
  title: string;
  description: string;
  testId: string;
  initialFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onSubmit: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  submitDisabled?: boolean;
  actionsClassName?: string;
}>;

/** Shared native editor for names and discoveries; actions stay above the keyboard. */
export function BoardTextEditorLayer({ open, title, description, testId, initialFocusRef, onCancel, onSubmit, cancelLabel = "取消", submitLabel = "完成", submitDisabled = false, actionsClassName = "", children }: BoardTextEditorLayerProps) {
  const { screenRef } = useScreenPortal();
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();
  const layerRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<number | null>(null);
  const cancel = () => { keyboard.hide(); onCancel(); };
  const submit = () => { keyboard.hide(); onSubmit(); };

  useEffect(() => {
    if (!open) return;
    const layer = layerRef.current, screen = screenRef.current, visual = window.visualViewport;
    if (!layer || !screen || !visual) return;
    const properties = ["top", "left", "width", "height", "field-height"].map(name => `--board-text-editor-${name}`);
    let animation = 0;
    const update = () => {
      if (!window.matchMedia("(max-width:600px), (any-pointer:coarse)").matches) return;
      const bounds = screen.getBoundingClientRect();
      const top = Math.max(bounds.top, visual.offsetTop), bottom = Math.min(bounds.bottom, visual.offsetTop + visual.height);
      const left = Math.max(bounds.left, visual.offsetLeft), right = Math.min(bounds.right, visual.offsetLeft + visual.width);
      if (bottom <= top || right <= left) return;
      layer.dataset.textEditorViewport = "true";
      for (const [index, value] of [top - bounds.top, left - bounds.left, right - left, bottom - top].entries()) layer.style.setProperty(properties[index], `${value}px`);
      const content = layer.querySelector<HTMLElement>(".board-text-editor-content"), active = document.activeElement;
      if (!content || !(active instanceof HTMLElement) || !content.contains(active) || !active.matches("input, textarea, select")) return;
      const visible = content.getBoundingClientRect();
      // Only the active multiline field needs to shrink. Other optional fields
      // remain scrollable; the header never competes with them for keyboard space.
      layer.style.setProperty(properties[4], `${Math.max(44, Math.min(128, visible.height - 24))}px`);
      const field = active.getBoundingClientRect();
      if (field.bottom > visible.bottom - 8) content.scrollTop += field.bottom - visible.bottom + 8;
      const shifted = active.getBoundingClientRect();
      if (shifted.top < visible.top + 8) content.scrollTop -= visible.top + 8 - shifted.top;
    };
    const schedule = () => { window.cancelAnimationFrame(animation); animation = window.requestAnimationFrame(update); };
    schedule();
    visual.addEventListener("resize", schedule);
    visual.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    layer.addEventListener("focusin", schedule);
    return () => {
      window.cancelAnimationFrame(animation);
      visual.removeEventListener("resize", schedule);
      visual.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      layer.removeEventListener("focusin", schedule);
      for (const property of properties) layer.style.removeProperty(property);
      delete layer.dataset.textEditorViewport;
    };
  }, [open, screenRef]);

  useEffect(() => () => { if (focusTimer.current !== null) window.clearTimeout(focusTimer.current); }, []);

  return <Dialog.Root open={open} onOpenChange={next => { if (!next) cancel(); }}>
    <Dialog.Portal container={screenRef.current ?? undefined} forceMount>
      {open && <Dialog.Content ref={layerRef} className="board-rename-layer board-text-editor-layer" data-testid={testId} style={{ "--board-rename-safe-top": `${device.geometry.safeArea.top}px` } as CSSProperties} onOpenAutoFocus={event => {
        event.preventDefault();
        focusTimer.current = window.setTimeout(() => {
          const root = initialFocusRef.current;
          const input = root?.matches("input, textarea") ? root : root?.querySelector<HTMLElement>("input, textarea");
          input?.focus();
          if (input instanceof HTMLInputElement) input.select();
          focusTimer.current = null;
        }, 0);
      }} onCloseAutoFocus={event => event.preventDefault()}>
        <header className={`board-rename-header ${actionsClassName}`} data-testid="board-text-editor-header">
          <button type="button" aria-label={cancelLabel} onClick={cancel}>取消</button>
          <Dialog.Title>{title}</Dialog.Title>
          <button type="button" className="is-primary" aria-label={submitLabel} disabled={submitDisabled} onClick={submit}>完成</button>
        </header>
        <div className="board-rename-content board-text-editor-content" data-testid="board-text-editor-content">
          {children}
          <Dialog.Description className="board-sr-only">{description}</Dialog.Description>
        </div>
      </Dialog.Content>}
    </Dialog.Portal>
  </Dialog.Root>;
}
