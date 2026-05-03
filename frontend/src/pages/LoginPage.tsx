import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const user = await login(email, password);
      if (user.role === "ADMIN") navigate("/admin");
      else navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Giriş başarısız");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Giriş Yap</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <label className="block text-sm font-medium text-slate-700 mb-1">E-posta</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-2 rounded font-medium hover:bg-slate-800"
        >
          Giriş Yap
        </button>

        <p className="mt-4 text-sm text-slate-600 text-center">
          Hesabın yok mu?{" "}
          <a href="/register" className="text-blue-600 hover:underline">Kayıt ol</a>
        </p>
      </form>
    </div>
  );
}
