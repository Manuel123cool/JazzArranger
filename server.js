const express = require('express');
const fs = require('fs').promises;// Asynchrones fs-Modul
const path = require('path');
const app = express();
const port = 3000;
const multer = require('multer');
const { exec } = require('child_process');
const cors = require('cors');
const util = require('util');

app.use(cors());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web'));

app.get('/transpose/:index', async (req, res) => {
    const index = req.params.index;
    const transposeValue = req.query.transposeValue;
    console.log(transposeValue)
    const leadSheetData = await fs.readFile('leadSheetData.json');

    const allFiles = JSON.parse(leadSheetData); // In JavaSript-Objekt umwandeln
    console.log("allofawon1", allFiles[index], index)

    console.log("allofawon", allFiles[index].storedName, index)
    const pythonFile = 'transpose.py';
    const { stdout: stdout1 } = await util.promisify(exec)(`python3 ${pythonFile} ./uploads/${allFiles[index].storedName} ${transposeValue}`);

    let command = 'readLeadSheetServer.py';
    command = `python3 ${command} ./uploads/${allFiles[index].storedName}`

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
        const result = parsedOutput["result"]
        const oneFileJson = { fileName: parsedOutput["fileName"], storedName: parsedOutput["storedName"], noteInfo: result, "keySign": parsedOutput["keySign"]};

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

            allFiles[index] = oneFileJson;
            await fs.writeFile('leadSheetData.json', JSON.stringify(allFiles, null, 2));
            console.log('Ausgabe wurde erfolgreich als JSON gespeichert!');
        } catch (err) {
            console.error('Fehler beim Verarbeiten der Datei:', err);
            return res.status(500).json({ error: 'Error processing data file' });
        }
        res.json({ message: `Transposed successfully!` });
    });

});


// Route, um die JSON-Daten zu senden
app.get('/data/:index', async (req, res) => {
  
    const index = req.params.index;

    const filePath = path.join(__dirname, 'leadSheetData.json');

    const data = await fs.readFile(filePath, 'utf8'); // JSON-Datei lesen

    const jsonData = JSON.parse(data); // In JavaSript-Objekt umwandeln
    console.log(jsonData["keySign"])
    res.json({"noteInfo": jsonData[index].noteInfo, "keySign": jsonData[index]["keySign"]}); // Als JSON senden
  
    //res.status(500).json({ error: 'Fehler beim Laden der JSON-Datei' });
});

app.use(express.static(path.join(__dirname, 'web')));

app.get('/uploadForm', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'uploadForm.html'));
});

app.get('/main', async (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'main.html'));
});

app.get('/getMainData', async (req, res) => {
    const filePath = path.join(__dirname, 'leadSheetData.json');

    const data = await fs.readFile(filePath, 'utf8'); // JSON-Datei lesen

    const jsonData = JSON.parse(data); // In JavaScript-Objekt umwandeln
    
    let mainData = []
    for (let i = 0; i < jsonData.length; ++i) {
        mainData.push(jsonData[i].fileName)
    }
    res.json(mainData); // Als JSON senden
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
app.use(express.json());
app.post('/saveStatus/:index', async (req, res) => {
    const index = req.params.index;

    const leadSheetData = await fs.readFile('leadSheetData.json');
    allFiles = JSON.parse(leadSheetData);
    
    console.log("12", allFiles, req.body)
    allFiles[index].noteInfo = req.body

    await fs.writeFile('leadSheetData.json', JSON.stringify(allFiles));

    res.json({ message: 'JSON erfolgreich gespeichert!' });
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
        const result = parsedOutput["result"]
        const oneFileJson = { fileName: req.file.originalname, storedName: req.file.filename, noteInfo: result, "keySign": parsedOutput["keySign"]};

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

app.get('/getPDF/:index', async (req, res) => {
    const index = req.params.index;
    const pythonFile = 'createXML.py';
    
    try {
        // Ersten Prozess ausführen
        const { stdout: stdout1 } = await util.promisify(exec)(`python3 ${pythonFile} ${index}`);
        console.log(stdout1)
        // Zweiten Prozess ausführen
        await util.promisify(exec)(`"/Applications/MuseScore 4.app/Contents/MacOS/mscore" -S ./server.mss ./output.xml -o ./output.pdf`);

        // PDF senden
        fs2 = require('fs')

        const file = fs2.createReadStream('./output.pdf');
        file.on('open', () => {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=quote.pdf');
            file.pipe(res);
        });
        
        file.on('error', err => {
            console.error('File error:', err);
            res.status(500).send('Error generating PDF');
        });

    } catch (error) {
        console.error('Execution error:', error);
        res.status(500).json({ 
            error: 'PDF generation failed',
            details: error.message 
        });
    }
});


app.get('/getXML/:index', async (req, res) => {
    const index = req.params.index;
    const pythonFile = 'createXML.py';
    const { stdout: stdout1 } = await util.promisify(exec)(`python3 ${pythonFile} ${index}`);

    
    res.download("output.xml"); 
});


// Server starten
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
