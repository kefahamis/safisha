"use client";

import { ShareToggle } from "@/components/collector/ShareToggle";
import { CityMap } from "@/components/map/CityMap";
import { Chip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { formatCoord, truckPos } from "@/lib/geo";
import { truckById, truckState } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

/** The driver's own view of what the office and clients can see. */
export function CollectorMap() {
  const s = useAppState();
  const truck = truckById(s, s.truckId);
  if (!truck) return null;

  const p = truckPos(truck);
  const st = truckState(truck);

  return (
    <>
      <PageHead title="My location" actions={<ShareToggle truck={truck} />}>
        What the office and your clients see.
      </PageHead>

      <div className="grid g-main">
        <div>
          <CityMap companyId={truck.company} focusTruckId={truck.id} showClients={false} />
        </div>
        <Panel title="GPS ping">
          <div className="list">
            <div className="li">
              <div>
                <div className="t mono">{truck.id}</div>
                <div className="sub mono">{formatCoord(p)}</div>
              </div>
              <Chip tone={st.cls}>{st.label}</Chip>
            </div>
          </div>
          <p className="hint">
            In production the driver app sends a ping every 15–30 s; clients see ETAs from the
            nearest truck serving their estate.
          </p>
        </Panel>
      </div>
    </>
  );
}
