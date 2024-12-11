const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const validator = require("validator");
const dotenv = require("dotenv").config();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 8080;

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

// Konfigurasi Google Cloud Storage
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

// Konfigurasi multer untuk mengunggah file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal ukuran file 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("File harus berupa gambar (jpeg, jpg, png)"));
  },
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

  // Validasi input
  if (!username || !email || !password) {
    return res.status(400).json({ error: true, message: "All fields are required" });
  }

  // Validasi format email
  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: true, message: "Invalid email format" });
  }

  // Validasi panjang password
  if (!validator.isLength(password, { min: 8 })) {
    return res.status(400).json({ error: true, message: "Password must be at least 8 characters" });
  }

  // Validasi format username (hanya alphanumeric, dengan beberapa karakter khusus)
  if (!validator.isAlphanumeric(username, 'en-US', { ignore: '._-' })) {
    return res.status(400).json({ error: true, message: "Invalid username format" });
  }

  console.log("Request received:", { username, email });

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed successfully");

    // Cek apakah username atau email sudah ada di database
    db.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [email, username],
      (err, results) => {
        if (err) {
          console.error("Database query error:", err);
          return res.status(500).json({ error: "Server error during query" });
        }

        if (results.length > 0) {
          return res.status(400).json({ error: "Email or username already exists" });
        }

        // Jika tidak ada duplikasi, insert data ke database
        db.query(
          "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
          [username, email, hashedPassword],
          (err, result) => {
            if (err) {
              console.error("Database insert error:", err);
              if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Email or username already exists" });
              }
              return res.status(500).json({ error: "Server error during insert", details: err });
            }
        
            console.log("User created successfully:", result);
            res.status(201).json({ error: false, message: "User Created" });
          }
        );
      }
    );
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Server error" });
  }
});



// Endpoint: Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: true, message: "Email and password are required" });
  }

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(400).json({ error: true, message: "User not found" });
      }

      const user = results[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(401).json({ error: true, message: "Incorrect password" });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.status(200).json({
        error: false,
        message: "success",
        loginResult: {
          userId: user.id,
          name: user.username, // Menggunakan username sebagai name
          token,
        },
      });
    }
  );
});

// Endpoint: Protected Route (contoh penggunaan token)
app.get("/profile", authenticateToken, (req, res) => {
  res.status(200).json({
    message: "Ini adalah halaman profile",
    user: req.user,
  });
});

// Endpoint: Unggah Foto Profil
app.post("/profile/upload-photo", authenticateToken, upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File foto diperlukan" });
  }

  try {
    const fileName = `profile_photos/${req.user.id}_${Date.now()}_${req.file.originalname}`;
    const blob = storage.bucket(bucketName).file(fileName);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
    });

    blobStream.on("error", (err) => {
      console.error("Error uploading to GCS:", err.message);
      res.status(500).json({ error: "Gagal mengunggah foto ke server" });
    });

    blobStream.on("finish", () => {
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;

      // Simpan URL foto profil ke database
      db.query(
        "UPDATE users SET profile_photo = ? WHERE id = ?",
        [publicUrl, req.user.id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: "Gagal menyimpan URL foto ke database" });
          }
          res.status(200).json({ message: "Foto profil berhasil diunggah", photoUrl: publicUrl });
        }
      );
    });

    blobStream.end(req.file.buffer);
  } catch (error) {
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
});

// Endpoint: Edit Foto Profil
app.post("/profile/photo", authenticateToken, upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Foto profil diperlukan" });
  }

  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  const allowedExtensions = [".jpg", ".jpeg", ".png"];
  if (!allowedExtensions.includes(fileExtension)) {
    return res.status(400).json({ error: "Format file tidak valid. Hanya JPG atau PNG yang diperbolehkan" });
  }

  try {
    // Nama file unik untuk penyimpanan di Cloud Storage
    const fileName = `profile-photos/${req.user.id}-${Date.now()}${fileExtension}`;
    const blob = bucket.file(fileName);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    blobStream.on("error", (err) => {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Gagal mengunggah foto profil" });
    });

    blobStream.on("finish", async () => {
      // URL publik untuk foto profil
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;

      // Perbarui URL foto profil di database
      db.query(
        "UPDATE users SET profile_photo = ? WHERE id = ?",
        [publicUrl, req.user.id],
        (err, result) => {
          if (err) {
            console.error("Database update error:", err);
            return res.status(500).json({ error: "Gagal memperbarui foto profil" });
          }
          res.status(200).json({
            message: "Foto profil berhasil diperbarui",
            profilePhoto: publicUrl,
          });
        }
      );
    });

    blobStream.end(req.file.buffer);
  } catch (error) {
    console.error("Error during upload:", error);
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
});

// Endpoint: Edit Profile
app.put("/profile/edit", authenticateToken, async (req, res) => {
  const { username, email, password } = req.body;

  if (username && !validator.isLength(username, { min: 3, max: 20 })) {
    return res.status(400).json({ error: "Username harus memiliki 3-20 karakter" });
  }

  if (email && !validator.isEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid" });
  }

  if (password && !validator.isStrongPassword(password, { minLength: 8, minSymbols: 0 })) {
    return res.status(400).json({
      error: "Password harus minimal 8 karakter dan mengandung huruf besar, kecil, dan angka",
    });
  }

  try {
    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.password = hashedPassword;
    }

    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      return res.status(400).json({ error: "Tidak ada data yang diperbarui" });
    }

    const updateFields = updateKeys.map((key) => `${key} = ?`).join(", ");
    const updateValues = updateKeys.map((key) => updates[key]);
    updateValues.push(req.user.id);

    db.query(
      `UPDATE users SET ${updateFields} WHERE id = ?`,
      updateValues,
      (err, result) => {
        if (err) {
          console.error("Error updating profile:", err.message);
          return res.status(500).json({ error: "Gagal memperbarui profil" });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: "Pengguna tidak ditemukan" });
        }

        res.status(200).json({ message: "Profil berhasil diperbarui" });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Terjadi kesalahan pada server" });
  }
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server berjalan di 0.0.0.0:${PORT}`);
});
