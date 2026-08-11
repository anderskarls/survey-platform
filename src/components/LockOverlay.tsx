"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface LockOverlayProps {
  enabled: boolean;
  onViolationChange?: (count: number) => void;
}

export default function LockOverlay({ enabled, onViolationChange }: LockOverlayProps) {
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningType, setWarningType] = useState<"tab" | "fullscreen">("tab");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEntryPrompt, setShowEntryPrompt] = useState(false);
  const hasEnteredFullscreen = useRef(false);

  const handleViolation = useCallback(
    (type: "tab" | "fullscreen") => {
      if (!enabled) return;
      setViolations((v) => {
        const next = v + 1;
        onViolationChange?.(next);
        return next;
      });
      setWarningType(type);
      setShowWarning(true);
    },
    [enabled, onViolationChange]
  );

  // Show fullscreen entry prompt on mount
  useEffect(() => {
    if (!enabled) return;
    setShowEntryPrompt(true);
  }, [enabled]);

  // Track fullscreen state changes
  useEffect(() => {
    if (!enabled) return;

    function onFullscreenChange() {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);

      // If they exit fullscreen after having entered it, that's a violation
      if (!isFull && hasEnteredFullscreen.current) {
        handleViolation("fullscreen");
      }
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [enabled, handleViolation]);

  // Tab/window switch detection
  useEffect(() => {
    if (!enabled) return;

    function onVisibilityChange() {
      if (document.hidden) {
        handleViolation("tab");
      }
    }

    function onBlur() {
      handleViolation("tab");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, handleViolation]);

  // beforeunload — warn when closing/navigating away
  useEffect(() => {
    if (!enabled) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled]);

  // Exit fullscreen on unmount (quiz submitted)
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      hasEnteredFullscreen.current = true;
      setIsFullscreen(true);
      setShowEntryPrompt(false);
    } catch {
      // Browser blocked it — continue without fullscreen
      setShowEntryPrompt(false);
    }
  }

  async function reenterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      hasEnteredFullscreen.current = true;
      setIsFullscreen(true);
      setShowWarning(false);
    } catch {
      setShowWarning(false);
    }
  }

  if (!enabled) return null;

  // Entry prompt — ask student to enter fullscreen before starting
  if (showEntryPrompt) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Låst läge
          </h2>
          <p className="text-gray-600 mb-1">
            Denna quiz körs i låst läge. Du får inte byta flik eller lämna
            helskärm under quizen.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Avvikelser registreras och visas för läraren.
          </p>
          <button
            type="button"
            onClick={enterFullscreen}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Starta i helskärm
          </button>
        </div>
      </div>
    );
  }

  // Violation warning
  if (showWarning) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {warningType === "fullscreen"
              ? "Du lämnade helskärm!"
              : "Du lämnade quizen!"}
          </h2>
          <p className="text-gray-600 mb-1">
            {warningType === "fullscreen"
              ? "Du får inte lämna helskärmsläge under quizen."
              : "Under pågående quiz får du inte byta flik eller fönster."}
          </p>
          <p className="text-sm text-red-600 font-medium mb-4">
            Antal avvikelser: {violations}
          </p>
          <button
            type="button"
            onClick={
              warningType === "fullscreen" ? reenterFullscreen : () => setShowWarning(false)
            }
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            {warningType === "fullscreen"
              ? "Återgå till helskärm"
              : "Tillbaka till quizen"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
