"use client";

/*
 * Meeting rooms manager (Sprint 12). Inline create form + editable list with an
 * active toggle and delete. Calls the rooms server actions and refreshes.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { createRoom, updateRoom, deleteRoom } from "./actions";

export type RoomRow = {
  id: string;
  name: string;
  location: string | null;
  capacity: number | null;
  color: string;
  active: boolean;
  bookingCount: number;
};

const ROOM_COLORS = ["#7d4aea", "#1d77bd", "#5cb85c", "#f0ad4e", "#d9534f", "#2fc6f6"];

export function RoomsManager({ rooms }: { rooms: RoomRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState(ROOM_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "rounded border px-2 py-1.5 text-sm";
  const fieldStyle = { borderColor: "var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;

  async function add() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createRoom({ name: name.trim(), location: location.trim() || undefined, capacity: capacity ? Number(capacity) : null, color });
      setName("");
      setLocation("");
      setCapacity("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(r: RoomRow) {
    await updateRoom(r.id, { active: !r.active });
    router.refresh();
  }

  async function remove(r: RoomRow) {
    await deleteRoom(r.id);
    router.refresh();
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 rounded border p-3" style={{ borderColor: "var(--kb-border)" }}>
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Add a room</p>
        <div className="flex flex-wrap items-end gap-2">
          <input className={field} style={fieldStyle} placeholder="Room name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={field} style={fieldStyle} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <input className={`${field} w-24`} style={fieldStyle} type="number" min={1} placeholder="Capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <div className="flex items-center gap-1">
            {ROOM_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`color ${c}`} className="h-6 w-6 rounded-full" style={{ backgroundColor: c, outline: color === c ? "2px solid var(--kb-text-primary)" : "none", outlineOffset: 1 }} />
            ))}
          </div>
          <KbButton variant="primary" onClick={add} disabled={busy}>Add</KbButton>
        </div>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
      </div>

      <div className="rounded border" style={{ borderColor: "var(--kb-border)" }}>
        {rooms.length === 0 && <p className="p-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No rooms yet.</p>}
        {rooms.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--kb-border)" }}>
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{r.name}</div>
              <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                {[r.location, r.capacity ? `Capacity ${r.capacity}` : null, `${r.bookingCount} booking${r.bookingCount === 1 ? "" : "s"}`].filter(Boolean).join(" - ")}
              </div>
            </div>
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
              <input type="checkbox" checked={r.active} onChange={() => toggleActive(r)} /> Active
            </label>
            <button onClick={() => remove(r)} aria-label="Delete room" className="rounded p-1 hover:bg-gray-100" style={{ color: "var(--kb-error)" }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
