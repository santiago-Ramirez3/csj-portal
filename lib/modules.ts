// Portal module definitions. Shared by server and client (no secrets here).
// Field names must match the NocoDB field titles exactly. Types and dropdown
// choices are NOT hard-coded: they are read live from NocoDB (see lib/schema.ts),
// so adding an option to a single select in NocoDB shows up in the portal.

export type Role = "Admin" | "Staff";

export interface FieldSpec {
  name: string; // NocoDB field title
  label?: string;
  grid?: boolean; // show as a column in the table view
  inline?: boolean; // editable directly in the table view
  form?: boolean; // shown in the create / edit form (default true)
  required?: boolean;
  width?: number; // grid column width (px)
  defaultValue?: unknown; // overrides the NocoDB default in the create form
}

export interface ParentSpec {
  key: string; // used in API payloads
  label: string;
  module: string; // module key of the parent (for the picker)
  linkField: string; // has-many field title on the PARENT table (created by n8n)
  required?: boolean;
  grid?: boolean; // show the linked parent as a grid column
  width?: number;
  // When a parent is selected, copy these parent fields into the child record
  copy?: Record<string, string>; // parentField -> childField
}

export interface ChildSpec {
  key: string;
  label: string;
  module: string; // child module key
  linkField: string; // has-many field title on THIS table
  columns: string[]; // child fields shown in the related list
  canAdd?: boolean; // show an inline "add" form in the drawer
  addFields?: string[];
  sort?: string; // NocoDB sort for the related list, e.g. "-Follow-up Date"
}

export interface ModuleSpec {
  key: string;
  title: string;
  singular: string;
  table: string; // NocoDB table title
  section: "Work" | "Admin";
  hidden?: boolean; // not in navigation (still usable as parent/child)
  writeRoles: Role[];
  displayField: string;
  searchFields: string[];
  statusField?: string; // single select used for the quick-filter chips
  dateFilterField?: string; // date field used for the from/to filter
  parentFilter?: string; // parent key that can be used as a filter (e.g. procedure)
  defaultSort: string;
  fields: FieldSpec[];
  parents?: ParentSpec[];
  children?: ChildSpec[];
}

const ALL: Role[] = ["Admin", "Staff"];
const ADMIN: Role[] = ["Admin"];

const patientParent = (linkField: string, copyLanguage = false): ParentSpec => ({
  key: "patient",
  label: "Patient",
  module: "patients",
  linkField,
  required: true,
  copy: {
    "Patient Name": "Patient Name",
    "Date of Birth": "Date of Birth",
    ...(copyLanguage ? { "Preferred Language": "Preferred Language" } : {}),
  },
});

