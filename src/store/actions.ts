import type { Command, CommandResult, StopProofInput } from "@/lib/commands";
import type { AppData, ClientType, DumpReport, PickupRequestStatus, StatementPeriod, StopStatus, TicketStatus, Txn } from "@/lib/types";
import type { AppStore } from "./appStore";
import { enqueue, isNetworkError, list, QUEUEABLE, remove } from "./outbox";

export interface NewClientInput {
  name: string;
  phone: string;
  estate: string;
  type: ClientType;
  plan: number;
}

export interface C2BInput {
  account: string;
  amount: number;
  phone: string;
}

export type ActionResult<T extends object = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Proof captured at a stop; the photo is a Blob so it can wait offline. */
export interface StopProofDraft extends Omit<StopProofInput, "photo"> {
  photo?: Blob;
}

/* ---------------- transport ---------------- */

async function postCommand(cmd: Command): Promise<{ result: CommandResult; snapshot?: AppData }> {
  const res = await fetch("/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    return { result: { ok: false, error: "Your session ended. Sign in again." } };
  }
  const body = await res.json().catch(() => ({}));
  if (body.result) return body;
  return { result: { ok: false, error: body.error ?? `Something went wrong (HTTP ${res.status}).` } };
}

/** Uploads a photo, downsized in the browser first. Returns the file id. */
export async function uploadPhoto(blob: Blob): Promise<string> {
  const small = await downsize(blob);
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "content-type": small.type || "image/jpeg" },
    body: small,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) throw new Error(body.error ?? "Photo upload failed.");
  return body.id as string;
}

/** Phone photos are several megabytes; 1600px JPEG is plenty as evidence. */
async function downsize(blob: Blob, max = 1600): Promise<Blob> {
  if (!blob.type.startsWith("image/")) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.size < 900_000) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.82));
  } catch {
    return blob;
  }
}

