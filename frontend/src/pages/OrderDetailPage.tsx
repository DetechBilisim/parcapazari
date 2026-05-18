import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ordersApi, type Order } from "../api/orders";
import { messagesApi, type Message } from "../api/messages";
import { getCurrentUser } from "../lib/auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function OrderDetailPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const { orderId } = useParams();

  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !orderId) {
      navigate("/login");
      return;
    }
    loadOrder();
    loadMessages();

    // Polling every 3 seconds for new messages
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadOrder = async () => {
    if (!orderId) return;
    const o = await ordersApi.getOrder(orderId);
    setOrder(o);
  };

  const loadMessages = async () => {
    if (!orderId) return;
    const msgs = await messagesApi.list(orderId);
    setMessages(msgs);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || (!draft && !attachment)) return;

    setSending(true);
    try {
      await messagesApi.send(orderId, draft, attachment || undefined);
      setDraft("");
      setAttachment(null);
      loadMessages();
    } finally {
      setSending(false);
    }
  };

  const handleBack = () => {
    if (user?.role === "RETAILER") navigate("/orders");
    else navigate("/orders");
  };

  if (!order || !user) return null;

  const counterparty =
    user.role === "RETAILER" ? order.wholesaler : order.retailer;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          ← Siparişlere dön
        </button>

        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
              <p className="text-sm text-slate-500">
                {new Date(order.createdAt).toLocaleString("tr-TR")} ·{" "}
                {counterparty?.companyName}
              </p>
            </div>
            <span className="text-xs font-medium px-3 py-1 bg-slate-100 rounded-full">
              {order.status}
            </span>
          </div>

          <div className="border-t pt-4 space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.partBrand} — {item.partName}
                  <span className="text-slate-500 ml-2">× {item.quantity}</span>
                </span>
                <span>
                  {item.lineTotal} {order.currency}
                </span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 border-t">
              <span>Toplam</span>
              <span>
                {order.total} {order.currency}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-5 py-3 border-b">
            <h2 className="font-bold">Mesajlar</h2>
            <p className="text-xs text-slate-500">
              {counterparty?.companyName} ile bu sipariş hakkındaki konuşma
            </p>
          </div>

          <div className="h-96 overflow-y-auto p-5 bg-slate-50">
            {messages.length === 0 ? (
              <p className="text-center text-slate-400 text-sm">
                Henüz mesaj yok. İlk mesajı sen gönder.
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isMine = msg.senderId === user.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-2 ${
                          isMine
                            ? "bg-blue-600 text-white"
                            : "bg-white border"
                        }`}
                      >
                        <p className="text-xs opacity-75 mb-1">
                          {msg.sender.companyName} ·{" "}
                          {new Date(msg.createdAt).toLocaleTimeString("tr-TR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {/* Message content rendered with dangerouslySetInnerHTML for rich text support */}
                        <div
                          className="text-sm"
                          dangerouslySetInnerHTML={{ __html: msg.content }}
                        />
                        {msg.attachmentUrl && (
                          <a
                            href={`${API_URL}${msg.attachmentUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`block mt-2 text-xs underline ${
                              isMine ? "text-blue-100" : "text-blue-700"
                            }`}
                          >
                            📎 {msg.attachmentName}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="border-t p-4">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mesaj yaz..."
                className="flex-1 border rounded p-2"
              />
              <button
                type="submit"
                disabled={sending || (!draft && !attachment)}
                className="bg-slate-900 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
              >
                {sending ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="text-sm"
              />
              {attachment && (
                <span className="text-xs text-slate-500">
                  📎 {attachment.name}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}