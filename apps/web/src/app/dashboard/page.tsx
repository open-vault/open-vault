"use client";
import { useState } from "react";
import { Sidebar } from "../../components/sidebar";
import { SecretsList } from "../../components/secrets-list";
import { SecretDetail } from "../../components/secret-detail";
import { FolderKey, Plus } from "lucide-react";
import type { Secret } from "@open-vault/shared/types";

export default function DashboardPage() {
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);

  // Placeholder data — in production, fetched from Convex via useQuery
  const secrets: Secret[] = [];

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <div className="flex flex-1 min-w-0">
        {/* Secrets list */}
        <div className="w-80 border-r border-zinc-800 flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <FolderKey className="w-4 h-4 text-emerald-500" />
              Secrets
            </div>
            <button className="text-zinc-400 hover:text-white transition-colors" title="Add secret">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SecretsList
              secrets={secrets}
              onSelect={setSelectedSecret}
              selected={selectedSecret?.id}
            />
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0">
          {selectedSecret ? (
            <SecretDetail secret={selectedSecret} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-2">
              <FolderKey className="w-8 h-8 text-zinc-700" />
              <span>Select a secret to view details</span>
              <span className="text-xs">or use <code className="font-mono">os secret set NAME</code> to create one</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
