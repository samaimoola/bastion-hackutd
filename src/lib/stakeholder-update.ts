import type { IncidentRecord } from "./incident-models";

/** A stakeholder snapshot is a saved incident record, not an approved announcement. */
export function latestStakeholderRecord(incidents: readonly IncidentRecord[]) {
  return incidents.reduce<IncidentRecord | null>((latest, incident) => {
    const time = Date.parse(incident.lastUpdate);
    if (!Number.isFinite(time)) return latest;
    if (!latest || time > Date.parse(latest.lastUpdate)) return incident;
    return latest;
  }, null);
}
