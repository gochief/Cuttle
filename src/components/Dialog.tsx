import { useEffect, useRef, type ReactNode, type FormEvent } from "react";
type Props = {
  title: string;
  wide?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};
export function Dialog({ title, wide, onClose, onSubmit, children }: Props) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    form.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="overlay">
      <form
        ref={form}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={"dialog " + (wide ? "large" : "")}
        onSubmit={onSubmit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const elements = Array.from(
              form.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
              ) || [],
            );
            const first = elements[0],
              last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="dialog-title">
          <div>
            <p className="eyebrow">CUTTLE WORKSPACE</p>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button type="button" aria-label="关闭对话框" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </form>
    </div>
  );
}