export const MODULES: ModuleSpec[] = [
  {
    key: "verifications",
    title: "Verifications",
    singular: "Verification",
    table: "Verifications",
    section: "Work",
    writeRoles: ALL,
    displayField: "Patient Name",
    searchFields: ["Patient Name"],
    statusField: "Verification Status",
    dateFilterField: "DOS",
    defaultSort: "-Date Worked",
    parents: [patientParent("Verifications")],
    fields: [
      { name: "Patient Name", grid: true, width: 210, required: true },
      { name: "Date of Birth", grid: true, width: 120 },
      { name: "Insurance", grid: true, inline: true, width: 170 },
      { name: "Verification Status", grid: true, inline: true, width: 160 },
      { name: "Referral Obtained", grid: true, inline: true, width: 150 },
      { name: "Date Worked", grid: true, inline: true, width: 130 },
      { name: "DOS", label: "DOS", grid: true, inline: true, width: 130 },
      { name: "Notes", grid: true, inline: true, width: 260 },
    ],
  },
  {
    key: "authorizations",
    title: "Authorizations",
    singular: "Authorization",
    table: "Authorizations",
    section: "Work",
    writeRoles: ALL,
    displayField: "Patient Name",
    searchFields: ["Patient Name", "Insurance ID", "Auth / Ref #"],
    statusField: "Status",
    dateFilterField: "Date",
    defaultSort: "-Date",
    parents: [
      patientParent("Authorizations"),
      { key: "insurance", label: "Insurance", module: "insurances", linkField: "Authorizations", grid: true, width: 220 },
    ],
    children: [
      {
        key: "followups",
        label: "Follow-ups",
        module: "followups",
        linkField: "Follow-ups",
        columns: ["Follow-up Date", "Channel", "Summary", "Notes"],
        canAdd: true,
        addFields: ["Follow-up Date", "Channel", "Summary", "Notes"],
        sort: "-Follow-up Date",
      },
    ],
    fields: [
      { name: "Date", grid: true, width: 120 },
      { name: "Patient Name", grid: true, width: 200, required: true },
      { name: "Date of Birth", grid: true, width: 120 },
      { name: "Status", grid: true, inline: true, width: 160 },
      { name: "Channel", grid: true, inline: true, width: 120 },
      { name: "Insurance ID", grid: true, width: 150 },
      { name: "Procedure", grid: true, width: 170 },
      { name: "CPT Codes", grid: true, width: 200 },
      { name: "DX Codes", width: 120 },
      { name: "PT Resp", width: 120 },
      { name: "Date of Service", grid: true, inline: true, width: 130 },
      { name: "DOS TBD", label: "DOS TBD", grid: true, inline: true, width: 90 },
      { name: "Date Requested", width: 130 },
      { name: "Auth Valid From", width: 130 },
      { name: "Auth Valid To", grid: true, width: 130 },
      { name: "Decision Date", grid: true, inline: true, width: 130 },
      { name: "Auth / Ref #", grid: true, inline: true, width: 160 },
      { name: "Comments / Notes", grid: true, inline: true, width: 300 },
    ],
  },
  {
    key: "coordination",
    title: "Procedure Coordination",
    singular: "Coordination",
    table: "Procedure Coordination",
    section: "Work",
    writeRoles: ALL,
    displayField: "Patient Name",
    searchFields: ["Patient Name"],
    statusField: "Status",
    dateFilterField: "Date",
    parentFilter: "procedure",
    defaultSort: "-Date",
    parents: [
      patientParent("Procedure Coordinations", true),
      {
        key: "procedure",
        label: "Procedure",
        module: "procedures",
        linkField: "Procedure Coordinations",
        required: true,
        grid: true,
        width: 240,
      },
    ],
    fields: [
      { name: "Date", grid: true, width: 120 },
      { name: "Patient Name", grid: true, width: 200, required: true },
      { name: "Date of Birth", grid: true, width: 120 },
      { name: "Date of Service", grid: true, inline: true, width: 130 },
      { name: "Status", grid: true, inline: true, width: 150 },
      { name: "Clearance", grid: true, inline: true, width: 140 },
      { name: "Auth", grid: true, inline: true, width: 170 },
      { name: "Verification", grid: true, inline: true, width: 170 },
      { name: "Transportation", grid: true, inline: true, width: 140 },
      { name: "Pre Op Info Sent", label: "Pre-op Info Sent", grid: true, inline: true, width: 120 },
      { name: "Procedure Meds", grid: true, inline: true, width: 140 },
      { name: "Preferred Language", label: "Language", grid: true, inline: true, width: 120 },
    ],
  },
  {
    key: "patients",
    title: "Patients",
    singular: "Patient",
    table: "Patients",
    section: "Work",
    writeRoles: ALL,
    displayField: "Patient Name",
    searchFields: ["Patient Name"],
    defaultSort: "Patient Name",
    children: [
      {
        key: "verifications",
        label: "Verifications",
        module: "verifications",
        linkField: "Verifications",
        columns: ["DOS", "Insurance", "Verification Status", "Referral Obtained"],
        sort: "-DOS",
      },
      {
        key: "authorizations",
        label: "Authorizations",
        module: "authorizations",
        linkField: "Authorizations",
        columns: ["Date", "Procedure", "Date of Service", "Status"],
        sort: "-Date",
      },
      {
        key: "coordination",
        label: "Procedure Coordination",
        module: "coordination",
        linkField: "Procedure Coordinations",
        columns: ["Date", "Date of Service", "Status"],
        sort: "-Date",
      },
    ],
    fields: [
      { name: "Patient Name", label: "Patient Name (LAST, FIRST)", grid: true, width: 260, required: true },
      { name: "Date of Birth", grid: true, width: 130, required: true },
      { name: "Preferred Language", grid: true, inline: true, width: 150 },
      { name: "Notes", grid: true, inline: true, width: 360 },
    ],
  },
  {
    key: "followups",
    title: "Auth Follow-ups",
    singular: "Follow-up",
    table: "Auth Follow-ups",
    section: "Work",
    hidden: true,
    writeRoles: ALL,
    displayField: "Summary",
    searchFields: ["Summary"],
    defaultSort: "-Follow-up Date",
    fields: [
      { name: "Follow-up Date", grid: true, required: true },
      { name: "Channel", grid: true },
      { name: "Summary", grid: true, required: true },
      { name: "Notes", grid: true },
    ],
  },
  {
    key: "procedures",
    title: "Procedures",
    singular: "Procedure",
    table: "Procedures",
    section: "Admin",
    writeRoles: ADMIN,
    displayField: "Procedure Name",
    searchFields: ["Procedure Name"],
    statusField: "Category",
    defaultSort: "Id",
    fields: [
      { name: "Procedure Name", grid: true, width: 420, required: true },
      { name: "Category", grid: true, inline: true, width: 180 },
      { name: "Active", grid: true, inline: true, width: 90, defaultValue: true },
    ],
  },
  {
    key: "insurances",
    title: "Insurances",
    singular: "Insurance",
    table: "Insurances",
    section: "Admin",
    writeRoles: ADMIN,
    displayField: "Payer Name",
    searchFields: ["Payer Name", "Aliases"],
    statusField: "Short Name",
    defaultSort: "Payer Name",
    fields: [
      { name: "Payer Name", grid: true, width: 380, required: true },
      { name: "Short Name", grid: true, inline: true, width: 170 },
      { name: "Payer Type", grid: true, inline: true, width: 150 },
      { name: "Active", grid: true, inline: true, width: 90, defaultValue: true },
      { name: "Aliases", grid: true, width: 320 },
    ],
  },
];

export const USERS_TABLE = "Portal Users";

export function getModule(key: string): ModuleSpec | undefined {
  return MODULES.find((m) => m.key === key);
}

export function canWrite(mod: ModuleSpec, role: Role | undefined): boolean {
  return !!role && mod.writeRoles.includes(role);
}
