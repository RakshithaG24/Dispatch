import { useState } from "react";
import type { User } from "../api/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function Avatar({ user }: { user: User }) {
  const [failed, setFailed] = useState(false);
  if (user.avatarUrl && !failed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-9 w-9 rounded-full object-cover ring-1 ring-line"
      />
    );
  }
  return (
    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-dark ring-1 ring-line">
      {initials(user.name)}
    </span>
  );
}
