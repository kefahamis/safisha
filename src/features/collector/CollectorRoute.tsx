"use client";

import { ClipboardCheck, Route, ShieldAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { RouteSheet } from "@/components/collector/RouteSheet";
import { ShareToggle } from "@/components/collector/ShareToggle";
import { CityMap } from "@/components/map/CityMap";
import { PageHead } from "@/components/ui/Panel";
import { companyById } from "@/lib/reference/companies";
import { truckById } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

export function CollectorRoute() {
  const s = useAppState();
  const { can } = useSession();
  const truck = truckById(s, s.truckId);
  if (!truck) return null;

  const co = companyById(truck.company);
  const check = s.fleet.checks[truck.id];
  const critical = s.fleet.alerts.some((a) => a.kind === "defect" && a.severity === "bad");

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

      {critical ? (
        <div className="banner bad">
          <ShieldAlert size={17} strokeWidth={2.2} aria-hidden="true" />
          This truck has a safety-critical defect. Don&rsquo;t drive it until the workshop clears it.
          <Link href="/collector/vehicle" className="linklike">
            Details
          </Link>
        </div>
      ) : (
        !check &&
        can("fleet.inspect") && (
          <div className="banner">
            <ClipboardCheck size={17} strokeWidth={2.2} aria-hidden="true" />
            Do your start-of-day vehicle check before you drive.
            <Link href="/collector/vehicle" className="btn small primary">
              Start check
            </Link>
          </div>
        )
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
