import React, { useState, useRef, useEffect } from "react";
import styles from "./chat.module.css";

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hola 👋 ¿Qué normativa necesitas revisar?", sources: [] }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!input.trim()) return;
    const userMsg = { role: "user", text: input, sources: [] };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/requests/chatbot", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ query: userMsg.text, history })
      });
      const data = await res.json();
      // Esperamos: { answer: string, sources: [{id,title,url,page}] }
      const botMsg = {
        role: "assistant",
        text: data.answer ?? "No hubo respuesta.",
        sources: Array.isArray(data.sources) ? data.sources : []
      };
      setMessages(m => [...m, botMsg]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: "Ocurrió un error procesando la consulta. Intenta nuevamente.", sources: [] }]);
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

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>Asesoría normativa — <span className={styles.badge}>IA</span></div>
        <button className={styles.linkBtn} onClick={() => window.open("/politicas-ia", "_blank")}>Ver políticas</button>
      </header>

      <main className={styles.thread}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? styles.msgUser : styles.msgBot}>
            <div className={styles.bubble}>
              <p>{m.text}</p>
              {m.role === "assistant" && m.sources?.length > 0 && (
                <div className={styles.sources}>
                  <span>Fuentes:</span>
                  <div className={styles.chips}>
                    {m.sources.map((s, idx) => (
                      <a key={idx} className={styles.chip}
                         href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
                        {s.title}{s.page ? ` (p. ${s.page})` : ""}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className={styles.inputBar}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown}
                  placeholder="Escribe tu consulta normativa..." rows={1}/>
        <button disabled={sending} onClick={send}>{sending ? "Enviando..." : "Enviar"}</button>
      </footer>
    </div>
  );
}