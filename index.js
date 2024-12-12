import cron, { schedule } from "node-cron";
import { fork } from "child_process";

const crone = "0-59/5 * * * *";

cron.schedule(crone, () => fork("task.js"));