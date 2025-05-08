const express = require('express');
const fs = require('fs').promises;// Asynchrones fs-Modul
const path = require('path');
const app = express();
const port = 3000;
const multer = require('multer');
const { exec } = require('child_process');
const cors = require('cors');
const util = require('util');
const { Client } = require('pg');
require('dotenv').config()
const format = require('pg-format');

console.log(process.env.DB_PSW)

const client = new Client({
	user: 'postgres',
	password: process.env.DB_PSW,
	host: 'localhost',
	port: '5432',
	database: 'jazz_arranger',
});
// Kopiere das folgende in server.js über die bestehende DB-Klasse hinweg, damit es richtig verarbeitet wird.

class OneTuplet {
    constructor(numerator, denominator) {
        this.numerator = numerator
        this.denominator = denominator
    }
}

class OneNote {
    constructor(note_key, duration, is_natural, octave, is_rest, relative_to_key = null, oneTuplet = null) {
        this.note_key = note_key;
        this.duration = duration
        this.is_natural = is_natural
        this.octave = octave
        this.is_rest = is_rest
        this.relative_to_key = relative_to_key
        this.oneTuplet = oneTuplet
    }
}

class DB {
    constructor(client) {
        this.client = client;
        client.connect()
            .then(() => console.log('Connected to PostgreSQL database'))
            .catch(err => console.error('Error connecting to PostgreSQL database', err));
    }

    async executeSQL(query, values = []) {
        try {
            return await this.client.query(query, values);
        } catch (error) {
            console.error('Database error:', error);
            throw error;
        }
    }

