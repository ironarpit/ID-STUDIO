import { useState, useCallback, useEffect } from 'react';

export interface UseModalTransitionOptions {
  onClose: () => void;
  isOpen?: boolean;
  duration?: number;
}

/**
 * Hook for smooth, professional modal opening & closing transitions.
 * - Backdrop: fades in 180ms, fades out 160ms.
 * - Panel: scales from 0.98 to 1 with 4px translation in 180ms; scales from 1 to 0.98 on close.
 * - Respects prefers-reduced-motion (closes immediately).
 * - Handles Escape key cleanly.
 * - Prevents duplicate overlays or blocked clicks.
 */
export function useModalTransition({
  onClose,
  isOpen = true,
  duration = 170
}: UseModalTransitionOptions) {
  const [isClosing, setIsClosing] = useState(false);

  // Reset closing flag whenever modal becomes opened
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isClosing) return;

    // Respect prefers-reduced-motion
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      onClose();
      return;
    }

    setIsClosing(true);
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [isClosing, onClose, duration]);

  // Handle Escape key with transition
  useEffect(() => {
    if (!isOpen || isClosing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, isClosing, handleClose]);

  return {
    isClosing,
    handleClose,
    backdropClass: isClosing ? 'modal-backdrop-out' : 'modal-backdrop-in',
    panelClass: isClosing ? 'modal-panel-out' : 'modal-panel-in',
    sheetClass: isClosing ? 'sheet-panel-out' : 'sheet-panel-in'
  };
}
