const express = require('express');
const fs = require('fs').promises;// Asynchrones fs-Modul
const path = require('path');
const app = express();
const port = 3000;
const multer = require('multer');
const { exec } = require('child_process');
const cors = require('cors');
app.use(cors());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web'));

// Route, um die JSON-Daten zu senden
app.get('/data/:index', async (req, res) => {
  try {
    const index = req.params.index;

    const filePath = path.join(__dirname, 'leadSheetData.json');

    const data = await fs.readFile(filePath, 'utf8'); // JSON-Datei lesen

    const jsonData = JSON.parse(data); // In JavaScript-Objekt umwandeln

    res.json(jsonData[index].noteInfo); // Als JSON senden
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der JSON-Datei' });
  }
});

app.use(express.static(path.join(__dirname, 'web')));

app.get('/uploadForm', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'uploadForm.html'));
});

app.get('/:index', (req, res) => {
    const index = req.params.index;
    const data = {
        index: index    
    };
    res.render('index', data); // Template "index.ejs" aus dem "web"-Ordner
});


// Route für das Formular
app.get('/json', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'jsonForm.html'));
});


// Route zum Speichern des JSON-Arra

app.post('/saveStatus/:index', async (req, res) => {
    const index = req.params.index;

    try {
        console.log(req.body.jsonArray)
        const jsonArray = req.body.jsonArray;
        // Versuche, das JSON zu parsen, um sicherzustellen, dass es valide ist
        console.log("test2")

        console.log(jsonArray)
        // Speichere das JSON in einer Datei
        await fs.writeFile('usedChords.json', jsonArray);
        res.json({ message: 'JSON erfolgreich gespeichert!' });
    } catch (error) {
        res.status(400).json({ error: 'Ungültiges JSON-Format oder Fehler beim Speichern' });
    }
});

// Konfiguration von multer für Datei-Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Speicherort für hochgeladene Dateien
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Dateiname mit Timestamp
    }
});

// Filter für erlaubte Dateitypen (nur .xml und .musicxml)
const fileFilter = (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (fileExtension === '.xml' || fileExtension === '.musicxml') {
        cb(null, true);
    } else {
        cb(new Error('Only XML and MusicXML files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter
});

// Statische Dateien aus dem 'public'-Ordner bereitstellen
app.use(express.static('public'));

// Upload-Route
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }
    const pythonFile = 'readLeadSheetServer.py';
    const command = `python3 ${pythonFile} uploads/${req.file.filename}`;

    exec(command, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Fehler beim Ausführen des Python-Skripts: ${error.message}`);
            return res.status(500).json({ error: 'Error executing Python script' });
        }
        if (stderr) {
            console.error(`Python-Fehler: ${stderr}`);
            return res.status(500).json({ error: 'Python script error' });
        }

        const parsedOutput = JSON.parse(stdout);
        const oneFileJson = { fileName: req.file.originalname, storedName: req.file.filename, noteInfo: parsedOutput};

        try {
            let allFiles = [];
            try {
                const data = await fs.readFile('leadSheetData.json');
                allFiles = JSON.parse(data);
                console.log('Aktuelle Daten:', allFiles);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    console.log('Datei leadSheetData.json nicht gefunden, erstelle eine neue leere Liste.');
                } else {
                    throw err;
                }
            }

            allFiles.push(oneFileJson);
            await fs.writeFile('leadSheetData.json', JSON.stringify(allFiles, null, 2));
            console.log('Ausgabe wurde erfolgreich als JSON gespeichert!');
        } catch (err) {
            console.error('Fehler beim Verarbeiten der Datei:', err);
            return res.status(500).json({ error: 'Error processing data file' });
        }
    });
    res.json({ message: `File ${req.file.originalname} uploaded successfully!` });
});

// Server starten
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
