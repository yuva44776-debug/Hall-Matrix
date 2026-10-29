const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const {
  detectAllocationQueryIntent,
  formatAllocationResponse,
  getExamAllocationAnalytics
} = require("../utils/allocationAnalytics");

let databases = [];

afterEach(async () => {
  await Promise.all(databases.map((db) => new Promise((resolve) => db.close(resolve))));
  databases = [];
});

function createAllocationDatabase() {
  const db = new sqlite3.Database(":memory:");
  databases.push(db);
  return new Promise((resolve, reject) => {
    db.run(
      "CREATE TABLE seat_allocations (regno TEXT, hall_no TEXT, exam_date TEXT, session TEXT, subject_code TEXT, dept TEXT)",
      (error) => {
        if (error) return reject(error);
        db.run(
          `INSERT INTO seat_allocations VALUES
            ('S001', 'H101', '2026-10-25', 'FN', 'CS101', 'CSE'),
            ('S001', 'H102', '2026-10-25', 'FN', 'CS101', 'CSE'),
            ('S001', ' h101 ', '2026-10-25', 'AN', 'MA101', 'CSE'),
            (' s002 ', 'H101', '2026-10-25', 'AN', 'MA101', 'CSE'),
            ('', 'H101', '2026-10-25', 'AN', 'MA101', 'CSE'),
            ('S001', '   ', '2026-10-25', 'AN', 'MA101', 'CSE'),
            ('S003', 'H102', '2026-10-24', 'FN', 'CS101', 'CSE')`,
          (insertError) => {
            if (insertError) return reject(insertError);
            resolve(db);
          }
        );
      }
    );
  });
}

function readAnalytics(db, dates) {
  return new Promise((resolve, reject) => {
    getExamAllocationAnalytics(db, dates, (error, data) => {
      if (error) return reject(error);
      resolve(data);
    });
  });
}

test("recognizes the total exam students question wording", () => {
  assert.equal(
    detectAllocationQueryIntent("Totally how many students are writing exam today"),
    "today_students_count"
  );
});

test("counts distinct valid students across today's sessions and says today in the answer", async () => {
  const db = await createAllocationDatabase();
  const analytics = await readAnalytics(db, ["2026-10-25"]);
  const reply = formatAllocationResponse("today_students_count", analytics, true, "today");

  assert.equal(analytics.totalStudents, 2);
  assert.match(reply, /2/);
  assert.match(reply, /today/i);
});

test("does not include another date when counting today's exam students", async () => {
  const db = await createAllocationDatabase();
  const analytics = await readAnalytics(db, ["2026-10-25"]);

  assert.equal(analytics.totalStudents, 2);
});

test("recognizes today's allocated hall question and counts distinct normalized halls", async () => {
  assert.equal(
    detectAllocationQueryIntent("How many halls are allocated for today's exam"),
    "today_halls_count"
  );

  const db = await createAllocationDatabase();
  const analytics = await readAnalytics(db, ["2026-10-25"]);
  const reply = formatAllocationResponse("today_halls_count", analytics, true, "today");

  assert.equal(analytics.totalHalls, 2);
  assert.match(reply, /2/);
  assert.match(reply, /today's exam/i);
});
