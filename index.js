const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const multer = require("multer");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Nandhakumar@123",
  database: "biits_expense_tracker",
});

db.connect((err) => {
  if (err) {
    throw err;
  }
  console.log("MySQL connected...");
});

app.post("/emp_register", async (req, res) => {
  const { emp_id, name, email, password, user_role, phone } = req.body;

  //   if (!name || !email || !password || !user_role || !phone) {
  //     return res
  //       .status(400)
  //       .json({ error: "Please provide all required fields" });
  //   }

  try {
    const userCheckSql = `SELECT * FROM emp_details WHERE email = ?`;
    db.query(userCheckSql, [email], async (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length > 0) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

      const sql = `INSERT INTO emp_details (emp_id,name, email, password, user_role, phone) VALUES (?,?, ?, ?, ?, ?)`;
      db.query(
        sql,
        [emp_id, name, email, hashedPassword, user_role, phone],
        (err, result) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database error" });
          }
          res.status(201).json({ message: "User registered successfully" });
        }
      );
    });
  } catch (error) {
    console.error("Internal server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login API
app.post("/emp_login", (req, res) => {
  const { email, password, user_role } = req.body;

  if (!email || !password || !user_role) {
    return res
      .status(400)
      .json({ error: "Please provide email, password and use_role" });
  }

  const sql = `SELECT * FROM emp_details WHERE email = ?`;
  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = results[0];

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.user_role !== user_role) {
      return res.status(401).json({ error: "Invalid user role" });
    }

    // Remove password from user object
    const { password: userPassword, ...userWithoutPassword } = user;
    res.json({ message: "Login successful", user: userWithoutPassword });
  });
});

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = "./uploads"; // Default upload path

    // Example: Store files in a directory based on user ID
    if (req.body.user_id) {
      uploadPath = `./uploads/${req.body.user_id}`;
    }

    // Ensure the directory exists, create it if it doesn't
    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath); // Set destination dynamically
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Keep original filename
  },
});

const upload = multer({ storage: storage });
// API to store expense details
app.post("/store_expense", upload.single("receipt"), async (req, res) => {
  const { emp_id, date, items, amount } = req.body;
  //   const receipt = req.file.path; // Uploaded file path
  let receipt = "";

  // Check if file was uploaded
  if (req.file) {
    receipt = req.file.path; // Uploaded file path
  }

  if (!emp_id || !date || !items || !amount || !receipt) {
    return res
      .status(400)
      .json({ error: "Please provide all required fields" });
  }

  try {
    const sql = `INSERT INTO expense_details (emp_id,date, items, receipt, amount) VALUES (?, ?, ?, ?, ?)`;
    db.query(sql, [emp_id, date, items, receipt, amount], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.status(201).json({ message: "Expense details stored successfully" });
    });
  } catch (error) {
    console.error("Internal server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to fetch all expenses for a particular user (emp_id)
app.get("/fetch_expenses/:emp_id", (req, res) => {
  const emp_id = req.params.emp_id;

  if (!emp_id) {
    return res.status(400).json({ error: "Please provide emp_id" });
  }

  const sql = `SELECT * FROM expense_details WHERE emp_id = ?`;
  db.query(sql, [emp_id], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ expenses: results });
  });
});

// Multer storage configuration
const refundStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = "./uploads/refunds";
    if (req.body.id) {
      uploadPath = `./uploads/refunds/${req.body.id}`;
    }
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const refundUpload = multer({ storage: refundStorage });

// API to update expense details with refund_receipt and refund_status
app.post(
  "/update_expense/:id",
  refundUpload.array("refund_receipt", 10),
  (req, res) => {
    const { id } = req.params;
    const { refund_status } = req.body;
    let refund_receipt = req.files.map((file) => file.path).join(","); // Store multiple file paths as comma-separated string

    if (!refund_status) {
      return res.status(400).json({ error: "Please provide refund_status" });
    }

    const sql = `UPDATE expense_details SET refund_receipt = ?, refund_status = ? WHERE id = ?`;
    db.query(sql, [refund_receipt, refund_status, id], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.status(200).json({ message: "Expense updated successfully" });
    });
  }
);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
