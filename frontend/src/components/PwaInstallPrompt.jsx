import React, { useEffect, useState } from "react";

function isStandaloneMode() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function isMobileLikeDevice() {
  return (
    window.matchMedia?.("(pointer: coarse)")?.matches ||
    window.innerWidth <= 1100
  );
}

export default function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandaloneMode());

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      if (!isMobileLikeDevice() || isStandaloneMode()) return;

      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;

    try {
      const result = await installPrompt.prompt();

      if (result?.outcome === "accepted") {
        setInstalled(true);
      }
    } finally {
      setInstallPrompt(null);
    }
  }

  if (installed || !installPrompt) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      aria-label={
        "Installer Belote et Amis en plein \u00e9cran"
      }
      style={{
        position: "fixed",
        zIndex: 9999,
        left: "50%",
        bottom: "calc(12px + env(safe-area-inset-bottom))",
        transform: "translateX(-50%)",
        width: "min(360px, calc(100vw - 24px))",
        minHeight: "48px",
        padding: "10px 16px",
        border: "1px solid rgba(135, 205, 255, 0.7)",
        borderRadius: "14px",
        background: "rgba(0, 35, 95, 0.96)",
        color: "#fff",
        boxShadow: "0 4px 18px rgba(0, 0, 0, 0.4)",
        fontSize: "0.95rem",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {"\u{1F4F1} Installer Belote & Amis - plein \u00e9cran"}
    </button>
  );
}
