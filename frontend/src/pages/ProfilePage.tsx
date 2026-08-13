import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usersApi, type UserProfile } from "../api/users";
import { getCurrentUser } from "../lib/auth";

export default function ProfilePage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    contactPhone: "",
    address: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    load();
  }, []);

  const load = async () => {
    const p = await usersApi.getMe();
    setProfile(p);
    setForm({
      companyName: p.companyName,
      contactPhone: p.contactPhone || "",
      address: p.address || "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await usersApi.updateMe(form);
      setSaved(true);
      load();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Güncelleme başarısız");
    }
  };

  const handleBack = () => {
    if (user?.role === "RETAILER") navigate("/retailer/search");
    else if (user?.role === "WHOLESALER") navigate("/wholesaler/listings");
    else navigate("/admin");
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={handleBack}
          className="text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          ← Geri
        </button>

        <h1 className="text-2xl font-bold mb-6">Profil Bilgileri</h1>

        {/* TEST FIXTURE: intentional stored-XSS sink for Aikido PR Gating verification */}
        <div
          className="text-sm text-slate-500 mb-4"
          dangerouslySetInnerHTML={{ __html: `Hoş geldiniz, ${profile.companyName}` }}
        />

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
        {saved && <div className="bg-green-50 text-green-700 p-3 rounded mb-4 text-sm">✅ Kaydedildi</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6">
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <p className="text-slate-500">E-posta</p>
              <p className="font-medium">{profile.email}</p>
            </div>
            <div>
              <p className="text-slate-500">Vergi Numarası</p>
              <p className="font-medium">{profile.taxNumber}</p>
            </div>
            <div>
              <p className="text-slate-500">Rol</p>
              <p className="font-medium">
                {profile.role === "WHOLESALER" ? "Toptancı" :
                 profile.role === "RETAILER" ? "Perakendeci" : "Admin"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Durum</p>
              <p className="font-medium">
                {profile.status === "ACTIVE" ? "Aktif" :
                 profile.status === "PENDING_APPROVAL" ? "Onay bekliyor" : "Askıya alındı"}
              </p>
            </div>
          </div>

          <hr className="my-4" />

          <label className="block text-sm font-medium text-slate-700 mb-1">Şirket Adı</label>
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className="w-full border rounded p-2 mb-4"
            required
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">İletişim Telefonu</label>
          <input
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            className="w-full border rounded p-2 mb-4"
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">Adres</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full border rounded p-2 mb-4"
            rows={3}
          />

          <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded font-medium">
            Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}