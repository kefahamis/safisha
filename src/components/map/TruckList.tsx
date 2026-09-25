"use client";

import { Chip } from "@/components/ui/Chip";
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
        return (
          <div className="li" key={t.id}>
            <div>
              <div className="t mono">{t.id}</div>
              <div className="sub">
                {t.driver} · {companyById(t.company).name.split(" ")[0]}
              </div>
              <div className="sub mono">
                {t.status === "offline" ? `Last seen ${fmtDate(t.lastSeen!)}` : formatCoord(p)}
              </div>
            </div>
            <Chip tone={st.cls}>{st.label}</Chip>
          </div>
        );
      })}
    </div>
  );
}