export function createActions(store: AppStore) {
  const { update, getState, receive } = store;

  /** Sends a command; on success the store takes the fresh snapshot. */
  async function send(cmd: Command, photo?: Blob): Promise<CommandResult> {
    try {
      let full = cmd;
      if (photo && cmd.type === "route.mark") {
        full = { ...cmd, proof: { ...cmd.proof, photo: await uploadPhoto(photo) } };
      }
      const { result, snapshot } = await postCommand(full);
      if (snapshot) receive(snapshot);
      update((s) => {
        s.online = true;
      });
      return result;
    } catch (err) {
      if (isNetworkError(err) && QUEUEABLE.has(cmd.type)) {
        await enqueue({ cmd, photo, at: Date.now() });
        applyLocally(cmd);
        update((s) => {
          s.online = false;
          s.pending += 1;
        });
        return { ok: true, message: "Saved offline. It will sync when you're back online." };
      }
      update((s) => {
        s.online = !isNetworkError(err);
      });
      return { ok: false, error: isNetworkError(err) ? "You're offline. Try again when connected." : "Something went wrong." };
    }
  }

  /** Mirrors a queued command in the UI until the server confirms it. */
  function applyLocally(cmd: Command) {
    update((s) => {
      if (cmd.type === "route.mark") {
        (s.stops[cmd.truck] ??= {})[cmd.client] = cmd.status;
        s.proofs[`${cmd.truck}|${cmd.client}`] = {
          status: cmd.status,
          at: "pending sync",
          weightKg: cmd.proof?.weightKg,
          stream: cmd.proof?.stream,
        };
      } else if (cmd.type === "route.undo") {
        delete s.stops[cmd.truck]?.[cmd.client];
        delete s.proofs[`${cmd.truck}|${cmd.client}`];
      } else if (cmd.type === "fleet.setSharing") {
        const t = s.trucks.find((x) => x.id === cmd.truck);
        if (t) t.sharing = cmd.sharing;
      }
    });
  }

  let flushing = false;
  /** Replays queued commands in order; stops at the first network failure. */
  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      const items = await list();
      for (const item of items) {
        try {
          let cmd = item.cmd;
          if (item.photo && cmd.type === "route.mark") {
            cmd = { ...cmd, proof: { ...cmd.proof, photo: await uploadPhoto(item.photo) } };
          }
          const { snapshot } = await postCommand(cmd);
          if (snapshot) receive(snapshot);
          await remove(item.key!);
        } catch (err) {
          if (isNetworkError(err)) break;
          await remove(item.key!); // a server rejection won't succeed on retry
        }
      }
      const left = (await list()).length;
      update((s) => {
        s.pending = left;
        s.online = left === 0 || s.online;
      });
    } finally {
      flushing = false;
    }
  }

  async function refresh() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        receive(await res.json());
        update((s) => {
          s.online = true;
        });
      }
    } catch {
      update((s) => {
        s.online = false;
      });
    }
  }

  /* ---------------- STK Push ---------------- */

  let polling: number | undefined;
  function pollStk(id: string) {
    window.clearTimeout(polling);
    const tick = async () => {
      if (getState().stk?.requestId !== id) return;
      try {
        const res = await fetch(`/api/pay/requests/${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = await res.json();
        if (body.status === "success") {
          await refresh();
          update((s) => {
            if (!s.stk || s.stk.requestId !== id) return;
            const txn: Txn | undefined = s.txns.find((x) => x.id === body.receipt);
            s.stk.txn = txn ?? {
              id: body.receipt,
              client: s.stk.client,
              date: "",
              kind: "payment",
              amount: body.amount,
              desc: "M-Pesa STK Push",
            };
            s.stk.step = "done";
          });
          return;
        }
        if (body.status === "failed") {
          update((s) => {
            if (!s.stk || s.stk.requestId !== id) return;
            s.stk.step = "declined";
            s.stk.error = body.resultDesc;
          });
          return;
        }
      } catch {
        /* keep polling through blips */
      }
      polling = window.setTimeout(tick, 2000);
    };
    polling = window.setTimeout(tick, 1500);
  }

  return {
    refresh,
    flush,

    /* ---- context switching (view-local) ---- */

    selectClient(id: string) {
      update((s) => {
        s.clientId = id;
        s.selTicket = null;
      });
    },

    selectCompany(id: string) {
      update((s) => {
        s.companyId = id;
        s.selTicket = null;
        s.estateFilter = "";
      });
    },

    selectTruck(id: string) {
      update((s) => {
        s.truckId = id;
      });
    },

    /** Opening a client from the admin database drops into that company's view. */
    focusClient(id: string) {
      update((s) => {
        const c = s.clients.find((x) => x.id === id);
        if (c) s.companyId = c.company;
        s.stmtClient = id;
      });
    },

    setQuery(q: string) {
      update((s) => {
        s.q = q;
      });
    },

    setEstateFilter(estate: string) {
      update((s) => {
        s.estateFilter = estate;
      });
    },

    setPeriod(period: StatementPeriod) {
      update((s) => {
        s.stmtPeriod = period;
      });
    },

    setStatementClient(id: string) {
      update((s) => {
        s.stmtClient = id;
      });
    },

    selectTicket(id: string | null) {
      update((s) => {
        s.selTicket = id;
      });
    },

    resetFilters() {
      update((s) => {
        s.q = "";
        s.estateFilter = "";
        s.selTicket = null;
      });
    },

    /* ---- live fleet ---- */

    /** One second of simulated driving, so trucks move smoothly between syncs. */
    tick() {
      update((s) => {
        s.elapsedMs += 1000;
        for (const t of s.trucks) {
          if (t.status !== "offline" && t.sharing) t.d += t.speed;
        }
      });
    },

    setSharing: (truck: string, sharing: boolean) => send({ type: "fleet.setSharing", truck, sharing }),

    gpsPing: (truck: string, lat: number, lng: number) => send({ type: "fleet.gps", truck, lat, lng }),

    /* ---- route sheet ---- */

    markStop(truck: string, client: string, status: StopStatus, proof: StopProofDraft = {}) {
      const { photo, ...rest } = proof;
      return send({ type: "route.mark", truck, client, status, proof: rest }, photo);
    },

    undoStop: (truck: string, client: string) => send({ type: "route.undo", truck, client }),

    optimiseRoute: (truck: string) => send({ type: "route.optimise", truck }),

    /* ---- customer care ---- */

    reply: (ticket: string, from: "client" | "agent", text: string) =>
      send({ type: "ticket.reply", ticket, from, text }),

    setTicketStatus: (ticket: string, status: TicketStatus) => send({ type: "ticket.status", ticket, status }),

    async createTicket(client: string, cat: string, subject: string, message: string) {
      const result = await send({ type: "ticket.create", client, cat, subject, message });
      if (result.ok && result.id) {
        update((s) => {
          s.selTicket = result.id!;
        });
      }
      return result;
    },

    /* ---- clients ---- */

    async addClient(company: string, input: NewClientInput): Promise<ActionResult<{ id: string; name: string }>> {
      const result = await send({
        type: "client.add",
        company,
        name: input.name,
        phone: input.phone,
        estate: input.estate,
        clientType: input.type,
        plan: input.plan,
      });
      if (!result.ok) return result;
      update((s) => {
        s.q = "";
      });
      return { ok: true, id: result.id!, name: result.message ?? input.name };
    },

    /* ---- M-Pesa ---- */

    openStk(clientId: string, opts: { amount?: number; purpose?: string } = {}) {
      update((s) => {
        const c = s.clients.find((x) => x.id === clientId);
        if (!c) return;
        const bal = s.txns
          .filter((t) => t.client === c.id)
          .reduce((b, t) => b + (t.kind === "charge" ? t.amount : -t.amount), 0);
        s.stk = {
          step: "form",
          client: c.id,
          phone: c.phone,
          amount: opts.amount ?? Math.max(bal, c.plan),
          purpose: opts.purpose ?? "account",
          mode: s.integrations.mpesa[c.company]?.mode ?? "simulated",
        };
      });
    },

    closeStk() {
      window.clearTimeout(polling);
      update((s) => {
        s.stk = null;
      });
    },

    /** Sends the payment prompt: to the simulated handset, or to the real phone. */
    async submitStk(phone: string, amount: number): Promise<ActionResult> {
      const stk = getState().stk;
      if (!stk) return { ok: false, error: "No payment in progress." };
      const result = await send({ type: "stk.start", client: stk.client, phone, amount, purpose: stk.purpose });
      if (!result.ok) return result;
      update((s) => {
        if (!s.stk) return;
        s.stk.phone = phone;
        s.stk.amount = Math.round(amount);
        s.stk.requestId = result.id;
        s.stk.mode = result.mode;
        // Live: the real phone shows the prompt. Simulated: we draw the handset.
        s.stk.step = result.mode === "live" ? "wait" : "phone";
      });
      if (result.mode === "live" && result.id) pollStk(result.id);
      return { ok: true };
    },

    /** The simulated handset's Approve / Cancel. */
    async simulateStk(approve: boolean) {
      const id = getState().stk?.requestId;
      if (!id) return;
      update((s) => {
        if (s.stk) s.stk.step = "wait";
      });
      await send({ type: "stk.simulate", request: id, approve });
      pollStk(id);
    },

    async payC2B(company: string, input: C2BInput) {
      return send({ type: "c2b.simulate", company, ...input });
    },

    assignSuspense: (id: string, client: string) => send({ type: "suspense.assign", id, client }),

    /* ---- on-demand pickups ---- */

    requestPickup: (input: { client: string; kind: string; notes: string; preferredDate: string; photo?: string }) =>
      send({ type: "pickup.request", ...input }),

    updatePickup: (
      id: string,
      patch: { status?: PickupRequestStatus; truck?: string | null; scheduledFor?: string | null },
    ) => send({ type: "pickup.update", id, ...patch }),

    /* ---- dumping ---- */

    reportDump: (input: { lat: number; lng: number; description: string; size: DumpReport["size"]; photo?: string }) =>
      send({ type: "dump.report", ...input }),

    updateDump: (id: string, status: DumpReport["status"], company?: string | null) =>
      send({ type: "dump.update", id, status, company }),

    setLang: (lang: "en" | "sw") => send({ type: "user.lang", lang }),
  };
}

export type AppActions = ReturnType<typeof createActions>;
