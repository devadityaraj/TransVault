const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const QRCode = require('qrcode');
const cors = require('cors');
const session = require('express-session'); 

const app = express();
const PORT = 3000;

const corsOptions = {
  origin: true, // Allows requests from any origin, or specify your origin URL
  credentials: true // Allows cookies and session data to be sent
};

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'your-secret-key', 
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: true,
    sameSite: 'none' 
  }
}));

let users = [];
const usersFilePath = path.join(__dirname, 'users.json');
if (fs.existsSync(usersFilePath)) {
  users = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
}

app.use((req, res, next) => {
  if (!req.session.uploadFolder) {
    req.session.uploadFolder = crypto.randomBytes(8).toString('hex');
    const folderPath = path.join(__dirname, 'uploads', req.session.uploadFolder);

    fs.mkdirSync(folderPath, { recursive: true });

    fs.writeFileSync(path.join(folderPath, 'key.txt'), req.session.uploadFolder);
  }
  next();
});

app.use((req, res, next) => {
  req.ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  next();
});

app.post('/log-login', (req, res) => {
  const { id, gps, date, time } = req.body;
  const ip = req.ipAddress;

  const logEntry = {
    id,
    ip,
    gps,
    date,
    time
  };

  const logFilePath = path.join(__dirname, 'history.json');

  fs.readFile(logFilePath, (err, data) => {
    if (err && err.code !== 'ENOENT') return res.status(500).send('Error reading history file');

    let history = [];
    if (data.length > 0) {
      try {
        history = JSON.parse(data);
      } catch (e) {
        history = [];
      }
    }

    history.push(logEntry);

    fs.writeFile(logFilePath, JSON.stringify(history, null, 2), (err) => {
      if (err) return res.status(500).send('Error writing to history file');
      res.status(200).send('Login data logged successfully');
    });
  });
});

app.post('/login', (req, res) => {
  const { id, password } = req.body;

  const user = users.find(user => user.id === id && user.password === password);

  if (user) {
    res.json({
      redirectUrl: user.role === 'admin' ? '/admin.html' : '/reader.html'
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials!' });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderPath = path.join(__dirname, 'uploads', req.session.uploadFolder);
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

app.post('/upload', upload.fields([
  { name: 'documents', maxCount: 10 },
]), (req, res) => {
  const uniqueKey = req.session.uploadFolder;
  const folderPath = path.join(__dirname, 'uploads', uniqueKey);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const formData = {
    dispatch_id: req.body.dispatch_id,
    date_dispatch: req.body.date_dispatch,
    time_dispatch: req.body.time_dispatch,
    sender_company: req.body.sender_company,
    sender_contact: req.body.sender_contact,
    sender_phone: req.body.sender_phone,
    sender_email: req.body.sender_email,
    sender_address: req.body.sender_address,
    receiver_company: req.body.receiver_company,
    receiver_contact: req.body.receiver_contact,
    receiver_phone: req.body.receiver_phone,
    receiver_email: req.body.receiver_email,
    receiver_address: req.body.receiver_address,
    truck_number: req.body.truck_number,
    truck_type: req.body.truck_type,
    cargo_type: req.body.cargo_type,
    license_plate: req.body.license_plate,
    drivers: req.body.drivers,
    cargo_description: req.body.cargo_description,
    cargo_weight: req.body.cargo_weight,
    cargo_dimensions: {
      length: req.body.cargo_length,
      width: req.body.cargo_width,
      height: req.body.cargo_height
    },
    special_instructions: req.body.special_instructions,
    pickup_location: req.body.pickup_location,
    delivery_location: req.body.delivery_location,
    estimated_pickup_time: req.body.estimated_pickup_time,
    estimated_delivery_time: req.body.estimated_delivery_time,
    route_details: req.body.route_details,
    insurance_details: req.body.insurance_details,
    permit_numbers: req.body.permit_numbers,
    customs_docs: req.body.customs_docs,
    attachments: req.body.attachments,
    authorized_by: req.body.authorized_by,
    signature: req.body.signature,
  };

  const jsonFilePath = path.join(folderPath, 'formData.json');
  
  fs.writeFile(jsonFilePath, JSON.stringify(formData, null, 2), (err) => {
    if (err) return res.status(500).send('Failed to save form data');
    QRCode.toDataURL(uniqueKey, (err, url) => {
      if (err) return res.status(500).send('Failed to generate QR code');
      res.json({ qrCodeUrl: url, uniqueKey });
    });
  });
});

app.get('/form-data/:key', (req, res) => {
  const uniqueKey = req.params.key;
  const folderPath = path.join(__dirname, 'uploads', uniqueKey);
  const jsonFilePath = path.join(folderPath, 'formData.json');

  if (!fs.existsSync(jsonFilePath)) {
    return res.status(404).send('Form data not found');
  }
  fs.readFile(jsonFilePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading form data');
    res.json(JSON.parse(data));
  });
});

app.get('/documents/:key', (req, res) => {
  const uniqueKey = req.params.key;
  const folderPath = path.join(__dirname, 'uploads', uniqueKey);
  if (!fs.existsSync(folderPath)) {
    return res.status(404).send('No matching folder found');
  }
  const files = fs.readdirSync(folderPath).filter(file => file !== 'key.txt' && file !== 'formData.json');
  res.json({ files });
});

app.get('/history.json', (req, res) => {
  const historyFilePath = path.join(__dirname, 'history.json');
  fs.readFile(historyFilePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ message: 'History not found' });
      }
      return res.status(500).json({ message: 'Error reading history file' });
    }
    res.json(JSON.parse(data));
  });
});

app.get('/view/:key/:file', (req, res) => {
  const uniqueKey = req.params.key;
  const fileName = req.params.file;
  const folderPath = path.join(__dirname, 'uploads', uniqueKey);

  const filePath = path.join(folderPath, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  res.sendFile(filePath);
});

app.post('/register', (req, res) => {
  const { fullName, role, id, password } = req.body;

  if (users.some(user => user.id === id)) {
    return res.status(400).send('User already exists');
  }

  const newUser = { fullName, role, id, password };
  users.push(newUser);

  fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), (err) => {
    if (err) return res.status(500).send('Failed to save user data');
    res.status(201).send('User registered successfully');
  });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});