const format = require('pg-format');

async function insertMeasure(measureNotes, alternativeCount, db, score_id) {
    const client = db.client;

    const {rows: [{measure_id}]} = await client.query(
        'INSERT INTO measure (score_id, measure_alternative_count) VALUES ($1, $2) RETURNING measure_id',
        [score_id, alternativeCount]
    );

    for (const noteObj of measureNotes) {
        const {
            elem_name,
            elem_length,
            chord_details,
            voicingIndex,
            voicings,
            relativeVoicings,
            leftHandVoicings
        } = noteObj;
        // Handle Hauptnote
        const {
            note_key, octave
        } = db.parseNoteKey(elem_name);
        
        const notesIds = await db.insertNote([{
            note_key,
            duration: typeof elem_length === 'object' || elem_length.hasOwnProperty("numerator") ? 0.5 : elem_length,
            relativeToKey: db.parseNoteKey(noteObj.relative_to_key[0]).note_key,
            is_natural: noteObj.relative_to_key[1] === 1,
            octave,
            is_rest: elem_name === 'Rest',
            tuplet: typeof elem_length === 'object' && elem_length.hasOwnProperty("numerator") ? elem_length : false,
            octave_change: 0
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
            const chordNotes = await db.insertNote(chord_details.map(cd => {
                const {note_key, is_natural, octave} = db.parseNoteKey(cd);
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
                if (Object.keys(voicing).length != 3 || voicing["leftHand"].length == 0 || voicing["rightHand"].length == 0) {
                    continue
                }

                const vocingNotesLeft = await db.insertNote(voicing["leftHand"].map((vn, index) => {
                    const {note_key, is_natural, octave} = db.parseNoteKey(vn);
                    return {
                        note_key, duration: 0, relativeToKey: db.parseNoteKey(relativeVoicings[indexVoicing][0][index][0]).note_key, is_natural: relativeVoicings[indexVoicing][0][index][1] == 1, octave, is_rest: false
                    };
                }));

                const vocingNotesRight = await db.insertNote(voicing["rightHand"].map((vn, index) => {
                    const {note_key, is_natural, octave} = db.parseNoteKey(vn);
                    return {
                        note_key, duration: 0, relativeToKey: db.parseNoteKey(relativeVoicings[indexVoicing][1][index][0]).note_key, is_natural: relativeVoicings[indexVoicing][1][index][1] == 1, octave, is_rest: false
                    };
                }));

                let vocingNotesImplied = null;
                if (voicing["impliedNotes"].length > 0) {
                        vocingNotesImplied = await db.insertNote(voicing["impliedNotes"].map((vn, index) => {
                        const {note_key, is_natural, octave} = db.parseNoteKey(vn);
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

                if (voicing["impliedNotes"].length > 0) {
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

        if (leftHandVoicings && leftHandVoicings.length > 0) {
            for (const [indexVoicing, voicing] of leftHandVoicings.entries()) {
                for (const [indexVoicingInversion, voicingInversion] of voicing.absolute.entries()) {
                    for (const [indexVoicingOctave, voicingOcatave] of voicingInversion.entries()) {

                        if ( Object.keys(voicingOcatave).length != 3 || voicingOcatave["leftHand"].length == 0 || voicingOcatave["rightHand"].length == 0) {
                            continue
                        }

                        const vocingNotesLeft = await db.insertNote(voicingOcatave["leftHand"].map((vn, index) => {
                            const {note_key, is_natural, octave} = db.parseNoteKey(vn);
                            return {
                                note_key, duration: 0, relativeToKey: db.parseNoteKey(voicing.relative[indexVoicingInversion][indexVoicingOctave][0][index][0]).note_key, is_natural: voicing.relative[indexVoicingInversion][indexVoicingOctave][0][index][1] == 1, octave, is_rest: false
                            };
                        }));

                        const vocingNotesRight = await db.insertNote(voicingOcatave["rightHand"].map((vn, index) => {
                            const {note_key, is_natural, octave} = db.parseNoteKey(vn);
                            return {
                                note_key, duration: 0, relativeToKey: db.parseNoteKey(voicing.relative[indexVoicingInversion][indexVoicingOctave][1][index][0]).note_key, is_natural: voicing.relative[indexVoicingInversion][indexVoicingOctave][1][index][1] == 1, octave, is_rest: false
                            };
                        }));

                        let vocingNotesImplied = null;
                        if (voicingOcatave["impliedNotes"].length > 0) {
                            vocingNotesImplied = await db.insertNote(voicingOcatave["impliedNotes"].map((vn, index) => {
                                const {note_key, is_natural, octave} = db.parseNoteKey(vn);
                                return {
                                    note_key, duration: 0, relativeToKey: null, is_natural: null, octave, is_rest: false
                                };
                            }));
                        }
                        
                        const {rows: [{measure_elem_voicing_id}]} = await client.query(
                            'INSERT INTO measure_elem_voicing (measure_elem_id, from_any_top_note) VALUES ($1, $2) RETURNING measure_elem_voicing_id',
                            [measure_elem_id, true]
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

                        if (voicingOcatave["impliedNotes"].length > 0) {
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
    }
}


async function insertNote(noteObj, db) {
    const client = db.client;
    const notes = Array.isArray(noteObj) ? noteObj : [noteObj];

    const queryText = format(
        'INSERT INTO note (note_key, duration, relative_to_key, is_natural, octave, is_rest, octave_change, references_note) VALUES %L RETURNING note_id',
        notes.map(n => [
            n.note_key,
            n.duration,
            n.relativeToKey,
            n.is_natural,
            n.octave,
            n.is_rest,
            n.note_octave,
            n.references
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

async function insertMeasureReferences(measureNotes, alternativeCount, db, score_id) {
    const client = db.client;

    const {rows: [{measure_id}]} = await client.query(
        'INSERT INTO measure (score_id, measure_alternative_count) VALUES ($1, $2) RETURNING measure_id',
        [score_id, alternativeCount]
    );

    for (const noteObj of measureNotes) {
        const {
            elem_name,
            elem_length,
            voicingIndex,
            references
        } = noteObj;

        // Handle Hauptnote
        const {
            note_key, octave
        } = db.parseNoteKey(elem_name);
        
        let  notesIds = null;

        if (references || references === 0) {
            console.log(references)

            notesIds = await insertNote([{
                note_key,
                duration: typeof elem_length === 'object' || elem_length.hasOwnProperty("noteTypeValue") ? elem_length.noteTypeValue : elem_length,
                relativeToKey: db.parseNoteKey(noteObj.relative_to_key[0]).note_key,
                is_natural: noteObj.relative_to_key[1] === 1,
                octave,
                is_rest: elem_name === 'Rest',
                tuplet: typeof elem_length === 'object' && elem_length.hasOwnProperty("numerator") ? elem_length : false,
                octave_change: 0,
                references
            }], db);
        } else {
            notesIds = await db.insertNote([{
                note_key,
                duration: typeof elem_length === 'object' || elem_length.hasOwnProperty("noteTypeValue") ? elem_length.noteTypeValue : elem_length,
                relativeToKey: db.parseNoteKey(noteObj.relative_to_key[0]).note_key,
                is_natural: noteObj.relative_to_key[1] === 1,
                octave,
                is_rest: elem_name === 'Rest',
                tuplet: typeof elem_length === 'object' && elem_length.hasOwnProperty("numerator") ? elem_length : false,
                octave_change: 0
            }]);
        }
    
        const {rows: [{measure_elem_id}]} = await client.query(
            'INSERT INTO measure_elem (measure_id) VALUES ($1) RETURNING measure_elem_id',
            [measure_id]
        );

        await client.query(
            'INSERT INTO measure_elem_note (measure_elem_id, note_id) VALUES ($1, $2)',
            [measure_elem_id, notesIds[0]]
        );
    }
}

async function createScoreComping(scoreJson, db, scoreId = -1)  {
    const client = db.client;
    try {
        await client.query('BEGIN');

        const {fileName, storedName, noteInfo, keySign, timeSign, mode} = scoreJson;

        let score_id = null;
        if (scoreId === -1) {
            
            const {rows: [{time_signature_id}]} = await client.query(
                'INSERT INTO time_signature (numerator, denominator) VALUES ($1, $2) RETURNING time_signature_id',
                [timeSign.numerator, timeSign.denominator]
            );

            const insertScoreResult = await client.query(
                'INSERT INTO score (file_name, stored_name, key_sign, time_signature_id, mode) VALUES ($1, $2, $3, $4, $5) RETURNING score_id',
                [fileName, storedName, keySign, time_signature_id, mode]
            );
            score_id = insertScoreResult.rows[0].score_id
        } else {
            score_id = scoreId
        }
        
        for (let i = 0; i < noteInfo.length; ++i) {
            for (let j = 0; j < noteInfo.length; ++j) {
                if (noteInfo.at(i).at(j) && j === 0) {
                    insertMeasure(noteInfo.at(i).at(j), j, db, score_id);
                } else if (noteInfo.at(i).at(j)) {
                    insertMeasureReferences(noteInfo.at(i).at(j), j, db, score_id);
                }
            }
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Panic!', error.stack);
    }
}

class OneTuplet {
    constructor(numerator, denominator) {
        this.numerator = numerator
        this.denominator = denominator
    }
}

class OneNote {
    constructor(note_key, duration, is_natural, octave, is_rest, relative_to_key = null, oneTuplet = null, octave_change = null) {
        this.note_key = note_key;
        this.duration = duration
        this.is_natural = is_natural
        this.octave = octave
        this.is_rest = is_rest
        this.relative_to_key = relative_to_key
        this.oneTuplet = oneTuplet
        this.octave_change = octave_change
    }
}

async function readScoreComping(scoreId, db) {
    try {
        // Score-Basisdaten abrufen
        const scoreQuery = `
            SELECT score_id, file_name, stored_name, key_sign, time_signature_id, mode
            FROM score 
            WHERE score_id = $1`;
        const scoreResult = await db.client.query(scoreQuery, [scoreId]);

        const timeSignQuery = `
            SELECT numerator, denominator
            FROM time_signature 
            WHERE time_signature_id = $1`;
        const timeSignResult = await db.client.query(timeSignQuery, [scoreResult.rows[0].time_signature_id]);

        if (scoreResult.rows.length === 0) {
            throw new Error(`Score with ID ${scoreId} not found`);
        }

        const score = scoreResult.rows[0];
        const result = {
            scoreId: score.score_id,
            fileName: score.file_name,
            storedName: score.stored_name,
            keySign: score.key_sign,
            noteInfo: [],
            timeSign: {"numerator": timeSignResult.rows[0].numerator, "denominator": timeSignResult.rows[0].denominator},
            mode: score.mode
        };

        // Measures für den Score abrufen
        const measuresQuery = `
            SELECT measure_id, measure_alternative_count, current_measure_alternative
            FROM measure 
            WHERE score_id = $1 
            ORDER BY measure_id`;
        const measuresResult = await db.client.query(measuresQuery, [scoreId]);

       let measureAlternativeIndeces = [];
       let currentAlternativeIndeces = [];

        // Für jedes Measure die zugehörigen Elemente und Noten abrufen
        for (const measure of measuresResult.rows) {
            measureAlternativeIndeces.push(measure.measure_alternative_count)
            currentAlternativeIndeces.push(measure.current_measure_alternative)

            const measureElementsQuery = `
                SELECT me.measure_elem_id, me.voicing_index, me.voicing_index_left_hand
                FROM measure_elem me
                WHERE me.measure_id = $1
                ORDER BY me.measure_elem_id`;
            const measureElementsResult = await db.client.query(measureElementsQuery, [measure.measure_id]);

            const measureNotes = [];

            // Für jedes Measure Element die Noten, Chords und Voicings abrufen
            for (const elem of measureElementsResult.rows) {
                // Haupt-Note abrufen
                const noteQuery = `
                    SELECT n.note_id, n.note_key, n.duration, n.relative_to_key, n.is_natural, n.octave AS octave, n.is_rest, t.numerator, t.denominator, n.octave_change, n.references_note
                    FROM measure_elem_note men
                    JOIN note n ON men.note_id = n.note_id
                    LEFT JOIN tuplet t ON n.note_id = t.note_id
                    WHERE men.measure_elem_id = $1`;
                const noteResult = await db.client.query(noteQuery, [elem.measure_elem_id]);

                if (noteResult.rows.length === 0) continue;
                
                const note = noteResult.rows[0];
                let noteObj = {};
                if (note.references_note || note.references_note === 0) {
                    noteObj = {
                        oneNote: new OneNote(note.note_key, note.duration,  note.is_natural, note.octave, note.is_rest, note.relative_to_key, note.numerator ? { numerator: note.numerator, denominator: note.denominator } : null),
                        voicingIndex: elem.voicing_index || elem.voicing_index == 0 ? elem.voicing_index : -1,
                        voicingIndexLeftHand: elem.voicing_index_left_hand || elem.voicing_index_left_hand == 0 ? elem.voicing_index_left_hand : -1,
                        voicings: [], 
                        chord_details: [],
                        octave_change: elem.octave_change,
                        references: note.references_note,
                    };
                } else {
                    noteObj = {
                        oneNote: new OneNote(note.note_key, note.duration,  note.is_natural, note.octave, note.is_rest, note.relative_to_key, note.numerator ? { numerator: note.numerator, denominator: note.denominator } : null),
                        voicingIndex: elem.voicing_index || elem.voicing_index == 0 ? elem.voicing_index : -1,
                        voicingIndexLeftHand: elem.voicing_index_left_hand || elem.voicing_index_left_hand == 0 ? elem.voicing_index_left_hand : -1,
                        voicings: [], 
                        chord_details: [],
                        octave_change: elem.octave_change
                    };
                }
                

                // Chord-Details abrufen
                const chordQuery = `
                    SELECT n.note_key, n.is_natural, n.octave AS octave
                    FROM chord_detail_elem cde
                    JOIN note n ON cde.note_id = n.note_id
                    WHERE cde.measure_elem_id = $1`;
                const chordResult = await db.client.query(chordQuery, [elem.measure_elem_id]);

                if (chordResult.rows.length > 0) {
                    noteObj.chord_details = chordResult.rows.map(chordNote => new OneNote(chordNote.note_key, 0, false, chordNote.octave, false));
                }

                // Voicing-Details abrufen
                const voicingQuery = `
                    SELECT mev.measure_elem_voicing_id, mev.from_any_top_note
                    FROM measure_elem_voicing mev
                    WHERE mev.measure_elem_id = $1
                    ORDER BY mev.measure_elem_voicing_id`;
                const voicingResult = await db.client.query(voicingQuery, [elem.measure_elem_id]);

                if (voicingResult.rows.length > 0) {
                    const voicings = [];
                    const leftHandVoicings = [];

                    for (const voicing of voicingResult.rows) {
                        const voicingNotesQuery = `
                            SELECT n.note_key, n.is_natural, n.octave, n.relative_to_key, n.octave_change, mevn.is_left_hand, mevn.is_implied
                            FROM measure_elem_voicing_note mevn
                            JOIN note n ON mevn.note_id = n.note_id
                            WHERE mevn.measure_elem_voicing_id = $1
                            ORDER BY mevn.note_id`

                        const voicingNotesResult = await db.client.query(voicingNotesQuery, [voicing.measure_elem_voicing_id]);

                        // Noten in linke und rechte Hand aufteilen
                        //constructor(note_key, duration, is_natural, octave, is_rest, relative_to_key = null, oneTuplet = null) {
                        const leftHandNotes = voicingNotesResult.rows
                            .filter(vn => vn.is_left_hand && !vn.is_implied)
                            .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key, null, vn.octave_change));

                        const rightHandNotes = voicingNotesResult.rows
                            .filter(vn => !vn.is_left_hand && !vn.is_implied)
                            .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key, null, vn.octave_change));
                        
                        const impliedNotes = voicingNotesResult.rows
                            .filter(vn => vn.is_implied)
                            .map(vn => new OneNote(vn.note_key, vn.duration, vn.is_natural, vn.octave, false, vn.relative_to_key, null, vn.octave_change));
                        
                        if (leftHandNotes.length > 0 && rightHandNotes.length > 0) {
                            if (voicing.from_any_top_note) {
                                leftHandVoicings.push([leftHandNotes, rightHandNotes, impliedNotes]);
                            } else {
                                voicings.push([leftHandNotes, rightHandNotes, impliedNotes]);
                            }
                        }
                    }

                    if ( voicings.length > 0) {
                        noteObj.voicings = voicings;
                        noteObj.leftHandVoicings = leftHandVoicings;
                    } else {
                        noteObj.voicings = [];
                    }
                }

                measureNotes.push(noteObj);
            }
            
            result.noteInfo.push(measureNotes);
        }

        let newResultInfo = [];
        let newMeasureIndeces = []
        for (let i = 0; i < measureAlternativeIndeces.length; ++i) {
            if (measureAlternativeIndeces[i] == 0) {
                newResultInfo.push([])
                newMeasureIndeces.push(currentAlternativeIndeces[i])
            }
            newResultInfo.at(-1).push(result.noteInfo[i])
        }

        for (let i = 0; i < newResultInfo.length; ++i) {
            for (let j = 0; j < newResultInfo[i].length; ++j) {
                for (let k = 0; k < newResultInfo[i][j].length; ++k) {
                    if (newResultInfo[i][j][k].hasOwnProperty("references")) {
                        let tempI = i;
                        let references = newResultInfo[i][j][k].references;
                        if (newResultInfo[i][0].length <= references) {
                            tempI += 1;
                            references = 0;
                        }
                        newResultInfo[i][j][k].voicings = newResultInfo[tempI][0][references].voicings;
                        newResultInfo[i][j][k].leftHandVoicings = newResultInfo[tempI][0][references].leftHandVoicings;
                        newResultInfo[i][j][k].chord_details = newResultInfo[tempI][0][references].chord_details;
                    }
                }
            }
        }

        result.noteInfo = newResultInfo
        result.measureIndeces = newMeasureIndeces

        return result;
    } catch (error) {
        console.error('Error reading score:', error);
        throw error;
    }
}
module.exports = {
    readScoreComping,
    createScoreComping
};