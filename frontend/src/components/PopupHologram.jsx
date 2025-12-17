import "../styles/PopupHologram.css";

export default function PopupHologram({
  visible,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
}) {
  if (!visible) return null;

  return (
    <div className="popup-overlay" onClick={onCancel}>
      <div className="popup-card-hologram" onClick={(e) => e.stopPropagation()}>
        <div className="popup-card-border-glow" />
        <div className="popup-card-inner">
          <h2 className="popup-title">{title}</h2>
          <p className="popup-message">{message}</p>

          <div className="popup-buttons">
            <button className="popup-btn popup-btn-confirm" onClick={onConfirm}>
              {confirmLabel}
            </button>
            <button className="popup-btn popup-btn-cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

