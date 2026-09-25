"use client";

import { Route, WifiOff } from "lucide-react";
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
      <PageHead title="Today’s route" icon={Route} actions={<ShareToggle truck={truck} />}>
        <span className="mono">{truck.id}</span> · {truck.driver} · {co.name}
      </PageHead>

      {truck.status === "offline" && (
        <div className="banner">
          <WifiOff size={17} strokeWidth={2.2} aria-hidden="true" />
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
