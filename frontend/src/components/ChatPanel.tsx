import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mergeChatMessages as mergeMessages } from '../lib/chat-state';
import { io, type Socket } from 'socket.io-client';
import { chatSocketUrl, getAccessToken, getChatMessages, getConversations, getMyProfile, readChatMessages, sendChatMessage, startConversation, type ChatConversation, type ChatMessage, type OwnProfile } from '../lib/api';

const timestamp = (value: string) => new Date(value).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short' });

export default function ChatPanel({ profileOpen, visible = true }: { profileOpen: boolean; visible?: boolean }) {
  const [account, setAccount] = useState<OwnProfile | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState(''); const selectedRef = useRef('');
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState(''); const retry = useRef<{ id: string; text: string; clientId: string } | null>(null);
  const [error, setError] = useState(''); const [sending, setSending] = useState(false); const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false); const [revision, setRevision] = useState(0);
  const socketRef = useRef<Socket | null>(null); const viewport = useRef<HTMLDivElement>(null); const end = useRef<HTMLDivElement>(null);
  const accountId = useRef('');
  const shouldScroll = useRef(true); const reading = useRef(new Set<string>());
  selectedRef.current = selected;

  useEffect(() => {
    let active = true; let socket: Socket | undefined;
    const token = getAccessToken();
    if (!token) { setAccount(null); setConversations([]); setSelected(''); setMessages([]); return; }
    getMyProfile().then(async ({ user }) => {
      if (!active) return;
      if (user.role !== 'student' && user.role !== 'tutor') { setAccount(null); return; }
      if (accountId.current !== user.id) { accountId.current = user.id; setSelected(''); setMessages([]); setDraft(''); }
      setAccount(user);
      const refresh = async () => { const result = await getConversations(); if (active) setConversations(result.data); };
      await refresh(); if (!active) return;
      socket = io(chatSocketUrl, { auth: { token }, reconnection: true }); socketRef.current = socket;
      socket.on('connect', () => {
        if (!active) return; setConnected(true); setError(''); void refresh().catch(() => {});
        const id = selectedRef.current;
        if (id) void getChatMessages(id).then((result) => { if (active && selectedRef.current === id) { setMessages((current) => mergeMessages(current, result.data)); setHasMore(result.hasMore); } }).catch(() => {});
      });
      socket.on('disconnect', () => { if (active) setConnected(false); });
      socket.on('profile:reviewed', (decision: { status: string; reviewNote?: string }) => {
        if (active) window.dispatchEvent(new CustomEvent('profile-review-updated', { detail: decision }));
      });
      socket.on('connect_error', () => { if (active) { setConnected(false); setError('El chat está reconectando. Si tu sesión venció, inicia sesión nuevamente.'); } });
      socket.on('chat:message', (message: ChatMessage) => {
        if (!active) return;
        if (message.conversationId === selectedRef.current) { shouldScroll.current = message.senderId === user.id || !viewport.current || viewport.current.scrollHeight - viewport.current.scrollTop - viewport.current.clientHeight < 100; setMessages((current) => mergeMessages(current, [message])); }
        void refresh().catch(() => {});
      });
      socket.on('chat:read', (receipt: { conversationId: string; messages: Array<{ _id: string; readAt: string }> }) => {
        if (!active) return;
        if (receipt.conversationId === selectedRef.current) setMessages((current) => current.map((message) => ({ ...message, readAt: receipt.messages.find((item) => item._id === message._id)?.readAt ?? message.readAt })));
        void refresh().catch(() => {});
      });
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el chat.'); });
    return () => { active = false; socket?.disconnect(); socketRef.current = null; setConnected(false); };
  }, [profileOpen, revision]);

  useEffect(() => {
    let active = true; setMessages([]); setError(''); setHasMore(false); setDraft(''); retry.current = null;
    if (!selected) return;
    setLoading(true); shouldScroll.current = true;
    getChatMessages(selected).then((result) => { if (active) { setMessages((current) => mergeMessages(result.data, current)); setHasMore(result.hasMore); } }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la conversación.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    let active = true;
    async function open(event: Event) {
      if (!getAccessToken()) { setError('Inicia sesión para enviar mensajes.'); document.getElementById('mensajes')?.scrollIntoView({ behavior: 'smooth' }); return; }
      try {
        const peerId = (event as CustomEvent<{ peerId: string }>).detail.peerId;
        const result = await startConversation(peerId);
        if (!active) return;
        setConversations((current) => [result.data, ...current.filter((item) => item._id !== result.data._id)]); setSelected(result.data._id); setError('');
        document.getElementById('mensajes')?.scrollIntoView({ behavior: 'smooth' });
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo abrir la conversación.'); }
    }
    window.addEventListener('open-chat', open); return () => { active = false; window.removeEventListener('open-chat', open); };
  }, []);

  useEffect(() => { if (shouldScroll.current && viewport.current) { viewport.current.scrollTop = viewport.current.scrollHeight; shouldScroll.current = false; } }, [messages]);
  useEffect(() => {
    if (!visible || !selected || !account || !viewport.current) return;
    const root = viewport.current; let alive = true;
    const mark = async (ids: string[]) => {
      if (!alive || !visible || document.hidden || !document.hasFocus()) return;
      const unread = ids.filter((id) => {
        const element = root.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
        if (!element || reading.current.has(id)) return false;
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }); if (!unread.length) return;
      unread.forEach((id) => reading.current.add(id));
      try {
        const receipt = await readChatMessages(selected, unread);
        if (alive) { setMessages((current) => current.map((message) => ({ ...message, readAt: receipt.messages.find((item) => item._id === message._id)?.readAt ?? message.readAt }))); const result = await getConversations(); if (alive) setConversations(result.data); }
      } catch { /* Retry on focus or the next message update. */ }
      finally { unread.forEach((id) => reading.current.delete(id)); }
    };
    const observer = new IntersectionObserver((entries) => { void mark(entries.filter((entry) => entry.isIntersecting).map((entry) => (entry.target as HTMLElement).dataset.messageId!)); }, { root, threshold: 0.5 });
    const observe = () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>('[data-message-id]').forEach((element) => { if (messages.some((message) => message._id === element.dataset.messageId && message.senderId !== account.id && !message.readAt)) observer.observe(element); });
    };
    observe(); window.addEventListener('focus', observe); document.addEventListener('visibilitychange', observe); window.addEventListener('scroll', observe, { passive: true });
    return () => { alive = false; observer.disconnect(); window.removeEventListener('focus', observe); document.removeEventListener('visibilitychange', observe); window.removeEventListener('scroll', observe); };
  }, [selected, messages, account, visible]);

  async function send(event: FormEvent) {
    event.preventDefault(); if (!draft.trim() || !selected || sending) return;
    const id = selected; const text = draft.trim();
    if (retry.current?.id !== id || retry.current.text !== text) retry.current = { id, text, clientId: crypto.randomUUID() };
    setSending(true); setError('');
    try { const result = await sendChatMessage(id, text, retry.current.clientId); if (selectedRef.current === id) { shouldScroll.current = true; setMessages((current) => mergeMessages(current, [result.data])); setDraft(''); } retry.current = null; const list = await getConversations(); setConversations(list.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.'); }
    finally { setSending(false); }
  }
  async function older() {
    if (!messages[0] || loading) return; const id = selected; setLoading(true);
    try { const result = await getChatMessages(id, messages[0]._id); if (selectedRef.current === id) { shouldScroll.current = false; setMessages((current) => mergeMessages(result.data, current)); setHasMore(result.hasMore); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.'); }
    finally { setLoading(false); }
  }
  const conversation = conversations.find((item) => item._id === selected);
  const unread = conversations.reduce((total, item) => total + item.unread, 0);
  useEffect(() => { window.dispatchEvent(new CustomEvent('chat-unread', { detail: unread })); }, [unread]);
  return <section className="section chat-section" id="mensajes"><div className="container">
    <div className="section-heading"><span className="eyebrow">COMUNICACIÓN PRIVADA</span><h2>Mis <span>mensajes{unread ? ` (${unread} sin leer)` : ''}</span></h2><p>Conversaciones privadas entre estudiantes y catedráticos. Fechas y horas de Guatemala.</p></div>
    {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}
    {!account ? <p>Inicia sesión como estudiante o catedrático para usar el chat.</p> : <>
      <p role="status">{connected ? 'Chat conectado' : 'Sin conexión en tiempo real'} · <button type="button" onClick={() => setRevision((value) => value + 1)}>Reconectar y actualizar</button></p>
      <div className="chat-layout"><aside className="chat-conversations" aria-label="Conversaciones">{!conversations.length && <p>Aún no tienes conversaciones. Como estudiante puedes iniciar una desde el perfil de un catedrático.</p>}{conversations.map((item) => <button type="button" key={item._id} aria-pressed={selected === item._id} onClick={() => setSelected(item._id)}><strong>{item.peerName}{item.unread ? ` · ${item.unread} sin leer` : ''}</strong><span>{item.lastMessage?.text ?? 'Nueva conversación'}</span></button>)}</aside>
      <div className="chat-thread">{!selected ? <p>Selecciona una conversación para ver sus mensajes.</p> : <><h3>{conversation?.peerName ?? 'Conversación'}</h3><div className="chat-messages" ref={viewport} aria-label="Historial de mensajes">{hasMore && <button type="button" disabled={loading} onClick={() => void older()}>Cargar mensajes anteriores</button>}{loading && <p role="status">Cargando mensajes…</p>}{messages.map((message) => <article key={message._id} data-message-id={message._id} className={`chat-bubble${message.senderId === account.id ? ' chat-bubble--own' : ''}`}><p>{message.text}</p><small>{timestamp(message.createdAt)}{message.senderId === account.id ? message.readAt ? ` · Leído ${timestamp(message.readAt)}` : ' · Enviado' : ''}</small></article>)}<div ref={end} /></div><form className="chat-compose" onSubmit={send}><label className="sr-only" htmlFor="chat-message">Escribe tu mensaje</label><textarea id="chat-message" required maxLength={2000} value={draft} disabled={sending} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe tu mensaje…" /><button className="button" disabled={sending || !draft.trim()}>{sending ? 'Enviando…' : 'Enviar'}</button></form></> }</div></div>
    </>}
  </div></section>;
}
