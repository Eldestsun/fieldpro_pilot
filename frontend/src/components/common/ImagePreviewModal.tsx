
import React from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface ImagePreviewModalProps {
    isOpen: boolean;
    imageUrl: string | null;
    onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
    isOpen,
    imageUrl,
    onClose,
}) => {
    // S2-9-pre1: focus trap + Escape-to-close + focus restore.
    const trapRef = useFocusTrap<HTMLDivElement>(isOpen && !!imageUrl, onClose);

    if (!isOpen || !imageUrl) return null;

    return (
        <div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.9)",
                zIndex: 10000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
            }}
            onClick={onClose}
        >
            <img
                src={imageUrl}
                alt="Preview"
                style={{
                    maxWidth: "95vw",
                    maxHeight: "85vh",
                    borderRadius: "8px",
                    objectFit: "contain",
                }}
                onClick={(e) => e.stopPropagation()} // Allow clicking image without closing? Actually spec says tap outside or close button.
            />
            <button
                onClick={onClose}
                style={{
                    marginTop: "16px",
                    padding: "12px 24px",
                    backgroundColor: "#fff",
                    color: "#000",
                    border: "none",
                    borderRadius: "24px",
                    fontSize: "16px",
                    fontWeight: "600",
                    cursor: "pointer",
                }}
            >
                Close
            </button>
        </div>
    );
};
