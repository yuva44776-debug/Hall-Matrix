console.log("✅ server.js loaded");

/* =======================
   1. IMPORTS
   ======================= */
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const session = require("express-session");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { allocateExamSeating, allocateBySubjectHallWise, validateAllocationGrid } = require("./utils/allocationLogic");
const { getTenantDb, initTenantSchema, ensureStudentCredentials, syncMetadataFromStudents, dbDir } = require("./utils/tenantDb");
const {
  getTodayDateVariants,
  parseDateVariantsFromMessage,
  detectAllocationQueryIntent,
  getExamAllocationAnalytics,
  formatAllocationResponse,
  getTodayExamStudentCount,
  getTodayAllocatedHallCount
} = require("./utils/allocationAnalytics");
const { handleTutorAiQuery } = require("./utils/tutorAiService");
const { detectStudentHallQueryIntent, detectStudentProfileQueryIntent, extractRegNoFromMessage, handleStudentHallQuery } = require("./utils/studentAiService");
const { isHallCountQuery, analyzeHallCountQuery } = require("./utils/hallCountService");
const { predictIntent } = require("./ai_model/tfidf_intent_model");

/* =======================
   2. APP & DB
   ======================= */
const app = express();

// Ensure the databases and uploads directories exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Startup migration of existing SQLite database to tenant_ccet
const tenantCcetDbPath = path.join(dbDir, "tenant_ccet.db");
const rootDbPath = path.join(__dirname, "hall_matrix.db");
if (!fs.existsSync(tenantCcetDbPath) && fs.existsSync(rootDbPath)) {
  console.log("Migration: Copying existing database to tenant_ccet...");
  try {
    fs.copyFileSync(rootDbPath, tenantCcetDbPath);
    console.log("Migration: Copy successful!");
  } catch (err) {
    console.error("Migration: Failed to copy database:", err.message);
  }
}

const db = new sqlite3.Database(
  rootDbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) console.error("DB connection error:", err.message);
    else console.log("✅ SQLite connected");
  },
);

/* =======================
   3. MIDDLEWARE
   ======================= */
app.set("trust proxy", 1);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

const upload = multer({ dest: uploadDir });

/* =======================
   4. SESSION
   ======================= */
app.use(
  session({
    secret: "hallmatrix_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // set to true if using https
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  }),
);

/* =======================
   5. AUTH & DB MIDDLEWARE
   ======================= */
app.use((req, res, next) => {
  const tenantId = (req.session.user && req.session.user.tenant_id) || (req.session.student && req.session.student.tenant_id) || (req.session.tutor && req.session.tutor.tenant_id) || req.headers["x-tenant-id"] || "ccet";
  if (tenantId) {
    try {
      req.db = getTenantDb(tenantId);
    } catch (err) {
      console.error("Failed to load tenant database:", err.message);
    }
  }
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized: Access is denied due to invalid credentials." });
  }
  next();
}

function requireAnyLogin(req, res, next) {
  if (!req.session.user && !req.session.student) {
    return res.status(401).json({ error: "Unauthorized: Please log in." });
  }
  next();
}

function requireStudentLogin(req, res, next) {
  if (!req.session.student) {
    return res.status(401).json({ error: "Please log in to the Student Portal to view your exam hall and seat." });
  }
  next();
}

/* =======================
   6. DATABASE TABLES (INIT MASTER)
   ======================= */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    tenant_id TEXT
  )`, () => {
    db.get("SELECT COUNT(*) as count FROM tenants", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO tenants (id, name) VALUES ('ccet', 'CCET College')");
        console.log("Migration: Registered default tenant 'ccet'.");
      }
    });

    db.all("PRAGMA table_info(users)", (err, info) => {
      if (info) {
        const hasTenantId = info.some(col => col.name === "tenant_id");
        if (!hasTenantId) {
          db.run("ALTER TABLE users ADD COLUMN tenant_id TEXT", (alterErr) => {
            if (!alterErr) {
              db.run("UPDATE users SET tenant_id = 'ccet' WHERE tenant_id IS NULL");
            }
          });
        } else {
          db.run("UPDATE users SET tenant_id = 'ccet' WHERE tenant_id IS NULL");
        }
      }
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    degree TEXT,
    branch TEXT,
    batch TEXT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'Tutor/Employee',
    status TEXT DEFAULT 'Active',
    tenant_id TEXT
  )`, () => {
    db.all("PRAGMA table_info(employees)", (err, info) => {
      if (info) {
        const hasRole = info.some(col => col.name === "role");
        if (!hasRole) {
          db.run("ALTER TABLE employees ADD COLUMN role TEXT DEFAULT 'Tutor/Employee'", () => {
            db.run("UPDATE employees SET role = 'Tutor/Employee' WHERE role IS NULL OR role = ''");
          });
        } else {
          db.run("UPDATE employees SET role = 'Tutor/Employee' WHERE role IS NULL OR role = ''");
        }
        const hasStatus = info.some(col => col.name === "status");
        if (!hasStatus) {
          db.run("ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'Active'", () => {
            db.run("UPDATE employees SET status = 'Active' WHERE status IS NULL OR status = ''");
          });
        } else {
          db.run("UPDATE employees SET status = 'Active' WHERE status IS NULL OR status = ''");
        }
      }
    });
  });
});

/* =======================
   7. AUTH ENDPOINTS
   ======================= */
app.get("/api/auth/me", (req, res) => {
  if (req.session.student) {
    res.json({
      user: {
        ...req.session.student,
        isStudent: true,
        role: "student"
      },
      student: req.session.student
    });
  } else if (req.session.tutor) {
    res.json({ user: req.session.tutor, tutor: req.session.tutor });
  } else if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  db.get(
    "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
    [username],
    (err, user) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!user) return res.status(400).json({ error: "Invalid username or password." });

      const storedPassword = String(user.password || "");
      let isMatch = false;

      if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$")) {
        isMatch = bcrypt.compareSync(password, storedPassword);
      } else {
        isMatch = password === storedPassword;
        if (isMatch) {
          const hashedPassword = bcrypt.hashSync(password, 10);
          db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, user.id]);
        }
      }

      if (!isMatch) {
        return res.status(400).json({ error: "Invalid username or password." });
      }

      db.get(
        "SELECT name FROM tenants WHERE id = ?",
        [user.tenant_id],
        (tenantErr, tenant) => {
          const safeUser = { ...user, tenant_name: tenant ? tenant.name : "Hall Matrix" };
          delete safeUser.password;
          req.session.student = null;
          req.session.tutor = null;
          req.session.user = safeUser;
          res.json({ success: true, user: safeUser });
        }
      );
    },
  );
});

app.post("/api/auth/register", (req, res) => {
  const { tenant_id, tenant_name, name, username, password, role } = req.body;

  if (!tenant_id || !tenant_name || !name || !username || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const tid = String(tenant_id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const cleanName = String(name).trim();
  const cleanUsername = String(username).trim();
  const cleanPassword = String(password).trim();

  if (!tid) {
    return res.status(400).json({ error: "Invalid Organization Code" });
  }

  db.get("SELECT * FROM tenants WHERE id = ?", [tid], (err, row) => {
    if (row) {
      return res.status(400).json({ error: "Organization Code already exists" });
    }

    db.get("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [cleanUsername], (err, urow) => {
      if (urow) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = bcrypt.hashSync(cleanPassword, 10);

      db.run(
        "INSERT INTO tenants (id, name) VALUES (?, ?)",
        [tid, tenant_name],
        (err) => {
          if (err) return res.status(500).json({ error: "Failed to create organization" });

          db.run(
            "INSERT INTO users (name, username, password, role, tenant_id) VALUES (?,?,?,?,?)",
            [cleanName, cleanUsername, hashedPassword, role || "admin", tid],
            (err) => {
              if (err) {
                db.run("DELETE FROM tenants WHERE id = ?", [tid]);
                return res.status(500).json({ error: "Failed to create admin user" });
              }

              try {
                getTenantDb(tid);
                console.log(`Initialized database for new tenant: ${tid}`);
              } catch (dbErr) {
                console.error("Failed to initialize database file:", dbErr.message);
              }

              res.json({ success: true, message: "Registered organization successfully" });
            },
          );
        },
      );
    });
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not log out" });
    res.json({ success: true });
  });
});

/* =======================
   7b. STUDENT AUTH & ALLOCATION ENDPOINTS
   ======================= */
function findStudentAcrossTenants(loginId, preferredTenantId, callback) {
  let files = [];
  try {
    files = fs.readdirSync(dbDir).filter(f => f.startsWith("tenant_") && f.endsWith(".db"));
  } catch (e) {
    files = [];
  }
  const allTenants = files.map(f => f.replace(/^tenant_/, "").replace(/\.db$/, ""));

  const tenantOrder = [];
  if (preferredTenantId && allTenants.includes(preferredTenantId)) {
    tenantOrder.push(preferredTenantId);
  }
  if (allTenants.includes("9203") && !tenantOrder.includes("9203")) {
    tenantOrder.push("9203");
  }
  for (const tid of allTenants) {
    if (!tenantOrder.includes(tid)) {
      tenantOrder.push(tid);
    }
  }

  let index = 0;
  function tryNext() {
    if (index >= tenantOrder.length) {
      return callback(null, null, null);
    }
    const currentTid = tenantOrder[index++];
    let currentDb;
    try {
      currentDb = getTenantDb(currentTid);
    } catch (dbErr) {
      return tryNext();
    }

    currentDb.get(
      "SELECT * FROM students WHERE LOWER(TRIM(REPLACE(regno, '.0', ''))) = ? OR LOWER(TRIM(COALESCE(username, ''))) = ?",
      [loginId, loginId],
      (err, studentRow) => {
        if (err || !studentRow) {
          return tryNext();
        }
        return callback(null, studentRow, currentTid);
      }
    );
  }

  tryNext();
}

app.post("/api/auth/student-login", (req, res) => {
  const { tenant_id, regno, username, password } = req.body;
  const loginId = String(regno || username || "").trim().replace(/\s+/g, "");
  const cleanPassword = String(password || "").trim();

  if (!loginId || !cleanPassword) {
    return res.status(400).json({ error: "Register Number and Password are required" });
  }

  // Strict Validation: 12-digit student Register number
  if (!/^\d{12}$/.test(loginId)) {
    return res.status(400).json({ error: "Register Number must be exactly 12 digits (e.g. 100000000001)" });
  }

  // Strict Validation: 6-digit password
  if (!/^\d{6}$/.test(cleanPassword)) {
    return res.status(400).json({ error: "Password must be exactly 6 digits (e.g. 934575)" });
  }

  const cleanLoginId = loginId.toLowerCase().replace(/\.0$/, "");
  const preferredTid = tenant_id ? String(tenant_id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") : null;

  findStudentAcrossTenants(cleanLoginId, preferredTid, (findErr, studentRow, matchedTid) => {
    if (findErr) {
      return res.status(500).json({ error: "Database authentication error" });
    }
    if (!studentRow) {
      return res.status(401).json({ error: "Invalid Register Number. Student not found." });
    }

    // Verify password (plain, bcrypt, or default 123456 / 934575)
    let passwordMatches = false;
    if (studentRow.password) {
      passwordMatches = (studentRow.password === cleanPassword) ||
        (() => {
          try { return bcrypt.compareSync(cleanPassword, studentRow.password); } catch { return false; }
        })();
    }

    // Always accept 123456 as the universal student default password
    if (!passwordMatches && (cleanPassword === "123456" || cleanPassword === "934575")) {
      passwordMatches = true;
      try {
        const tDb = getTenantDb(matchedTid);
        const hashed = bcrypt.hashSync("123456", 10);
        tDb.run("UPDATE students SET password = ? WHERE id = ?", [hashed, studentRow.id]);
      } catch (saveErr) {
        console.error("Could not persist default password:", saveErr);
      }
    }

    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid Register Number or Password." });
    }

    db.get("SELECT * FROM tenants WHERE id = ?", [matchedTid], (err, tenant) => {
      const activeTenant = tenant || { id: matchedTid, name: "Chettinad College of Engineering & Technology" };
      const cleanRegNo = String(studentRow.regno).trim().replace(/\.0$/, "");

      db.get(
        `SELECT id, name, email, branch, batch, role, degree FROM employees 
         WHERE tenant_id = ? 
           AND (LOWER(branch) = LOWER(?) OR LOWER(branch) LIKE '%' || LOWER(?) || '%' OR LOWER(?) LIKE '%' || LOWER(branch) || '%')
         ORDER BY id DESC LIMIT 1`,
        [matchedTid, studentRow.dept, studentRow.dept, studentRow.dept],
        (tutorErr, tutorRow) => {
          let academicYear = "3rd Year";
          let semester = "Semester 5";
          if (studentRow.batch) {
            const parts = String(studentRow.batch).split("-");
            const startYear = parseInt(parts[0], 10);
            if (!isNaN(startYear)) {
              const currentYear = new Date().getFullYear();
              const currentMonth = new Date().getMonth() + 1;
              let yearDiff = currentYear - startYear;
              if (yearDiff < 0) yearDiff = 0;
              let yearOfStudy = yearDiff + 1;
              if (yearOfStudy > 4) yearOfStudy = 4;
              const yearNames = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
              academicYear = yearNames[yearOfStudy - 1] || `${yearOfStudy}th Year`;
              let sem = (yearOfStudy - 1) * 2 + (currentMonth >= 7 ? 1 : 2);
              if (sem > 8) sem = 8;
              semester = `Semester ${sem}`;
            }
          }

          const studentSession = {
            regno: cleanRegNo,
            name: studentRow.name || `Student ${cleanRegNo}`,
            tenant_id: matchedTid,
            tenant_name: activeTenant.name,
            dept: studentRow.dept || "N/A",
            batch: studentRow.batch || "N/A",
            degree: studentRow.degree || "BE",
            subject_code: studentRow.subject_code || "N/A",
            username: studentRow.username || `${cleanRegNo}@student.edu`,
            email: studentRow.username || `${cleanRegNo}@student.edu`,
            status: "Active",
            academic_year: academicYear,
            semester: semester,
            academic_session: "2026 - 2027",
            tutor: tutorRow ? {
              name: tutorRow.name,
              email: tutorRow.email,
              role: tutorRow.role || "Class Tutor / Advisor",
              branch: tutorRow.branch
            } : {
              name: "Department Faculty Advisor",
              email: `${String(studentRow.dept || "dept").toLowerCase()}@ccet.edu.in`,
              role: "Faculty Advisor",
              branch: studentRow.dept || "Engineering"
            }
          };

          req.session.user = null;
          req.session.tutor = null;
          req.session.student = studentSession;
          res.json({ success: true, student: studentSession });
        }
      );
    });
  });
});

app.get("/api/auth/student-me", (req, res) => {
  if (req.session.student) {
    res.json({ student: req.session.student });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/api/auth/student-logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not log out" });
    res.json({ success: true });
  });
});

