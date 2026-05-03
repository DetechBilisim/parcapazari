import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { logout } from "../lib/auth";
import { useNavigate } from "react-router-dom";

interface PendingUser {
  id: string;
  email: string;
  role: string;
  companyName: string;
  taxNumber: string;
  contactPhone?: string;
  createdAt: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await api.get("/admin/pending-users");
    setUsers(data);
  };

  useEffect(() => { load(); }, []);

  const approve = async (userId: string) => {
    await api.post(`/admin/users/${userId}/approve`);
    load();
  };

  const reject = async (userId: string) => {
    await api.post(`/admin/users/${userId}/reject`);
    load();
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin Paneli — Onay Bekleyen Hesaplar</h1>
          <button onClick={handleLogout} className="text-sm text-slate-600 hover:text-slate-900">
            Çıkış
          </button>
        </div>

        {users.length === 0 ? (
          <p className="text-slate-500">Onay bekleyen hesap yok.</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl shadow p-5 flex justify-between items-center">
                <div>
                  <p className="font-medium">{u.companyName}</p>
                  <p className="text-sm text-slate-500">
                    {u.email} · {u.role === "WHOLESALER" ? "Toptancı" : "Perakendeci"} · Vergi No: {u.taxNumber}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(u.id)}
                    className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => reject(u.id)}
                    className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-red-700"
                  >
                    Reddet
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
