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
const { json } = require('stream/consumers');

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

    async createScore(scoreJson, scoreId = -1) {
        const client = this.client;
        try {
            await client.query('BEGIN');

            const {fileName, storedName, noteInfo, keySign} = scoreJson;

            let score_id = null;
            if (scoreId === -1) {
                const {rows: [{score_id}]} = await client.query(
                    'INSERT INTO score (file_name, stored_name, key_sign) VALUES ($1, $2, $3) RETURNING score_id',
                    [fileName, storedName, keySign]
                );
            } else {
                score_id = scoreId
            }
            

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
                            if (voicing.length != 3 || voicing[0].length == 0 || voicing[1].length == 0) {
                                continue
                            }

                            const vocingNotesLeft = await this.insertNote(voicing[0].map((vn, index) => {
                                const {note_key, is_natural, octave} = this.parseNoteKey(vn);
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

                            console.log(voicing[2])
                            let vocingNotesImplied = null;
                            if (voicing[2].length > 0) {
                                 vocingNotesImplied = await this.insertNote(voicing[2].map((vn, index) => {
                                    const {note_key, is_natural, octave} = this.parseNoteKey(vn);
                                    return {
                                        note_key, duration: 0, relativeToKey: null, is_natural: null, octave, is_rest: false
                                    };
                                }));
                            }
                            

                            const {rows: [{measure_elem_voicing_id}]} = await client.query(
                                'INSERT INTO measure_elem_voicing (measure_elem_id) VALUES ($1) RETURNING measure_elem_voicing_id',
                                [measure_elem_id]
                            );

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

                            if (voicing[2].length > 0) {
                                const vocingNotesImpliedIdQuery = format(
                                    'INSERT INTO measure_elem_voicing_note (measure_elem_voicing_id, note_id, is_implied) VALUES %L',
                                    vocingNotesImplied.map(id => [
                                        measure_elem_voicing_id,
                                        id,
                                        true
                                    ])
                                );
                                
                                const resultVocingNotesImplied = await client.query(vocingNotesImpliedIdQuery);
                            }
                            
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
                                SELECT n.note_key, n.is_natural, n.octave, n.relative_to_key, mevn.is_left_hand, mevn.is_implied
                                FROM measure_elem_voicing_note mevn
                                JOIN note n ON mevn.note_id = n.note_id
                                WHERE mevn.measure_elem_voicing_id = $1
                                ORDER BY mevn.is_left_hand DESC, n.octave, n.note_key`;
                            const voicingNotesResult = await this.client.query(voicingNotesQuery, [voicing.measure_elem_voicing_id]);
    
                            // Noten in linke und rechte Hand aufteilen
                            //constructor(note_key, duration, is_natural, octave, is_rest, relative_to_key = null, oneTuplet = null) {
                            const leftHandNotes = voicingNotesResult.rows
                                .filter(vn => vn.is_left_hand && !vn.is_implied)
                                .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key));

                            const rightHandNotes = voicingNotesResult.rows
                                .filter(vn => !vn.is_left_hand && !vn.is_implied)
                                .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key));
                            
                            const impliedNotes = voicingNotesResult.rows
                                .filter(vn => vn.is_implied)
                                .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key));
                            
                            if (leftHandNotes.length > 0 && rightHandNotes.length > 0) {
                                voicings.push([leftHandNotes, rightHandNotes, impliedNotes]);
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

    async deleteScoreData(scoreId) {
        const deleteScoreQuery = `
            DELETE FROM measure WHERE score_id = $1;
        `;
        
        await this.client.query(deleteScoreQuery, [scoreId]);


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
        
        await this.client.query(deleteNoteQuery, []);
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

    async insertVoicingCategory(categoryId, voicingId) {
        const categoryConnectionRes = await this.client.query(
            'INSERT INTO voicing_category_connection (voicing_id, voicing_category_id) VALUES ($1, $2)',
            [voicingId, categoryId]
        );
    }
      
    async getVoicings() {
        const resultNotes = await this.client.query(`
            SELECT v.voicing_id, 
                json_agg(n.*) AS notes,
                json_agg(nve.is_left_hand) AS hands,
                json_agg(nve.is_implied) AS implied 
            FROM voicing v
            JOIN note_voicing_elem nve ON v.voicing_id = nve.voicing_id
            JOIN note n ON nve.note_id = n.note_id
            GROUP BY v.voicing_id
            ORDER BY v.voicing_id;
        `);

        const resultCategory = await this.client.query(`
            SELECT v.voicing_id, vc.category_name, vc.voicing_category_id
            FROM voicing v
            JOIN voicing_category_connection vcc ON vcc.voicing_id = v.voicing_id
            JOIN voicing_category vc ON vc.voicing_category_id = vcc.voicing_category_id
            ORDER BY v.voicing_id;
        `);

        let savedVoicings = {};

        let voicingsIds = [];
        for (let i = 0; i < resultNotes.rowCount; ++i) {
            savedVoicings[String(resultNotes.rows[i].voicing_id)] = {
                leftHand: [],
                rightHand: [],
                impliedNotes: [],
                categories: [],
                categoriesIds: []
            };
            voicingsIds.push(resultNotes.rows[i].voicing_id)
        }

        for (let i = 0; i < resultNotes.rowCount; ++i) {
            for (let j = 0; j < resultNotes.rows[i].notes.length; ++j) {
                let note = resultNotes.rows[i].notes[j];
                if (resultNotes.rows[i].hands[j]) {
                    savedVoicings[String(resultNotes.rows[i].voicing_id)].leftHand.push(note.note_key + note.octave);
                } else if (resultNotes.rows[i].implied[j]) {
                    savedVoicings[String(resultNotes.rows[i].voicing_id)].impliedNotes.push(note.note_key + note.octave);
                } else {
                    if (note.note_key == "ANY") {
                        savedVoicings[String(resultNotes.rows[i].voicing_id)].rightHand.push(note.note_key);
                    } else {
                        savedVoicings[String(resultNotes.rows[i].voicing_id)].rightHand.push(note.note_key + note.octave);

                    }
                } 
            }
        }

        for (let i = 0; i < resultCategory.rowCount; ++i) {
            if (resultCategory.rows[i].voicing_id in savedVoicings) {
                savedVoicings[String(resultCategory.rows[i].voicing_id)].categories.push(resultCategory.rows[i].category_name);
                savedVoicings[String(resultCategory.rows[i].voicing_id)].categoriesIds.push(resultCategory.rows[i].voicing_category_id);
            }
        }

        let savedVoicingsResult = [];
        for (const [key, value] of Object.entries(savedVoicings)) {
            savedVoicingsResult.push(value);
        }
        
        return {"voicings": savedVoicingsResult, "voicingsIds": voicingsIds};
    }

    async getVoicingCategories() {
        const getVoicingCategoriesQuery = `
            SELECT category_name, voicing_category_id FROM voicing_category;
        `;
        
        let voicingCategoriesResult = await this.client.query(getVoicingCategoriesQuery, []);
        return {"categories": voicingCategoriesResult.rows.map(row => row.category_name), "categoriesIds": voicingCategoriesResult.rows.map(row => row.voicing_category_id)}
    }

    async deleteVoicing(voicingId, update = false) {
        try {
            await this.client.query('BEGIN');
            // 1. Alle Note-IDs ermitteln, die mit dem Voicing verbunden sind
            const noteIdsResult = await this.client.query(
                `SELECT note_id FROM note_voicing_elem WHERE voicing_id = $1`,
                [voicingId]
            );
            const noteIds = noteIdsResult.rows.map(row => row.note_id);
    
            // 2. Lösche Einträge in note_voicing_elem
            await this.client.query(
                `DELETE FROM note_voicing_elem WHERE voicing_id = $1`,
                [voicingId]
            );
    
            // 3. Lösche Kategorie-Verbindungen
            await this.client.query(
                `DELETE FROM voicing_category_connection WHERE voicing_id = $1`,
                [voicingId]
            );
    
            // 4. Lösche das Voicing selbst
            let result = null;
            if (!update) {
                result = await this.client.query(
                    `DELETE FROM voicing WHERE voicing_id = $1 RETURNING *`,
                    [voicingId]
                );
            }
            
    
            // 5. Lösche Notes, die nicht mehr mit anderen Voicings verbunden sind
            if (noteIds.length > 0) {
                const unusedNoteIdsResult = await this.client.query(
                    `SELECT note_id FROM note WHERE note_id = ANY($1::integer[])
                     AND NOT EXISTS (
                        SELECT 1 FROM note_voicing_elem WHERE note_id = note.note_id
                     )`,
                    [noteIds]
                );
                const unusedNoteIds = unusedNoteIdsResult.rows.map(row => row.note_id);
    
                if (unusedNoteIds.length > 0) {
                    await this.client.query(
                        `DELETE FROM note WHERE note_id = ANY($1::integer[])`,
                        [unusedNoteIds]
                    );
                }
            }
    
            // Transaktion bestätigen
            await this.client.query('COMMIT');
    
            // Überprüfe, ob das Voicing gelöscht wurde
            if (!update && result.rowCount === 0) {
                throw new Error(`Voicing mit ID ${voicingId} existiert nicht`);
            }
            
            if (!update) return { success: true, deletedVoicing: result.rows[0] };
            else return { success: true, updatedVoicing: voicingId };

        } catch (error) {
            // Bei Fehler Rollback durchführen
            await this.client.query('ROLLBACK');
            throw error;
        }
    }

    async  deleteVoicingNotes(voicingId) {
        await this.client.query('DELETE FROM voicing_notes WHERE voicing_id = $1', [voicingId]);
      }
      
      // Löscht alle Kategorien eines Voicings
    async  deleteVoicingCategories(voicingId) {
        await this.client.query(
            `DELETE FROM voicing_category_connection WHERE voicing_id = $1`,
            [voicingId]
        );
    }
}

const db = new DB(client);

app.use(cors());

// Voicings laden
app.get('/voicings', async (req, res) => {
    try {
        const voicings = await db.getVoicings();
        const categories = await db.getVoicingCategories();

        res.json({"voicings": voicings.voicings, "categories": categories.categories, "voicingsIds": voicings.voicingsIds, "categoriesIds": categories.categoriesIds});
    } catch (err) {
        res.status(500).send(err.message);
    }
});
  
app.delete('/deleteVoicing/:voicingId', async (req, res) => {
    res.json(await db.deleteVoicing(req.params.voicingId))
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web'));

app.get('/delete/:scoreId', async (req, res) => {
    const scoreId = req.params.scoreId;
    db.deleteScore(scoreId);
    res.redirect('/main');
});

app.get('/updateScore/:scoreId', async (req, res) => {
    const scoreId = req.params.scoreId;

    const name = await db.getStoredName(scoreId);

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
        await db.deleteScoreData(scoreId);

        db.createScore(oneFileJson, scoreId);

        res.redirect('/main');
    });
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
    if (req.body.voicing.categories.length == 0) {
        return
    }
    try {
      const voicingId = await db.insertVoicing();
      // Noten einfügen und verknüpfen
      for (const note of req.body.voicing.leftHand) {
        db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), true, false, voicingId)
      }

      if (req.body.voicing.rightHand.length > 0 && req.body.voicing.rightHand[0] === "ANY") {
            await db.insertVoicingNote("ANY", 3, false, false, voicingId);
        } else {
            for (const note of req.body.voicing.rightHand) {
                db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, false, voicingId)
            }
        }
      for (const note of req.body.voicing.impliedNotes) {
        db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, true, voicingId)
      }

      for (const categoryId of req.body.voicing.categoriesIds) {
        db.insertVoicingCategory(categoryId, voicingId)
      }

        await db.client.query('COMMIT');
        res.json({ message: `uploaded successfully!`, "voicingId": voicingId});

    } catch (error) {
        await db.client.query('ROLLBACK');
        console.error('Panic!', error.stack);
        res.json({ message: `uploaded unsuccessfull!` });

    }
  });
  app.use(express.json());


app.put('/voicing/:id', async (req, res) => {
  const voicingId = req.params.id; // ID des zu aktualisierenden Voicings aus der URL

  if (req.body.voicing.categories.length === 0) {
    return res.status(400).json({ message: 'No categories provided!' });
  }

  try {
    // Beginne eine Transaktion
    await db.client.query('BEGIN');

    // Lösche die bestehenden Noten und Kategorien für das Voicing, bevor neue eingefügt werden
    await db.deleteVoicing(voicingId, true)

    // Füge neue Noten ein
    for (const note of req.body.voicing.leftHand) {
      await db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), true, false, voicingId);
    }

    
    for (const note of req.body.voicing.rightHand) {
        await db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, false, voicingId);
    }
    
    

    for (const note of req.body.voicing.impliedNotes) {
      await db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, true, voicingId);
    }

    // Füge neue Kategorien ein
    for (const categoryId of req.body.voicing.categoriesIds) {
      await db.insertVoicingCategory(categoryId, voicingId);
    }

    // Commit der Transaktion
    await db.client.query('COMMIT');
    res.json({ message: `Voicing ${voicingId} updated successfully!`, voicingId: voicingId });

  } catch (error) {
    // Wenn ein Fehler auftritt, rollback der Transaktion
    await db.client.query('ROLLBACK');
    console.error('Panic! Update failed:', error.stack);
    res.status(500).json({ message: `Update of voicing ${voicingId} unsuccessful!` });

  }
});

  app.use(express.json());
  app.post('/categories', async (req, res) => {
    try {
      await db.client.query('BEGIN');
      const result_id = await db.client.query(
        'INSERT INTO voicing_category (category_name) VALUES ($1) RETURNING voicing_category_id',
        [req.body.categoryName]
      );
      await db.client.query('COMMIT');

      res.status(201).json({"result_id": result_id.rows[0].voicing_category_id});
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/deleteCategory/:categoryId', async (req, res) => {
    const categoryId = req.params.categoryId;
    try {
      await db.client.query('BEGIN');
      const result = await db.client.query(
        'DELETE FROM voicing_category WHERE voicing_category_id = $1;',
        [categoryId]
      );
      await db.client.query('COMMIT');

      res.status(201).json("Delete successfully");
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
// Server starten
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});


async function addVoicingsFromArray() {
    const voicings = [
        [["C3"], ["E4", "B4"]], [["D3"], ["F4", "C5"]], [["G3"], ["B4", "F5"]],
        [["C2"], ["B3", "E4"]], [["D2"], ["C4", "F4"]], [["G2"], ["F4", "B4"]],
        [["C3", "B3"], ["E4", "G4"]], [["D3", "C4"], ["F4", "A4"]], [["G3", "F4"], ["B4", "D5"]],
        [["C3", "B3"], ["E4", "G4", "D5"]], [["D3", "C4"], ["F4", "A4", "E5"]], [["G3", "F4"], ["B4", "D5", "A5"]],
        [["C3", "E3"], ["B3", "D4", "G4"]], [["D3", "F3"], ["C4", "E4", "A4"]], [["G3", "B3"], ["F4", "A4", "D5"]],
        [["C2", "E3"], ["B3", "D4", "G4"]], [["D2", "F3"], ["C4", "E4", "A4"]], [["G2", "B3"], ["F4", "A4", "D5"]],
        [["G3"], ["C4", "E4", "B4"]], [["A3"], ["D4", "F4", "C5"]], [["D4"], ["G4", "B4", "F5"]],
        [["E3"], ["C4", "G4", "B4"]], [["F3"], ["D4", "A4", "C5"]], [["B3"], ["G4", "D5", "F5"]],
        [["C4"], ["F4", "A4", "D5"]], [["F4"], ["B4", "D5", "G5"]],
        [["A3"], ["F4", "C5", "D5"]], [["D4"], ["B4", "F5", "G5"]],
        [["C4"], ["G4", "B4", "E5"]], [["D4"], ["A4", "C5", "F5"]], [["G3"], ["D5", "F5", "B5"]],
        [["C4"], ["A4", "D5", "F5"]], [["F4"], ["D5", "G5", "B5"]],
        [["E4"], ["B4", "C5", "G5"]], [["F4"], ["C5", "D5", "A5"]], [["B3"], ["F4", "G4", "D5"]],
        [["C4"], ["B4", "E5", "G5"]], [["D4"], ["C5", "F5", "A5"]], [["G3"], ["F4", "B4", "D5"]],
        [["C3"], ["E4", "G4", "B4", "D5"]], [["C3"], ["G4", "B4", "D5", "E5"]], [["C3"], ["B4", "D5", "E5", "G5"]], [["C3"], ["D5", "E5", "G5", "B5"]],
        [["D3"], ["F4", "A4", "C5", "E5"]], [["D3"], ["C5", "E5", "F5", "A5"]], [["D3"], ["E4", "F4", "A4", "C5"]],
        [["G2"], ["B3", "D4", "F4", "A4"]], [["G2"], ["D4", "F4", "A4", "B4"]], [["G2"], ["F4", "A4", "B4", "D5"]], [["G2"], ["A3", "B3", "D4", "F4"]],
        [["C4"], ["E4", "G4", "A4", "C5"]], [["E4"], ["G4", "A4", "C5", "E5"]], [["G4"], ["A4", "C5", "E5", "G5"]], [["A4"], ["C5", "E5", "G5", "A5"]],
        [["D4"], ["F4", "A4", "B4", "D5"]], [["F4"], ["A4", "B4", "D5", "F5"]], [["A4"], ["B4", "D5", "F5", "A5"]], [["B4"], ["D5", "F5", "A5", "B5"]],
        [["G4"], ["B4", "D5", "F5", "G5"]], [["B4"], ["D5", "F5", "G5", "B5"]], [["D4"], ["F4", "G4", "B4", "D5"]], [["F4"], ["G4", "B4", "D5", "F5"]],
        [["C3", "F3", "B-3"], ["E-4", "A-4"]], [["F3", "B-3"], ["E-4", "A-4", "C5"]],
        [["D3", "A3", "E4", "F4"], ["C5", "G5"]], [["D3", "A3", "E4", "F#4"], ["C#5", "G#5"]],
        [["D3", "F3", "C4"], ["E4", "G4"]], [["F3", "C4"], ["E4", "G4", "D5"]],
        [["F3", "C4"], ["E4", "A4", "D5"]],
        [["F3", "C4"], ["E4", "B4", "D5"]],
        [["E3", "A3", "C4"], ["E4", "B4"]],
        [["E3", "B-3"], ["E-4", "A-4", "C5"]], [["E3", "B-3"], ["E-4", "G4", "C5"]],
        [["C3", "G3"], ["F4", "B-4", "D5"]],
        [["G3", "A3", "D4", "E4"], ["G4"]],
        [["A3", "C4", "D4", "G4"], ["B4"]],
        [["D3", "G#3", "C4"], ["F#4"]],
        [["D#3"], ["B3", "F#4", "A4"]],
        [["D4"], ["F#4", "G#4", "B4", "D5"]],
        [["D3", "F3", "A-3", "C4"], ["E4", "G4"]]
    ]
    await db.client.query('BEGIN');

    for (let i = 0; i < voicings.length; ++i) {
        const voicingId = await db.insertVoicing();
        for (let j = 0; j < voicings[i].length; ++j) {
            for (let k = 0; k < voicings[i][j].length; ++k) {
                const note = voicings[i][j][k];
                if (j == 0) {
                    db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), true, false, voicingId)
                  }
            
                  if (j == 1) {
                    db.insertVoicingNote(note.replace(note.at(-1), ""), note.at(-1), false, false, voicingId)
                  }
          
                  
            }
        }
    }
    await db.client.query('COMMIT');
}
