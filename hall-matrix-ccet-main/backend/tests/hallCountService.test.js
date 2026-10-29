const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const {
  analyzeHallCountQuery,
  isHallCountQuery,
  parseHallCountQuery
} = require("../utils/hallCountService");

let databases = [];

afterEach(async () => {
  await Promise.all(databases.map((db) => new Promise((resolve) => db.close(resolve))));
  databases = [];
});

function createTestDatabase() {
  const db = new sqlite3.Database(":memory:");
  databases.push(db);
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("CREATE TABLE halls (hall_no TEXT UNIQUE)", (error) => {
        if (error) return reject(error);
        db.run(
          `CREATE TABLE seat_allocations (
            regno TEXT,
            hall_no TEXT,
            exam_date TEXT,
            session TEXT
          )`,
          (schemaError) => {
            if (schemaError) return reject(schemaError);
            db.run(
              "INSERT INTO halls (hall_no) VALUES ('H101'), ('H102'), ('H103')",
              (hallError) => {
                if (hallError) return reject(hallError);
                db.run(
                  `INSERT INTO seat_allocations (regno, hall_no, exam_date, session) VALUES
                    ('S001', 'H101', '2026-10-25', 'AN'),
                    ('S001', 'H101', '2026-10-25', 'AN'),
                    ('S002', 'H101', '2026-10-25', 'AN'),
                    ('S001', 'H102', '2026-10-25', 'AN'),
                    ('S003', 'H102', '2026-10-25', 'AN'),
                    ('S004', 'H101', '2026-10-24', 'FN'),
                    ('S005', 'H102', '2026-10-24', 'FN')`,
                  (allocationError) => {
                    if (allocationError) return reject(allocationError);
                    resolve(db);
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}

function analyze(db, message) {
  return new Promise((resolve, reject) => {
    analyzeHallCountQuery(db, message, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

test("detects natural-language hall-count questions and normalizes IDs", () => {
  assert.equal(isHallCountQuery("Count in h101"), true);
  assert.equal(isHallCountQuery("How many students are allocated to hall H102?"), true);
  assert.deepEqual(
    parseHallCountQuery("Compare h101 and H102", [{ hall_no: "H101" }, { hall_no: "H102" }]).hallNos,
    ["H101", "H102"]
  );
  assert.equal(isHallCountQuery("Where is my hall?"), false);
});

test("counts distinct students in the latest allocation session and reports empty halls", async () => {
  const db = await createTestDatabase();

  const single = await analyze(db, "What is the count in h101?");
  assert.equal(single.hallCounts[0].studentCount, 2);
  assert.deepEqual(single.session, { exam_date: "2026-10-25", session: "AN" });

  const comparison = await analyze(db, "Compare H101, H102, and H103");
  assert.deepEqual(comparison.hallCounts.map(({ studentCount }) => studentCount), [2, 2, 0]);

  const emptyHall = await analyze(db, "Count in H103");
  assert.equal(emptyHall.hallCounts[0].studentCount, 0);

  const previousSession = await analyze(db, "Count in H101 FN");
  assert.equal(previousSession.hallCounts[0].studentCount, 1);
  assert.deepEqual(previousSession.session, { exam_date: "2026-10-24", session: "FN" });
});

test("reports missing halls, total distinct students, and the highest-count hall", async () => {
  const db = await createTestDatabase();

  const missing = await analyze(db, "What is the count in H999?");
  assert.equal(missing.reply, "I couldn't find examination hall H999. Please check the hall number and try again.");

  const total = await analyze(db, "Show the total number of students across all halls");
  assert.equal(total.totalStudents, 3);

  const highest = await analyze(db, "Which hall has the highest number of students?");
  assert.deepEqual(highest.hallCounts.map(({ hallNo }) => hallNo), ["H101", "H102"]);
});

test("surfaces database schema failures to the caller", async () => {
  const db = new sqlite3.Database(":memory:");
  databases.push(db);
  await assert.rejects(analyze(db, "Count in H101"), /no such table: halls/);
});
