import {
  adminRetrieveSettings,
  type RetrieveSettingsRow,
  resetRetrieveSettings,
  saveRetrieveSettings,
} from "../../../shared/retrieve/index.ts";
import type { RetrieveSettingsModel } from "./model.ts";

export abstract class RetrieveSettings {
  static async get() {
    return adminRetrieveSettings();
  }

  static async put(body: RetrieveSettingsModel["retrieveBody"]) {
    const row: RetrieveSettingsRow = {
      childLimit: body.childLimit,
      maxParents: body.maxParents,
      maxCharacters: body.maxCharacters,
    };
    await saveRetrieveSettings(row);
    return adminRetrieveSettings();
  }

  static async reset() {
    return resetRetrieveSettings();
  }
}
