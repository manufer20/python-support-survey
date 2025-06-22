// surveyProxy – CommonJS Azure Function

const FLOW_URL =
  "https://prod-149.westeurope.logic.azure.com:443/workflows/5d4cdfd91c2748449afff34157bd8379/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=tM2yN2voxBg0uq1F7G4r5-i4Mxku3asseDZjrGgLqBw";

const ACCESS_KEY = "RacingCampeon2025";

// use the built-in globalThis.fetch in Node 18;
// if not present, fall back to undici polyfill
const fetchFn =
  typeof fetch === "function"
    ? fetch
    : (...a) => import("undici").then(({ fetch }) => fetch(...a));

module.exports = async function (context, req) {
  try {
    // header check
    if (req.headers["x-api-key"] !== ACCESS_KEY) {
      context.res = { status: 401, body: "Unauthorized" };
      return;
    }

    // forward to Power Automate
    const resp = await fetchFn(FLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {})
    });

    context.res = {
      status: resp.status,
      body: await resp.text()
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.toString() };
  }
}



const express = require("express");
const { createHandler } = require("@azure/functions");
const fetch = require("node-fetch");
const ExcelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(express.json());

const ACCESS_KEY = "RacingCampeon2025";

const SHAREPOINT_TOKEN = "Bearer YOUR_ACCESS_TOKEN_HERE";
const EXCEL_URL = "https://yourdomain.sharepoint.com/sites/yoursite/_api/web/getfilebyserverrelativeurl('/sites/yoursite/Shared Documents/yourfile.xlsx')/$value";

const CACHE_DIR = path.join(__dirname, "cache");
const LOCAL_FILE = path.join(CACHE_DIR, "yourfile.xlsx");
const METADATA_FILE = path.join(CACHE_DIR, "lastUpdated.json");

// Ensure cache folder exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (e) {}
}

// Check if file is older than 1 day
async function shouldUpdateFile() {
  try {
    const meta = JSON.parse(await fs.readFile(METADATA_FILE, "utf8"));
    const lastUpdated = new Date(meta.lastUpdated);
    const now = new Date();
    const ageInHours = (now - lastUpdated) / (1000 * 60 * 60);
    return ageInHours >= 24;
  } catch {
    return true; // No metadata = needs update
  }
}

// Download file and save it locally
async function updateLocalFile() {
  const res = await fetch(EXCEL_URL, {
    method: "GET",
    headers: {
      "Authorization": SHAREPOINT_TOKEN,
      "Accept": "*/*"
    }
  });

  if (!res.ok) throw new Error(`SharePoint fetch failed: ${res.status}`);

  const buffer = await res.buffer();
  await fs.writeFile(LOCAL_FILE, buffer);
  await fs.writeFile(METADATA_FILE, JSON.stringify({ lastUpdated: new Date().toISOString() }));
}

// Read the Excel file and check for student number
async function checkStudentNumber(studentNumber) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(LOCAL_FILE);

  let found = false;
  workbook.eachSheet(sheet => {
    sheet.eachRow(row => {
      row.eachCell(cell => {
        if (String(cell.value).trim() === studentNumber) {
          found = true;
        }
      });
    });
  });

  return found;
}

// Middleware to protect with API key
app.use((req, res, next) => {
  if (req.headers["x-api-key"] !== ACCESS_KEY) {
    return res.status(401).send("Unauthorized");
  }
  next();
});

// GET /student?student_number=123456
app.get("/student", async (req, res) => {
  const studentNumber = req.query.student_number?.trim();
  if (!studentNumber) return res.status(400).send("Missing student_number");

  try {
    await ensureCacheDir();

    if (await shouldUpdateFile()) {
      console.log("🔄 Updating cached Excel file from SharePoint...");
      await updateLocalFile();
    }

    const exists = await checkStudentNumber(studentNumber);
    res.status(200).json({ exists });
  } catch (err) {
    console.error("Error checking student number:", err);
    res.status(500).send("Internal server error");
  }
});

module.exports = createHandler(app);
