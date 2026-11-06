"use client";
import { useFormStatus } from "react-dom";

export function Submit({ children, className = "btn primary", pendingText = "جاري الحفظ…", disabled = false, pending: pendingProp }: { children: React.ReactNode; className?: string; pendingText?: string; disabled?: boolean; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-disabled={pending || disabled}>
      {pending ? pendingText : children}
    </button>
  );
}