    parseNoteKey(noteStr) {
        // Für "F#5" → F#, nicht-natürlich, Oktave 5
        const matches = noteStr && noteStr.match(/^([A-Ga-g][\-#]?)(\d+)$/);
        if (!matches) return {
            note_key: 'Rest',
            octave: 0
        };
        const [_, note, octave] = matches;
        const normalizedName = note.charAt(0).toUpperCase() + note.slice(1).toLowerCase();
        return {
            note_key: normalizedName,
            octave: parseInt(octave)
        };
    }

    async insertNote(noteObj) {
        const notes = Array.isArray(noteObj) ? noteObj : [noteObj];
    
        const queryText = format(
            'INSERT INTO note (note_key, duration, relative_to_key, is_natural, octave, is_rest) VALUES %L RETURNING note_id',
            notes.map(n => [
                n.note_key,
                n.duration,
                n.relativeToKey,
                n.is_natural,
                n.octave,
                n.is_rest
            ])
        );
        
        try {
            const result = await client.query(queryText);

            let tupletNotes = []
            let noteIds = []
            for (let i = 0; i < notes.length; ++i) {
                noteIds.push(result.rows[i].note_id)
                if (notes[i].tuplet !== false && notes[i].tuplet !== undefined && notes[i].tuplet.hasOwnProperty('numerator')) {
                    tupletNotes.push({"note": notes[i], "noteId": result.rows[i].note_id})
                }
            }
            if (tupletNotes.length > 0) {
                const queryTextTuplet = format(
                    'INSERT INTO tuplet (numerator, denominator, note_id) VALUES %L',
                    tupletNotes.map(n => [
                        n.note.tuplet.numerator,
                        n.note.tuplet.denominator,
                        n.noteId
                    ])
                );
                const resultTuplet = await client.query(queryTextTuplet);
            }   
            return noteIds;
        } catch (err) {
            console.error('Fehler beim Einfügen der Noten:', err);
            throw err;
        }
    }

    async createScore(scoreJson) {
        const client = this.client;
        try {
            await client.query('BEGIN');

            const {fileName, storedName, noteInfo, keySign} = scoreJson;

            const {rows: [{score_id}]} = await client.query(
                'INSERT INTO score (file_name, stored_name, key_sign) VALUES ($1, $2, $3) RETURNING score_id',
                [fileName, storedName, keySign]
            );

            for (const measureNotes of noteInfo) {
                const {rows: [{measure_id}]} = await client.query(
                    'INSERT INTO measure (score_id) VALUES ($1) RETURNING measure_id',
                    [score_id]
                );

                for (const noteObj of measureNotes) {
                    const {
                        elem_name,
                        elem_length,
                        chord_details,
                        voicingIndex,
                        voicings,
                        relativeVoicings 
                    } = noteObj;

                    // Handle Hauptnote
                    const {
                        note_key, octave
                    } = this.parseNoteKey(elem_name);
                    const notesIds = await this.insertNote([{
                        note_key,
                        duration: typeof elem_length === 'object' || elem_length.hasOwnProperty("numerator") ? 0.5 : elem_length,
                        relativeToKey: noteObj.relative_to_key[0][0],
                        is_natural: noteObj.relative_to_key[1] === 1,
                        octave,
                        is_rest: elem_name === 'Rest',
                        tuplet: typeof elem_length === 'object' && elem_length.hasOwnProperty("numerator") ? elem_length : false
                    }]);

                    const {rows: [{measure_elem_id}]} = await client.query(
                        'INSERT INTO measure_elem (measure_id) VALUES ($1) RETURNING measure_elem_id',
                        [measure_id]
                    );

                    await client.query(
                        'INSERT INTO measure_elem_note (measure_elem_id, note_id) VALUES ($1, $2)',
                        [measure_elem_id, notesIds[0]]
                    );

                    // Chord Details
                    if (chord_details && chord_details.length) {
                        const chordNotes = await this.insertNote(chord_details.map(cd => {
                            const {note_key, is_natural, octave} = this.parseNoteKey(cd);
                            return {
                                note_key, duration: 0, relativeToKey: null, is_natural: false, octave, is_rest: false
                            };
                        }));

                        for (const chordNoteId of chordNotes) {
                            await client.query(
                                'INSERT INTO chord_detail_elem (measure_elem_id, note_id) VALUES ($1, $2)',
                                [measure_elem_id, chordNoteId]
                            );
                        }
                    }
                    if (voicings && voicings.length > 0) {
                        for (const [indexVoicing, voicing] of voicings.entries()) {
                            if (voicing.length != 2 || voicing[0].length == 0 || voicing[1].length == 0) {
                                continue
                            }

                            const vocingNotesLeft = await this.insertNote(voicing[0].map((vn, index) => {
                                const {note_key, is_natural, octave} = this.parseNoteKey(vn);
                                console.log({note_key, duration: 0, relativeToKey: this.parseNoteKey(relativeVoicings[indexVoicing][0][index][0]).note_key, is_natural: relativeVoicings[indexVoicing][0][index][1] === 1, octave, is_rest: false})
                                return {
                                    note_key, duration: 0, relativeToKey: this.parseNoteKey(relativeVoicings[indexVoicing][0][index][0]).note_key, is_natural: relativeVoicings[indexVoicing][0][index][1] == 1, octave, is_rest: false
                                };
                            }));

                            const vocingNotesRight = await this.insertNote(voicing[1].map((vn, index) => {
                                const {note_key, is_natural, octave} = this.parseNoteKey(vn);
                                return {
                                    note_key, duration: 0, relativeToKey: this.parseNoteKey(relativeVoicings[indexVoicing][1][index][0]).note_key, is_natural: relativeVoicings[indexVoicing][1][index][1] == 1, octave, is_rest: false
                                };
                            }));

                            const {rows: [{measure_elem_voicing_id}]} = await client.query(
                                'INSERT INTO measure_elem_voicing (measure_elem_id) VALUES ($1) RETURNING measure_elem_voicing_id',
                                [measure_elem_id]
                            );
                            console.log(measure_elem_voicing_id);

                            const vocingNotesLeftIdQuery = format(
                                'INSERT INTO measure_elem_voicing_note (measure_elem_voicing_id, note_id, is_left_hand) VALUES %L',
                                vocingNotesLeft.map(id => [
                                    measure_elem_voicing_id,
                                    id,
                                    true
                                ])
                            );

                            const resultVocingNotesLeftIdQuery = await client.query(vocingNotesLeftIdQuery);

                            const vocingNotesRightIdQuery = format(
                                'INSERT INTO measure_elem_voicing_note (measure_elem_voicing_id, note_id, is_left_hand) VALUES %L',
                                vocingNotesRight.map(id => [
                                    measure_elem_voicing_id,
                                    id,
                                    false
                                ])
                            );
                            
                            const resultVocingNotesRight = await client.query(vocingNotesRightIdQuery);
                        }
                    }
                }
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Panic!', error.stack);
        }
    }


    async readScore(scoreId) {
        try {
            // Score-Basisdaten abrufen
            const scoreQuery = `
                SELECT score_id, file_name, stored_name, key_sign 
                FROM score 
                WHERE score_id = $1`;
            const scoreResult = await this.client.query(scoreQuery, [scoreId]);
    
            if (scoreResult.rows.length === 0) {
                throw new Error(`Score with ID ${scoreId} not found`);
            }
    
            const score = scoreResult.rows[0];
            const result = {
                scoreId: score.score_id,
                fileName: score.file_name,
                storedName: score.stored_name,
                keySign: score.key_sign,
                noteInfo: []
            };
    
            // Measures für den Score abrufen
            const measuresQuery = `
                SELECT measure_id 
                FROM measure 
                WHERE score_id = $1 
                ORDER BY measure_id`;
            const measuresResult = await this.client.query(measuresQuery, [scoreId]);
    
            // Für jedes Measure die zugehörigen Elemente und Noten abrufen
            for (const measure of measuresResult.rows) {
                const measureElementsQuery = `
                    SELECT me.measure_elem_id, me.voicing_index
                    FROM measure_elem me
                    WHERE me.measure_id = $1
                    ORDER BY me.measure_elem_id`;
                const measureElementsResult = await this.client.query(measureElementsQuery, [measure.measure_id]);
    
                const measureNotes = [];
    
                // Für jedes Measure Element die Noten, Chords und Voicings abrufen
                for (const elem of measureElementsResult.rows) {
                    // Haupt-Note abrufen
                    const noteQuery = `
                        SELECT n.note_id, n.note_key, n.duration, n.relative_to_key, n.is_natural, n.octave AS octave, n.is_rest, t.numerator, t.denominator
                        FROM measure_elem_note men
                        JOIN note n ON men.note_id = n.note_id
                        LEFT JOIN tuplet t ON n.note_id = t.note_id
                        WHERE men.measure_elem_id = $1`;
                    const noteResult = await this.client.query(noteQuery, [elem.measure_elem_id]);
    
                    if (noteResult.rows.length === 0) continue;
                    
                    const note = noteResult.rows[0];
                    const noteObj = {
                        oneNote: new OneNote(note.note_key, note.duration,  note.is_natural, note.octave, note.is_rest, note.relative_to_key, note.numerator ? { numerator: note.numerator, denominator: note.denominator } : null),
                        voicingIndex: elem.voicing_index || elem.voicing_index == 0 ? elem.voicing_index : -1, // wird später gesetzt, falls Voicings vorhanden
                        voicings: [], // wird später gesetzt, falls Voicings vorhanden
                        chord_details: [],
                    };
    
                    // Chord-Details abrufen
                    const chordQuery = `
                        SELECT n.note_key, n.is_natural, n.octave AS octave
                        FROM chord_detail_elem cde
                        JOIN note n ON cde.note_id = n.note_id
                        WHERE cde.measure_elem_id = $1`;
                    const chordResult = await this.client.query(chordQuery, [elem.measure_elem_id]);
    
                    if (chordResult.rows.length > 0) {
                        noteObj.chord_details = chordResult.rows.map(chordNote => new OneNote(chordNote.note_key, 0, false, chordNote.octave, false));
                    }
    
                    // Voicing-Details abrufen
                    const voicingQuery = `
                        SELECT mev.measure_elem_voicing_id
                        FROM measure_elem_voicing mev
                        WHERE mev.measure_elem_id = $1
                        ORDER BY mev.measure_elem_voicing_id`;
                    const voicingResult = await this.client.query(voicingQuery, [elem.measure_elem_id]);
    
                    if (voicingResult.rows.length > 0) {
                        const voicings = [];
                        for (const voicing of voicingResult.rows) {
                            const voicingNotesQuery = `
                                SELECT n.note_key, n.is_natural, n.octave, n.relative_to_key, mevn.is_left_hand
                                FROM measure_elem_voicing_note mevn
                                JOIN note n ON mevn.note_id = n.note_id
                                WHERE mevn.measure_elem_voicing_id = $1
                                ORDER BY mevn.is_left_hand DESC, n.octave, n.note_key`;
                            const voicingNotesResult = await this.client.query(voicingNotesQuery, [voicing.measure_elem_voicing_id]);
    
                            // Noten in linke und rechte Hand aufteilen
                            //constructor(note_key, duration, is_natural, octave, is_rest, relative_to_key = null, oneTuplet = null) {
                            const leftHandNotes = voicingNotesResult.rows
                                .filter(vn => vn.is_left_hand)
                                .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key));

                            const rightHandNotes = voicingNotesResult.rows
                                .filter(vn => !vn.is_left_hand)
                                .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key));
                            
                            if (leftHandNotes.length > 0 && rightHandNotes.length > 0) {
                                voicings.push([leftHandNotes, rightHandNotes]);
                            }
                        }

                        if ( voicings.length > 0) {
                            noteObj.voicings = voicings;
                        } else {
                            noteObj.voicings = [];
                        }
                    }
    
                    measureNotes.push(noteObj);
                }
    
                result.noteInfo.push(measureNotes);
            }
    
            return result;
        } catch (error) {
            console.error('Error reading score:', error);
            throw error;
        }
    }

