"use client";

import { CityMap } from "@/components/map/CityMap";
import { Chip } from "@/components/ui/Chip";
import { PageHead, Panel } from "@/components/ui/Panel";
import { fmtDate } from "@/lib/format";
import { etaMin, formatCoord, truckPos } from "@/lib/geo";
import { companyById } from "@/lib/reference/companies";
import { clientById, truckState, trucksOf } from "@/lib/selectors";
import { useAppState } from "@/store/StoreProvider";

/** Live fleet view from the client's side, with their gate pinned. */
export function ClientTrack() {
  const s = useAppState();
  const client = clientById(s, s.clientId);
  if (!client) return null;

  const company = companyById(client.company);
  const fleet = trucksOf(s, client.company);

  return (
    <>
      <PageHead title="Track your collector">
        Live positions of {company.name} trucks. Your gate is marked in yellow.
      </PageHead>

      <div className="grid g-main">
        <div>
          <CityMap companyId={client.company} homeClientId={client.id} showClients={false} />
        </div>
        <Panel title={`${company.name} fleet`}>
          <div className="list">
            {fleet.map((t) => {
              const st = truckState(t);
              const p = truckPos(t);
              const serves = t.route.includes(client.estate);
              return (
                <div className="li" key={t.id}>
                  <div>
                    <div className="t mono">{t.id}</div>
                    <div className="sub">
                      {t.driver}
                      {serves ? " · serves your estate" : ""}
                    </div>
                    <div className="sub mono">
                      {t.status === "offline"
                        ? `Last seen ${fmtDate(t.lastSeen!)}`
                        : formatCoord(p)}
                    </div>
                    {t.status !== "offline" && t.sharing && (
                      <div className="sub" style={{ color: "var(--ok)", fontWeight: 600 }}>
                        ≈ {etaMin(t, client)} min away
                      </div>
                    )}
                  </div>
                  <Chip tone={st.cls}>{st.label}</Chip>
                </div>
              );
            })}
          </div>
          <p className="hint">
            Coordinates update every second from the driver’s phone (simulated here).
          </p>
        </Panel>
      </div>
    </>
  );
}
