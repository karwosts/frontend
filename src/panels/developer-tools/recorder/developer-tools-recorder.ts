import "@material/mwc-button/mwc-button";
import { mdiBroom, mdiBookOff, mdiCancel, mdiFileQuestion } from "@mdi/js";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { CSSResultGroup, html, nothing, LitElement, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { LocalizeFunc } from "../../../common/translations/localize";
import { computeStateName } from "../../../common/entity/compute_state_name";
import "../../../components/data-table/ha-data-table";
import "../../../components/ha-svg-icon";
import "../../../components/ha-icon-button";
import type { DataTableColumnContainer } from "../../../components/data-table/ha-data-table";
import { subscribeEntityRegistry } from "../../../data/entity_registry";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import { HomeAssistant } from "../../../types";
import {
  getRecordedExcludedEntities,
  purgeEntity,
} from "../../../data/recorder";
import { formatDuration } from "../../../common/datetime/duration";
import "@lrnwebcomponents/simple-tooltip/simple-tooltip";
import { subscribeHistory, HistoryStates } from "../../../data/history";

enum StatusType {
  Normal = 1,
  Excluded,
  Disabled,
  Orphan,
}

type RecorderData = {
  displayName: string;
  entity_id: string;
  records: number;
  interval?: number | undefined;
  status: StatusType;
};

@customElement("developer-tools-recorder")
class HaPanelDevRecorder extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _isLoading = true;

  @state() private _data: RecorderData[] = [] as RecorderData[];

  @state() private _disabledEntities: Set<string> | undefined;

  @state() private _history: HistoryStates | undefined;

  @state() private _recordedIds: string[] | undefined;

  @state() private _excludedIds: string[] | undefined;

  private _subscribed?: Promise<UnsubscribeFunc>;

  private async _load() {
    const { recorded_ids: recordedIds, excluded_ids: excludedIds } =
      await getRecordedExcludedEntities(this.hass);

    this._recordedIds = recordedIds;
    this._excludedIds = excludedIds;

    this._subscribed = subscribeHistory(
      this.hass,
      (history) => {
        this._history = history;
        this._unsubscribeHistory();
      },
      new Date(0),
      new Date(),
      recordedIds
    );
    this._subscribed.catch(() => {
      this._unsubscribeHistory();
    });
  }

  protected updated(changedProps: PropertyValues) {
    if (
      (changedProps.has("_history") ||
        changedProps.has("_disabledEntities") ||
        changedProps.has("_recordedIds") ||
        changedProps.has("_excludedIds") ||
        changedProps.has("narrow")) &&
      this._history &&
      this._recordedIds &&
      this._excludedIds &&
      this._disabledEntities
    ) {
      this.parseHistory();
      this._isLoading = false;
    }
  }

  private parseHistory() {
    const nowSeconds = new Date().getTime() / 1000;
    this._data = [
      ...this._recordedIds!.map((id) => {
        const records = this._history![id]?.length || 0;
        return {
          entity_id: id,
          records,
          interval: records
            ? (nowSeconds - this._history![id]![0].lu) / records
            : undefined,
          displayName:
            (this.hass.states[id] && computeStateName(this.hass.states[id])) ||
            "",
          status: this._disabledEntities!.has(id)
            ? StatusType.Disabled
            : this.hass.states[id]
              ? StatusType.Normal
              : StatusType.Orphan,
        };
      }),
      ...this._excludedIds!.map((id) => ({
        entity_id: id,
        records: 0,
        displayName:
          (this.hass.states[id] && computeStateName(this.hass.states[id])) ||
          "",
        status: this._disabledEntities!.has(id)
          ? StatusType.Disabled
          : this.hass.states[id]
            ? StatusType.Excluded
            : StatusType.Orphan,
      })),
    ];
  }

  private _unsubscribeHistory() {
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.());
      this._subscribed = undefined;
    }
  }

  protected firstUpdated() {
    this._load();
  }

  private _columns = memoizeOne(
    (
      localize: LocalizeFunc,
      narrow: boolean
    ): DataTableColumnContainer<RecorderData> => ({
      displayName: {
        title: localize(
          "ui.panel.developer-tools.tabs.recorder.data_table.name"
        ),
        sortable: true,
        filterable: true,
        hidden: narrow,
        grows: true,
      },
      entity_id: {
        title: localize(
          "ui.panel.developer-tools.tabs.recorder.data_table.entity_id"
        ),
        sortable: true,
        filterable: true,
        grows: narrow,
        width: "30%",
      },
      records: {
        title: localize(
          "ui.panel.developer-tools.tabs.recorder.data_table.records"
        ),
        sortable: true,
        filterable: false,
        width: "15%",
      },
      interval: {
        title: "Update Frequency",
        sortable: true,
        filterable: false,
        hidden: narrow,
        width: "15%",
        template: (entity) =>
          entity.interval != null
            ? html`${formatDuration(entity.interval.toString(), "s")}`
            : html`-`,
      },
      status: {
        title: "Status",
        sortable: true,
        filterable: false,
        type: "icon-button",
        template: (entity) =>
          entity.status === StatusType.Orphan
            ? html`<ha-svg-icon
                  style="margin-left: 12px; margin-right: 12px"
                  .path=${mdiFileQuestion}
                ></ha-svg-icon>
                <simple-tooltip animation-delay="0" position="left">
                  Orphan Record</simple-tooltip
                >`
            : entity.status === StatusType.Disabled
              ? html`<ha-svg-icon
                    style="margin-left: 12px; margin-right: 12px"
                    .path=${mdiCancel}
                  ></ha-svg-icon>
                  <simple-tooltip animation-delay="0" position="left">
                    Entity Disabled</simple-tooltip
                  >`
              : entity.status === StatusType.Excluded
                ? html`<ha-svg-icon
                      style="margin-left: 12px; margin-right: 12px"
                      .path=${mdiBookOff}
                    ></ha-svg-icon>
                    <simple-tooltip animation-delay="0" position="left">
                      Recording Disabled</simple-tooltip
                    >`
                : nothing,
      },
      action: {
        title: "",
        filterable: false,
        type: "icon-button",
        template: (entity) => html`
          <ha-icon-button
            .label=${localize(
              "ui.panel.developer-tools.tabs.recorder.data_table.purge"
            )}
            .path=${mdiBroom}
            .entity=${entity}
            @click=${this._purgeEntity}
          ></ha-icon-button>
        `,
      },
    })
  );

  protected render() {
    return html`
      <ha-data-table
        .hass=${this.hass}
        .columns=${this._columns(this.hass.localize, this.narrow)}
        .data=${this._data}
        .noDataText=${this._isLoading
          ? this.hass.localize(
              "ui.panel.developer-tools.tabs.recorder.data_table.loading"
            )
          : undefined}
        id="entity_id"
        clickable
        @row-click=${this._rowClicked}
      ></ha-data-table>
    `;
  }

  private _rowClicked(ev) {
    const id = ev.detail.id;
    if (id in this.hass.states) {
      fireEvent(this, "hass-more-info", { entityId: id });
    }
  }

  private _purgeEntity = async (ev) => {
    ev.stopPropagation();
    const entityId = ev.currentTarget.entity.entity_id;
    if (entityId) {
      if (
        !(await showConfirmationDialog(this, {
          text: this.hass.localize(
            "ui.panel.developer-tools.tabs.recorder.data_table.confirm_purge",
            { entity: entityId }
          ),
          destructive: true,
        }))
      ) {
        return;
      }
      purgeEntity(this.hass, entityId);
    }
  };

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeEntityRegistry(this.hass.connection!, (entities) => {
        const disabledEntities = new Set<string>();
        for (const confEnt of entities) {
          if (!confEnt.disabled_by) {
            continue;
          }
          disabledEntities.add(confEnt.entity_id);
        }
        this._disabledEntities = disabledEntities;
      }),
    ];
  }

  static get styles(): CSSResultGroup {
    return haStyle;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "developer-tools-recorder": HaPanelDevRecorder;
  }
}
