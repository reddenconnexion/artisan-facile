import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
].join(',');

/**
 * Make a modal accessible to keyboard and screen-reader users:
 *
 *   - traps Tab / Shift+Tab inside the modal so focus can't escape to the
 *     page behind,
 *   - moves focus to the first focusable element when the modal opens,
 *   - returns focus to whichever element was focused before the modal opened
 *     when it closes,
 *   - calls `onClose` on Escape (so every modal closes consistently).
 *
 * Returns a ref to attach to the modal container.
 *
 * @param {boolean} isOpen
 * @param {() => void} [onClose]
 */
export const useModalA11y = (isOpen, onClose) => {
    const containerRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        previousActiveElementRef.current = document.activeElement;

        const container = containerRef.current;
        if (!container) return undefined;

        const focusables = container.querySelectorAll(FOCUSABLE_SELECTOR);
        const firstFocusable = focusables[0];
        if (firstFocusable) {
            firstFocusable.focus();
        } else {
            // Make the container itself focusable as a fallback so screen
            // readers know where they are.
            container.setAttribute('tabindex', '-1');
            container.focus();
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose?.();
                return;
            }

            if (event.key !== 'Tab') return;
            const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
            if (nodes.length === 0) {
                event.preventDefault();
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            const previous = previousActiveElementRef.current;
            if (previous && typeof previous.focus === 'function') {
                // Defer so we don't fight the browser's own focus restoration
                // when the modal is unmounting.
                setTimeout(() => previous.focus(), 0);
            }
        };
    }, [isOpen, onClose]);

    return containerRef;
};
