import { nextClientNumber, receiptNumber } from "./clientNumber";
import { MONTHS, pad, stamp } from "./format";
import { offsetPoint } from "./geo";
import { ESTATES } from "./reference/estates";
import { rng, SEED } from "./rng";
import type {
  AppState,
  Client,
  ClientType,
  Pickup,
  Ticket,
  Truck,
  Txn,
} from "./types";

type SeedRow = [company: string, estate: string, name: string, type: ClientType, plan: number];

const CLIENT_ROWS: SeedRow[] = [
  ["TS", "KIL", "Wanjiku Kamau", "Household", 600],
  ["TS", "LAV", "Brian Otieno", "Household", 600],
  ["TS", "KIL", "Kilele Apartments (Mgmt)", "Business", 6000],
  ["TS", "WES", "Amina Hassan", "Household", 600],
  ["TS", "KAR", "Peter Mwangi", "Household", 800],
  ["TS", "WES", "Riverside Grocers", "Business", 2500],
  ["KW", "RUA", "Faith Njeri", "Household", 500],
  ["KW", "KAS", "Kevin Mutua", "Household", 500],
  ["KW", "KAS", "Kasarani Heights Court", "Business", 8000],
  ["KW", "UMO", "Grace Achieng", "Household", 400],
  ["KW", "UMO", "Joseph Kiprono", "Household", 400],
  ["KW", "RUA", "Ruaka Fresh Butchery", "Business", 1800],
  ["MZ", "SOB", "Mercy Wambui", "Household", 500],
  ["MZ", "EMB", "Daniel Ochieng", "Household", 450],
  ["MZ", "EMB", "Embakasi Hardware Depot", "Business", 2200],
  ["MZ", "LAN", "Esther Chebet", "Household", 550],
  ["MZ", "LAN", "Samuel Kariuki", "Household", 550],
  ["MZ", "SOB", "Plainsview Shopping Arcade", "Business", 5000],
];

/** `d` and `speed` are metres: how far along the loop, and how far per second. */
const TRUCK_ROWS: Truck[] = [
  { id: "KDA 412X", company: "TS", driver: "John Kiprop", route: ["KIL", "LAV", "KAR", "KIL", "WES"], d: 900, speed: 110, status: "route", sharing: true },
  { id: "KCZ 118M", company: "TS", driver: "Mary Atieno", route: ["WES", "KIL"], d: 2600, speed: 90, status: "route", sharing: true },
  { id: "KDE 907T", company: "KW", driver: "Paul Njoroge", route: ["RUA", "KAS", "UMO"], d: 6000, speed: 105, status: "route", sharing: true },
  { id: "KBX 551P", company: "KW", driver: "Hassan Ali", route: ["UMO", "KAS"], d: 1300, speed: 85, status: "route", sharing: true },
  { id: "KDG 230Q", company: "MZ", driver: "Ruth Wairimu", route: ["SOB", "EMB", "LAN"], d: 4200, speed: 100, status: "route", sharing: true },
  { id: "KCR 774L", company: "MZ", driver: "Ibrahim Said", route: ["EMB", "SOB"], d: 0, speed: 85, status: "offline", sharing: false, lastSeen: "2026-09-24 17:42" },
];

/**
 * Builds the whole demo dataset from a fixed seed: clients with issued numbers,
 * three months of billing, the last collection per client, and a care inbox.
 */
