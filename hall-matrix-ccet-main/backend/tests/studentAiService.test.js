const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const {
  detectStudentHallQueryIntent,
  handleStudentHallQuery
} = require("../utils/studentAiService");

let databases = [];

afterEach(async () => {
  await Promise.all(databases.map((db) => new Promise((resolve) => db.close(resolve))));
  databases = [];
});

function createStudentDatabase() {
  const db = new sqlite3.Database(":memory:");
  databases.push(db);
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("CREATE TABLE students (regno TEXT, name TEXT, dept TEXT, batch TEXT, degree TEXT, subject_code TEXT)", (error) => {
        if (error) return reject(error);
        db.run("CREATE TABLE subjects (subject_code TEXT, subject_name TEXT)", (subjectsError) => {
          if (subjectsError) return reject(subjectsError);
          db.run("CREATE TABLE halls (hall_no TEXT, block TEXT, capacity INTEGER)", (hallsError) => {
            if (hallsError) return reject(hallsError);
            db.run(
              `CREATE TABLE seat_allocations (
               regno TEXT, name TEXT, subject_code TEXT, subject_name TEXT, hall_no TEXT,
               seat_label TEXT, dept TEXT, batch TEXT, exam_date TEXT, session TEXT, invigilator TEXT
             )`,
              (schemaError) => {
              if (schemaError) return reject(schemaError);
              db.run(
                "INSERT INTO students VALUES ('100000000009', 'Naveen Iyer', 'AIDS', '2023-2027', 'BE', 'CS3251')",
                (studentError) => {
                  if (studentError) return reject(studentError);
                  db.run("INSERT INTO halls VALUES ('H101', 'A', 60)", (hallError) => {
                    if (hallError) return reject(hallError);
                    db.run("INSERT INTO subjects VALUES ('CS3251', 'Programming in C')", (subjectError) => {
                      if (subjectError) return reject(subjectError);
                      db.run(
                        `INSERT INTO seat_allocations
                         VALUES ('100000000009', 'Naveen Iyer', 'CS3251', 'Programming in C',
                           'H101', 'C4', 'AIDS', '2023-2027', '2026-10-25', 'AN', 'Private Staff Name')`,
                        (allocationError) => {
                          if (allocationError) return reject(allocationError);
                          resolve(db);
                          }
                        );
                      });
                    });
                  });
                }
              );
            }
          );
        });
      });
    });
  });
}

function queryStudentHall(tenantDb, message) {
  return new Promise((resolve, reject) => {
    handleStudentHallQuery(
      {
        studentSession: {
          regno: "100000000009",
          name: "Naveen Iyer",
          dept: "AIDS",
          batch: "2023-2027",
          degree: "BE",
          subject_code: "CS3251",
          tenant_id: "test"
        },
        tenantId: "test",
        tenantDb,
        message
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
}

test("recognizes the student asking where their hall is", () => {
  assert.equal(detectStudentHallQueryIntent("Where is my hall?"), true);
  assert.equal(detectStudentHallQueryIntent("What is my seat number?"), true);
});

test("returns the logged-in student's hall and seat without invigilator details", async () => {
  const db = await createStudentDatabase();
  const result = await queryStudentHall(db, "Where is my hall?");

  assert.equal(result.type, "student_hall_allocation");
  assert.equal(result.allocations[0].hall_no, "H101");
  assert.equal(result.allocations[0].seat_label, "C4");
  assert.match(result.reply, /H101/);
  assert.match(result.reply, /C4/);
  assert.doesNotMatch(result.reply, /Invigilator|Private Staff Name/);
  assert.equal(Object.hasOwn(result.allocations[0], "invigilator"), false);
});
