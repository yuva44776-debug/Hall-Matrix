const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbDir = path.join(__dirname, "..", "databases");

// Ensure databases directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const connections = {};

function ensureStudentCredentials(db, callback) {
  db.all("PRAGMA table_info(students)", (err, info) => {
    if (err) return callback(err);

    const columns = new Set((info || []).map((column) => column.name));
    const missingColumns = [];
    if (!columns.has('username')) missingColumns.push("ALTER TABLE students ADD COLUMN username TEXT");
    if (!columns.has('password')) missingColumns.push("ALTER TABLE students ADD COLUMN password TEXT");

    const addNextColumn = (index) => {
      if (index >= missingColumns.length) return callback(null);
      db.run(missingColumns[index], (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column name')) return callback(alterErr);
        addNextColumn(index + 1);
      });
    };

    addNextColumn(0);
  });
}

function initTenantSchema(db, callback) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regno TEXT,
      name TEXT,
      dept TEXT,
      subject_code TEXT,
      batch TEXT,
      degree TEXT,
      username TEXT,
      password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS degrees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      degree TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS halls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hall_no TEXT UNIQUE,
      capacity INTEGER,
      block TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_code TEXT,
      subject_name TEXT,
      batch TEXT,
      dept TEXT,
      degree TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS invigilators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      dept TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS seat_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regno TEXT,
      name TEXT,
      subject_code TEXT,
      subject_name TEXT,
      hall_no TEXT,
      seat_label TEXT,
      dept TEXT,
      batch TEXT,
      exam_date TEXT,
      session TEXT,
      invigilator TEXT
    )`, callback);
  });
}

function getTenantDb(tenantId) {
  if (connections[tenantId]) {
    return connections[tenantId];
  }

  const dbPath = path.join(dbDir, `tenant_${tenantId}.db`);
  const dbExists = fs.existsSync(dbPath);
  
  const db = new sqlite3.Database(dbPath);
  connections[tenantId] = db;

  if (!dbExists) {
    initTenantSchema(db);
  } else {
    // Migration for existing DBs
    db.serialize(() => {
      db.all("PRAGMA table_info(students)", (err, info) => {
        if (info) {
          if (!info.some(col => col.name === 'batch')) {
            db.run("ALTER TABLE students ADD COLUMN batch TEXT");
          }
          if (!info.some(col => col.name === 'degree')) {
            db.run("ALTER TABLE students ADD COLUMN degree TEXT");
          }
          if (!info.some(col => col.name === 'name')) {
            db.run("ALTER TABLE students ADD COLUMN name TEXT");
          }
          if (!info.some(col => col.name === 'username')) {
            db.run("ALTER TABLE students ADD COLUMN username TEXT");
          }
          if (!info.some(col => col.name === 'password')) {
            db.run("ALTER TABLE students ADD COLUMN password TEXT");
          }
        }
      });
      db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='subjects'", (err, rows) => {
        if (rows && rows[0] && /subject_code\s+TEXT\s+UNIQUE/i.test(rows[0].sql || '')) {
          db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run(`CREATE TABLE subjects_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subject_code TEXT,
              subject_name TEXT,
              batch TEXT,
              dept TEXT,
              degree TEXT
            )`);
            db.run("INSERT INTO subjects_new (id, subject_code, subject_name, batch, dept, degree) SELECT id, subject_code, subject_name, batch, dept, degree FROM subjects");
            db.run("DROP TABLE subjects");
            db.run("ALTER TABLE subjects_new RENAME TO subjects");
            db.run("COMMIT");
          });
        }
      });
      db.all("PRAGMA table_info(subjects)", (err, info) => {
        if (info) {
          if (!info.some(col => col.name === 'batch')) {
            db.run("ALTER TABLE subjects ADD COLUMN batch TEXT");
          }
          if (!info.some(col => col.name === 'dept')) {
            db.run("ALTER TABLE subjects ADD COLUMN dept TEXT");
          }
          if (!info.some(col => col.name === 'degree')) {
            db.run("ALTER TABLE subjects ADD COLUMN degree TEXT");
          }
        }
      });
      db.all("PRAGMA table_info(seat_allocations)", (err, info) => {
        if (info) {
          if (!info.some(col => col.name === 'name')) {
            db.run("ALTER TABLE seat_allocations ADD COLUMN name TEXT");
          }
          if (!info.some(col => col.name === 'batch')) {
            db.run("ALTER TABLE seat_allocations ADD COLUMN batch TEXT");
          }
          if (!info.some(col => col.name === 'subject_name')) {
            db.run("ALTER TABLE seat_allocations ADD COLUMN subject_name TEXT");
          }
        }
      });
      db.all("PRAGMA table_info(departments)", (err, info) => {
        if (info) {
          if (info.length > 0 && !info.some(col => col.name === 'degree')) {
            db.run("ALTER TABLE departments ADD COLUMN degree TEXT");
          }
        }
      });
      db.run(`CREATE TABLE IF NOT EXISTS degrees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        degree TEXT
      )`);
      repairLegacyStudents(db, () => {
        syncMetadataFromStudents(db);
      });
    });
  }

  return db;
}

function repairLegacyStudents(db, callback) {
  const mappings = [
    { start: 1, end: 80, dept: 'AIDS', degree: 'BE', subject: 'AD3021' },
    { start: 81, end: 160, dept: 'CSE', degree: 'BE', subject: 'CS3051' },
    { start: 161, end: 240, dept: 'ECE', degree: 'BE', subject: 'EC3041' },
    { start: 241, end: 320, dept: 'IT', degree: 'BE', subject: 'IT3052' },
    { start: 321, end: 400, dept: 'AIML', degree: 'BE', subject: 'AI3001' },
    { start: 401, end: 480, dept: 'MECH', degree: 'BE', subject: 'ME3001' },
    { start: 481, end: 560, dept: 'CIVIL', degree: 'B.TECH', subject: 'CE3001' },
    { start: 561, end: 640, dept: 'EEE', degree: 'B.TECH', subject: 'EE3001' },
  ];

  db.serialize(() => {
    mappings.forEach((m) => {
      for (let i = m.start; i <= m.end; i++) {
        const regno = '100000000' + String(i).padStart(3, '0');
        db.run(
          "UPDATE students SET dept = ?, degree = ?, subject_code = ? WHERE regno = ? AND (dept = 'GENERAL' OR subject_code = 'GENERAL')",
          [m.dept, m.degree, m.subject, regno]
        );
      }
    });
    if (callback) callback();
  });
}

function syncMetadataFromStudents(db, callback) {
  db.serialize(() => {
    db.run("DELETE FROM departments WHERE UPPER(TRIM(name)) = 'GENERAL'");

    db.run(`
      INSERT OR IGNORE INTO degrees (name)
      SELECT DISTINCT TRIM(degree)
      FROM students
      WHERE degree IS NOT NULL AND TRIM(degree) != '' AND UPPER(TRIM(degree)) != 'GENERAL'
    `);
    db.run(`
      INSERT INTO departments (name, degree)
      SELECT DISTINCT TRIM(s.dept), TRIM(s.degree)
      FROM students s
      WHERE s.dept IS NOT NULL AND TRIM(s.dept) != '' AND UPPER(TRIM(s.dept)) != 'GENERAL'
        AND NOT EXISTS (
          SELECT 1 FROM departments d
          WHERE LOWER(d.name) = LOWER(TRIM(s.dept))
            AND (d.degree IS NULL OR LOWER(d.degree) = LOWER(TRIM(s.degree)))
        )
    `, () => {
      if (callback) callback();
    });
  });
}

module.exports = {
  getTenantDb,
  dbDir,
  initTenantSchema,
  ensureStudentCredentials,
  syncMetadataFromStudents,
  repairLegacyStudents
};
