import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../lib/auth";

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "RETAILER" as "WHOLESALER" | "RETAILER",
    companyName: "",
    taxNumber: "",
    contactPhone: "",
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await register(form);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Kayıt başarısız");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-green-700 mb-2">✅ Kayıt başarılı</h1>
          <p className="text-slate-600">Hesabınız admin onayını bekliyor. Yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Kayıt Ol</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <label className="block text-sm font-medium text-slate-700 mb-1">Hesap Tipi</label>
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as any })}
          className="w-full border rounded p-2 mb-4"
        >
          <option value="RETAILER">Perakendeci</option>
          <option value="WHOLESALER">Toptancı</option>
        </select>

        <label className="block text-sm font-medium text-slate-700 mb-1">Şirket Adı</label>
        <input
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Vergi Numarası</label>
        <input
          value={form.taxNumber}
          onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">İletişim Telefonu</label>
        <input
          value={form.contactPhone}
          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          className="w-full border rounded p-2 mb-4"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">E-posta</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-2 rounded font-medium hover:bg-slate-800"
        >
          Kayıt Ol
        </button>

        <p className="mt-4 text-sm text-slate-600 text-center">
          Zaten hesabın var mı?{" "}
          <a href="/login" className="text-blue-600 hover:underline">Giriş yap</a>
        </p>
      </form>
    </div>
  );
}
