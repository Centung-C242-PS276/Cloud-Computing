const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const validator = require("validator");
const dotenv = require("dotenv").config();
const jwt = require("jsonwebtoken");
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080; // Menggunakan PORT yang diberikan oleh Cloud Run

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Konfigurasi koneksi ke Google Cloud SQL
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.getConnection((err) => {
  if (err) {
    console.error("Error connecting to the database:", err.message);
  } else {
    console.log("Connected to the MySQL database.");
  }
});

// Middleware untuk validasi token JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ error: "Token diperlukan" });
  }

  const tokenWithoutBearer = token.startsWith('Bearer ') ? token.slice(7) : token;
  console.log("Token diterima:", tokenWithoutBearer); // Tambahkan log ini

  jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token tidak valid" });
    }
    console.log("User dari token:", user); // Tambahkan log ini
    req.user = user;
    next();
  });
};

// Rute utama (root)
app.get("/", (req, res) => {
  res.send("API authentication centung is running...");
});

// Endpoint: Register
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, dan password diperlukan" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid" });
  }

  if (!validator.isLength(username, { min: 3, max: 20 })) {
    return res.status(400).json({ error: "Username harus memiliki 3-20 karakter" });
  }

  if (!validator.isStrongPassword(password, { minLength: 8, minSymbols: 0 })) {
    return res.status(400).json({
      error: "Password harus minimal 8 karakter dan mengandung huruf besar, kecil, dan angka",
    });
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan data ke database, termasuk JWT token
    db.query(
      "INSERT INTO users (username, email, password, jwt_token) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, ''],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Email atau username sudah digunakan" });
          }
          return res.status(500).json({ error: "Gagal mendaftar pengguna" });
        }
        res.status(201).json({ message: "Registrasi berhasil" });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
});

// Endpoint: Login
app.post("/login", (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Email/Username dan password diperlukan" });
  }

  // Cek apakah identifier adalah email atau username
  db.query(
    "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?",
    [identifier.toLowerCase(), identifier.toLowerCase()],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(400).json({ error: "Pengguna tidak ditemukan" });
      }

      const user = results[0];

      // Periksa password
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: "Password salah" });
      }

      // Generate JWT Token
      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

      // Simpan JWT token ke dalam database
      db.query(
        "UPDATE users SET jwt_token = ? WHERE id = ?",
        [token, user.id],
        (err, result) => {
          if (err) {
            return res.status(500).json({ error: "Gagal menyimpan JWT token" });
          }
          res.status(200).json({
            message: "Login berhasil",
            token,
            user: {
              username: user.username,
              email: user.email,
            },
          });
        }
      );
    }
  );
});

// Endpoint: Protected Route (contoh penggunaan token)
app.get("/profile", authenticateToken, (req, res) => {
  res.status(200).json({
    message: "Ini adalah halaman profile",
    user: req.user, // Menampilkan user info yang ada pada token
  });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server berjalan di 0.0.0.0:${PORT}`);
});
