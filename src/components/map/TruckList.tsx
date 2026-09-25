"use client";

import { Truck } from "lucide-react";
import type { CSSProperties } from "react";
import { TruckChip } from "@/components/ui/Chip";
import { fmtDate } from "@/lib/format";
import { formatCoord, truckPos } from "@/lib/geo";
import { companyById } from "@/lib/reference/companies";
import { truckState } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

/** Fleet roster with a live GPS readout per truck. */
export function TruckList({ companyId = "" }: { companyId?: string }) {
  const s = useAppState();
  const trucks = s.trucks.filter((t) => !companyId || t.company === companyId);

  return (
    <div className="list">
      {trucks.map((t) => {
        const p = truckPos(t);
        const st = truckState(t);
        const co = companyById(t.company);
        return (
          <div className="li" key={t.id}>
            <div className="li-main">
              <span
                className={`truck-badge${t.status === "offline" ? " offline" : ""}`}
                style={{ "--truck": co.color } as CSSProperties}
                aria-hidden="true"
              >
                <Truck size={15} strokeWidth={2.2} />
              </span>
              <div>
                <div className="t mono">{t.id}</div>
                <div className="sub">
                  {t.driver} · {co.name.split(" ")[0]}
                </div>
                <div className="sub mono">
                  {t.status === "offline" ? `Last seen ${fmtDate(t.lastSeen!)}` : formatCoord(p)}
                </div>
              </div>
            </div>
            <TruckChip state={st} />
          </div>
        );
      })}
    </div>
  );
}
