"use client";
import { Eye, EyeOff, Copy, Share2, RotateCcw, Clock } from "lucide-react";
import { useState } from "react";
import type { Secret, SecretVersion } from "@open-vault/shared/types";

interface Props {
  secret: Secret;
  versions?: SecretVersion[];
}

export function SecretDetail({ secret, versions = [] }: Props) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-mono text-lg font-medium text-white">{secret.name}</h2>
          <p className="text-sm text-zinc-400 mt-1">{secret.type} · Project: {secret.projectId.slice(0, 8)}...</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-900/40 text-emerald-400 font-medium">
          {secret.status}
        </span>
      </div>

      {/* Value (always masked until revealed) */}
      <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Value</span>
          <div className="flex gap-2">
            <button
              onClick={() => setRevealed((r) => !r)}
              className="text-zinc-400 hover:text-white transition-colors"
              title={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <span className="font-mono text-sm text-white">
          {revealed ? "(decrypt with CLI: os secret get " + secret.name + " --raw)" : "••••••••••••••••"}
        </span>
        <p className="text-xs text-zinc-600 mt-2">Values are decrypted client-side via CLI only.</p>
      </div>

      {/* Version timeline */}
      {versions.length > 0 && (
        <div>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Version History
          </h3>
          <div className="flex flex-col gap-2">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${v.id === secret.currentVersionId ? "bg-emerald-500" : "bg-zinc-600"}`} />
                <span className="font-mono text-zinc-300">v{v.versionNumber}</span>
                <span className="text-zinc-500">{new Date(v.createdAt).toLocaleString()}</span>
                {v.id === secret.currentVersionId && (
                  <span className="text-xs text-emerald-500">current</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
