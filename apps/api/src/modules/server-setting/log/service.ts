import {
  adminLogSettings,
  type LogSettingsRow,
  purgeLogs,
  resetLogSettings,
  saveLogSettings,
} from "../../../shared/log/index.ts";
import type { LogSettingsModel } from "./model.ts";

export abstract class LogSettings {
  static async get() {
    return adminLogSettings();
  }

  static async put(body: LogSettingsModel["logBody"]) {
    const row: LogSettingsRow = {
      sinks: body.sinks,
      queueSize: body.queueSize,
      drainTimeoutMs: body.drainTimeoutMs,
      pretty: body.pretty,
    };
    await saveLogSettings(row);
    return adminLogSettings();
  }

  static async reset() {
    return resetLogSettings();
  }

  static async purge() {
    return purgeLogs();
  }
}
