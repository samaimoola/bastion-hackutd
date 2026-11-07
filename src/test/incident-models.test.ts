// MOCKED / pure tests: no database, no network. They check validation, row mapping and that
// database errors are translated to fixed messages. They do not prove the live database behaves.
import { describe, expect, it } from "vitest";
import {
  createIncidentInputSchema,
  getIncidentInputSchema,
  incidentFailure,
  toIncidentRecord,
  TITLE_MAX,
  DESCRIPTION_MAX,
} from "@/lib/incident-models";

const VALID_UUID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

describe("createIncidentInputSchema", () => {
  it("accepts a title alone and trims it", () => {
    expect(createIncidentInputSchema.parse({ title: "  Ransomware on FS-01  " })).toEqual({
      title: "Ransomware on FS-01",
    });
  });

  it("accepts every optional field with database enum values", () => {
    const input = {
      title: "T",
      description: "d",
      severity: "Critical",
      stage: "Post-incident",
    } as const;
    expect(createIncidentInputSchema.parse(input)).toEqual(input);
  });

  it.each([
    ["missing title", {}],
    ["empty title", { title: "" }],
    ["whitespace-only title", { title: "   \n\t " }],
    ["non-string title", { title: 42 }],
    ["title over the limit", { title: "x".repeat(TITLE_MAX + 1) }],
    ["description over the limit", { title: "T", description: "x".repeat(DESCRIPTION_MAX + 1) }],
    ["unknown severity", { title: "T", severity: "Urgent" }],
    ["lowercase severity", { title: "T", severity: "critical" }],
    ["unknown stage", { title: "T", stage: "Investigation" }],
    ["database column name instead of stage", { title: "T", response_stage: "Detection" }],
    ["caller-supplied creator", { title: "T", creator_id: VALID_UUID }],
    ["caller-supplied id", { title: "T", id: VALID_UUID }],
    ["null", null],
    ["a string", "Ransomware"],
  ])("rejects %s", (_label, input) => {
    expect(() => createIncidentInputSchema.parse(input)).toThrow();
  });

  it("accepts a title exactly at the limit", () => {
    expect(() => createIncidentInputSchema.parse({ title: "x".repeat(TITLE_MAX) })).not.toThrow();
  });
});

describe("getIncidentInputSchema", () => {
  it("accepts a UUID", () => {
    expect(getIncidentInputSchema.parse({ id: VALID_UUID })).toEqual({ id: VALID_UUID });
  });

  it.each([
    ["missing id", {}],
    ["empty id", { id: "" }],
    ["non-UUID id", { id: "INC-2026-0412" }],
    ["SQL-looking id", { id: "1 OR 1=1" }],
    ["number", { id: 1 }],
    ["extra key", { id: VALID_UUID, creator_id: VALID_UUID }],
  ])("rejects %s", (_label, input) => {
    expect(() => getIncidentInputSchema.parse(input)).toThrow();
  });
});

describe("toIncidentRecord", () => {
  it("maps database columns to the UI incident field names and drops everything else", () => {
    const row = {
      id: VALID_UUID,
      title: "T",
      description: "Summary",
      severity: "High",
      response_stage: "Containment",
      created_at: "2026-11-07T06:42:00Z",
      updated_at: "2026-11-07T18:55:00Z",
      // Present on a real row but never selected or returned.
      creator_id: "00000000-0000-4000-8000-000000000000",
    } as const;
    const record = toIncidentRecord(row);
    expect(record).toEqual({
      id: VALID_UUID,
      title: "T",
      severity: "High",
      stage: "Containment",
      declaredAt: "2026-11-07T06:42:00Z",
      lastUpdate: "2026-11-07T18:55:00Z",
      summary: "Summary",
    });
    expect(record).not.toHaveProperty("creator_id");
    expect(record).not.toHaveProperty("commanderId");
  });
});

describe("incidentFailure (database error handling)", () => {
  const LEAKS = [
    'relation "public.incidents" does not exist',
    "new row violates row-level security policy for table incidents",
    "duplicate key value violates unique constraint incidents_pkey",
    "SELECT * FROM public.incidents WHERE secret = 'hunter2'",
    "eyJhbGciOi.fake.token",
  ];

  it.each([
    ["42501", "create", "You do not have permission to do that."],
    ["PGRST301", "list", "Your session expired. Sign in again."],
    ["PGRST303", "load", "Your session expired. Sign in again."],
    ["22023", "create", "The incident details are not valid."],
    ["22P02", "load", "The incident details are not valid."],
    ["23505", "create", "The incident could not be created. Please try again."],
    ["XX000", "list", "Incidents could not be loaded. Please try again."],
    ["08006", "load", "The incident could not be loaded. Please try again."],
  ] as const)("maps code %s for %s to a fixed message", (code, action, message) => {
    expect(incidentFailure({ code }, action).message).toBe(message);
  });

  it("uses the generic message when the error has no code", () => {
    expect(incidentFailure({}, "create").message).toBe(
      "The incident could not be created. Please try again.",
    );
  });

  it("never copies database message, details, hint or code into the result", () => {
    for (const code of ["42501", "PGRST301", "22023", "23505", "XX000", undefined]) {
      for (const leak of LEAKS) {
        const dbError = {
          ...(code ? { code } : {}),
          message: leak,
          details: leak,
          hint: leak,
        };
        for (const action of ["create", "list", "load"] as const) {
          const result = incidentFailure(dbError, action);
          expect(result).toBeInstanceOf(Error);
          expect(result.message).not.toContain(leak);
          expect(result.message).not.toMatch(/relation|row-level|constraint|SELECT|eyJ|hunter2/i);
          if (code) expect(result.message).not.toContain(code);
        }
      }
    }
  });
});