    async readFileNames() {
        const scoreNamesQuery = `
                SELECT score_id, file_name 
                FROM score 
                ORDER BY score_id`;
        const scoreNamesResult = await this.client.query(scoreNamesQuery, []);

        return scoreNamesResult.rows
    }

    async updateVoicingIndex(scoreId, measureId, voicingIndex, noteId) {
        const measureIdQuery = `
                SELECT measure_id 
                FROM measure 
                WHERE score_id = $1 
                ORDER BY measure_id
        `;
        
        const measureIdsResult = await this.client.query(measureIdQuery, [scoreId]);

        let measure_id = measureIdsResult.rows[measureId].measure_id;

        const elemIdQuery = `
                SELECT measure_elem_id 
                FROM measure_elem 
                WHERE measure_id = $1 
                ORDER BY measure_elem_id
        `;
        
        const elemIdResult = await this.client.query(elemIdQuery, [measure_id]);

        let measure_elem_id = elemIdResult.rows[noteId].measure_elem_id;

        
        const updateQuery = `
            UPDATE measure_elem
            SET voicing_index = $1
            WHERE measure_elem_id = $2;
        `;
        this.client.query(updateQuery, [voicingIndex, measure_elem_id]);
    }

    deleteScore(scoreId) {
        const deleteScoreQuery = `
            DELETE FROM score WHERE score_id = $1;
        `;
        
        this.client.query(deleteScoreQuery, [scoreId]);


        const deleteNoteQuery = `
            DELETE FROM note
            WHERE note_id NOT IN (
                SELECT note_id FROM measure_elem_note
                UNION
                SELECT note_id FROM measure_elem_voicing_note
                UNION
                SELECT note_id FROM chord_detail_elem
                UNION
                SELECT note_id FROM tuplet
                UNION
                SELECT note_id FROM note_voicing_elem
            );
        `;
        
        this.client.query(deleteNoteQuery, []);
    }

