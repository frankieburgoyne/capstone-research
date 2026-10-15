import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

type Kind = "info" | "good" | "bad";
type ToastItem = { id: number; message: string; kind: Kind };

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

// Small messages that appear in the corner and fade away on their own
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: Kind = "info") => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}