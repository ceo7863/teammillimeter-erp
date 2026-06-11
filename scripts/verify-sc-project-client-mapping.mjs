import {
  autoMapScProjectsToClients,
  listClientScProjectIds,
} from "../server/scScheduleSync.mjs";

const projects = [
  { id: "proj-a", name: "Alpha Corp" },
  { id: "proj-b", name: "Beta LLC" },
  { id: "proj-c", name: "Gamma" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("=== SC project ? ERP client mapping verification ===");

// Legacy single scProjectId reads as one entry
const legacyClient = { id: 1, name: "Alpha", scProjectId: "proj-a", scProjectName: "Alpha Corp" };
assert(
  listClientScProjectIds(legacyClient).join(",") === "proj-a",
  "legacy scProjectId should migrate to listClientScProjectIds",
);

// Manual add second project to same client (simulated state after two mappings)
let clients = [
  {
    id: 10,
    name: "Shared Client",
    scProjectIds: ["proj-a"],
    scProjectMappings: [{ scProjectId: "proj-a", scProjectName: "Alpha Corp", manual: true }],
    scProjectMappingManual: true,
  },
  { id: 20, name: "Other", scProjectIds: ["proj-c"], scProjectMappings: [{ scProjectId: "proj-c", scProjectName: "Gamma" }] },
];

clients[0] = {
  ...clients[0],
  scProjectIds: ["proj-a", "proj-b"],
  scProjectMappings: [
    ...(clients[0].scProjectMappings || []),
    { scProjectId: "proj-b", scProjectName: "Beta LLC", manual: true },
  ],
};
assert(
  listClientScProjectIds(clients[0]).length === 2,
  "one ERP client should hold multiple SC project ids",
);

const mapped = autoMapScProjectsToClients(clients, projects);
const shared = mapped.clients.find((row) => row.id === 10);
assert(
  listClientScProjectIds(shared).includes("proj-a") && listClientScProjectIds(shared).includes("proj-b"),
  "sync should keep both projects on the same ERP client",
);

const other = mapped.clients.find((row) => row.id === 20);
assert(listClientScProjectIds(other).join(",") === "proj-c", "unrelated client mapping should remain");

// Duplicate project across clients: dedupe keeps one winner
const duped = autoMapScProjectsToClients(
  [
    { id: 1, name: "A", scProjectIds: ["proj-a"], scProjectMappingManual: true, scProjectMappingUpdatedAt: "2026-01-01T00:00:00.000Z" },
    { id: 2, name: "B", scProjectIds: ["proj-a"], scProjectMappingUpdatedAt: "2026-06-01T00:00:00.000Z" },
  ],
  projects,
);
const owners = duped.clients
  .filter((row) => listClientScProjectIds(row).includes("proj-a"))
  .map((row) => row.id);
assert(owners.length === 1, "each SC project should map to exactly one ERP client after dedupe");
assert(owners[0] === 1, "manual mapping should win dedupe over newer automatic mapping");

console.log("status: PASS");
