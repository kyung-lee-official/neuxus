import { allModels } from "../model-providers/core/catalog.ts";

const CATALOG_CREATED_AT = "2026-01-10T12:00:00.000Z";

export type ModelListResponse = {
  data: Array<{
    type: "model";
    id: string;
    display_name: string;
    created_at: string;
  }>;
  has_more: false;
  first_id: string | null;
  last_id: string | null;
};

export abstract class Models {
  /** Text models clients may send to `POST /v1/messages`. */
  static list(): ModelListResponse {
    const data = allModels()
      .filter((model) => model.capabilities.text === true)
      .map((model) => ({
        type: "model" as const,
        id: model.identifier,
        display_name: model.displayName,
        created_at: CATALOG_CREATED_AT,
      }));
    return {
      data,
      has_more: false,
      first_id: data[0]?.id ?? null,
      last_id: data[data.length - 1]?.id ?? null,
    };
  }
}
