import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listingsApi, type Part, type PartListing } from "../api/listings";
import { getCurrentUser, logout } from "../lib/auth";

export default function WholesalerListingsPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [listings, setListings] = useState<PartListing[]>([]);
  const [catalog, setCatalog] = useState<Part[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    partId: "",
    price: 0,
    currency: "TRY" as "TRY" | "EUR" | "USD",
    stock: 0,
    minOrderQty: 1,
    notes: "",
  });

  useEffect(() => {
    if (!user || user.role !== "WHOLESALER") {
      navigate("/login");
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [myListings, catalogParts] = await Promise.all([
        listingsApi.getMyListings(),
        listingsApi.getCatalog(),
      ]);
      setListings(myListings);
      setCatalog(catalogParts);
    } catch (err: any) {
      setError(err.response?.data?.error || "Veriler yüklenemedi");
    }
  };

  const handleSearch = async () => {
    if (!searchTerm) {
      const all = await listingsApi.getCatalog();
      setCatalog(all);
      return;
    }
    const results = await listingsApi.searchCatalog(searchTerm);
    setCatalog(results);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await listingsApi.createListing(form);
      setShowAddForm(false);
      setForm({ partId: "", price: 0, currency: "TRY", stock: 0, minOrderQty: 1, notes: "" });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || "Liste oluşturulamadı");
    }
  };

  const handleDelete = async (listingId: string) => {
    if (!confirm("Bu listeyi silmek istediğinizden emin misiniz?")) return;
    await listingsApi.deleteListing(listingId);
    loadData();
  };

  const handleStockUpdate = async (listingId: string, newStock: number) => {
    await listingsApi.updateListing(listingId, { stock: newStock });
    loadData();
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">{user.companyName}</h1>
            <p className="text-sm text-slate-500">Toptancı Paneli — Parça Listeleri</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-600 hover:text-slate-900">
            Çıkış
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Listelerim ({listings.length})</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-slate-900 text-white px-4 py-2 rounded font-medium hover:bg-slate-800"
          >
            {showAddForm ? "İptal" : "+ Yeni Liste"}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 mb-6">
            <h3 className="font-bold mb-4">Yeni Parça Listesi Ekle</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Parça Ara</label>
              <div className="flex gap-2">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="SKU veya isim ile ara..."
                  className="flex-1 border rounded p-2"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="bg-slate-200 px-4 rounded font-medium"
                >
                  Ara
                </button>
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1">Parça Seç</label>
            <select
              value={form.partId}
              onChange={(e) => setForm({ ...form, partId: e.target.value })}
              className="w-full border rounded p-2 mb-4"
              required
            >
              <option value="">-- Bir parça seçin --</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} — {p.name} (SKU: {p.sku})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fiyat</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Para Birimi</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value as any })}
                  className="w-full border rounded p-2"
                >
                  <option value="TRY">TRY</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stok</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) })}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1">Notlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border rounded p-2 mb-4"
              rows={2}
            />

            <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded font-medium">
              Kaydet
            </button>
          </form>
        )}

        {listings.length === 0 ? (
          <p className="text-slate-500 text-center py-8 bg-white rounded-2xl shadow">
            Henüz hiç listeniz yok. Yukarıdan "Yeni Liste" butonuyla başlayabilirsiniz.
          </p>
        ) : (
          <div className="space-y-3">
            {listings.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl shadow p-5 flex justify-between items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-medium">{l.part.brand} — {l.part.name}</p>
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                      SKU: {l.part.sku}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {l.part.vehicleMakes.join(", ")} · {l.part.category}
                  </p>
                  {l.notes && (
                    <p className="text-xs text-slate-600 mt-1">📝 {l.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-lg">{l.price} {l.currency}</p>
                    <p className="text-xs text-slate-500">Min. sipariş: {l.minOrderQty}</p>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Stok</label>
                    <input
                      type="number"
                      defaultValue={l.stock}
                      onBlur={(e) => handleStockUpdate(l.id, parseInt(e.target.value))}
                      className="w-20 border rounded p-1 text-center"
                    />
                  </div>

                  <button
                    onClick={() => handleDelete(l.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
