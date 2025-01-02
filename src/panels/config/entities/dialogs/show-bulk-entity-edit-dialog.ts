import { fireEvent } from "../../../../common/dom/fire_event";
import type { Helper } from "../../helpers/const";
import type { EntityRegistryEntry } from "../../../../data/entity_registry";

const loadDialog = () => import("./dialog-bulk-entity-edit");

export interface DialogBulkEntityEditParams {
  entityIds: string[];
  entities: EntityRegistryEntry[];
  helpers: Record<string, Helper[]>;
}

export const showBulkEntityEditDialog = (
  element: HTMLElement,
  detailParams: DialogBulkEntityEditParams
) =>
  new Promise(() => {
    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-bulk-entity-edit",
      dialogImport: loadDialog,
      dialogParams: detailParams,
    });
  });
