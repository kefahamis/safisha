import type { Config } from "@netlify/functions";
import { triggerCron } from "../lib/cron.mts";

/** Nightly backup, photo moves and rate-limit clean-up, at 02:30 Nairobi time. */
const maintenance = () => triggerCron("maintenance");
export default maintenance;

export const config: Config = { schedule: "30 23 * * *" };