    async getStoredName(scoreId) {
        const scoreNameQuery = `
                SELECT stored_name, file_name
                FROM score 
                WHERE score_id = $1`;
        const scoreNameResult = await this.client.query(scoreNameQuery, [scoreId]);

        return scoreNameResult.rows[0];
    }

    async insertVoicingNote(noteKey, octave, isLeftHand, isImplied, voicingId) {
        console.log(noteKey, octave, isLeftHand, isImplied, voicingId)
        const noteRes = await this.client.query(
            `INSERT INTO note 
            (note_key, octave)
            VALUES ($1, $2)
            RETURNING note_id`,
            [noteKey, octave]
          );
          
          await this.client.query(
            `INSERT INTO note_voicing_elem
            (is_left_hand, note_id, voicing_id, is_implied)
            VALUES ($1, $2, $3, $4)`,
            [isLeftHand, noteRes.rows[0].note_id, voicingId, isImplied]
          );
    }

    async insertVoicing() {
        const voicingRes = await this.client.query(
            'INSERT INTO voicing DEFAULT VALUES RETURNING voicing_id'
        );
        return voicingRes.rows[0].voicing_id;
    }

    async insertVoicingCategory(categoryName, voicingId) {
        const categoryRes = await this.client.query(
            'INSERT INTO voicing_category (category_name) VALUES ($1) RETURNING voicing_category_id',
            [categoryName]
        );

        const categoryConnectionRes = await this.client.query(
            'INSERT INTO voicing_category_connection (voicing_id, voicing_category_id) VALUES ($1, $2)',
            [voicingId, categoryRes.rows[0].voicing_category_id]
        );
    }
      
