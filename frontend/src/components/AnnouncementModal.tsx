import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { X } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  isActive: boolean;
  activatedAt?: string | null;
}

const STORAGE_KEY = "announcement_seen";

const AnnouncementModal = () => {
  const [visible, setVisible] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [countdown, setCountdown] = useState(10);

  const { data: announcement } = useQuery<Announcement | null>({
    queryKey: ["announcement-active"],
    queryFn: async () => {
      try {
        return await apiFetch<Announcement | null>("/api/announcements/active");
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!announcement) return;

    // Key includes the activatedAt so re-dispatching the same aviso (or a new one) shows again
    const seenKey = `${STORAGE_KEY}_${announcement.id}_${announcement.activatedAt ?? ""}`;
    const alreadySeen = sessionStorage.getItem(seenKey);
    if (alreadySeen) return;

    setVisible(true);
    setCanClose(false);
    setCountdown(10);

    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setCanClose(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [announcement]);

  const handleClose = () => {
    if (!canClose || !announcement) return;
    const seenKey = `${STORAGE_KEY}_${announcement.id}_${announcement.activatedAt ?? ""}`;
    sessionStorage.setItem(seenKey, "1");
    setVisible(false);
  };

  if (!visible || !announcement) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleClose}
          disabled={!canClose}
          aria-label={canClose ? "Fechar aviso" : `Aguarde ${countdown}s`}
          className={`absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors
            ${canClose
              ? "bg-muted hover:bg-muted/80 cursor-pointer text-foreground"
              : "bg-muted/40 cursor-not-allowed text-muted-foreground"
            }`}
        >
          {canClose ? (
            <X className="h-4 w-4" />
          ) : (
            <span className="text-xs font-semibold">{countdown}</span>
          )}
        </button>

        <div className="p-6 pt-10">
          <h2 className="text-lg font-bold mb-3">{announcement.title}</h2>

          {announcement.imageUrl && (
            <img
              src={announcement.imageUrl.startsWith("http") ? announcement.imageUrl : `/api/announcements/${announcement.id}/image`}
              alt="Imagem do aviso"
              className="w-full rounded-lg mb-4 object-cover max-h-64"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}

          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {announcement.body}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementModal;
