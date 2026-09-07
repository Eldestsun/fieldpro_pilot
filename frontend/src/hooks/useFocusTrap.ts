import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * S2-9-pre1 — WCAG focus management for modal dialogs.
 *
 * Attach the returned ref to the dialog's container element. While `active`:
 *  - focus moves into the dialog on open (first focusable, else the container);
 *  - Tab / Shift+Tab cycle within the dialog (SC 2.4.3 Focus Order — focus
 *    never escapes into the page behind the scrim);
 *  - Escape invokes `onClose` (SC 2.1.2 No Keyboard Trap — the trap is always
 *    keyboard-escapable);
 *  - on close/unmount, focus returns to the element that opened the dialog.
 *
 * The container receives tabIndex={-1} via the ref setup so it can take
 * initial focus even when the dialog has no focusable children.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
    active: boolean,
    onClose?: () => void,
) {
    const containerRef = useRef<T | null>(null);
    const restoreRef = useRef<HTMLElement | null>(null);
    // Keep the latest onClose without re-binding listeners every render.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        restoreRef.current = (document.activeElement as HTMLElement) ?? null;

        if (!container.hasAttribute("tabindex")) {
            container.setAttribute("tabindex", "-1");
        }
        const initial = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (initial ?? container).focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && onCloseRef.current) {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== "Tab") return;

            // Note: no offsetParent visibility filter — it is null for elements
            // inside position:fixed overlays (our dialogs) and always null in
            // jsdom. The selector already excludes disabled controls; `hidden`
            // covers the explicit-hide case.
            const focusables = Array.from(
                container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((el) => !el.hasAttribute("hidden"));
            if (focusables.length === 0) {
                e.preventDefault();
                container.focus();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const current = document.activeElement as HTMLElement | null;

            if (e.shiftKey) {
                if (current === first || !container.contains(current)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (current === last || !container.contains(current)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        // Capture phase so the trap sees Tab/Escape before inner handlers.
        document.addEventListener("keydown", handleKeyDown, true);
        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
            restoreRef.current?.focus?.();
        };
    }, [active]);

    return containerRef;
}