app.get("/api/student/dashboard", (req, res) => {
  if (!req.session.student) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const s = req.session.student;
  let tenantDb;
  try {
    tenantDb = getTenantDb(s.tenant_id);
  } catch (err) {
    return res.json({
      success: true,
      student: s,
      subjects: [],
      allocations: [],
      examStats: { hasAllocations: false, totalExams: 0, totalSubjects: 0 }
    });
  }

  tenantDb.all(
    `SELECT * FROM subjects 
     WHERE LOWER(TRIM(dept)) = LOWER(TRIM(?))
        OR (batch IS NOT NULL AND batch != '' AND LOWER(TRIM(batch)) = LOWER(TRIM(?)))
     ORDER BY subject_code`,
    [s.dept, s.batch],
    (subErr, subjectRows) => {
      let subjects = subjectRows || [];

      // If registered primary subject is missing from catalog, prepend it
      if (s.subject_code && s.subject_code !== "N/A" && !subjects.some(sub => sub.subject_code === s.subject_code)) {
        subjects.unshift({
          id: 'primary',
          subject_code: s.subject_code,
          subject_name: 'Primary Registered Course',
          dept: s.dept,
          batch: s.batch,
          degree: s.degree,
          isPrimary: true
        });
      }

      tenantDb.all(
        `SELECT sa.*, 
                COALESCE(NULLIF(sa.subject_name, ''), (SELECT s.subject_name FROM subjects s WHERE s.subject_code = sa.subject_code LIMIT 1), 'Scheduled Exam') as subject_name,
                h.block as hall_block,
                h.capacity as hall_capacity
         FROM seat_allocations sa 
         LEFT JOIN halls h ON UPPER(TRIM(h.hall_no)) = UPPER(TRIM(sa.hall_no))
         WHERE TRIM(REPLACE(LOWER(sa.regno), '.0', '')) = TRIM(REPLACE(LOWER(?), '.0', '')) 
         ORDER BY sa.exam_date, sa.session`,
        [s.regno],
        (allocErr, allocRows) => {
          const allocations = allocRows || [];
          res.json({
            success: true,
            student: s,
            subjects: subjects,
            allocations: allocations,
            examStats: {
              hasAllocations: allocations.length > 0,
              totalExams: allocations.length,
              totalSubjects: subjects.length
            }
          });
        }
      );
    }
  );
});

app.get("/api/student/my-allocations", (req, res) => {
  if (!req.session.student) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { regno, tenant_id } = req.session.student;
  let tenantDb;
  try {
    tenantDb = getTenantDb(tenant_id);
  } catch (err) {
    return res.json({ allocations: [] });
  }

  tenantDb.all(
    `SELECT sa.*, 
            COALESCE(NULLIF(sa.subject_name, ''), (SELECT s.subject_name FROM subjects s WHERE s.subject_code = sa.subject_code LIMIT 1), 'Scheduled Exam') as subject_name,
            h.block as hall_block,
            h.capacity as hall_capacity
     FROM seat_allocations sa 
     LEFT JOIN halls h ON UPPER(TRIM(h.hall_no)) = UPPER(TRIM(sa.hall_no))
     WHERE TRIM(REPLACE(LOWER(sa.regno), '.0', '')) = TRIM(REPLACE(LOWER(?), '.0', '')) 
     ORDER BY sa.exam_date, sa.session`,
    [regno],
    (err, rows) => {
      if (err) return res.json({ allocations: [] });
      res.json({ allocations: rows || [] });
    }
  );
});

/* =======================
   7c. EMPLOYEE CRUD ENDPOINTS
   ======================= */
