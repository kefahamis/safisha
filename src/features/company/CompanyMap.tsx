"use client";

import { Map, Truck } from "lucide-react";
import { CityMap, MapLegend } from "@/components/map/CityMap";
import { TruckList } from "@/components/map/TruckList";
import { PageHead, Panel } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { useAppState } from "@/store/StoreProvider";

export function CompanyMap() {
  const s = useAppState();
  const co = companyById(s.companyId);

  return (
    <>
      <PageHead title="Fleet map" icon={Map}>
        {co.name} trucks and client locations. Dashed outlines show your service estates.
      </PageHead>
      <div className="grid g-main">
        <div>
          <CityMap companyId={co.id} />
          <MapLegend />
        </div>
        <Panel title="Trucks" icon={Truck}>
          <TruckList companyId={co.id} />
        </Panel>
      </div>
    </>
  );
}
