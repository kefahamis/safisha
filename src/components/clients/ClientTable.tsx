"use client";

import { House, Search, SearchX, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BalanceChip, CompanyTag } from "@/components/ui/Chip";
import { PAGE_SIZES, Pagination } from "@/components/ui/Pagination";
import { group } from "@/lib/format";
import { estateName } from "@/lib/reference/estates";
import { balance } from "@/lib/selectors";
import type { Client } from "@/lib/types";
import { useActions, useAppState } from "@/store/StoreProvider";

/** Client register, a page at a time. Selecting a row opens that client's statement. */
export function ClientTable({
  clients,
  showCompany = false,
}: {
  clients: Client[];
  showCompany?: boolean;
}) {
  const s = useAppState();
  const actions = useActions();
  const router = useRouter();

  const q = s.q.trim().toLowerCase();
  const matches = clients.filter((c) => {
    const matchesQuery =
      !q || `${c.name} ${c.id} ${c.phone}`.toLowerCase().includes(q);
    const matchesEstate =
      showCompany || !s.estateFilter || c.estate === s.estateFilter;
    return matchesQuery && matchesEstate;
  });

  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  // A new search or estate starts back on page one.
  const filterKey = `${q}|${s.estateFilter}`;
  const [lastFilter, setLastFilter] = useState(filterKey);
  if (filterKey !== lastFilter) {
    setLastFilter(filterKey);
    setPage(1);
  }
  // Rows can vanish under us on a sync; never sit past the last page.
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages);
  const rows = matches.slice((current - 1) * pageSize, current * pageSize);

  const open = (id: string) => {
    actions.focusClient(id);
    router.push("/company/statements");
  };

  return (
    <>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Client no.</th>
              <th>Name</th>
              {showCompany ? <th>Company</th> : null}
              <th>Estate</th>
              {showCompany ? null : <th>Type</th>}
              <th>Phone</th>
              <th className="r">Fee</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="muted"
                  style={{ textAlign: "center", padding: 20 }}
                >
                  <span
                    className="with-ico"
                    style={{ justifyContent: "center" }}
                  >
                    <SearchX size={16} strokeWidth={2.2} aria-hidden="true" />
                    No clients match.
                  </span>
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr
                  key={c.id}
                  className="click"
                  tabIndex={0}
                  onClick={() => open(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(c.id);
                  }}
                >
                  <td className="mono">{c.id}</td>
                  <td>
                    <span className="li-main">
                      <span className="avatar sm" aria-hidden="true">
                        {c.type === "Business" ? (
                          <Store size={14} strokeWidth={2.2} />
                        ) : (
                          <House size={14} strokeWidth={2.2} />
                        )}
                      </span>
                      {c.name}
                    </span>
                  </td>
                  {showCompany ? (
                    <td>
                      <CompanyTag companyId={c.company} />
                    </td>
                  ) : null}
                  <td>{estateName(c.estate)}</td>
                  {showCompany ? null : <td>{c.type}</td>}
                  <td className="mono num">{c.phone}</td>
                  <td className="r">{group(c.plan)}</td>
                  <td>
                    <BalanceChip balance={balance(s, c.id)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {matches.length > PAGE_SIZES[0] && (
        <Pagination
          page={current}
          pageSize={pageSize}
          total={matches.length}
          noun="clients"
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </>
  );
}

/** Free-text search shared by the company and admin registers. */
export function ClientSearch({ id }: { id: string }) {
  const s = useAppState();
  const actions = useActions();
  return (
    <label className="search" style={{ flex: 1, minWidth: 180 }}>
      <Search size={16} strokeWidth={2.2} aria-hidden="true" />
      <input
        id={id}
        type="search"
        placeholder="Search name, number or phone"
        aria-label="Search clients"
        value={s.q}
        onChange={(e) => actions.setQuery(e.target.value)}
      />
    </label>
  );
}