app.post("/api/employees", requireLogin, (req, res) => {
  const { name, email, degree, branch, batch, username, password, role, status } = req.body;
  const tenant_id = req.session.user.tenant_id;

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Name, username, and password are required" });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email || "").trim();
  const cleanDegree = String(degree || "").trim();
  const cleanBranch = String(branch || "").trim();
  const cleanBatch = String(batch || "").trim();
  const cleanUsername = String(username).trim();
  const cleanRole = String(role || "Tutor/Employee").trim();
  const cleanStatus = String(status || "Active").trim();

  // Duplicate check for existing username or email under this tenant
  db.get(
    `SELECT * FROM employees WHERE tenant_id = ? AND (LOWER(username) = LOWER(?) OR (email != '' AND LOWER(email) = LOWER(?)))`,
    [tenant_id, cleanUsername, cleanEmail],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) {
        return res.status(400).json({ error: "An employee with this username or email already exists." });
      }

      // Hash password using bcrypt
      const hashedPassword = bcrypt.hashSync(password.trim(), 10);

      db.run(
        `INSERT INTO employees (name, email, degree, branch, batch, username, password, role, status, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cleanName, cleanEmail, cleanDegree, cleanBranch, cleanBatch, cleanUsername, hashedPassword, cleanRole, cleanStatus, tenant_id],
        function (err) {
          if (err) {
            if (err.message.includes("UNIQUE")) {
              return res.status(400).json({ error: "Username already exists" });
            }
            return res.status(500).json({ error: err.message });
          }
          res.json({
            success: true,
            employee: {
              id: this.lastID,
              name: cleanName,
              email: cleanEmail,
              degree: cleanDegree,
              branch: cleanBranch,
              batch: cleanBatch,
              username: cleanUsername,
              role: cleanRole,
              status: cleanStatus,
              tenant_id
            }
          });
        }
      );
    }
  );
});

app.get("/api/employees", requireLogin, (req, res) => {
  const tenant_id = req.session.user.tenant_id;
  db.all(
    "SELECT id, name, email, degree, branch, batch, username, role, status, tenant_id FROM employees WHERE tenant_id = ?",
    [tenant_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const employees = (rows || []).map(emp => ({
        ...emp,
        role: emp.role || 'Tutor/Employee',
        status: emp.status || 'Active'
      }));
      res.json({ employees });
    }
  );
});

app.put("/api/employees/:id", requireLogin, (req, res) => {
  const { name, email, degree, branch, batch, username, password, role, status } = req.body;
  const tenant_id = req.session.user.tenant_id;
  const employeeId = req.params.id;

  const cleanName = String(name).trim();
  const cleanEmail = String(email || "").trim();
  const cleanDegree = String(degree || "").trim();
  const cleanBranch = String(branch || "").trim();
  const cleanBatch = String(batch || "").trim();
  const cleanUsername = String(username).trim();
  const cleanRole = String(role || "Tutor/Employee").trim();
  const cleanStatus = String(status || "Active").trim();

  let query, params;
  if (password && String(password).trim().length > 0) {
    const hashedPassword = bcrypt.hashSync(String(password).trim(), 10);
    query = `UPDATE employees SET name=?, email=?, degree=?, branch=?, batch=?, username=?, password=?, role=?, status=? WHERE id=? AND tenant_id=?`;
    params = [cleanName, cleanEmail, cleanDegree, cleanBranch, cleanBatch, cleanUsername, hashedPassword, cleanRole, cleanStatus, employeeId, tenant_id];
  } else {
    query = `UPDATE employees SET name=?, email=?, degree=?, branch=?, batch=?, username=?, role=?, status=? WHERE id=? AND tenant_id=?`;
    params = [cleanName, cleanEmail, cleanDegree, cleanBranch, cleanBatch, cleanUsername, cleanRole, cleanStatus, employeeId, tenant_id];
  }

  db.run(query, params, function (err) {
    if (err) {
      if (err.message.includes("UNIQUE")) {
        return res.status(400).json({ error: "Username already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.delete("/api/employees/:id", requireLogin, (req, res) => {
  const tenant_id = req.session.user.tenant_id;
  db.run(
    "DELETE FROM employees WHERE id=? AND tenant_id=?",
    [req.params.id, tenant_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

/* =======================
   7d. TUTOR AUTH ENDPOINTS
   ======================= */
app.post("/api/auth/tutor-login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const cleanUsername = String(username).trim();
  const rawPassword = String(password).trim();

  db.get(
    "SELECT * FROM employees WHERE LOWER(username) = LOWER(?) OR (email != '' AND LOWER(email) = LOWER(?))",
    [cleanUsername, cleanUsername],
    (err, employee) => {
      if (err) return res.status(500).json({ error: "Database authentication error" });

      if (!employee) {
        return res.status(400).json({ error: "Invalid username or password." });
      }

      // Check role permission
      const roleStr = String(employee.role || 'Tutor/Employee').toLowerCase();
      if (!roleStr.includes("tutor") && !roleStr.includes("employee")) {
        return res.status(403).json({ error: "You are not authorized to access the tutor portal." });
      }

      const storedPassword = String(employee.password || "");
      let isMatch = false;
      if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$")) {
        isMatch = bcrypt.compareSync(rawPassword, storedPassword);
      } else {
        isMatch = (rawPassword === storedPassword);
        if (isMatch) {
          const hashedPassword = bcrypt.hashSync(rawPassword, 10);
          db.run("UPDATE employees SET password = ? WHERE id = ?", [hashedPassword, employee.id]);
        }
      }

      if (!isMatch) {
        return res.status(400).json({ error: "Invalid username or password." });
      }

      db.get(
        "SELECT name FROM tenants WHERE id = ?",
        [employee.tenant_id],
        (err, tenant) => {
          const tutorSession = {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            degree: employee.degree || '',
            branch: employee.branch || '',
            batch: employee.batch || '',
            username: employee.username,
            role: employee.role || 'Tutor/Employee',
            status: employee.status || 'Active',
            isTutor: true,
            tenant_id: employee.tenant_id || 'ccet',
            tenant_name: tenant ? tenant.name : "CCET Institution"
          };

          req.session.student = null;
          req.session.tutor = tutorSession;
          req.session.user = tutorSession;

          res.json({ success: true, tutor: tutorSession, user: tutorSession });
        }
      );
    }
  );
});

app.get("/api/auth/tutor-me", (req, res) => {
  if (req.session.tutor) {
    res.json({ tutor: req.session.tutor });
  } else if (req.session.user && req.session.user.isTutor) {
    res.json({ tutor: req.session.user });
  } else {
    res.status(401).json({ error: "Unauthorized: Tutor session required" });
  }
});

app.post("/api/auth/tutor-logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not log out" });
    res.json({ success: true });
  });
});

/* =======================
   7e. TUTOR STUDENT MAPPING (DYNAMIC AUTOMATIC BATCH MATCHING)
   ======================= */
app.get("/api/tutor/my-students", (req, res) => {
  const tutorId = (req.session.tutor && req.session.tutor.id) || (req.session.user && req.session.user.isTutor && req.session.user.id);
  if (!tutorId) {
    return res.status(401).json({ error: "Unauthorized: Active tutor session required." });
  }

  // Always read tutor info fresh from database to prevent client spoofing
  db.get(
    "SELECT * FROM employees WHERE id = ?",
    [tutorId],
    (err, tutorRecord) => {
      if (err || !tutorRecord) {
        return res.status(404).json({ error: "Tutor profile record not found." });
      }

      const tutorBranch = String(tutorRecord.branch || "").trim();
      const tutorBatch = String(tutorRecord.batch || "").trim();
      const tutorDegree = String(tutorRecord.degree || "").trim();

      if (!tutorBatch) {
        return res.status(400).json({
          error: "No batch is assigned to this tutor.",
          tutor: {
            name: tutorRecord.name,
            branch: tutorBranch,
            batch: "",
            degree: tutorDegree
          },
          students: []
        });
      }

      let tenantDb;
      try {
        tenantDb = getTenantDb(tutorRecord.tenant_id || "ccet");
      } catch (dbErr) {
        return res.status(500).json({ error: "Failed to access organization database." });
      }

      // Query students matching department and batch dynamically
      tenantDb.all(
        `SELECT * FROM students 
         WHERE LOWER(TRIM(dept)) = LOWER(TRIM(?))
           AND (LOWER(TRIM(batch)) = LOWER(TRIM(?)) OR REPLACE(LOWER(batch), ' ', '') = REPLACE(LOWER(?), ' ', ''))
         ORDER BY regno, name`,
        [tutorBranch, tutorBatch, tutorBatch],
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });

          res.json({
            success: true,
            tutor: {
              id: tutorRecord.id,
              name: tutorRecord.name,
              email: tutorRecord.email,
              degree: tutorRecord.degree,
              branch: tutorRecord.branch,
              batch: tutorRecord.batch,
              role: tutorRecord.role || 'Tutor/Employee'
            },
            students: rows || []
          });
        }
      );
    }
  );
});

/* =======================
   8a. DEGREES ENDPOINTS
   ======================= */
app.get("/api/degrees", requireLogin, (req, res) => {
  syncMetadataFromStudents(req.db, () => {
    req.db.all("SELECT * FROM degrees ORDER BY name ASC", (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ degrees: rows || [] });
    });
  });
});

app.post("/api/degrees/add", requireLogin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Degree name is required" });

  req.db.run("INSERT INTO degrees (name) VALUES (?)", [name], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, degree: { id: this.lastID, name } });
  });
});

app.post("/api/degrees/delete/:id", requireLogin, (req, res) => {
  req.db.run("DELETE FROM degrees WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/* =======================
   8b. DEPARTMENTS ENDPOINTS
   ======================= */
app.get("/api/departments", requireLogin, (req, res) => {
  const { degree } = req.query;
  syncMetadataFromStudents(req.db, () => {
    let query = "SELECT * FROM departments";
    const params = [];

    if (degree) {
      query += " WHERE LOWER(degree) = LOWER(?)";
      params.push(degree);
    }
    query += " ORDER BY name ASC";

    req.db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ departments: rows || [] });
    });
  });
});

app.post("/api/departments/add", requireLogin, (req, res) => {
  const { name, degree } = req.body;
  if (!name) return res.status(400).json({ error: "Department name is required" });

  req.db.run("INSERT INTO departments (name, degree) VALUES (?,?)", [name, degree || null], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, department: { id: this.lastID, name, degree } });
  });
});

app.post("/api/departments/delete/:id", requireLogin, (req, res) => {
  req.db.run("DELETE FROM departments WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/* =======================
   9. STUDENTS ENDPOINTS
   ======================= */
app.get("/api/students", requireLogin, (req, res) => {
  const { degree, dept, batch } = req.query;
  ensureStudentCredentials(req.db, (schemaErr) => {
    if (schemaErr) return res.status(500).json({ error: "Failed to prepare student credentials: " + schemaErr.message });

    let query = "SELECT id, regno, name, degree, dept, subject_code, batch, username FROM students WHERE 1=1";
    const params = [];

    if (degree) {
      query += " AND degree = ?";
      params.push(degree);
    }
    if (dept) {
      query += " AND dept = ?";
      params.push(dept);
    }
    if (batch) {
      query += " AND batch = ?";
      params.push(batch);
    }

    req.db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ students: rows || [] });
    });
  });
});

app.post("/api/students/add", requireLogin, (req, res) => {
  const { regno, name, degree, dept, subject_code, batch, username } = req.body;
  if (!regno || !dept || !subject_code) {
    return res.status(400).json({ error: "Registration number, department, and subject code are required" });
  }

  ensureStudentCredentials(req.db, (schemaErr) => {
    if (schemaErr) return res.status(500).json({ error: "Failed to prepare student credentials: " + schemaErr.message });

    const cleanUsername = username ? String(username).trim().toLowerCase() : null;
    req.db.run(
      "INSERT INTO students (regno, name, degree, dept, subject_code, batch, username) VALUES (?,?,?,?,?,?,?)",
      [regno, name || null, degree || null, dept, subject_code, batch || null, cleanUsername],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        syncMetadataFromStudents(req.db);
        res.json({ success: true, student: { id: this.lastID, regno, name, degree, dept, subject_code, batch, username: cleanUsername } });
      },
    );
  });
});

app.put("/api/students/:id", requireLogin, (req, res) => {
  const { regno, name, degree, dept, subject_code, batch, username, password } = req.body;
  const cleanRegno = String(regno || "").trim().replace(/\.0$/, "");
  const cleanDept = String(dept || "").trim();
  const cleanSubjectCode = String(subject_code || "").trim();
  const cleanUsername = username ? String(username).trim().toLowerCase() : cleanRegno.toLowerCase();

  if (!cleanRegno || !cleanDept || !cleanSubjectCode) {
    return res.status(400).json({ error: "Register number, department, and subject code are required" });
  }

  const cleanPassword = String(password || "").trim();
  const updateStudent = (query, params) => {
    req.db.run(query, params, function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "Register number already exists" });
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: "Student not found" });
      res.json({ success: true });
    });
  };

  ensureStudentCredentials(req.db, (schemaErr) => {
    if (schemaErr) return res.status(500).json({ error: "Failed to prepare student credentials: " + schemaErr.message });

    if (cleanPassword) {
      updateStudent(
        "UPDATE students SET regno=?, name=?, degree=?, dept=?, subject_code=?, batch=?, username=?, password=? WHERE id=?",
        [cleanRegno, name || null, degree || null, cleanDept, cleanSubjectCode, batch || null, cleanUsername, bcrypt.hashSync(cleanPassword, 10), req.params.id]
      );
    } else {
      updateStudent(
        "UPDATE students SET regno=?, name=?, degree=?, dept=?, subject_code=?, batch=?, username=? WHERE id=?",
        [cleanRegno, name || null, degree || null, cleanDept, cleanSubjectCode, batch || null, cleanUsername, req.params.id]
      );
    }
  });
});

app.post("/api/students/delete/:id", requireLogin, (req, res) => {
  req.db.run("DELETE FROM students WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post("/api/students/bulk-delete", requireLogin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No student IDs specified for deletion" });
  }

  const chunkSize = 400;
  let deletedTotal = 0;
  let processedChunks = 0;
  const totalChunks = Math.ceil(ids.length / chunkSize);
  let hasError = false;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");

    req.db.run(
      `DELETE FROM students WHERE id IN (${placeholders})`,
      chunk,
      function (err) {
        if (err && !hasError) {
          hasError = true;
          return res.status(500).json({ error: err.message });
        }
        deletedTotal += this ? (this.changes || 0) : 0;
        processedChunks++;

        if (processedChunks === totalChunks && !hasError) {
          res.json({ success: true, deletedCount: deletedTotal });
        }
      }
    );
  }
});

function getRowValue(row, possibleKeys) {
  if (!row || typeof row !== "object") return null;
  const normKeys = possibleKeys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const origKey of Object.keys(row)) {
    const norm = origKey.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normKeys.includes(norm)) {
      const val = row[origKey];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        return String(val).trim();
      }
    }
  }
  return null;
}

function extractStudentFromRow(r, queryOpts = {}) {
  if (!r || typeof r !== "object") return null;

  const { queryDegree, queryDept, queryBatch, querySubjectCode } = queryOpts;

  let regno = null;
  let name = null;
  let dept = null;
  let subject_code = null;
  let batch = null;
  let degree = null;
  let username = null;

  const keys = Object.keys(r);

  const isUsernameKey = (norm) => {
    return (
      norm.includes("gmail") ||
      norm.includes("email") ||
      norm.includes("mail") ||
      norm.includes("username") ||
      norm === "user" ||
      norm === "uname"
    );
  };

  // 1. Key Matching
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const val = r[k] !== undefined && r[k] !== null ? String(r[k]).trim() : "";
    if (!val) continue;

    // Username / Gmail / Email matching (must precede name matching)
    if (!username && isUsernameKey(norm)) {
      username = val;
    }
    // Reg No matching (any header with reg, roll, enroll, id, student)
    else if (!regno && !isUsernameKey(norm) && (norm.includes("reg") || norm.includes("roll") || norm.includes("enroll") || norm === "id" || norm === "studentid" || norm === "regno" || norm.includes("registerno") || norm.includes("registernumber") || norm.includes("egisternumbe"))) {
      regno = val;
    }
    // Name matching (headers with 'name' or 'student', excluding username, email, reg, roll, id, code, dept)
    else if (!name && !isUsernameKey(norm) && (norm.includes("name") || norm.includes("student")) && !norm.includes("reg") && !norm.includes("roll") && !norm.includes("id") && !norm.includes("code") && !norm.includes("dept") && !norm.includes("branch")) {
      name = val;
    }
    // Dept matching (supports department, dept, branch, stream)
    else if (!dept && (norm.includes("dept") || norm.includes("department") || norm.includes("branch") || norm.includes("stream"))) {
      dept = val;
    }
    // Subject Code matching
    else if (!subject_code && (norm.includes("subject") || norm.includes("subcode") || norm.includes("coursecode"))) {
      subject_code = val;
    }
    // Batch matching
    else if (!batch && (norm.includes("batch") || norm.includes("year"))) {
      batch = val;
    }
    // Degree matching
    else if (!degree && (norm.includes("degree") || norm.includes("course") || norm.includes("program"))) {
      degree = val;
    }
  }

  // 2. Position / Value inspection fallback
  // Fallback for username if not found by header: inspect for email address format
  if (!username && keys.length > 0) {
    for (const k of keys) {
      const val = String(r[k] || "").trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        username = val;
        break;
      }
    }
  }

  // Fallback if regno not found by key name
  if (!regno && keys.length > 0) {
    for (const k of keys) {
      const val = String(r[k] || "").trim();
      // If a cell contains a 4+ digit number or alphanumeric registration code (not an email address)
      if (!val.includes("@") && /^[A-Za-z0-9]{4,20}$/.test(val) && !isNaN(val.slice(-3))) {
        regno = val;
        break;
      }
    }
  }

  if (!regno) return null;

  return {
    regno: String(regno).replace(/\.0$/, ""),
    name: name || null,
    dept: dept || queryDept || "GENERAL",
    subject_code: subject_code || querySubjectCode || "GENERAL",
    batch: batch || queryBatch || null,
    degree: degree || queryDegree || null,
    username: username ? String(username).trim().toLowerCase() : null
  };
}

app.post("/api/students/upload", requireLogin, upload.single("file"), (req, res) => {
  const { degree: queryDegree, dept: queryDept, batch: queryBatch, subject_code: querySubjectCode } = req.query;

  if (!req.file) return res.status(400).json({ error: "Excel file is required" });

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Uploaded sheet is empty" });
    }
    const sheet = wb.Sheets[sheetName];

    // Read sheet into JSON array of objects
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!Array.isArray(data) || data.length === 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "No data rows found in the uploaded file" });
    }

    ensureStudentCredentials(req.db, (schemaErr) => {
      if (schemaErr) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: "Failed to prepare student credentials: " + schemaErr.message });
      }

      req.db.all("SELECT id, regno, name, degree, dept, subject_code, batch, username FROM students", (fetchErr, existingRows) => {
        if (fetchErr) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: "Failed to read existing student records: " + fetchErr.message });
        }

        const existingMap = new Map();
        (existingRows || []).forEach((row) => {
          if (row.regno) {
            existingMap.set(String(row.regno).trim().replace(/\.0$/, ""), row);
          }
        });

        req.db.serialize(() => {
          req.db.run("BEGIN TRANSACTION");

          const insertStmt = req.db.prepare(
            "INSERT INTO students (regno, name, degree, dept, subject_code, batch, username) VALUES (?,?,?,?,?,?,?)",
          );
          const updateStmt = req.db.prepare(
            "UPDATE students SET name = ?, degree = ?, dept = ?, subject_code = ?, batch = ?, username = ? WHERE id = ?",
          );

          let count = 0;
          data.forEach((r) => {
            const studentData = extractStudentFromRow(r, { queryDegree, queryDept, queryBatch, querySubjectCode });
            if (studentData && studentData.regno) {
              const existing = existingMap.get(studentData.regno);
              if (existing) {
                const finalName = studentData.name || existing.name;
                const finalDegree = studentData.degree || existing.degree;
                const finalDept = (studentData.dept && studentData.dept !== "GENERAL") ? studentData.dept : (existing.dept || studentData.dept);
                const finalSubject = (studentData.subject_code && studentData.subject_code !== "GENERAL") ? studentData.subject_code : (existing.subject_code || studentData.subject_code);
                const finalBatch = studentData.batch || existing.batch;
                const finalUsername = studentData.username || existing.username;

                updateStmt.run(
                  finalName,
                  finalDegree,
                  finalDept,
                  finalSubject,
                  finalBatch,
                  finalUsername,
                  existing.id
                );
              } else {
                insertStmt.run(
                  studentData.regno,
                  studentData.name,
                  studentData.degree,
                  studentData.dept,
                  studentData.subject_code,
                  studentData.batch,
                  studentData.username
                );
              }
              count++;
            }
          });

          insertStmt.finalize();
          updateStmt.finalize();

          req.db.run("COMMIT", (commitErr) => {
            if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

            if (commitErr) {
              return res.status(500).json({ error: "Failed to save student records into database" });
            }

            if (count === 0) {
              return res.status(400).json({
                error: "No valid student rows found. Please ensure the Excel file contains student Register Numbers."
              });
            }

            syncMetadataFromStudents(req.db);
            res.json({ success: true, count, message: `Successfully imported ${count} student records!` });
          });
        });
      });
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

/* =======================
   10. SUBJECTS ENDPOINTS
   ======================= */
app.get("/api/subjects", requireLogin, (req, res) => {
  req.db.all("SELECT * FROM subjects ORDER BY dept ASC, subject_code ASC, batch ASC, id ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ subjects: rows || [] });
  });
});

app.post("/api/subjects/add", requireLogin, (req, res) => {
  const { subject_code, subject_name, batch, dept, degree } = req.body;
  if (!subject_code || !subject_name) {
    return res.status(400).json({ error: "Subject code and name are required" });
  }

  req.db.get(
    "SELECT id FROM subjects WHERE UPPER(TRIM(COALESCE(subject_code,''))) = UPPER(TRIM(?)) AND UPPER(TRIM(COALESCE(dept,''))) = UPPER(TRIM(?)) AND UPPER(TRIM(COALESCE(batch,''))) = UPPER(TRIM(?))",
    [subject_code, dept || '', batch || ''],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) {
        req.db.run(
          "UPDATE subjects SET subject_name = ?, degree = ? WHERE id = ?",
          [subject_name, degree || null, existing.id],
          function (uErr) {
            if (uErr) return res.status(500).json({ error: uErr.message });
            res.json({ success: true, updated: true, id: existing.id });
          }
        );
      } else {
        req.db.run(
          "INSERT INTO subjects (subject_code, subject_name, batch, dept, degree) VALUES (?,?,?,?,?)",
          [subject_code, subject_name, batch || null, dept || null, degree || null],
          function (iErr) {
            if (iErr) return res.status(500).json({ error: iErr.message });
            res.json({ success: true, id: this.lastID });
          }
        );
      }
    }
  );
});

app.post("/api/subjects/delete/:id", requireLogin, (req, res) => {
  req.db.run("DELETE FROM subjects WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post("/api/subjects/bulk-delete", requireLogin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No subject IDs specified for deletion" });
  }

  const chunkSize = 400;
  let deletedTotal = 0;
  let processedChunks = 0;
  const totalChunks = Math.ceil(ids.length / chunkSize);
  let hasError = false;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");

    req.db.run(
      `DELETE FROM subjects WHERE id IN (${placeholders})`,
      chunk,
      function (err) {
        if (err && !hasError) {
          hasError = true;
          return res.status(500).json({ error: err.message });
        }
        deletedTotal += this ? (this.changes || 0) : 0;
        processedChunks++;

        if (processedChunks === totalChunks && !hasError) {
          res.json({ success: true, deletedCount: deletedTotal });
        }
      }
    );
  }
});

app.post("/api/subjects/upload", requireLogin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Excel file is required" });

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Uploaded sheet is empty" });
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!Array.isArray(rows) || rows.length === 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "No data rows found in the uploaded file" });
    }

    req.db.all("SELECT id, subject_code, subject_name, batch, dept, degree FROM subjects", (fetchErr, existingRows) => {
      if (fetchErr) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: "Failed to read existing subjects: " + fetchErr.message });
      }

      const existingMap = new Map();
      (existingRows || []).forEach((row) => {
        const key = `${(row.dept || '').trim().toLowerCase()}__${(row.subject_code || '').trim().toLowerCase()}__${(row.batch || '').trim().toLowerCase()}`;
        existingMap.set(key, row);
      });

      req.db.serialize(() => {
        req.db.run("BEGIN TRANSACTION");

        const insertStmt = req.db.prepare(
          "INSERT INTO subjects (subject_code, subject_name, batch, dept, degree) VALUES (?,?,?,?,?)",
        );
        const updateStmt = req.db.prepare(
          "UPDATE subjects SET subject_name = ?, degree = ? WHERE id = ?",
        );

        let count = 0;
        rows.forEach((r) => {
          const dept = getRowValue(r, ["department", "dept", "department_name", "dept_name", "branch", "branch_name"]);
          const subject_code = getRowValue(r, ["subject_code", "subjectcode", "subcode", "sub_code", "code", "course_code", "coursecode"]);
          const subject_name = getRowValue(r, ["subject_name", "subjectname", "subname", "sub_name", "name", "title", "subject", "course_name", "coursename"]);
          const batch = getRowValue(r, ["assigned_batch", "assignedbatch", "batch", "batch_name", "batchname", "year", "batch_year", "regulation", "class"]);
          const degree = getRowValue(r, ["degree", "programme", "program", "course"]);

          if (subject_code && subject_name) {
            const key = `${(dept || '').trim().toLowerCase()}__${(subject_code || '').trim().toLowerCase()}__${(batch || '').trim().toLowerCase()}`;
            const existing = existingMap.get(key);
            if (existing && existing.id > 0) {
              updateStmt.run(subject_name, degree || existing.degree || null, existing.id);
            } else {
              insertStmt.run(subject_code, subject_name, batch || null, dept || null, degree || null);
              existingMap.set(key, { id: -1, subject_code, subject_name, batch, dept, degree });
            }
            count++;
          }
        });

        insertStmt.finalize();
        updateStmt.finalize();

        req.db.run("COMMIT", (commitErr) => {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

          if (commitErr) return res.status(500).json({ error: "Failed to save subject records: " + commitErr.message });

          if (count === 0) {
            return res.status(400).json({
              error: "No valid subject rows found. Required columns: Department, Subject Code, Subject Name, Assigned Batch."
            });
          }

          res.json({ success: true, count, message: `Successfully imported ${count} subjects!` });
        });
      });
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

/* =======================
   11. HALLS ENDPOINTS
   ======================= */
app.get("/api/halls", requireLogin, (req, res) => {
  req.db.all("SELECT * FROM halls", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ halls: rows || [] });
  });
});

app.post("/api/halls/add", requireLogin, (req, res) => {
  const { hall_no, capacity, block } = req.body;
  if (!hall_no || !capacity) {
    return res.status(400).json({ error: "Hall number and capacity are required" });
  }

  req.db.run(
    "INSERT OR IGNORE INTO halls (hall_no, capacity, block) VALUES (?,?,?)",
    [hall_no, capacity, block || ""],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    },
  );
});

app.post("/api/halls/delete/:id", requireLogin, (req, res) => {
  req.db.run("DELETE FROM halls WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post("/api/halls/bulk-delete", requireLogin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No hall IDs specified for deletion" });
  }

  const chunkSize = 400;
  let deletedTotal = 0;
  let processedChunks = 0;
  const totalChunks = Math.ceil(ids.length / chunkSize);
  let hasError = false;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");

    req.db.run(
      `DELETE FROM halls WHERE id IN (${placeholders})`,
      chunk,
      function (err) {
        if (err && !hasError) {
          hasError = true;
          return res.status(500).json({ error: err.message });
        }
        deletedTotal += this ? (this.changes || 0) : 0;
        processedChunks++;

        if (processedChunks === totalChunks && !hasError) {
          res.json({ success: true, deletedCount: deletedTotal });
        }
      }
    );
  }
});

app.post("/api/halls/upload", requireLogin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Excel file is required" });

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Uploaded sheet is empty" });
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!Array.isArray(rows) || rows.length === 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "No data rows found in the uploaded file" });
    }

    req.db.serialize(() => {
      req.db.run("BEGIN TRANSACTION");

      const stmt = req.db.prepare(
        "INSERT OR IGNORE INTO halls (hall_no, capacity, block) VALUES (?,?,?)",
      );

      let count = 0;
      rows.forEach((r) => {
        const hall_no = getRowValue(r, ["hall_no", "hallno", "hallnumber", "hall", "room", "roomno"]);
        const capacity = getRowValue(r, ["capacity", "seats", "cap", "size"]);
        const block = getRowValue(r, ["block", "sector", "building"]);

        if (hall_no && capacity) {
          stmt.run(hall_no, parseInt(capacity) || 0, block || "");
          count++;
        }
      });

      stmt.finalize();
      req.db.run("COMMIT", (commitErr) => {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        if (commitErr) return res.status(500).json({ error: "Failed to save hall records" });

        if (count === 0) {
          return res.status(400).json({
            error: "No valid hall rows found. Required columns: Hall Number ('hall_no') and Capacity ('capacity')."
          });
        }

        res.json({ success: true, count, message: `Successfully imported ${count} classrooms!` });
      });
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

/* =======================
   12. INVIGILATORS ENDPOINTS
   ======================= */
app.get("/api/invigilators", requireLogin, (req, res) => {
  req.db.all("SELECT * FROM invigilators", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ invigilators: rows || [] });
  });
});

app.post("/api/invigilators/add", requireLogin, (req, res) => {
  const { name, dept } = req.body;
  if (!name || !dept) {
    return res.status(400).json({ error: "Faculty name and department are required" });
  }

  req.db.run(
    "INSERT INTO invigilators (name, dept) VALUES (?,?)",
    [name, dept],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    },
  );
});

app.post("/api/invigilators/delete/:id", requireLogin, (req, res) => {
  req.db.run("DELETE FROM invigilators WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post("/api/invigilators/bulk-delete", requireLogin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No invigilator IDs specified for deletion" });
  }

  const chunkSize = 400;
  let deletedTotal = 0;
  let processedChunks = 0;
  const totalChunks = Math.ceil(ids.length / chunkSize);
  let hasError = false;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");

    req.db.run(
      `DELETE FROM invigilators WHERE id IN (${placeholders})`,
      chunk,
      function (err) {
        if (err && !hasError) {
          hasError = true;
          return res.status(500).json({ error: err.message });
        }
        deletedTotal += this ? (this.changes || 0) : 0;
        processedChunks++;

        if (processedChunks === totalChunks && !hasError) {
          res.json({ success: true, deletedCount: deletedTotal });
        }
      }
    );
  }
});

app.post("/api/invigilators/upload", requireLogin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Excel file is required" });

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Uploaded sheet is empty" });
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!Array.isArray(rows) || rows.length === 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "No data rows found in the uploaded file" });
    }

    req.db.serialize(() => {
      req.db.run("BEGIN TRANSACTION");

      const stmt = req.db.prepare(
        "INSERT INTO invigilators (name, dept) VALUES (?,?)",
      );

      let count = 0;
      rows.forEach((r) => {
        const name = getRowValue(r, ["name", "faculty_name", "staff_name", "teacher_name", "faculty"]);
        const dept = getRowValue(r, ["dept", "department", "branch"]);

        if (name && dept) {
          stmt.run(name, dept);
          count++;
        }
      });

      stmt.finalize();
      req.db.run("COMMIT", (commitErr) => {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        if (commitErr) return res.status(500).json({ error: "Failed to save invigilator records" });

        if (count === 0) {
          return res.status(400).json({
            error: "No valid invigilator rows found. Required columns: Name ('name') and Department ('dept')."
          });
        }

        res.json({ success: true, count, message: `Successfully imported ${count} invigilators!` });
      });
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

/* =======================
   13. PUBLIC STUDENT SEAT LOOKUP
   ======================= */
app.get("/api/t/:tenant_id/student-view", (req, res) => {
  const tid = req.params.tenant_id.toLowerCase();

  db.get("SELECT * FROM tenants WHERE id = ?", [tid], (err, tenant) => {
    const activeTenant = tenant || { id: tid, name: "CCET Institution" };
    res.json({ tenant: activeTenant });
  });
});

app.post("/api/t/:tenant_id/student-view", (req, res) => {
  const tid = req.params.tenant_id.toLowerCase();
  let regno = String(req.body.regno || "").trim();
  regno = regno.replace(/\.0$/, "");

  const queryStudentData = (targetTid, callback) => {
    let tenantDb;
    try {
      tenantDb = getTenantDb(targetTid);
    } catch (dbErr) {
      return callback(dbErr);
    }

    tenantDb.get(
      "SELECT * FROM students WHERE TRIM(REPLACE(LOWER(regno), '.0', '')) = TRIM(LOWER(?))",
      [regno],
      (err, studentRow) => {
        if (err) return callback(err);
        tenantDb.all(
          `SELECT sa.*, 
                  COALESCE(NULLIF(sa.subject_name, ''), (SELECT s.subject_name FROM subjects s WHERE s.subject_code = sa.subject_code LIMIT 1), 'Scheduled Exam') as subject_name 
           FROM seat_allocations sa 
           WHERE TRIM(REPLACE(LOWER(sa.regno), '.0', '')) = TRIM(LOWER(?)) 
           ORDER BY sa.exam_date, sa.session`,
          [regno],
          (err2, allocRows) => {
            if (err2) return callback(err2);
            callback(null, studentRow, allocRows, targetTid);
          }
        );
      }
    );
  };

  queryStudentData(tid, (err, studentRow, allocRows, usedTid) => {
    if (!studentRow && (!allocRows || allocRows.length === 0)) {
      findStudentAcrossTenants(regno.toLowerCase(), tid, (findErr, fallbackRow, fallbackTid) => {
        if (fallbackRow && fallbackTid) {
          return queryStudentData(fallbackTid, (err3, sRow, aRows) => {
            db.get("SELECT * FROM tenants WHERE id = ?", [fallbackTid], (tErr, tenant) => {
              const activeTenant = tenant || { id: fallbackTid, name: "Chettinad College of Engineering & Technology" };
              res.json({
                success: true,
                student: {
                  regno: regno,
                  name: sRow ? sRow.name : "Student",
                  dept: sRow ? sRow.dept : "N/A",
                  batch: sRow ? sRow.batch : "N/A",
                  degree: sRow ? sRow.degree : "N/A"
                },
                allocations: aRows || [],
                tenant: activeTenant
              });
            });
          });
        }
        return res.status(404).json({ error: "No student or exam allocation details found for this register number." });
      });
      return;
    }

    db.get("SELECT * FROM tenants WHERE id = ?", [usedTid], (err, tenant) => {
      const activeTenant = tenant || { id: usedTid, name: "Chettinad College of Engineering & Technology" };
      res.json({
        success: true,
        student: {
          regno: regno,
          name: studentRow ? studentRow.name : (allocRows[0] ? allocRows[0].name : "Student"),
          dept: studentRow ? studentRow.dept : (allocRows[0] ? allocRows[0].dept : "N/A"),
          batch: studentRow ? studentRow.batch : (allocRows[0] ? allocRows[0].batch : "N/A"),
          degree: studentRow ? studentRow.degree : "N/A"
        },
        allocations: allocRows || [],
        tenant: activeTenant
      });
    });
  });
});

/* =======================
   14. ALLOCATION GENERATOR
   ======================= */
app.post("/api/allocation/generate", requireLogin, (req, res) => {
  const { subject_codes, exam_date, session } = req.body;

  if (!exam_date || !session) {
    return res.status(400).json({ error: "Exam date and session are required" });
  }

  const rawCodes = String(subject_codes || "").trim();
  if (!rawCodes) {
    return res.status(400).json({ error: "Please enter at least one valid subject code." });
  }

  const codes = Array.from(
    new Set(
      rawCodes
        .split(/[,;]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (codes.length === 0) {
    return res.status(400).json({ error: "Please enter at least one valid subject code." });
  }

  // 1. Fetch subjects catalog first to identify Department + Batch + Subject Name
  req.db.all("SELECT * FROM subjects", (err, subjectsCatalog) => {
    if (err) return res.status(500).json({ error: err.message });

    const catalog = subjectsCatalog || [];

    // Step 1 & 2: Search subjects catalog for every entered subject code
    const subjectConfigs = [];
    for (const code of codes) {
      const matchingEntries = catalog.filter(
        (s) => s.subject_code && s.subject_code.trim().toUpperCase() === code
      );

      if (matchingEntries.length === 0) {
        return res.status(400).json({
          error: `Subject Code ${code} was not found. Please verify the subject code.`
        });
      }

      // If multiple catalog entries exist for the same subject code across batches,
      // find one that aligns with other entered subjects' batches, or default to the first
      let chosenEntry = matchingEntries[0];
      if (matchingEntries.length > 1 && subjectConfigs.length > 0) {
        const priorBatch = subjectConfigs[0].batch;
        const sameBatchMatch = matchingEntries.find(
          (m) => m.batch && String(m.batch).trim().toUpperCase() === String(priorBatch).trim().toUpperCase()
        );
        if (sameBatchMatch) chosenEntry = sameBatchMatch;
      }

      const identifiedDept = String(chosenEntry.dept || "").trim();
      const identifiedBatch = String(chosenEntry.batch || "").trim();
      const identifiedName = String(chosenEntry.subject_name || "").trim();

      subjectConfigs.push({
        code,
        subject_name: identifiedName,
        dept: identifiedDept,
        batch: identifiedBatch,
      });
    }

    // 2. Fetch all registered students
    req.db.all("SELECT * FROM students", (err2, allStudents) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const studentsList = allStudents || [];
      if (studentsList.length === 0) {
        return res.status(404).json({
          error: "No registered students found in the database. Please add students first."
        });
      }

      // Group subject configs by department + batch to handle multiple subjects/electives per department
      const groups = new Map();
      subjectConfigs.forEach((cfg) => {
        const key = (cfg.dept || "GENERAL").toUpperCase() + "::" + (cfg.batch || "ALL").toUpperCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(cfg);
      });

      const seenStudentIds = new Set();
      const bucketMap = new Map();

      for (const [key, groupSubjects] of groups.entries()) {
        const [targetDept, targetBatch] = key.split("::");

        // 1. Candidate students for this department & batch
        let candidateStudents = studentsList.filter((s) => {
          if (seenStudentIds.has(s.id)) return false;
          const sDept = String(s.dept || "").trim().toUpperCase();
          const sBatch = String(s.batch || "").trim().toUpperCase();
          const deptMatches = !targetDept || targetDept === "GENERAL" || sDept === targetDept;
          const batchMatches = !targetBatch || targetBatch === "ALL" || sBatch === targetBatch;
          return deptMatches && batchMatches;
        });

        // 2. Fallback for GENERAL students if target is GENERAL or no specific department students were found
        if (candidateStudents.length === 0 && (targetDept === "GENERAL" || !targetDept)) {
          candidateStudents = studentsList.filter((s) => {
            if (seenStudentIds.has(s.id)) return false;
            const sDept = String(s.dept || "").trim().toUpperCase();
            const sBatch = String(s.batch || "").trim().toUpperCase();
            const isGeneral = sDept === "GENERAL";
            const batchMatches = !targetBatch || targetBatch === "ALL" || sBatch === targetBatch;
            return isGeneral && batchMatches;
          });
        }

        if (candidateStudents.length === 0) {
          const firstSub = groupSubjects[0];
          return res.status(400).json({
            error: `No students were found for ${firstSub.code} under ${firstSub.dept || "Department"}, Batch ${firstSub.batch || "All"}.`
          });
        }

        const subjectAssignments = new Map();
        groupSubjects.forEach((s) => subjectAssignments.set(s.code, []));

        // Check explicit student subject matching
        const unassignedStudents = [];
        candidateStudents.forEach((st) => {
          const sSub = String(st.subject_code || "").trim().toUpperCase();
          const sSubList = sSub.split(/[,;\/]+/).map((x) => x.trim());
          const matchingCodes = groupSubjects.filter((gs) => sSubList.includes(gs.code) || sSub === gs.code);

          if (matchingCodes.length === 1) {
            subjectAssignments.get(matchingCodes[0].code).push(st);
          } else {
            unassignedStudents.push(st);
          }
        });

        const emptySubjects = groupSubjects.filter((gs) => subjectAssignments.get(gs.code).length === 0);

        if (emptySubjects.length > 0) {
          // If unassigned students exist, give them to empty subjects first
          if (unassignedStudents.length > 0) {
            let uIdx = 0;
            while (uIdx < unassignedStudents.length) {
              for (const gs of emptySubjects) {
                if (uIdx < unassignedStudents.length) {
                  subjectAssignments.get(gs.code).push(unassignedStudents[uIdx++]);
                }
              }
              if (emptySubjects.every((gs) => subjectAssignments.get(gs.code).length > 0)) break;
            }
            while (uIdx < unassignedStudents.length) {
              for (const gs of groupSubjects) {
                if (uIdx < unassignedStudents.length) {
                  subjectAssignments.get(gs.code).push(unassignedStudents[uIdx++]);
                }
              }
            }
          }

          // If any subject STILL has 0 students (e.g. all department students were seeded with one default code):
          const stillEmpty = groupSubjects.filter((gs) => subjectAssignments.get(gs.code).length === 0);
          if (stillEmpty.length > 0) {
            const allGroupStudents = [];
            groupSubjects.forEach((gs) => {
              allGroupStudents.push(...subjectAssignments.get(gs.code));
              subjectAssignments.set(gs.code, []);
            });

            // Balance/distribute all group students evenly across the group subjects
            allGroupStudents.forEach((st, idx) => {
              const assignedSub = groupSubjects[idx % groupSubjects.length];
              subjectAssignments.get(assignedSub.code).push(st);
            });
          }
        } else if (unassignedStudents.length > 0) {
          unassignedStudents.forEach((st, idx) => {
            const assignedSub = groupSubjects[idx % groupSubjects.length];
            subjectAssignments.get(assignedSub.code).push(st);
          });
        }

        // Validate and populate buckets for each subject in this group
        for (const cfg of groupSubjects) {
          const assigned = subjectAssignments.get(cfg.code) || [];
          if (assigned.length === 0) {
            return res.status(400).json({
              error: `No students were found for ${cfg.code} under ${cfg.dept || "Department"}, Batch ${cfg.batch || "All"}.`
            });
          }

          assigned.forEach((st) => seenStudentIds.add(st.id));
          bucketMap.set(cfg.code, {
            subject_code: cfg.code,
            subject_name: cfg.subject_name,
            dept: cfg.dept,
            batch: cfg.batch,
            students: assigned.map((s) => ({
              ...s,
              subject_code: cfg.code,
              subject_name: cfg.subject_name,
              dept: s.dept && s.dept.toUpperCase() !== "GENERAL" ? s.dept : cfg.dept,
              batch: s.batch || cfg.batch,
            })),
          });
        }
      }

      // Reconstruct buckets in the exact order of entered codes
      const subjectBuckets = subjectConfigs.map((cfg) => bucketMap.get(cfg.code));

      // 3. Fetch halls
      req.db.all("SELECT * FROM halls ORDER BY hall_no", (errHalls, halls) => {
        if (errHalls || !halls || halls.length === 0) {
          return res.status(400).json({ error: "No exam halls configured. Please add classroom halls first." });
        }

        // 4. Fetch invigilators
        req.db.all("SELECT * FROM invigilators", (errInvs, invs) => {
          if (errInvs || !invs || invs.length === 0) {
            return res.status(400).json({ error: "No invigilators registered. Please add faculty invigilators first." });
          }

          let rawAllocations;
          try {
            rawAllocations = allocateExamSeating(subjectBuckets, halls);
          } catch (allocErr) {
            return res.status(400).json({ error: allocErr.message });
          }

          // Invigilator assignment
          let invIndex = 0;
          const hallInv = {};
          halls.forEach((h) => {
            hallInv[h.hall_no] = invs[invIndex++ % invs.length].name;
          });

          const preview = rawAllocations.map((r) => ({
            regno: r.regno,
            name: r.name || null,
            dept: r.dept,
            batch: r.batch || null,
            subject_code: r.subject_code,
            subject_name: r.subject_name || "",
            hall_no: r.hall_no,
            seat_label: r.seat_label,
            invigilator: hallInv[r.hall_no] || (invs[0] ? invs[0].name : "Invigilator"),
            exam_date,
            session,
          }));

          // Auto-save/confirm to database table seat_allocations
          req.db.run(
            "DELETE FROM seat_allocations WHERE exam_date = ? AND session = ?",
            [exam_date, session],
            (delErr) => {
              if (delErr) {
                return res.status(500).json({ error: "Failed to clear prior allocations: " + delErr.message });
              }

              const stmt = req.db.prepare(`
                INSERT INTO seat_allocations
                (regno, name, subject_code, subject_name, hall_no, seat_label, dept, batch, exam_date, session, invigilator)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
              `);

              preview.forEach((p) => {
                stmt.run(
                  p.regno,
                  p.name || null,
                  p.subject_code,
                  p.subject_name || "",
                  p.hall_no,
                  p.seat_label,
                  p.dept,
                  p.batch || null,
                  p.exam_date,
                  p.session,
                  p.invigilator
                );
              });

              stmt.finalize((finErr) => {
                if (finErr) {
                  return res.status(500).json({ error: "Failed to persist seat allocations: " + finErr.message });
                }
                req.session.preview = preview;
                const distinctHalls = new Set(preview.map((p) => p.hall_no)).size;
                res.json({
                  success: true,
                  preview,
                  message: `Successfully scheduled and verified ${preview.length} student seating allocations across ${distinctHalls} hall(s) for ${exam_date} (${session})!`
                });
              });
            }
          );
        });
      });
    });
  });
});

/* =======================
   16. CONFIRM ALLOCATION
   ======================= */
app.post("/api/allocation/confirm", requireLogin, (req, res) => {
  // Prefer preview sent in request body, fallback to session
  const preview = req.body.preview || req.session.preview;

  if (!preview || preview.length === 0) {
    return res.status(400).json({ error: "No active generated seat preview to confirm" });
  }

  const targetDate = preview[0].exam_date;
  const targetSession = preview[0].session;

  req.db.run(
    "DELETE FROM seat_allocations WHERE exam_date = ? AND session = ?",
    [targetDate, targetSession],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to update allocations for specified exam date and session" });

      const stmt = req.db.prepare(`
        INSERT INTO seat_allocations
        (regno, name, subject_code, subject_name, hall_no, seat_label, dept, batch, exam_date, session, invigilator)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);

      preview.forEach((p) => {
        stmt.run(
          p.regno,
          p.name || null,
          p.subject_code,
          p.subject_name || "",
          p.hall_no,
          p.seat_label,
          p.dept,
          p.batch || null,
          p.exam_date,
          p.session,
          p.invigilator,
        );
      });

      stmt.finalize((err2) => {
        if (err2) return res.status(500).json({ error: "Failed to save seating layouts" });

        // Clean up session preview once successfully confirmed
        req.session.preview = null;
        res.json({ success: true, message: `Allocations for ${targetDate} (${targetSession}) confirmed and saved successfully!` });
      });
    }
  );
});

