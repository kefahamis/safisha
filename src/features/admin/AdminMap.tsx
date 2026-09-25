"use client";

import { CityMap, MapLegend } from "@/components/map/CityMap";
import { TruckList } from "@/components/map/TruckList";
import { PageHead, Panel } from "@/components/ui/Panel";

export function AdminMap() {
  return (
    <>
      <PageHead title="City map">All companies’ trucks and clients in real time.</PageHead>
      <div className="grid g-main">
        <div>
          <CityMap />
          <MapLegend />
        </div>
        <Panel title="All trucks">
          <TruckList />
        </Panel>
      </div>
    </>
  );
}
