import { useEffect, useState } from "react";

interface HealthResponse {
  status: string;
  service: string;
  message: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:4000/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg w-full">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          ParçaPazar
        </h1>
        <p className="text-slate-600 mb-6">
          Otomotiv yedek parça B2B platformu
        </p>

        <div className="border-t pt-6">
          <p className="text-sm text-slate-500 mb-2">Backend health check:</p>
          {error && (
            <pre className="text-red-600 text-xs">Error: {error}</pre>
          )}
          {health && (
            <pre className="text-green-700 text-xs bg-green-50 p-3 rounded">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
