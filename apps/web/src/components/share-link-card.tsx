"use client";
import { Copy, X, Clock, Eye } from "lucide-react";
import { cn } from "../lib/utils";
import type { ShareLink } from "@open-vault/shared/types";

interface Props {
  link: ShareLink;
  onRevoke?: (id: string) => void;
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-900/40 text-emerald-400",
  EXPIRED: "bg-zinc-800 text-zinc-400",
  EXHAUSTED: "bg-zinc-800 text-zinc-400",
  REVOKED: "bg-red-900/40 text-red-400",
};

export function ShareLinkCard({ link, onRevoke }: Props) {
  const copyId = () => navigator.clipboard.writeText(link.id);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs text-zinc-300 truncate">{link.id}</code>
            <button onClick={copyId} className="text-zinc-500 hover:text-white transition-colors shrink-0">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(link.expiresAt).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {link.viewCount}/{link.maxViews ?? "∞"}
            </span>
            <span>{link.mode}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColors[link.status])}>
            {link.status}
          </span>
          {link.status === "ACTIVE" && onRevoke && (
            <button
              onClick={() => {
                if (confirm("Revoke this share link?")) onRevoke(link.id);
              }}
              className="text-zinc-500 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
