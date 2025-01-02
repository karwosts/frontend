import type { CSSResultGroup } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import { isHelperDomain } from "../../helpers/const";
import { createCloseHeading } from "../../../../components/ha-dialog";
import { HELPERS_CRUD } from "../../../../data/helpers_crud";
import "../../../../components/ha-button";
import "../../../../components/ha-expansion-panel";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import "../../../../components/ha-form/ha-form";
import { updateEntityRegistryEntry } from "../../../../data/entity_registry";
import { computeDomain } from "../../../../common/entity/compute_domain";
import type { SchemaUnion } from "../../../../components/ha-form/types";
import type { HomeAssistant } from "../../../../types";
import type { DialogBulkEntityEditParams } from "./show-bulk-entity-edit-dialog";
// import type { Helper, HelperDomain } from "../../helpers/const";

interface NamedEntity {
  entityId: string;
  uniqueId: string;
  currentName: string;
  registryName: string;
  originalName: string;
  newName?: string | null;
}

@customElement("dialog-bulk-entity-edit")
export class DialogBulkEntityEdit extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: DialogBulkEntityEditParams;

  private _entities: NamedEntity[] = [];

  @state() private _data;

  private _renamedCount = 0;

  public showDialog(params: DialogBulkEntityEditParams): void {
    this._params = params;
    this._data = {
      name_find: "",
      name_replace: "",
      name_reset: false,
    };
    this._entities = this._params.entityIds.map((entityId) => {
      const domain = computeDomain(entityId);
      let registryName;
      let originalName;
      const entityReg = this._params!.entities.find(
        (e) => e.entity_id === entityId
      );
      const uniqueId = entityReg!.unique_id;
      if (isHelperDomain(domain)) {
        const item = this._params!.helpers[domain]?.find(
          (helper) => helper.id === uniqueId
        );
        registryName = item!.name;
        originalName = entityReg!.original_name || uniqueId;
      } else {
        registryName = entityReg!.name;
        originalName = entityReg!.original_name;
      }
      const currentName =
        this.hass.states[entityId]?.attributes?.friendly_name ||
        registryName ||
        originalName ||
        entityId;
      return {
        entityId,
        currentName,
        registryName,
        originalName,
        uniqueId,
      };
    });
  }

  private _closeDialog(): void {
    this._data = undefined;
    this._entities = [];
    this._params = undefined;
    this._renamedCount = 0;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _schema = memoizeOne(
    () =>
      [
        {
          name: "name_find",
          selector: {
            text: {},
          },
        },
        {
          name: "name_replace",
          selector: {
            text: {},
          },
        },
        {
          name: "name_reset",
          required: false,
          selector: {
            boolean: {},
          },
        },
      ] as const
  );

  protected render() {
    if (!this._params) {
      return nothing;
    }

    return html`
      <ha-dialog
        open
        @closed=${this._closeDialog}
        .heading=${createCloseHeading(
          this.hass,
          this.hass.localize("ui.panel.config.entities.bulk_edit.title")
        )}
      >
        <ha-expansion-panel outlined expanded>
          <div slot="header" class="header">
            ${this.hass.localize(
              "ui.panel.config.entities.bulk_edit.update_names"
            )}
          </div>
          <ha-form
            .hass=${this.hass}
            .schema=${this._schema()}
            .data=${this._data}
            .computeLabel=${this._computeLabel}
            @value-changed=${this._valueChanged}
          ></ha-form>
          <ha-expansion-panel outlined>
            <div slot="header">
              ${this.hass.localize(
                "ui.panel.config.entities.bulk_edit.update_names_preview",
                {
                  renamed: this._renamedCount,
                  unchanged: this._entities.length - this._renamedCount,
                }
              )}
            </div>
            <table style="width: 100%; text-align: var(--float-start);">
              <tr>
                <th>
                  ${this.hass.localize(
                    "ui.panel.config.entities.bulk_edit.old_name"
                  )}
                </th>
                <th>
                  ${this.hass.localize(
                    "ui.panel.config.entities.bulk_edit.new_name"
                  )}
                </th>
              </tr>
              ${this._entities
                .filter((e) => "newName" in e)
                .map(
                  (e) =>
                    html`<tr>
                      <td>${e.currentName}</td>
                      <td><b>${e.newName ?? e.originalName}</b></td>
                    </tr>`
                )}
              ${this._entities
                .filter((e) => !("newName" in e))
                .map(
                  (e) =>
                    html`<tr>
                      <td>${e.currentName}</td>
                      <td><i>${e.currentName}</i></td>
                    </tr>`
                )}
            </table>
          </ha-expansion-panel>
        </ha-expansion-panel>
        <ha-button slot="primaryAction" @click=${this._submit}>
          ${this.hass.localize("ui.common.submit")}
        </ha-button>
      </ha-dialog>
    `;
  }

  private _valueChanged(ev: CustomEvent) {
    const value = { ...ev.detail.value };

    if (
      value.name_find !== this._data?.name_find ||
      value.name_replace !== this._data?.name_replace ||
      value.name_reset !== this._data?.name_reset
    ) {
      if (value.name_reset) {
        this._entities.forEach((e) => {
          if (isHelperDomain(computeDomain(e.entityId))) {
            if (e.registryName !== e.originalName) {
              e.newName = e.originalName;
            } else {
              delete e.newName;
            }
          } else if (e.registryName) {
            e.newName = null;
          } else {
            delete e.newName;
          }
        });
      } else if (value.name_find || value.name_replace) {
        this._entities.forEach((e) => {
          if (!value.name_find) {
            e.newName = value.name_replace.trim();
          } else if (e.currentName.includes(value.name_find)) {
            e.newName = e.currentName
              .replace(value.name_find, value.name_replace || "")
              .trim();
          } else {
            delete e.newName;
          }
        });
      } else {
        this._entities.forEach((e) => {
          delete e.newName;
        });
      }
    }

    this._renamedCount = this._entities.filter((e) => "newName" in e).length;

    this._data = value;
  }

  private _computeLabel = (
    entry: SchemaUnion<ReturnType<typeof this._schema>>
  ): string =>
    this.hass.localize(`ui.panel.config.entities.bulk_edit.${entry.name}`) ||
    entry.name;

  private _submit(): void {
    this._entities.forEach((e) => {
      if ("newName" in e) {
        const domain = computeDomain(e.entityId);
        if (isHelperDomain(domain)) {
          const item = this._params!.helpers[domain]?.find(
            (helper) => helper.id === e.uniqueId
          );
          if (item) {
            HELPERS_CRUD[domain].update(this.hass, e.uniqueId, {
              ...item,
              name: e.newName ?? e.originalName,
            } as any);
          }
        } else {
          updateEntityRegistryEntry(this.hass!, e.entityId, {
            name: e.newName,
          });
        }
      }
    });
    this._closeDialog();
  }

  static get styles(): CSSResultGroup {
    return [haStyle, haStyleDialog];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-bulk-entity-edit": DialogBulkEntityEdit;
  }
}