app.get("/api/allocation/list", requireLogin, (req, res) => {
  req.db.all(
    `SELECT exam_date, session, 
            COUNT(DISTINCT regno) as student_count,
            COUNT(DISTINCT hall_no) as hall_count,
            GROUP_CONCAT(DISTINCT subject_code) as subject_codes,
            GROUP_CONCAT(DISTINCT dept) as departments
     FROM seat_allocations
     GROUP BY exam_date, session
     ORDER BY exam_date DESC, session DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, allocations: rows || [] });
    }
  );
});

app.get("/api/allocation/view-detail", requireLogin, (req, res) => {
  const { exam_date, session } = req.query;
  if (!exam_date || !session) {
    return res.status(400).json({ error: "Exam date and session parameters are required" });
  }

  req.db.all(
    `SELECT sa.*, COALESCE(sa.subject_name, s.subject_name, '') as subject_name
     FROM seat_allocations sa
     LEFT JOIN subjects s ON sa.subject_code = s.subject_code AND (sa.dept = s.dept OR sa.dept IS NULL) AND (sa.batch = s.batch OR sa.batch IS NULL)
     WHERE sa.exam_date = ? AND sa.session = ?
     ORDER BY sa.hall_no, sa.seat_label`,
    [exam_date, session],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, preview: rows || [] });
    }
  );
});

app.post("/api/allocation/delete", requireLogin, (req, res) => {
  const { exam_date, session } = req.body;
  if (!exam_date || !session) {
    return res.status(400).json({ error: "Exam date and session are required" });
  }

  req.db.run(
    "DELETE FROM seat_allocations WHERE exam_date = ? AND session = ?",
    [exam_date, session],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, count: this.changes });
    }
  );
});

/* =======================
   18. SMART MATRIX AI CHATBOT ENDPOINT
   ======================= */
function handleAiChat(req, res) {
  const message = String(req.body?.message || "").trim();
  if (message.length > 1000) {
    return res.status(400).json({ error: "Please keep Matrix AI questions under 1000 characters." });
  }

  if (isHallCountQuery(message)) {
    const user = req.session.user;
    const isTutor = !!(req.session.tutor || (user && (user.isTutor || String(user.role || "").toLowerCase().includes("tutor"))));
    if (!user || isTutor || req.session.student) {
      return res.status(403).json({
        error: "Hall-wide student counts are available to authorized administrators. Please sign in with an administrator account."
      });
    }
    if (!req.db) {
      return res.status(500).json({ error: "Unable to access the examination database right now. Please try again." });
    }

    return analyzeHallCountQuery(req.db, message, (err, result) => {
      if (err) {
        console.error("Matrix AI hall count query error:", err);
        return res.status(500).json({ error: "Unable to retrieve hall allocation data right now. Please try again." });
      }
      if (!result) {
        return res.status(400).json({ error: "Please include an examination hall or ask for a total or highest-count hall." });
      }
      return res.json({ success: true, ...result });
    });
  }

  const lowerMsg = message.toLowerCase();
  const aiPrediction = predictIntent(message);
  const aiConfidence = Number(aiPrediction.confidence || 0);
  const aiIntent = aiConfidence >= 0.55 ? aiPrediction.intent : null;
  const aiMeta = { model: "TF-IDF + Logistic Regression", intent: aiPrediction.intent, confidence: Number(aiConfidence.toFixed(4)) };
  const isStudent = !!req.session.student;
  const studentRegNo = isStudent ? req.session.student.regno : null;

  // 0. Tutor Session Specific Handling (Automatic Batch & Dept Context)
  const isTutor = !!(req.session.tutor || (req.session.user && req.session.user.isTutor));
  const tutorSession = req.session.tutor || (req.session.user && req.session.user.isTutor ? req.session.user : null);

  if (!isStudent && isTutor && tutorSession) {
    return handleTutorAiQuery(
      {
        tutorId: tutorSession.id,
        tenantId: tutorSession.tenant_id,
        message,
        masterDb: db,
        predictedIntent: aiIntent
      },
      (err, tutorResult) => {
        if (err) {
          console.error("Tutor Matrix AI query error:", err);
          return res.status(500).json({ error: "Matrix AI error while processing tutor query." });
        }
        if (tutorResult) {
          return res.json({ ...tutorResult, ai: aiMeta });
        }

        // If not a specific today/timetable query, provide a helpful tutor assistant greeting/prompt
        const deptLabel = tutorSession.degree ? `${tutorSession.degree} ${tutorSession.branch}` : (tutorSession.branch || "your department");
        const batchLabel = tutorSession.batch || "your batch";

        if (lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey") || lowerMsg === "help") {
          return res.json({
            success: true,
            reply: `👋 **Hello ${tutorSession.name || 'Tutor'}!**\n\nI am your **Matrix AI Assistant** for **${deptLabel} (${batchLabel})**.\n\nYou can ask me:\n• *"What exam is my batch writing today?"*\n• *"What is the exam timetable for my batch?"*\n• *"Which exam do my students have today?"*`
          });
        }

        // Fallback for general tutor queries
        return res.json({
          success: true,
          ai: aiMeta,
          reply: `🤖 **Tutor Matrix AI Ready**\n\nYou are logged in as Tutor for **${deptLabel} (${batchLabel})**.\n\nTry asking:\n• *"What exam is my batch writing today?"*\n• *"What is the exam timetable for my batch?"*`
        });
      }
    );
  }

  // 1. Student Hall / Seat Analysis Query
  const isHallIntent = aiIntent === "student_hall" || detectStudentHallQueryIntent(message);
  const potentialRegNo = extractRegNoFromMessage(message);

  if (isStudent) {
    if (lowerMsg === "hi" || lowerMsg === "hello" || lowerMsg === "hey" || lowerMsg === "help") {
      const s = req.session.student;
      return res.json({
        success: true,
        reply: `👋 **Hello ${s.name || 'Student'}!**\n\nI am your **Student Portal Matrix AI Assistant**.\n\nYour Academic Snapshot:\n• **Register Number:** \`${s.regno}\`\n• **Department:** ${s.dept} (${s.batch || 'Batch'})\n• **Class Tutor / Advisor:** ${s.tutor?.name || 'Department Faculty Advisor'}\n\nYou can ask me:\n• *"Show my profile"* or *"Who is my tutor?"*\n• *"What subjects am I taking?"*\n• *"Where is my exam hall?"*`
      });
    }

    if (aiIntent === "student_profile" || detectStudentProfileQueryIntent(message) || lowerMsg.includes("tutor") || lowerMsg.includes("advisor") || lowerMsg.includes("profile") || lowerMsg.includes("subject") || lowerMsg.includes("details") || lowerMsg.includes("info")) {
      const s = req.session.student;
      return res.json({
        success: true,
        ai: aiMeta,
        reply: `🎓 **Student Academic Profile & Details**\n\n` +
          `• **Student Name:** **${s.name}**\n` +
          `• **Register Number:** \`${s.regno}\`\n` +
          `• **Degree & Department:** **${s.degree}** — **${s.dept}**\n` +
          `• **Batch & Academic Year:** **${s.batch}** (${s.academic_year || '3rd Year'} • ${s.semester || 'Semester 5'})\n` +
          `• **Class Tutor / Advisor:** **${s.tutor?.name || 'Department Advisor'}** (${s.tutor?.email || 'advisor@ccet.edu.in'})\n` +
          `• **Primary Registered Subject:** \`${s.subject_code}\`\n` +
          `• **Enrollment Status:** 🟢 **Active Regular Student**\n\n` +
          `💡 *Need to check your exam room or seating? Ask: \"Where is my exam hall?\"*`
      });
    }
  }

  if (isHallIntent || (isStudent && (lowerMsg.includes("exam") || lowerMsg.includes("hall") || lowerMsg.includes("seat") || lowerMsg.includes("schedule") || lowerMsg.includes("timetable")))) {
    return handleStudentHallQuery(
      {
        studentSession: req.session.student,
        requestedRegNo: potentialRegNo,
        tenantId: req.session.student ? req.session.student.tenant_id : (req.headers["x-tenant-id"] || "ccet"),
        tenantDb: req.db,
        masterDb: db,
        message
      },
      (err, result) => {
        if (err) {
          console.error("Student Hall AI error:", err);
          return res.status(500).json({ error: "Matrix AI error while processing student hall query." });
        }
        return res.json({ ...result, ai: aiMeta });
      }
    );
  }

  // 2. Today's (or Specified Date) Exam Allocation Analysis (Total Students / Total Halls)
  const predictedAllocIntent = {
    today_students_count: "today_students_count",
    today_halls_count: "today_halls_count",
    today_summary: "today_summary"
  }[aiIntent] || null;

  // GUARD: If message mentions a specific hall number (e.g. "Hall 101", "Hall H101"),
  // skip the general allocation analytics — let it fall through to the per-hall query in Section 5.
  const _specificHallGuardMatch = message.match(/\bhall\s*[:\-]?\s*([A-Za-z0-9_\-]+)\b/i);
  const _specificHallToken = _specificHallGuardMatch ? _specificHallGuardMatch[1].toUpperCase() : null;
  const _ignoredHallGuardTokens = new Set(["ARE", "IS", "ALLOCATED", "USED", "TOTAL", "ROOM", "ROOMS", "S", "TODAY", "EXAM", "SCHEDULE", "BEING", "COUNT"]);
  const _hasSpecificHallMention = !!(_specificHallToken && !_ignoredHallGuardTokens.has(_specificHallToken));

  // Only run general allocation analytics if NO specific hall is mentioned in the message
  const allocIntent = _hasSpecificHallMention ? null : (detectAllocationQueryIntent(message) || predictedAllocIntent);
  if (allocIntent) {
    const explicitDateVariants = parseDateVariantsFromMessage(message);
    const dateVariants = explicitDateVariants || getTodayDateVariants();
    const isToday = !explicitDateVariants;
    const dateLabel = explicitDateVariants ? explicitDateVariants[0] : "today";

    return getExamAllocationAnalytics(req.db, dateVariants, (err, analytics) => {
      if (err) {
        console.error("Matrix AI allocation query error:", err);
        return res.json({
          success: true,
          reply: "I couldn't retrieve today's exam allocation data. Please try again."
        });
      }

      const reply = formatAllocationResponse(allocIntent, analytics, isToday, dateLabel);
      return res.json({
        success: true,
        ai: aiMeta,
        reply,
        type: "exam_allocation_analysis",
        analytics: {
          totalStudents: analytics.totalStudents,
          totalHalls: analytics.totalHalls,
          hasAllocations: analytics.hasAllocations,
          primaryDate: analytics.primaryDate
        }
      });
    });
  }

  // 3. Detect Register Number (4 to 15 digits / alphanumeric code like 950001, 950002)
  let requestedRegNo = null;
  const regMatch = message.match(/\b[A-Za-z0-9]{4,15}\b/g);
  if (regMatch) {
    for (const token of regMatch) {
      if (/^\d{4,15}$/.test(token) || (token.length >= 5 && /\d{3,}/.test(token))) {
        // Exclude 4-digit years like 2026
        if (!/^(19|20)\d{2}$/.test(token)) {
          requestedRegNo = token;
          break;
        }
      }
    }
  }
  if (!requestedRegNo && req.session.student) {
    requestedRegNo = req.session.student.regno;
  }

  // 4. Detect Date (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, today, inaiku, tomorrow)
  let searchedDate = null;
  const ymdMatch = message.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const dmyMatch = message.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);

  if (ymdMatch) {
    searchedDate = `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, "0")}-${String(ymdMatch[3]).padStart(2, "0")}`;
  } else if (dmyMatch) {
    searchedDate = `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, "0")}-${String(dmyMatch[1]).padStart(2, "0")}`;
  } else if (lowerMsg.includes("today") || lowerMsg.includes("inaiku") || lowerMsg.includes("inayikku")) {
    const todayVars = getTodayDateVariants();
    searchedDate = todayVars[0];
  } else if (lowerMsg.includes("tomorrow") || lowerMsg.includes("naalaiku")) {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const tmrVars = getTodayDateVariants(tmr);
    searchedDate = tmrVars[0];
  }

  // 5. Specific Hall Query — detect any message mentioning a specific hall number
  // Triggers for: count queries, detail queries, info queries, or just "Hall 101"
  const hallCountMatch = message.match(/\bhall\s*[:\-]?\s*([A-Za-z0-9_\-]+)\b/i);
  // Extended: count keywords + any hall detail/info query
  const isHallCountRequest =
    /\b(count|how many|number of|strength|student count|students? in|students? on|students? for|what is the count|tell me|details?|info|information|about|show|list|data|analysis|analyse|analyze|allocated|allocation|seating|who is|who are|check)\b/i.test(lowerMsg) ||
    // Also trigger if message is just "Hall 101" or "Hall 101?" with no other keywords
    /^\s*hall\s*[:\-]?\s*[A-Za-z0-9_\-]+\s*\??\s*$/i.test(message);
  const rawHallToken = hallCountMatch ? hallCountMatch[1].toUpperCase() : null;
  const ignoredHallTokens = new Set(["ARE", "IS", "ALLOCATED", "USED", "TOTAL", "ROOM", "ROOMS", "S", "TODAY", "EXAM", "SCHEDULE", "BEING"]);
  const hallNoQuery = (rawHallToken && !ignoredHallTokens.has(rawHallToken)) ? rawHallToken : null;

  if (hallNoQuery && isHallCountRequest) {
    const sessionMatch = lowerMsg.match(/\b(fn|an|forenoon|afternoon)\b/i);

    // If a specific date is provided, filter by that date; otherwise show ALL allocations for this hall
    if (searchedDate) {
      // Date-specific query
      const params = [hallNoQuery, searchedDate];
      let hallQuery = `SELECT COUNT(DISTINCT regno) as total, session, GROUP_CONCAT(DISTINCT subject_code) as subjects, GROUP_CONCAT(DISTINCT dept) as depts FROM seat_allocations WHERE UPPER(TRIM(hall_no)) = ? AND exam_date = ?`;
      if (sessionMatch) {
        const sessionValue = sessionMatch[1].toLowerCase().startsWith("f") ? "FN" : "AN";
        hallQuery += " AND session = ?";
        params.push(sessionValue);
      }
      hallQuery += " GROUP BY session";

      return req.db.all(hallQuery, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const hallLabel = hallNoQuery;
        const sessionLabel = sessionMatch ? ` (${sessionMatch[1].toUpperCase()} session)` : "";
        if (rows && rows.length > 0) {
          const totalStudents = rows.reduce((sum, r) => sum + (r.total || 0), 0);
          const sessionBreakdown = rows.map(r => `  • **${r.session} Session**: ${r.total} student${r.total === 1 ? "" : "s"} — Subjects: \`${r.subjects || 'N/A'}\``).join("\n");
          return res.json({
            success: true,
            reply: `📊 **Hall ${hallLabel} — ${searchedDate}${sessionLabel}**\n\n**Total Students Allocated: ${totalStudents}**\n\n${sessionBreakdown}`
          });
        }
        return res.json({
          success: true,
          reply: `📊 **Hall ${hallLabel}** — No seating allocations found for **${searchedDate}**${sessionLabel}.\n\nTry asking without a date to see all available allocations for this hall.`
        });
      });
    } else {
      // No date specified — show ALL allocations for this hall across all dates/sessions
      const params = [hallNoQuery];
      let hallQuery = `SELECT exam_date, session, COUNT(DISTINCT regno) as total, GROUP_CONCAT(DISTINCT subject_code) as subjects, GROUP_CONCAT(DISTINCT dept) as depts FROM seat_allocations WHERE UPPER(TRIM(hall_no)) = ?`;
      if (sessionMatch) {
        const sessionValue = sessionMatch[1].toLowerCase().startsWith("f") ? "FN" : "AN";
        hallQuery += " AND session = ?";
        params.push(sessionValue);
      }
      hallQuery += " GROUP BY exam_date, session ORDER BY exam_date DESC, session ASC";

      return req.db.all(hallQuery, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const hallLabel = hallNoQuery;
        const sessionLabel = sessionMatch ? ` (${sessionMatch[1].toUpperCase()} session)` : "";

        if (rows && rows.length > 0) {
          const grandTotal = rows.reduce((sum, r) => sum + (r.total || 0), 0);
          const breakdown = rows.map(r =>
            `  • **${r.exam_date} (${r.session})**: **${r.total}** student${r.total === 1 ? "" : "s"} — Subjects: \`${r.subjects || 'N/A'}\` — Dept: ${r.depts || 'N/A'}`
          ).join("\n");
          return res.json({
            success: true,
            reply: `📊 **Hall ${hallLabel}${sessionLabel} — Seating Allocation Overview**\n\n**Grand Total Students Allocated: ${grandTotal}** (across ${rows.length} session${rows.length === 1 ? "" : "s"})\n\n${breakdown}\n\n💡 _To filter by a specific date or session, ask: \"How many students in Hall ${hallLabel} on 2026-08-10?\"_`
          });
        }

        // Hall exists but no allocations found — provide useful context
        return req.db.all(
          `SELECT DISTINCT hall_no FROM seat_allocations ORDER BY hall_no LIMIT 20`,
          (e2, availHalls) => {
            const hallList = availHalls && availHalls.length > 0
              ? `\n\nAvailable halls with allocations: ${availHalls.map(h => `\`${h.hall_no}\``).join(", ")}`
              : "";
            return res.json({
              success: true,
              reply: `📊 **Hall ${hallLabel}** — No seating allocations found in the database for this hall.${hallList}`
            });
          }
        );
      });
    }
  }

  // -------------------------------------------------------------
  // BRANCH A: Register Number Typed (e.g. "950001", "reg 950001")
  // -------------------------------------------------------------
  if (requestedRegNo) {
    return handleStudentHallQuery(
      {
        studentSession: req.session.student,
        requestedRegNo,
        tenantId: req.session.student ? req.session.student.tenant_id : (req.headers["x-tenant-id"] || "ccet"),
        tenantDb: req.db,
        masterDb: db,
        message
      },
      (err, result) => {
        if (err) {
          console.error("Student Hall AI error:", err);
          return res.status(500).json({ error: "Matrix AI error while processing student register number query." });
        }
        return res.json(result);
      }
    );
  }

  // -------------------------------------------------------------
  // BRANCH B: Specific Date typed or Exam Schedule Query
  // -------------------------------------------------------------
  if (searchedDate || lowerMsg.includes("exam") || lowerMsg.includes("schedule") || lowerMsg.includes("subject")) {
    if (searchedDate) {
      // Query specific date
      req.db.all(
        `SELECT sa.*, 
                COALESCE(NULLIF(sa.subject_name, ''), (SELECT s.subject_name FROM subjects s WHERE s.subject_code = sa.subject_code LIMIT 1), 'Exam') as subject_name
         FROM seat_allocations sa
         WHERE sa.exam_date = ?
         ORDER BY sa.session, sa.hall_no`,
        [searchedDate],
        (err, rows) => {
          if (!err && rows && rows.length > 0) {
            const subjectCodes = [...new Set(rows.map(r => r.subject_code))].join(", ");
            const depts = [...new Set(rows.map(r => r.dept))].join(", ");
            const halls = [...new Set(rows.map(r => r.hall_no))].join(", ");
            const invs = [...new Set(rows.map(r => r.invigilator).filter(Boolean))].join(", ");
            const session = rows[0].session || "FN";

            const reply = `📅 **Exam Schedule for Date: ${searchedDate} (${session} Session)**\n\n` +
              `- 📘 **Assigned Subject Codes:** \`${subjectCodes}\`\n` +
              `- 🏢 **Participating Departments:** ${depts}\n` +
              `- 👥 **Total Allocated Students:** ${rows.length} Students\n` +
              `- 🏫 **Classroom Halls Used:** ${halls}\n` +
              `- 👨‍🏫 **Assigned Invigilators:** ${invs || 'Faculty Staff'}`;

            return res.json({
              success: true,
              reply,
              type: "exam_schedule",
              schedule: { exam_date: searchedDate, session, subject_codes: subjectCodes }
            });
          } else {
            // Get all available scheduled dates to inform user
            req.db.all(
              `SELECT DISTINCT exam_date, session, GROUP_CONCAT(DISTINCT subject_code) as subject_codes FROM seat_allocations GROUP BY exam_date, session`,
              (e, allRows) => {
                let availInfo = "No active exam schedules in database yet.";
                if (allRows && allRows.length > 0) {
                  availInfo = "Active scheduled exam dates are:\n" + allRows.map(r => `• **${r.exam_date} (${r.session})**: Subjects \`${r.subject_codes}\``).join("\n");
                }
                return res.json({
                  success: true,
                  reply: `📅 **No Exam Schedule Found for Date: ${searchedDate}**\n\n${availInfo}`
                });
              }
            );
          }
        }
      );
      return;
    }

    // General Exam Schedule List
    req.db.all(
      `SELECT exam_date, session, 
              COUNT(DISTINCT regno) as student_count,
              COUNT(DISTINCT hall_no) as hall_count,
              GROUP_CONCAT(DISTINCT subject_code) as subject_codes,
              GROUP_CONCAT(DISTINCT dept) as departments
       FROM seat_allocations
       GROUP BY exam_date, session
       ORDER BY exam_date DESC, session DESC`,
      (err, rows) => {
        if (!err && rows && rows.length > 0) {
          const first = rows[0];
          let reply = `📅 **Active Scheduled Exams Overview**\n\n` +
            rows.map(r => `• **Date: ${r.exam_date} (${r.session})**\n  - 📘 Subject Codes: \`${r.subject_codes}\`\n  - 🏢 Departments: ${r.departments}\n  - 👥 Coverage: ${r.student_count} Students in ${r.hall_count} Halls`).join("\n\n");

          return res.json({
            success: true,
            reply,
            type: "exam_schedule",
            schedule: first
          });
        } else {
          return res.json({
            success: true,
            reply: `📅 **No Scheduled Exams Found**\n\nThere are currently no confirmed exam seating allocations saved in the database.`
          });
        }
      }
    );
    return;
  }

  // -------------------------------------------------------------
  // BRANCH C: General Query / Database Overview Response
  // -------------------------------------------------------------
  req.db.get("SELECT COUNT(*) as student_count FROM students", (e1, r1) => {
    req.db.get("SELECT COUNT(*) as hall_count FROM halls", (e2, r2) => {
      req.db.get("SELECT COUNT(*) as subject_count FROM subjects", (e3, r3) => {
        req.db.get("SELECT COUNT(*) as alloc_count FROM seat_allocations", (e4, r4) => {
          const reply = `🤖 **Matrix AI Assistant Ready**\n\n` +
            `Here is the active system overview:\n` +
            `- 🎓 **Total Students:** ${r1 ? r1.student_count : 0}\n` +
            `- 🏫 **Classroom Halls:** ${r2 ? r2.hall_count : 0}\n` +
            `- 📘 **Exam Subjects:** ${r3 ? r3.subject_count : 0}\n` +
            `- 🪑 **Active Seating Allocations:** ${r4 ? r4.alloc_count : 0}\n\n` +
            `**Try typing:**\n` +
            `• Type any Register Number (e.g. \`950001\`) to view student hall profile!\n` +
            `• Type any Date (e.g. \`2026-08-10\` or \`today\`) to view assigned subject codes!`;

          res.json({ success: true, reply });
        });
      });
    });
  });
}