    async getVoicings() {
        console.log(1)
        const resultNotes = await this.client.query(`
            SELECT v.voicing_id, 
                    json_agg(n.*) as notes,
                    json_agg(nve.is_left_hand) as hands,
                    json_agg(nve.is_implied) as implied 
            FROM voicing v
            JOIN note_voicing_elem nve ON v.voicing_id = nve.voicing_id
            JOIN note n ON nve.note_id = n.note_id
            GROUP BY v.voicing_id
        `);
        console.log(2)

        const resultCategory = await this.client.query(`
            SELECT v.voicing_id, vc.category_name
            FROM voicing v
            JOIN voicing_category_connection vcc ON vcc.voicing_id = v.voicing_id
            JOIN voicing_category vc ON vc.voicing_category_id = vcc.voicing_category_connection_id
            GROUP BY v.voicing_id, vc.category_name;
        `);
        console.log(3)

        let savedVoicings = {};

        let voicingsIds = [];
        for (let i = 0; i < resultNotes.rowCount; ++i) {
            savedVoicings[String(resultNotes.rows[i].voicing_id)] = {
                leftHand: [],
                rightHand: [],
                impliedNotes: [],
                categories: []
            };
            voicingsIds.push(resultNotes.rows[i].voicing_id)
        }
        console.log(4)

        for (let i = 0; i < resultNotes.rowCount; ++i) {
            for (let j = 0; j < resultNotes.rows[i].notes.length; ++j) {
                let note = resultNotes.rows[i].notes[j];
                if (resultNotes.rows[i].hands[j]) {
                    savedVoicings[String(resultNotes.rows[i].voicing_id)].leftHand.push(note.note_key + note.octave);
                } else if (resultNotes.rows[i].implied[j]) {
                    savedVoicings[String(resultNotes.rows[i].voicing_id)].impliedNotes.push(note.note_key + note.octave);
                } else {
                    savedVoicings[String(resultNotes.rows[i].voicing_id)].rightHand.push(note.note_key + note.octave);
                } 
            }
        }
        console.log(5)

        for (let i = 0; i < resultCategory.rowCount; ++i) {
            console.log()
            savedVoicings[String(resultCategory.rows[i].voicing_id)].categories.push(resultCategory.rows[i].category_name);
        }

        let savedVoicingsResult = [];
        for (const [key, value] of Object.entries(savedVoicings)) {
            savedVoicingsResult.push(value);
        }
        console.log(6)

        console.log(JSON.stringify(savedVoicingsResult, null, 2))
        return {"voicings": savedVoicingsResult, "voicingsIds": voicingsIds};
    }

