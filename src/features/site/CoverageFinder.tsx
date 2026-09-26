"use client";

import { CalendarDays, Headset, MapPin, Smartphone } from "lucide-react";
import { useState } from "react";

export interface CoverageEstate {
  code: string;
  name: string;
  days: string[];
  company: string;
  companyColor: string;
  paybill: string;
  care: string;
  hours: string;
}

/** "Which company collects on my street, and when?" — the estate picker. */
export function CoverageFinder({ estates }: { estates: CoverageEstate[] }) {
  const [code, setCode] = useState(estates[0]?.code ?? "");
  const e = estates.find((x) => x.code === code);

  return (
    <div className="s-finder">
      <div className="s-chips" role="radiogroup" aria-label="Estate">
        {estates.map((x) => (
          <button key={x.code} type="button" role="radio" aria-checked={x.code === code} className="s-chip" onClick={() => setCode(x.code)}>
            <span className="s-chip-dot" style={{ background: x.companyColor }} aria-hidden="true" />
            {x.name}
          </button>
        ))}
      </div>

      {e && (
        <div className="s-finder-card" aria-live="polite">
          <div className="s-finder-head">
            <MapPin size={20} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <div className="s-eyebrow light">Your estate</div>
              <h3>{e.name}</h3>
            </div>
          </div>
          <dl className="s-finder-facts">
            <div>
              <dt>
                <CalendarDays size={16} strokeWidth={2.2} aria-hidden="true" /> Collection days
              </dt>
              <dd>{e.days.join(" & ")}</dd>
            </div>
            <div>
              <dt>
                <span className="s-chip-dot" style={{ background: e.companyColor }} aria-hidden="true" /> Collected by
              </dt>
              <dd>{e.company}</dd>
            </div>
            <div>
              <dt>
                <Smartphone size={16} strokeWidth={2.2} aria-hidden="true" /> M-Pesa Paybill
              </dt>
              <dd className="mono">{e.paybill}</dd>
            </div>
            <div>
              <dt>
                <Headset size={16} strokeWidth={2.2} aria-hidden="true" /> Care line
              </dt>
              <dd>
                <a href={`tel:${e.care.replace(/\s/g, "")}`}>{e.care}</a>
                <span> · {e.hours}</span>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
