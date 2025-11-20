import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "./chat.module.css";

const INITIAL_MESSAGE = {
  role: "assistant",
  text: "Hola 👋 Soy tu asistente normativo USACH. Conversemos sobre procedimientos y resoluciones.",
  sources: [],
};

const QUICK_PROMPTS = [
  "¿Cuál es el procedimiento para convalidar asignaturas?",
  "Muéstrame los plazos de apelación a resoluciones académicas.",
  "¿Qué documentos necesito para solicitar suspensión de estudios?",
];

const QUICK_LINKS = [
  { href: "/admin/create-user", label: "Crear cuentas", description: "Gestiona credenciales y perfiles" },
  { href: "/documents", label: "Documentos", description: "Revisa normas y resoluciones" },
  { href: "/requests", label: "Solicitudes", description: "Consulta flujos y pasos oficiales" },
];

export default function Chat() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState({ type: "idle", message: "Listo para conversar." });
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: sending ? "auto" : "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const next = Math.min(textareaRef.current.scrollHeight, 180);
    textareaRef.current.style.height = `${next}px`;
  }, [input]);

  async function send() {
    if (!input.trim() || sending) return;

    const userMsg = { role: "user", text: input.trim(), sources: [] };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStatus({ type: "loading", message: "Buscando normativa y generando respuesta contextual…" });

    try {
      const history = [...messages, userMsg].slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/requests/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg.text, history }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.warn("Respuesta del chatbot no es JSON válido", parseErr);
      }

      if (!res.ok) {
        const fallbackMessage =
          data?.error ||
          (res.status >= 500
            ? "El asistente tuvo un problema interno. Intenta nuevamente en unos minutos."
            : "No se pudo obtener respuesta del asistente.");
        throw new Error(fallbackMessage);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Respuesta inesperada del asistente.");
      }

      const sources = Array.isArray(data.sources) ? data.sources.filter(Boolean) : [];
      const botMsg = {
        role: "assistant",
        text: data.answer?.trim() || "No hubo respuestas disponibles para esta consulta.",
        sources,
      };
      setMessages((prev) => [...prev, botMsg]);

      const followUp =
        sources.length > 0
          ? `Se encontraron ${sources.length} fuente${sources.length > 1 ? "s" : "" } verificadas.`
          : "No se hallaron fuentes directas. Puedes revisar documentos recientes manualmente.";
      setStatus({ type: sources.length ? "success" : "warning", message: followUp });
    } catch (e) {
      console.error("--- INICIO DE ERROR DETALLADO DEL CHATBOT ---");
      console.error("Error completo:", e);
      console.error("Mensaje de error:", e.message);
      console.error("Stack de error:", e.stack);
      console.error("--- FIN DE ERROR DETALLADO DEL CHATBOT ---");
      const message =
        e?.message?.includes("modelo")
          ? "No pudimos conectar con el modelo configurado. Verifica la configuración técnica."
          : e?.message || "Error inesperado. Intenta de nuevo.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Hubo un problema: ${message}. Revisa la consola para más detalles.`, sources: [] },
      ]);
      setStatus({ type: "error", message: "Error en la comunicación con el chatbot. Revisa la consola." });
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handlePromptClick(prompt) {
    setInput(prompt);
    textareaRef.current?.focus();
  }

  function handleClear() {
    setMessages([INITIAL_MESSAGE]);
    setStatus({ type: "idle", message: "Conversación reiniciada." });
  }

  const statusClassName = `${styles.statusBar} ${
    status.type === "loading"
      ? styles.statusLoading
      : status.type === "error"
      ? styles.statusError
      : status.type === "warning"
      ? styles.statusWarning
      : status.type === "success"
      ? styles.statusSuccess
      : ""
  }`

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" legacyBehavior>
          <a className={styles.backLink}>← Panel principal</a>
        </Link>
        <div className={styles.sidebarHeader}>
          <h1>Asistente normativo</h1>
          <p>
            Interactúa en formato chat para explorar reglamentos, documentos escaneados y pasos oficiales.
          </p>
        </div>

        <div className={styles.sidebarCard}>
          <h2>Gestión rápida</h2>
          <ul className={styles.quickLinks}>
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <button
                  type="button"
                  className={styles.quickLink}
                  onClick={() => router.push(link.href)}
                >
                  <span>{link.label}</span>
                  <small>{link.description}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.sidebarCard}>
          <h2>Sugerencias de consulta</h2>
          <div className={styles.promptList}>
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className={styles.promptChip}
                onClick={() => handlePromptClick(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.sidebarCard}>
          <h2>Heurísticas aplicadas</h2>
          <ul className={styles.heuristics}>
            <li>Visibilidad del estado: indicadores de carga y éxito.</li>
            <li>Control del usuario: reinicia la conversación cuando lo necesites.</li>
            <li>Consistencia: respuestas con fuentes verificables.</li>
            <li>Prevención de errores: mensajes claros ante fallos del modelo.</li>
          </ul>
        </div>

        <Link className={styles.policyLink} href="/politicas-ia" target="_blank">
          Políticas de uso de IA
        </Link>
      </aside>

      <section className={styles.main}>
        <header className={styles.mainHeader}>
          <div>
            <p className={styles.breadcrumb}>Inicio / Chat normativo</p>
            <h2>Chat de resoluciones y normativa</h2>
          </div>
          <button type="button" className={styles.resetButton} onClick={handleClear}>
            Reiniciar chat
          </button>
        </header>

        <div className={statusClassName} role="status" aria-live="polite">
          {status.message}
        </div>

        <div className={styles.thread}>
          {messages.map((m, i) => (
            <article
              key={`${m.role}-${i}-${m.text.slice(0, 12)}`}
              className={`${styles.messageRow} ${m.role === "user" ? styles.messageUser : styles.messageAssistant}`}
            >
              <div className={`${styles.avatar} ${m.role === "user" ? styles.avatarUser : styles.avatarAssistant}`} aria-hidden="true">
                {m.role === "user" ? "Tú" : "IA"}
              </div>
              <div className={styles.bubble}>
                <p>{m.text}</p>
                {m.role === "assistant" && m.sources?.length > 0 && (
                  <div className={styles.sources}>
                    <p className={styles.sourcesTitle}>Fuentes consultadas</p>
                    <ul>
                      {m.sources.map((s, idx) => (
                        <li key={`${s.id || idx}-${idx}`}>
                          {s?.url ? (
                            <a
                              className={styles.sourceLink}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {s.title || "Documento"}
                            </a>
                          ) : (
                            <span className={styles.sourceLink}>{s.title || "Documento"}</span>
                          )}
                          {s.page && <span className={styles.sourceMeta}> · p. {s.page}</span>}
                          {s.excerpt && <p className={styles.sourceExcerpt}>{s.excerpt}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        <footer className={styles.composer}>
          <div className={styles.composerInfo}>
            {sending ? "La IA está redactando…" : "Escribe tu consulta con el mayor contexto posible."}
          </div>
          <div className={styles.composerRow}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Haz tu consulta normativa en formato conversacional"
              rows={1}
            />
            <button type="button" className={styles.sendButton} disabled={sending || !input.trim()} onClick={send}>
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}