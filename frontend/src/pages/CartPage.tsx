import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cartApi, type Cart } from "../api/cart";
import { ordersApi } from "../api/orders";
import { getCurrentUser } from "../lib/auth";

export default function CartPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [cart, setCart] = useState<Cart | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "RETAILER") {
      navigate("/login");
      return;
    }
    load();
  }, []);

  const load = async () => {
    const c = await cartApi.get();
    setCart(c);
  };

  const updateQty = async (itemId: string, qty: number) => {
    await cartApi.updateItem(itemId, qty);
    load();
  };

  const removeItem = async (itemId: string) => {
    await cartApi.removeItem(itemId);
    load();
  };

  const applyDiscount = async () => {
    setError(null);
    try {
      await cartApi.applyDiscount(discountInput);
      setDiscountInput("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "İndirim kodu uygulanamadı");
    }
  };

  const removeDiscount = async () => {
    await cartApi.removeDiscount();
    load();
  };

  const handleCheckout = async () => {
    setError(null);
    try {
      await ordersApi.checkout(shippingAddress, notes);
      setSuccess(true);
      setTimeout(() => navigate("/orders"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Sipariş oluşturulamadı");
    }
  };

  if (!cart) return null;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow p-10 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-green-700 mb-2">✅ Sipariş oluşturuldu</h1>
          <p className="text-slate-600">Siparişlerim sayfasına yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  // Group items by wholesaler for visual clarity
  const groupedByWholesaler = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const wid = item.partListing.wholesaler.id;
    if (!groupedByWholesaler.has(wid)) groupedByWholesaler.set(wid, []);
    groupedByWholesaler.get(wid)!.push(item);
  }

  const subtotal = cart.items.reduce(
    (sum, i) => sum + parseFloat(i.unitPrice) * i.quantity,
    0
  );
  const discountPercent = cart.discountCode?.discountPercent || 0;
  const discountAmount = (subtotal * discountPercent) / 100;
  const total = subtotal - discountAmount;
  const currency = cart.items[0]?.currency || "TRY";

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Sepetim</h1>
          <button
            onClick={() => navigate("/retailer/search")}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Aramaya dön
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        {cart.items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <p className="text-slate-500 mb-4">Sepetiniz boş.</p>
            <button
              onClick={() => navigate("/retailer/search")}
              className="bg-slate-900 text-white px-6 py-2 rounded font-medium"
            >
              Parça Aramaya Başla
            </button>
          </div>
        ) : (
          <>
            {Array.from(groupedByWholesaler.entries()).map(([wid, items]) => (
              <div key={wid} className="bg-white rounded-2xl shadow mb-4 overflow-hidden">
                <div className="bg-slate-50 px-5 py-3 border-b">
                  <p className="font-medium">{items[0].partListing.wholesaler.companyName}</p>
                  <p className="text-xs text-slate-500">
                    {items.length} parça · Bu toptancı için ayrı bir sipariş oluşturulacak
                  </p>
                </div>

                <div className="divide-y">
                  {items.map((item) => (
                    <div key={item.id} className="px-5 py-4 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="font-medium">
                          {item.partListing.part.brand} — {item.partListing.part.name}
                        </p>
                        <p className="text-xs text-slate-500">SKU: {item.partListing.part.sku}</p>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Adet</label>
                        <input
                          type="number"
                          defaultValue={item.quantity}
                          onBlur={(e) => updateQty(item.id, parseInt(e.target.value))}
                          className="w-20 border rounded p-1 text-center"
                        />
                      </div>

                      <div className="text-right w-32">
                        <p className="text-sm text-slate-500">
                          {item.unitPrice} {item.currency} × {item.quantity}
                        </p>
                        <p className="font-bold">
                          {(parseFloat(item.unitPrice) * item.quantity).toFixed(2)} {item.currency}
                        </p>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-bold mb-4">Sipariş Özeti</h2>

              {cart.discountCode ? (
                <div className="flex justify-between items-center bg-green-50 p-3 rounded mb-4">
                  <p className="text-sm">
                    İndirim kodu: <strong>{cart.discountCode.code}</strong> ({cart.discountCode.discountPercent}%)
                  </p>
                  <button onClick={removeDiscount} className="text-red-600 text-sm">Kaldır</button>
                </div>
              ) : (
                <div className="flex gap-2 mb-4">
                  <input
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="İndirim kodu"
                    className="flex-1 border rounded p-2"
                  />
                  <button
                    onClick={applyDiscount}
                    className="bg-slate-200 px-4 rounded font-medium"
                  >
                    Uygula
                  </button>
                </div>
              )}

              <div className="space-y-1 text-sm border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Ara toplam</span>
                  <span>{subtotal.toFixed(2)} {currency}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>İndirim ({discountPercent}%)</span>
                    <span>-{discountAmount.toFixed(2)} {currency}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Toplam</span>
                  <span>{total.toFixed(2)} {currency}</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Teslimat Adresi</label>
                  <textarea
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full border rounded p-2"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notlar</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border rounded p-2"
                  />
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full bg-slate-900 text-white py-3 rounded font-medium hover:bg-slate-800"
                >
                  Ödemeyi Tamamla ({total.toFixed(2)} {currency})
                </button>
                <p className="text-xs text-slate-500 text-center">
                  Mock ödeme — gerçek ödeme entegrasyonu yok
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}