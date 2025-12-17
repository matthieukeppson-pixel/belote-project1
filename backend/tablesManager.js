// tablesManager.js

// Nombre de sièges par table
const SEATS_PER_TABLE = 4;

// Stockage des tables :
// tables = { 1: { seats: [null, null, null, null] }, 2: {...}, ... }
let tables = {};
let nextTableId = 1;

/* =====================================================
   CREATE NEW TABLE
===================================================== */
export function createTable() {
  const id = nextTableId++;

  tables[id] = {
    id,
    seats: Array(SEATS_PER_TABLE).fill(null), // 4 sièges vides
    status: "empty", // empty / waiting / full / playing (plus tard)
  };

  return tables[id];
}

/* =====================================================
   GET ALL TABLES
===================================================== */
export function getTables() {
  return tables;
}

/* =====================================================
   ENSURE AT LEAST N TABLES EXIST
===================================================== */
export function ensureTables(minCount = 3) {
  while (Object.keys(tables).length < minCount) {
    createTable();
  }
}

/* =====================================================
   PLAYER JOINS A SEAT
===================================================== */
export function sitAtTable(tableId, pseudo) {
  const table = tables[tableId];
  if (!table) return { success: false, error: "Table inexistante" };

  // Vérifier si déjà assis
  if (table.seats.includes(pseudo)) {
    return { success: true, table };
  }

  // Chercher un siège libre
  const emptyIndex = table.seats.findIndex((s) => s === null);
  if (emptyIndex === -1) return { success: false, error: "Table pleine" };

  table.seats[emptyIndex] = pseudo;

  updateStatus(table);
  return { success: true, table };
}

/* =====================================================
   PLAYER LEAVES SEAT
===================================================== */
export function leaveTable(tableId, pseudo) {
  const table = tables[tableId];
  if (!table) return;

  const index = table.seats.findIndex((s) => s === pseudo);
  if (index !== -1) {
    table.seats[index] = null;
  }

  updateStatus(table);
}

/* =====================================================
   UPDATE TABLE STATUS
===================================================== */
function updateStatus(table) {
  const filled = table.seats.filter((s) => s !== null).length;

  if (filled === 0) table.status = "empty";
  else if (filled < SEATS_PER_TABLE) table.status = "waiting";
  else table.status = "full";
}






