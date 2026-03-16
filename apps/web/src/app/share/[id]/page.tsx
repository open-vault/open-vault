"use client";
import { useState } from "react";
import { Lock, Eye, AlertTriangle } from "lucide-react";

interface Props {
  params: { id: string };
}

export default function SharePage({ params }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);

  const handleReveal = async () => {
    setStatus("loading");
    try {
      // In production: call shareLinks:access mutation then decrypt with #key fragment
      const fragment = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      const params2 = new URLSearchParams(fragment);
      const shareKey = params2.get("key");

      if (!shareKey) {
        setError("No decryption key found in URL. Share the full URL including #key=...");
        setStatus("error");
        return;
      }

      // Placeholder: show that the key was found
      setPayload(`[Encrypted payload — decrypt with shareKey: ${shareKey.slice(0, 8)}...]`);
      setStatus("success");
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-900/40 flex items-center justify-center">
              <Lock className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-white font-semibold">Shared Secret</h1>
              <p className="text-xs text-zinc-400">End-to-end encrypted</p>
            </div>
          </div>

          <div className="text-sm text-zinc-400 mb-1">Link ID</div>
          <code className="font-mono text-xs text-zinc-300 block mb-6 break-all">{params.id}</code>

          {status === "idle" && (
            <button
              onClick={handleReveal}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2.5 px-4 rounded-md transition-colors"
            >
              <Eye className="w-4 h-4" />
              Reveal Secret
            </button>
          )}

          {status === "loading" && (
            <div className="text-center text-zinc-400 text-sm py-4">Decrypting...</div>
          )}

          {status === "success" && payload && (
            <div>
              <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Secret Value</div>
              <div className="rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-white break-all">
                {payload}
              </div>
              <p className="text-xs text-zinc-600 mt-3">This secret will not be shown again. Save it now.</p>
            </div>
          )}

          {status === "error" && error && (
            <div className="flex items-start gap-2 rounded-md border border-red-900 bg-red-950/40 p-3">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-600 mt-4">
          Powered by Open Secret · E2E encrypted
        </p>
      </div>
    </div>
  );
}
