import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi, type Order } from "../api/orders";
import { getCurrentUser } from "../lib/auth";

const STATUS_LABELS: Record<Order["status"], string> = {
  PENDING_PAYMENT: "Ödeme Bekliyor",
  PAID: "Ödendi",
  CONFIRMED: "Onaylandı",
  SHIPPED: "Kargolandı",
  DELIVERED: "Teslim Edildi",
  CANCELLED: "İptal Edildi",
};

const STATUS_COLORS: Record<Order["status"], string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function OrdersPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    load();
  }, []);

  const load = async () => {
    const data = await ordersApi.myOrders();
    setOrders(data);
  };

  const updateStatus = async (orderId: string, status: Order["status"]) => {
    await ordersApi.updateStatus(orderId, status);
    load();
  };

  const handleBack = () => {
    if (user?.role === "RETAILER") navigate("/retailer/search");
    else navigate("/wholesaler/listings");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Siparişlerim</h1>
            <p className="text-sm text-slate-500">
              {user.role === "RETAILER" ? "Verdiğim siparişler" : "Aldığım siparişler"}
            </p>
          </div>
          <button onClick={handleBack} className="text-sm text-slate-600 hover:text-slate-900">
            ← Geri
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center text-slate-500">
            Henüz sipariş yok.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="px-5 py-3 border-b flex justify-between items-center bg-slate-50">
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(order.createdAt).toLocaleString("tr-TR")} ·{" "}
                      {user.role === "RETAILER"
                        ? order.wholesaler?.companyName
                        : order.retailer?.companyName}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                <div className="px-5 py-3 divide-y">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-2 flex justify-between text-sm">
                      <div>
                        <span className="font-medium">
                          {item.partBrand} — {item.partName}
                        </span>
                        <span className="text-slate-500 ml-2">× {item.quantity}</span>
                      </div>
                      <span>{item.lineTotal} {order.currency}</span>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-3 bg-slate-50 flex justify-between items-center">
                  <div className="text-sm">
                    {parseFloat(order.discountAmount) > 0 && (
                      <span className="text-green-700 mr-3">
                        İndirim: -{order.discountAmount} {order.currency}
                      </span>
                    )}
                    <span className="font-bold">Toplam: {order.total} {order.currency}</span>
                  </div>

                  {user.role === "WHOLESALER" && (
                    <div className="flex gap-2">
                      {order.status === "PAID" && (
                        <button
                          onClick={() => updateStatus(order.id, "CONFIRMED")}
                          className="bg-purple-600 text-white text-xs px-3 py-1 rounded"
                        >
                          Onayla
                        </button>
                      )}
                      {order.status === "CONFIRMED" && (
                        <button
                          onClick={() => updateStatus(order.id, "SHIPPED")}
                          className="bg-indigo-600 text-white text-xs px-3 py-1 rounded"
                        >
                          Kargola
                        </button>
                      )}
                      {order.status === "SHIPPED" && (
                        <button
                          onClick={() => updateStatus(order.id, "DELIVERED")}
                          className="bg-green-600 text-white text-xs px-3 py-1 rounded"
                        >
                          Teslim Edildi
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}