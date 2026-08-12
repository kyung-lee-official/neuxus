"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  /** When true, backdrop / Escape / × do not close. */
  closeDisabled?: boolean;
  children: ReactNode;
};

export function Modal({
  open,
  title,
  titleId,
  onClose,
  closeDisabled = false,
  children,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDisabled, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-md border border-line bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded border border-transparent text-lg text-muted leading-none hover:border-line hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Close"
          disabled={closeDisabled}
          onClick={onClose}
        >
          ×
        </button>
        <h2 id={titleId} className="m-0 pr-8 font-display text-ink text-lg">
          {title}
        </h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
