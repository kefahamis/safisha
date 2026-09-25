"use client";

import { RouteSheet } from "@/components/collector/RouteSheet";
import { ShareToggle } from "@/components/collector/ShareToggle";
import { CityMap } from "@/components/map/CityMap";
import { PageHead } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { truckById } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function CollectorRoute() {
  const s = useAppState();
  const truck = truckById(s, s.truckId);
  if (!truck) return null;

  const co = companyById(truck.company);

  return (
    <>
      <PageHead title="Today’s route" actions={<ShareToggle truck={truck} />}>
        <span className="mono">{truck.id}</span> · {truck.driver} · {co.name}
      </PageHead>

      {truck.status === "offline" && (
        <div className="banner">
          This truck is marked offline. Turning on location sharing puts it back on route.
        </div>
      )}

      <div className="grid g-main">
        <RouteSheet truck={truck} />
        <div>
          <CityMap companyId={truck.company} focusTruckId={truck.id} />
        </div>
      </div>
    </>
  );
}
