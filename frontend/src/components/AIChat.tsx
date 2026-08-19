import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  X,
  Check,
  Loader2,
  Bot,
  User,
  Clock,
  FolderOpen,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects, useLocations } from "@/lib/queries";
import {
  aiChat,
  aiConfirm,
  aiTranscribe,
  type AiChatMessage,
  type AiEntry,
} from "@/lib/queries";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  entries?: AiEntry[];
  saved?: AiEntry[];
}

const formatEntryDate = (date?: string) => {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const EntryCard = ({ entry, index }: { entry: AiEntry; index: number }) => (
  <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
    <div className="flex items-center gap-2">
      <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="font-semibold">{entry.start_time}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-semibold">{entry.end_time}</span>
      <span className="ml-auto text-muted-foreground">
        {formatEntryDate(entry.date)}
      </span>
    </div>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
      {(entry.projectName || entry.project_id) && (
        <span className="flex items-center gap-1">
          <FolderOpen className="h-3 w-3" /> {entry.projectName || "Projeto"}
        </span>
      )}
      {(entry.locationName || entry.location_id) && (
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {entry.locationName || "Local"}
        </span>
      )}
    </div>
  </div>
);

const AIChat = () => {
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Oi! Eu sou o assistente de registros. Descreva as atividades que você fez (ex: \"trabalhei de 8h às 12h no projeto Alfa no escritório\") ou grave um áudio. Posso entender várias atividades de uma vez.",
    },
  ]);
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState<AiEntry[] | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));

  const decorate = (entries: AiEntry[]): AiEntry[] =>
    entries.map((e) => ({
      ...e,
      projectName: e.project_id
        ? projectMap[e.project_id]?.name
        : e.project_name,
      locationName: e.location_id
        ? locationMap[e.location_id]?.name
        : e.location_name,
    }));

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    queryClient.invalidateQueries({ queryKey: ["time-entries"] });
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending, transcribing]);

  const history = (): AiChatMessage[] =>
    messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: clean },
    ];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const res = await aiChat(clean, history());
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: res.reply,
          entries: decorate(res.entries),
          saved: decorate(res.saved),
        },
      ]);
      if (res.saved.length) refreshLists();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      setMessages([
        ...newMessages,
        { role: "assistant", content: `Não consegui processar: ${message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async (entries: AiEntry[]) => {
    if (confirming) return;
    setConfirming(entries);
    try {
      const res = await aiConfirm(entries);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, saved: decorate(res.saved) },
      ]);
      if (res.saved.length) refreshLists();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(message);
    } finally {
      setConfirming(null);
    }
  };

  // --- Gravação de áudio ---------------------------------------------------
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error("Gravação de áudio não suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        await handleTranscribe(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const handleTranscribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const file = new File([blob], "audio.webm", {
        type: blob.type || "audio/webm",
      });
      const { text } = await aiTranscribe(file);
      if (text.trim()) {
        await sendMessage(text.trim());
      } else {
        toast.error("Não consegui entender o áudio.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(message);
    } finally {
      setTranscribing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <>
      {/* Botão flutuante */}
      <Button
        onClick={() => setOpen((o) => !o)}
        size="icon"
        className="fixed right-4 bottom-24 md:bottom-6 z-40 h-12 w-12 rounded-full shadow-lg"
        aria-label="Assistente de registros"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </Button>

      {/* Painel do chat */}
      {open && (
        <div className="fixed z-40 right-0 sm:right-4 bottom-0 sm:bottom-24 md:bottom-6 w-full sm:w-96 h-[70vh] sm:h-[520px] sm:max-h-[70vh] flex flex-col bg-card border-t sm:border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">
                Assistente de Registros
              </div>
              <div className="text-[10px] text-muted-foreground">
                Descreva suas atividades ou grave um áudio
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Mensagens */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>

                  {/* Entradas propostas para confirmação */}
                  {msg.entries && msg.entries.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.entries.map((entry, idx) => (
                        <EntryCard key={idx} entry={entry} index={idx} />
                      ))}
                      <Button
                        size="sm"
                        className="w-full mt-1"
                        disabled={confirming !== null}
                        onClick={() => void handleConfirm(msg.entries!)}
                      >
                        {confirming ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Confirmar e salvar
                      </Button>
                    </div>
                  )}

                  {/* Entradas salvas */}
                  {msg.saved && msg.saved.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                        {msg.saved.length}{" "}
                        {msg.saved.length === 1
                          ? "registro salvo"
                          : "registros salvos"}
                      </div>
                      {msg.saved.map((entry, idx) => (
                        <EntryCard key={idx} entry={entry} index={idx} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando...
              </div>
            )}
            {transcribing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcrevendo
                áudio...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            {recording && (
              <div className="mb-2 flex items-center justify-center gap-2 text-xs text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                Gravando... fale e toque para parar
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ex: trabalhei das 8h às 12h no projeto Alfa na obra"
                rows={2}
                className="min-h-[56px] resize-none text-sm"
                disabled={sending || transcribing || recording}
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  onClick={recording ? stopRecording : () => void startRecording()}
                  disabled={sending || transcribing}
                  aria-label={recording ? "Parar gravação" : "Gravar áudio"}
                >
                  {recording ? (
                    <MicOff className="h-4 w-4 text-destructive" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim() || sending || transcribing || recording}
                  aria-label="Enviar"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChat;