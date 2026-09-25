"use client";

import { TruckChip } from "@/components/ui/Chip";
import { MapPinned, Timer, Truck } from "lucide-react";
import { CityMap } from "@/components/map/CityMap";
import { PageHead, Panel } from "@/components/ui/Panel";
import { fmtDate } from "@/lib/format";
import { etaMin, formatCoord, truckPos } from "@/lib/geo";
import { useT } from "@/lib/i18n";
import { companyById } from "@/lib/reference/companies";
import { clientById, truckState, trucksOf } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

/** Live fleet view from the client's side, with their gate pinned. */
export function ClientTrack() {
  const s = useAppState();
  const { t } = useT();
  const client = clientById(s, s.clientId);
  if (!client) return null;

  const company = companyById(client.company);
  const fleet = trucksOf(s, client.company);

  return (
    <>
      <PageHead title={t("Track your collector")} icon={MapPinned}>
        {t("Live positions of {company} trucks. Your gate is marked in yellow.", {
          company: company.name,
        })}
      </PageHead>

      <div className="grid g-main">
        <div>
          <CityMap companyId={client.company} homeClientId={client.id} showClients={false} />
        </div>
        <Panel title={t("{company} fleet", { company: company.name })} icon={Truck}>
          <div className="list">
            {fleet.map((tr) => {
              const st = truckState(tr);
              const p = truckPos(tr);
              const serves = tr.route.includes(client.estate);
              return (
                <div className="li" key={tr.id}>
                  <div>
                    <div className="t mono">{tr.id}</div>
                    <div className="sub">
                      {tr.driver}
                      {serves ? ` · ${t("serves your estate")}` : ""}
                    </div>
                    <div className="sub mono">
                      {tr.status === "offline"
                        ? t("Last seen {when}", { when: fmtDate(tr.lastSeen!) })
                        : formatCoord(p)}
                    </div>
                    {tr.status !== "offline" && tr.sharing && (
                      <div className="sub eta">
                        <Timer size={13} strokeWidth={2.2} aria-hidden="true" />
                        {t("≈ {n} min away", { n: etaMin(tr, client) })}
                      </div>
                    )}
                  </div>
                  <TruckChip state={st} />
                </div>
              );
            })}
          </div>
          <p className="hint">
            {t(
              "Positions update from the driver’s phone, or follow the planned route when GPS isn’t shared.",
            )}
          </p>
        </Panel>
      </div>
    </>
  );
}