export function createInitialState(): AppState {
  const rand = rng(SEED);
  const seq: Record<string, number> = {};

  const seededPhone = () =>
    "07" +
    String(Math.floor(rand() * 1e8))
      .padStart(8, "0")
      .replace(/(\d{2})(\d{3})(\d{3})/, "$1 $2 $3");

  const clients: Client[] = CLIENT_ROWS.map(([company, estate, name, type, plan]) => {
    const e = ESTATES[estate];
    const id = nextClientNumber(seq, company, estate, rand);
    const phone = seededPhone();
    const joined = `2025-${pad(1 + Math.floor(rand() * 12))}-${pad(1 + Math.floor(rand() * 27))}`;
    // Scatter each gate within the estate's own extent.
    const spread = e.radius * 0.62;
    const gate = offsetPoint(e, (rand() - 0.5) * 2 * spread, (rand() - 0.5) * 2 * spread);
    return {
      id,
      company,
      estate,
      name,
      type,
      plan,
      phone,
      joined,
      lat: gate.lat,
      lng: gate.lng,
    };
  });

  const trucks: Truck[] = TRUCK_ROWS.map((t) => ({ ...t, route: [...t.route] }));

  // Billing for Jul–Sep 2026: a monthly charge, and a payment most months.
  let txns: Txn[] = [];
  for (const c of clients) {
    for (const m of [7, 8, 9]) {
      txns.push({
        id: `INV-${c.id}-${m}`,
        client: c.id,
        date: `2026-${pad(m)}-01 00:05`,
        kind: "charge",
        amount: c.plan,
        desc: `Collection fee · ${MONTHS[m - 1]} 2026`,
      });
      const r = rand();
      if ((m === 9 && r < 0.38) || r < 0.1) continue;
      const amount = r < 0.2 ? Math.round(c.plan / 2 / 50) * 50 : c.plan;
      const day = m === 9 ? 2 + Math.floor(rand() * 20) : 2 + Math.floor(rand() * 12);
      const channel = rand() < 0.55 ? "STK Push" : "Paybill";
      txns.push({
        id: receiptNumber(rand),
        client: c.id,
        date: `2026-${pad(m)}-${pad(day)} ${pad(7 + Math.floor(rand() * 13))}:${pad(
          Math.floor(rand() * 60),
        )}`,
        kind: "payment",
        amount,
        channel,
        payer: c.phone,
        desc: `M-Pesa ${channel}`,
      });
    }
  }

  // The demo client always has something outstanding to pay.
  const demoClient = clients[0];
  txns = txns.filter(
    (t) => !(t.client === demoClient.id && t.kind === "payment" && t.date.startsWith("2026-09")),
  );

  // Last collection per client: the most recent scheduled day before 24 Sep.
  const pickups: Pickup[] = clients.map((c) => {
    const days = ESTATES[c.estate].days;
    const d = new Date(2026, 8, 24);
    while (!days.includes(d.getDay())) d.setDate(d.getDate() - 1);
    d.setHours(7 + Math.floor(rand() * 6), Math.floor(rand() * 60));
    const truck = trucks.find((t) => t.company === c.company && t.route.includes(c.estate));
    return { client: c.id, when: stamp(d), truck: truck ? truck.id : "—", status: "Collected" };
  });

  const byName = (name: string) => clients.find((c) => c.name === name)!.id;

  const tickets: Ticket[] = [
    {
      id: "T-1042",
      client: byName("Wanjiku Kamau"),
      company: "TS",
      cat: "Missed pickup",
      subject: "Truck did not come on Monday",
      status: "Open",
      msgs: [
        { from: "client", text: "Hi, the truck skipped our gate on Monday. Bins are full.", at: "2026-09-23 08:12" },
        { from: "agent", text: "Sorry about that, Wanjiku. Our crew reported the gate locked at 7:40. We have added you to Thursday’s priority list.", at: "2026-09-23 09:05" },
        { from: "client", text: "Thanks. The askari will open by 7am.", at: "2026-09-23 09:20" },
      ],
    },
    {
      id: "T-1043",
      client: byName("Kevin Mutua"),
      company: "KW",
      cat: "Billing",
      subject: "Paid twice in August",
      status: "Pending",
      msgs: [
        { from: "client", text: "I think I paid August twice by Paybill. Can it go to September?", at: "2026-09-19 18:40" },
        { from: "agent", text: "Checking with finance. We will confirm within 48 hours.", at: "2026-09-20 08:15" },
      ],
    },
    {
      id: "T-1044",
      client: byName("Mercy Wambui"),
      company: "MZ",
      cat: "Bin request",
      subject: "Need a second 120L bin",
      status: "Resolved",
      msgs: [
        { from: "client", text: "Can I get an extra bin for recyclables?", at: "2026-09-15 12:02" },
        { from: "agent", text: "Delivered on 17 Sep with the green lid. No extra charge.", at: "2026-09-17 15:30" },
      ],
    },
    {
      id: "T-1045",
      client: byName("Brian Otieno"),
      company: "TS",
      cat: "Schedule",
      subject: "Saturday collection?",
      status: "Open",
      msgs: [
        { from: "client", text: "Is there an option for Saturday collection in Lavington?", at: "2026-09-24 20:11" },
      ],
    },
  ];

  const stops: AppState["stops"] = {};
  for (const t of trucks) stops[t.id] = {};

  return {
    companyId: "TS",
    clientId: demoClient.id,
    truckId: "KDA 412X",
    q: "",
    estateFilter: "",
    stmtPeriod: "all",
    stmtClient: null,
    selTicket: null,
    seq,
    clients,
    trucks,
    txns,
    tickets,
    pickups,
    // One payment typed with a letter O instead of a zero, waiting to be matched.
    suspense: [
      {
        id: receiptNumber(rand),
        account: "TS-KIL-O1427",
        amount: 600,
        payer: "0722 118 904",
        date: "2026-09-22 19:03",
        company: "TS",
        reason: "Wrong format. Expected e.g. TS-KIL-01427",
      },
    ],
    stops,
    stk: null,
    elapsedMs: 0,
  };
}
