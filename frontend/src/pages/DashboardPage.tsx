import { getCurrentUser, logout } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function DashboardPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    if (user?.role === "WHOLESALER" && user.status === "ACTIVE") {
      navigate("/wholesaler/listings");
    }
    else if (user?.role === "RETAILER" && user.status === "ACTIVE") {
    navigate("/retailer/search");
  }
  }, [user, navigate]);

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Hoş geldin, {user.companyName}</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Çıkış
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-sm text-slate-500 mb-2">Rol</p>
          <p className="font-medium mb-4">
            {user.role === "WHOLESALER" ? "Toptancı" : user.role === "RETAILER" ? "Perakendeci" : "Admin"}
          </p>

          <p className="text-sm text-slate-500 mb-2">Durum</p>
          <p className="font-medium">
            {user.status === "ACTIVE" ? "✅ Aktif" :
             user.status === "PENDING_APPROVAL" ? "⏳ Onay bekliyor" : "🚫 Askıya alındı"}
          </p>
        </div>

        <div className="mt-6 bg-yellow-50 border border-yellow-200 p-4 rounded text-sm text-yellow-800">
          Phase 3'te bu sayfa role'üne göre genişletilecek (toptancı: parça katalog yönetimi, perakendeci: arama).
        </div>
      </div>
    </div>
  );
}
