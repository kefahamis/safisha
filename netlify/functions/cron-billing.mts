import type { Config } from "@netlify/functions";
import { triggerCron } from "../lib/cron.mts";

/** Monthly charges and payment reminders, daily at 08:00 Nairobi time. */
const billing = () => triggerCron("billing");
export default billing;

export const config: Config = { schedule: "0 5 * * *" };
