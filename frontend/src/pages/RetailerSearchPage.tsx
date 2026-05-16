import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchApi, type PartWithListings, type SearchFilters } from "../api/search";
import { getCurrentUser, logout } from "../lib/auth";
import { cartApi } from "../api/cart";

const CATEGORIES = [
  { value: "", label: "Tüm Kategoriler" },
  { value: "BRAKES", label: "Fren Sistemi" },
  { value: "ENGINE", label: "Motor" },
  { value: "SUSPENSION", label: "Süspansiyon" },
  { value: "ELECTRICAL", label: "Elektrik" },
  { value: "TRANSMISSION", label: "Şanzıman" },
  { value: "EXHAUST", label: "Egzoz" },
  { value: "COOLING", label: "Soğutma" },
  { value: "FILTERS", label: "Filtreler" },
  { value: "BODY", label: "Kaporta" },
  { value: "INTERIOR", label: "İç Döşeme" },
  { value: "OTHER", label: "Diğer" },
];

export default function RetailerSearchPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [results, setResults] = useState<PartWithListings[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    brand: "",
    category: "",
    inStockOnly: true,
  });

  useEffect(() => {
    if (!user || user.role !== "RETAILER") {
      navigate("/login");
      return;
    }
    loadBrands();
    runSearch();
  }, []);

  const loadBrands = async () => {
    const list = await searchApi.getBrands();
    setBrands(list);
  };

  const runSearch = async () => {
    setLoading(true);
    try {
      const data = await searchApi.searchParts(filters);
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
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
            <p className="text-sm text-slate-500">Perakendeci Paneli — Parça Arama</p>
          </div>
          <div className="flex gap-4 items-center">
            <button
              onClick={() => navigate("/profile")}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Profil
            </button>
            <button
              onClick={() => navigate("/cart")}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
            Sepet
            </button>
            <button
              onClick={() => navigate("/orders")}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Siparişler
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Çıkış
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SKU, OEM kodu veya isim ile ara
            </label>
            <input
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              placeholder="Örn: BOSCH-0986452041, fren balatası, 34116794300"
              className="w-full border rounded p-2"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Marka</label>
              <select
                value={filters.brand}
                onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
                className="w-full border rounded p-2"
              >
                <option value="">Tüm Markalar</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full border rounded p-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Para Birimi</label>
              <select
                value={filters.currency || ""}
                onChange={(e) => setFilters({ ...filters, currency: e.target.value as any })}
                className="w-full border rounded p-2"
              >
                <option value="">Tümü</option>
                <option value="TRY">TRY</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.inStockOnly}
                onChange={(e) => setFilters({ ...filters, inStockOnly: e.target.checked })}
              />
              Sadece stoktakiler
            </label>

            <button
              type="submit"
              className="bg-slate-900 text-white px-6 py-2 rounded font-medium hover:bg-slate-800"
            >
              {loading ? "Aranıyor..." : "Ara"}
            </button>
          </div>
        </form>

        <div className="mb-3 text-sm text-slate-500">
          {results.length} parça bulundu
        </div>

        {results.length === 0 ? (
          <p className="text-slate-500 text-center py-12 bg-white rounded-2xl shadow">
            Aramanızla eşleşen parça bulunamadı.
          </p>
        ) : (
          <div className="space-y-4">
            {results.map((part) => (
              <PartCard key={part.id} part={part} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PartCard({ part }: { part: PartWithListings }) {
  const cheapest = part.listings[0];
  const totalStock = part.listings.reduce((sum, l) => sum + l.stock, 0);

  const handleAddToCart = async (listingId: string) => {
  await cartApi.addItem(listingId, 1);
  alert("Sepete eklendi ✓");
};


  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <div className="p-5 border-b">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-bold text-lg">{part.brand} — {part.name}</h3>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">SKU: {part.sku}</span>
            </div>
            <p className="text-sm text-slate-600">
              {part.vehicleMakes.join(", ")} · {part.vehicleModels.slice(0, 2).join(", ")}
              {part.vehicleModels.length > 2 && ` (+${part.vehicleModels.length - 2})`}
            </p>
            {part.oemCodes.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                OEM: {part.oemCodes.join(", ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">En düşük fiyat</p>
            <p className="font-bold text-2xl text-green-700">
              {cheapest.price} {cheapest.currency}
            </p>
            <p className="text-xs text-slate-500 mt-1">Toplam stok: {totalStock}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 uppercase px-5 py-2 bg-slate-50">
          {part.listings.length} Toptancı
        </p>
        <div className="divide-y">
          {part.listings.map((listing) => (
            <div key={listing.id} className="px-5 py-3 flex justify-between items-center hover:bg-slate-50">
              <div>
                <p className="font-medium">{listing.wholesaler.companyName}</p>
                <p className="text-xs text-slate-500">
                  Min. sipariş: {listing.minOrderQty} adet · Stok: {listing.stock}
                </p>
                {listing.notes && (
                  <p className="text-xs text-slate-600 mt-0.5">📝 {listing.notes}</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">
                  {listing.price} {listing.currency}
                </p>
                <button
                  className="text-xs text-blue-600 hover:underline mt-1"
                  onClick={() => handleAddToCart(listing.id)}
                >
                  Sepete ekle →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}