    async getVoicingCategories() {
        const getVoicingCategoriesQuery = `
            SELECT category_name, voicing_category_id FROM voicing_category
            WHERE voicing_category_id NOT IN (
                SELECT vcc.voicing_category_id FROM voicing_category_connection vcc
                WHERE vcc.voicing_category_id IS NOT NULL
            );
        `;
        
        let voicingCategoriesResult = await this.client.query(getVoicingCategoriesQuery, []);
        return {"categories": voicingCategoriesResult.rows.map(row => row.category_name), "categoriesIds": row.voicing_category_id}
    }
}

const db = new DB(client);

app.use(cors());

// Voicings laden
app.get('/voicings', async (req, res) => {
    console.log("test123")
    try {

        res.json({"voicings": await db.getVoicings().voicings, "categories": await db.getVoicingCategories().categories, "voicingsIds": await db.getVoicings().voicingsIds, "categoriesIds": await db.getVoicingCategories().categories});
    } catch (err) {
        res.status(500).send(err.message);
    }
});
  

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web'));

app.get('/delete/:scoreId', async (req, res) => {
    const scoreId = req.params.scoreId;
    db.deleteScore(scoreId);
    res.redirect('/main');
});

app.get('/transpose/:scoreId', async (req, res) => {
    const scoreId = req.params.scoreId;

    const transposeValue = req.query.transposeValue;
    const name = await db.getStoredName(scoreId);
    const pythonFile = 'transpose.py';
    const { stdout: stdout1 } = await util.promisify(exec)(`python3 ${pythonFile} ./uploads/${name.stored_name} ${transposeValue}`);

    let command = 'readLeadSheetServer.py';
    command = `python3 ${command} ./uploads/${name.stored_name}`

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

        const oneFileJson = { fileName: name.file_name, storedName: name.stored_name, noteInfo: result, "keySign": parsedOutput["keySign"]};

        db.createScore(oneFileJson);
        db.deleteScore(scoreId);
        res.json({ message: `Transposed successfully!` });
    });
});

app.get('/data/:index', async (req, res) => {
    const index = req.params.index;
    res.json(await db.readScore(index)); 
});

app.use(express.static(path.join(__dirname, 'web')));

app.get('/uploadForm', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'uploadForm.html'));
});

app.get('/main', async (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'main.html'));
});

app.get('/getMainData', async (req, res) => {
    db.readFileNames().then(value => { res.json(value); })
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
app.post('/saveStatus/:scoreId', async (req, res) => {
    db.updateVoicingIndex(req.params.scoreId, req.body.measureId, req.body.voicingIndex, req.body.elemId);

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

        db.createScore(oneFileJson);
    });
    res.json({ message: `File ${req.file.originalname} uploaded successfully!` });
});

app.get('/getPDF/:scoreId', async (req, res) => {
    const scoreId = req.params.scoreId;
    const pythonFile = 'createXML.py';
    
    try {
        // Ersten Prozess ausführen
        const name = await db.getStoredName(scoreId);
        const { stdout: stdout1 } = await util.promisify(exec)(`python3 ${pythonFile} ${scoreId}`);
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


  // Voicing speichern
  app.use(express.json());
  app.post('/voicing', async (req, res) => {
    console.log(req.body.voicing)
    try {
      const voicingId = await db.insertVoicing();
      // Noten einfügen und verknüpfen
      for (const note of req.body.voicing.leftHand) {
        db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), true, false, voicingId)
      }

      for (const note of req.body.voicing.rightHand) {
        db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, false, voicingId)
      }

      for (const note of req.body.voicing.impliedNotes) {
        db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, true, voicingId)
      }

      for (const categoryName of req.body.voicing.categories) {
        db.insertVoicingCategory(categoryName, voicingId)
      }

        await db.client.query('COMMIT');
    } catch (error) {
        await db.client.query('ROLLBACK');
        console.error('Panic!', error.stack);
    }
  });

  app.get('/categories', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM voicing_category');
      res.json(result.rows);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
  
  app.use(express.json());
  app.post('/categories', async (req, res) => {
    try {
      const result = await pool.query(
        'INSERT INTO voicing_category (category_name) VALUES ($1) RETURNING *',
        [req.body.categoryName]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
// Server starten
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