app.post("/api/ai/chat", handleAiChat);
app.post("/api/ai/student-chat", requireStudentLogin, handleAiChat);

/* =======================
   17. PDF STREAMING ENDPOINTS
   ======================= */
app.get("/api/allocation/pdf-hall", requireLogin, (req, res) => {
  // Attempt to fetch allocations from database if session is cleared, fallback to session
  req.db.all(
    `
    SELECT regno, dept, subject_code, hall_no, seat_label, exam_date, session, invigilator
    FROM seat_allocations
    ORDER BY hall_no, seat_label
    `,
    (err, rows) => {
      const activeAllocations = (rows && rows.length > 0) ? rows : req.session.preview;

      if (!activeAllocations || activeAllocations.length === 0) {
        return res.status(400).send("No confirmed allocation or active preview available");
      }

      const doc = new PDFDocument({ margin: 36, size: "A4" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=Exam_Hall_Seating.pdf");
      doc.pipe(res);

      const date = activeAllocations[0].exam_date;
      const session = activeAllocations[0].session;

      /* GROUP BY HALL */
      const halls = {};
      activeAllocations.forEach((p) => {
        if (!halls[p.hall_no]) halls[p.hall_no] = [];
        halls[p.hall_no].push(p);
      });

      const cols = ["A", "B", "C", "D"];
      const cellWidth = 135;
      const cellHeight = 70;

      Object.keys(halls).forEach((hallNo, index) => {
        if (index !== 0) doc.addPage();

        const seats = halls[hallNo];

        /* ===== HEADER ===== */
        const headerX = 30;
        const headerY = 20;
        const headerWidth = doc.page.width - 60;
        const headerHeight = 90;

        doc
          .roundedRect(headerX, headerY, headerWidth, headerHeight, 12)
          .fill("#0f172a");

        doc
          .fillColor("white")
          .fontSize(16)
          .text("EXAM HALL SEATING ARRANGEMENT", headerX, headerY + 14, {
            width: headerWidth,
            align: "center",
          })
          .fontSize(10)
          .text(`Date: ${date} | Session: ${session}`, headerX, headerY + 38, {
            width: headerWidth,
            align: "center",
          })
          .fontSize(11)
          .text(
            `Hall: ${hallNo}   |   Invigilator: ${seats[0].invigilator}`,
            headerX,
            headerY + 62,
            { width: headerWidth, align: "center" },
          );

        doc.fillColor("black");
        doc.y = headerY + headerHeight + 20;

        /* MAP SEATS */
        const seatMap = {};
        seats.forEach((s) => (seatMap[s.seat_label] = s));

        const maxRow = Math.max(
          ...seats.map((s) => parseInt(s.seat_label.slice(1)) || 1),
        );

        let x = (doc.page.width - cols.length * cellWidth) / 2;
        let y = doc.y;

        /* COLUMN HEADERS */
        cols.forEach((c, i) => {
          doc
            .roundedRect(x + i * cellWidth, y, cellWidth - 10, 38, 8)
            .fill("#1e293b");

          doc
            .fillColor("white")
            .fontSize(13)
            .text(c, x + i * cellWidth, y + 10, {
              width: cellWidth - 10,
              align: "center",
            });

          doc.fillColor("black");
        });

        y += 50;

        /* SEAT GRID */
        for (let r = 1; r <= maxRow; r++) {
          cols.forEach((c, i) => {
            const key = c + r;
            const s = seatMap[key];

            const bx = x + i * cellWidth;
            const by = y;

            doc
              .roundedRect(bx, by, cellWidth - 10, cellHeight, 8)
              .stroke("#cbd5e1");

            if (s) {
              doc
                .fontSize(10)
                .text(key, bx, by + 8, { width: cellWidth - 10, align: "center" })
                .fontSize(11)
                .text(String(s.regno).replace(/\.0$/, ""), bx, by + 26, {
                  width: cellWidth - 10,
                  align: "center",
                })
                .fontSize(9)
                .fillColor("#475569")
                .text(s.dept, bx, by + 46, {
                  width: cellWidth - 10,
                  align: "center",
                })
                .fillColor("black");
            }
          });

          y += cellHeight + 14;

          if (y + cellHeight > doc.page.height - 40) {
            doc.addPage();
            y = 90;
          }
        }
      });

      doc.end();
    }
  );
});

app.get("/api/allocation/pdf-summary", requireLogin, (req, res) => {
  req.db.all(
    `
    SELECT hall_no, subject_code, regno, exam_date, session
    FROM seat_allocations
    ORDER BY hall_no, subject_code, regno
    `,
    (err, rows) => {
      if (err || !rows || rows.length === 0) {
        return res.status(400).send("No confirmed allocation data found to summarize");
      }

      /* ---------- GROUP DATA ---------- */
      const hallMap = {};
      rows.forEach((r) => {
        if (!hallMap[r.hall_no]) hallMap[r.hall_no] = {};
        if (!hallMap[r.hall_no][r.subject_code])
          hallMap[r.hall_no][r.subject_code] = [];
        hallMap[r.hall_no][r.subject_code].push(
          String(r.regno).replace(/\.0$/, ""),
        );
      });

      const halls = Object.keys(hallMap);
      const meta = rows[0];

      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margins: { top: 0, left: 0, right: 0, bottom: 25 },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=Hall_Allocation_Summary.pdf");
      doc.pipe(res);

      /* ---------- HEADER (FULL WIDTH, NO GAPS) ---------- */
      const headerHeight = 80;

      const drawHeader = () => {
        doc.save();

        doc.rect(0, 0, doc.page.width, headerHeight).fill("#0f172a");

        doc
          .fillColor("white")
          .fontSize(18)
          .text("ANNA UNIVERSITY, CHENNAI – 25", 0, 20, {
            width: doc.page.width,
            align: "center",
          });

        doc.fontSize(12).text("Examination Wing – Hall Allocation Summary", {
          width: doc.page.width,
          align: "center",
        });

        doc
          .fontSize(10)
          .text(`Date / Session : ${meta.exam_date} | ${meta.session}`, {
            width: doc.page.width,
            align: "center",
          });

        doc.restore();
      };

      drawHeader();

      /* ---------- GRID CONFIG ---------- */
      const boxW = 380;
      const boxH = 210;

      const startX = 30;
      const startY = headerHeight + 30;

      const gapX = 30;
      const gapY = 30;

      /* ---------- DRAW HALL BLOCK ---------- */
      function drawHallBlock(hallNo, x, y) {
        const subjects = hallMap[hallNo];
        let hallTotal = 0;

        // Outer box
        doc.roundedRect(x, y, boxW, boxH, 10).stroke("#94a3b8");

        // Header
        doc
          .roundedRect(x, y, boxW, 28, 10)
          .fill("#1e293b")
          .fillColor("white")
          .fontSize(11)
          .text(`HALL : ${hallNo}`, x, y + 7, {
            width: boxW,
            align: "center",
          })
          .fillColor("black");

        let cy = y + 40;
        const contentBottom = y + boxH - 34;

        /* SUBJECTS (CLIPPED) */
        Object.entries(subjects).forEach(([sub, regs]) => {
          if (cy + 24 > contentBottom) return;

          doc.fontSize(9).text(sub, x + 12, cy);
          cy += 12;

          doc
            .fontSize(8)
            .fillColor("#334155")
            .text(regs.join(", "), x + 12, cy, {
              width: boxW - 24,
              height: contentBottom - cy,
              ellipsis: true,
            })
            .fillColor("black");

          cy += 22;
          hallTotal += regs.length;
        });

        /* FOOTER (FIXED POSITION) */
        doc.rect(x, y + boxH - 26, boxW, 26).fill("#f1f5f9");

        doc
          .fillColor("black")
          .fontSize(10)
          .text(`HALL TOTAL : ${hallTotal}`, x, y + boxH - 18, {
            width: boxW,
            align: "center",
          });
      }

      /* ---------- MAIN LOOP ---------- */
      halls.forEach((hallNo, i) => {
        if (i > 0 && i % 4 === 0) {
          doc.addPage();
          drawHeader();
        }

        const pos = i % 4;
        const col = pos % 2;
        const row = Math.floor(pos / 2);

        const x = startX + col * (boxW + gapX);
        const y = startY + row * (boxH + gapY);

        drawHallBlock(hallNo, x, y);
      });

      doc.end();
    },
  );
});

/* =======================
   18. PRODUCTION FRONTEND SERVING
   ======================= */
const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDistPath));

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("API route not found and Frontend build not found.");
  }
});

/* =======================
   19. GLOBAL ERROR HANDLERS
   ======================= */
app.use((err, req, res, next) => {
  console.error("Express Error Catch:", err.stack || err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.stack || err.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});

/* =======================
   20. SERVER LISTEN
   ======================= */
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use by another process. Please stop any process using port ${PORT} or run on another port.`);
  } else {
    console.error("Server error:", err);
  }
});
