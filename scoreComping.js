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
                if (noteInfo.at(i).at(j)) {
                    insertMeasure(noteInfo.at(i).at(j), j, db, score_id);
                }
            }
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Panic!', error.stack);
    }
}

async function readScoreComping1(scoreId, db) {
    try {
        const client = db.client;
        // Score-Basisdaten abrufen
        const scoreQuery = `
            SELECT s.score_id, s.file_name, s.stored_name, s.key_sign, s.mode,
                   ts.numerator, ts.denominator
            FROM score s
            JOIN time_signature ts ON s.time_signature_id = ts.time_signature_id
            WHERE s.score_id = $1`;
        const scoreResult = await client.query(scoreQuery, [scoreId]);

        if (scoreResult.rows.length === 0) {
            throw new Error(`Score with ID ${scoreId} not found`);
        }

        const scoreData = scoreResult.rows[0];
        const result = {
            scoreId: scoreData.score_id,
            fileName: scoreData.file_name,
            storedName: scoreData.stored_name,
            keySign: scoreData.key_sign,
            noteInfo: [], // db will be array of arrays: [ [alt0_notes, alt1_notes], [alt0_next_measure_notes], ... ]
            timeSign: { "numerator": scoreData.numerator, "denominator": scoreData.denominator },
            mode: scoreData.mode,
            measureIndeces: []
        };

        // Measures für den Score abrufen, including alternative_count, ordered by measure_id
        const measuresQuery = `
            SELECT measure_id, measure_alternative_count, current_measure_alternative
            FROM measure 
            WHERE score_id = $1 
            ORDER BY measure_id`; // Important for grouping alternatives correctly
        const measuresResult = await client.query(measuresQuery, [scoreId]);

        let currentLogicalMeasureAlternatives = [];

        let currentMeasureAlternative = null;
        for (const measureRow of measuresResult.rows) {
            const measureId = measureRow.measure_id;
            const alternativeCount = measureRow.measure_alternative_count;
            currentMeasureAlternative = measureRow.current_measure_alternative

            // If db is the first alternative of a new logical measure (alternativeCount is 0)
            // and we have collected alternatives for a previous logical measure, push them.
            if (alternativeCount === 0 && currentLogicalMeasureAlternatives.length > 0) {
                result.noteInfo.push(currentLogicalMeasureAlternatives);
                result.measureIndeces.push(currentMeasureAlternative)

                currentLogicalMeasureAlternatives = []; // Reset for the new logical measure
            }

            const measureElementsQuery = `
                SELECT me.measure_elem_id, me.voicing_index, me.voicing_index_left_hand
                FROM measure_elem me
                WHERE me.measure_id = $1
                ORDER BY me.measure_elem_id`; // Assuming order of elements within a measure matters
            const measureElementsResult = await client.query(measureElementsQuery, [measureId]);

            const singleAlternativeNotes = []; // Holds noteObj for the current measureRow (one alternative)

            for (const elem of measureElementsResult.rows) {
                // Haupt-Note abrufen
                const noteQuery = `
                    SELECT n.note_id, n.note_key, n.duration, n.relative_to_key, n.is_natural, n.octave, n.is_rest, t.numerator, t.denominator, n.octave_change
                    FROM measure_elem_note men
                    JOIN note n ON men.note_id = n.note_id
                    LEFT JOIN tuplet t ON n.note_id = t.note_id
                    WHERE men.measure_elem_id = $1`;
                const noteResult = await client.query(noteQuery, [elem.measure_elem_id]);

                if (noteResult.rows.length === 0) continue;
                
                const mainNoteData = noteResult.rows[0];
                
                // Reconstruct OneNote / noteObj.
                // db part is crucial for ensuring the data structure matches what insertMeasure expects.
                // The OneNote class constructor might need more data or adjustment.
                // For now, I'm creating a structure similar to what insertMeasure might consume.
                // db requires careful mapping from DB fields back to the complex `noteObj` structure.
                
                // db will be the equivalent of `noteObj` in `insertMeasure`
                const noteOutputObject = {
                    elem_name: mainNoteData.is_rest ? "Rest" : `${mainNoteData.note_key}${mainNoteData.octave}`,
                    elem_length: mainNoteData.numerator ? { numerator: mainNoteData.numerator, denominator: mainNoteData.denominator } : mainNoteData.duration,
                    // For relative_to_key, insertMeasure expects an array: [key_string, is_natural_flag_for_main_note]
                    // The main note's `is_natural` from the DB refers to its relation to `relative_to_key`, not its own accidental.
                    // The `is_natural` property of the `note` table should reflect if the note *itself* is natural in context of `relative_to_key`.
                    // `db.parseNoteKey(elem_name)` in insertMeasure will determine the absolute pitch including accidentals.
                    relative_to_key: mainNoteData.relative_to_key 
                                      ? [mainNoteData.relative_to_key, mainNoteData.is_natural ? 1 : 0] 
                                      : null,
                    octave_change: mainNoteData.octave_change,
                    chord_details: [], // Array of strings like "C4", "E4"
                    voicingIndex: elem.voicing_index === null ? -1 : elem.voicing_index,
                    voicingIndexLeftHand: elem.voicing_index_left_hand === null ? -1 : elem.voicing_index_left_hand,
                    voicings: [], // Array of {leftHand: [strings], rightHand: [strings], impliedNotes: [strings]}
                    relativeVoicings: [], // Mirrored structure to voicings, but with relative info
                    leftHandVoicings: [], // Array of {absolute: ..., relative: ...} structures
                };


                // Chord-Details abrufen
                const chordQuery = `
                    SELECT n.note_key, n.octave, n.is_natural AS note_is_natural_db
                    FROM chord_detail_elem cde
                    JOIN note n ON cde.note_id = n.note_id
                    WHERE cde.measure_elem_id = $1`;
                const chordResult = await client.query(chordQuery, [elem.measure_elem_id]);

                if (chordResult.rows.length > 0) {
                    // insertMeasure expects chord_details to be an array of note strings ("C4", "Eb3", etc.)
                    noteOutputObject.chord_details = chordResult.rows.map(cd => {
                        // Reconstruct the note string, e.g. "C4", "Db5".
                        // db.parseNoteKey in insertMeasure will handle it.
                        // The `is_natural` from note table for chord notes usually means "no accidental if key implies one already"
                        // but parseNoteKey("C#4") inherently knows C# is not natural.
                        // For simplicity, we assume note_key itself contains accidentals if any (e.g., "C#", "Db")
                        return `${cd.note_key}${cd.octave}`;
                    });
                }

                // Voicing-Details abrufen
                const voicingQuery = `
                    SELECT mev.measure_elem_voicing_id, mev.from_any_top_note
                    FROM measure_elem_voicing mev
                    WHERE mev.measure_elem_id = $1
                    ORDER BY mev.measure_elem_voicing_id`;
                const voicingResult = await client.query(voicingQuery, [elem.measure_elem_id]);

                if (voicingResult.rows.length > 0) {
                    for (const voicingInfo of voicingResult.rows) {
                        const voicingNotesQuery = `
                            SELECT n.note_key, n.octave, n.relative_to_key, n.is_natural AS note_is_natural_db, mevn.is_left_hand, mevn.is_implied
                            FROM measure_elem_voicing_note mevn
                            JOIN note n ON mevn.note_id = n.note_id
                            WHERE mevn.measure_elem_voicing_id = $1
                            ORDER BY mevn.note_id`; // Order might be important if relativeVoicings relies on it

                        const voicingNotesResult = await client.query(voicingNotesQuery, [voicingInfo.measure_elem_voicing_id]);
                        
                        const currentVoicingAbsolute = { leftHand: [], rightHand: [], impliedNotes: [] };
                        const currentVoicingRelative = { leftHand: [], rightHand: [] }; // Implied notes don't usually have relative info

                        voicingNotesResult.rows.forEach(vn => {
                            const noteString = `${vn.note_key}${vn.octave}`;
                            const relativeInfo = vn.relative_to_key ? [vn.relative_to_key, vn.note_is_natural_db ? 1 : 0] : null;

                            if (vn.is_implied) {
                                currentVoicingAbsolute.impliedNotes.push(noteString);
                            } else if (vn.is_left_hand) {
                                currentVoicingAbsolute.leftHand.push(noteString);
                                if (relativeInfo) currentVoicingRelative.leftHand.push(relativeInfo);
                            } else {
                                currentVoicingAbsolute.rightHand.push(noteString);
                                if (relativeInfo) currentVoicingRelative.rightHand.push(relativeInfo);
                            }
                        });
                        
                        if (currentVoicingAbsolute.leftHand.length > 0 && currentVoicingAbsolute.rightHand.length > 0) {
                            if (voicingInfo.from_any_top_note) {
                                // db structure is nested for leftHandVoicings in insertMeasure
                                // { absolute: [ [ {leftHand:[], rightHand:[], impliedNotes:[]} ...octaves ] ...inversions ],
                                //   relative: [ [ [ [LH_rel_key, LH_is_nat_flag], ... ], [ [RH_rel_key, RH_is_nat_flag], ... ] ] ...octaves ] ...inversions ]
                                // }
                                // For simplicity, reading back might flatten db or require a more complex reconstruction.
                                // Assuming one level of nesting for now when reading back:
                                const newLhVoicing = {
                                    absolute: [[currentVoicingAbsolute]], // Assuming it's one variant [inversion][octave]
                                    relative: [[[currentVoicingRelative.leftHand, currentVoicingRelative.rightHand]]]
                                };
                                noteOutputObject.leftHandVoicings.push(newLhVoicing);

                            } else {
                                noteOutputObject.voicings.push(currentVoicingAbsolute);
                                noteOutputObject.relativeVoicings.push([
                                    currentVoicingRelative.leftHand, 
                                    currentVoicingRelative.rightHand
                                ]);
                            }
                        }
                    }
                }
                singleAlternativeNotes.push(noteOutputObject);
            }
            currentLogicalMeasureAlternatives.push(singleAlternativeNotes);
        }

        // After the loop, if there are any remaining alternatives for the last logical measure, push them.
        if (currentLogicalMeasureAlternatives.length > 0) {
            result.noteInfo.push(currentLogicalMeasureAlternatives);
            result.measureIndeces.push(currentMeasureAlternative)
        }

        return result;
    } catch (error) {
        console.error('Error reading score:', error.stack);
        throw error;
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
                    SELECT n.note_id, n.note_key, n.duration, n.relative_to_key, n.is_natural, n.octave AS octave, n.is_rest, t.numerator, t.denominator, n.octave_change
                    FROM measure_elem_note men
                    JOIN note n ON men.note_id = n.note_id
                    LEFT JOIN tuplet t ON n.note_id = t.note_id
                    WHERE men.measure_elem_id = $1`;
                const noteResult = await db.client.query(noteQuery, [elem.measure_elem_id]);

                if (noteResult.rows.length === 0) continue;
                
                const note = noteResult.rows[0];
                const noteObj = {
                    oneNote: new OneNote(note.note_key, note.duration,  note.is_natural, note.octave, note.is_rest, note.relative_to_key, note.numerator ? { numerator: note.numerator, denominator: note.denominator } : null),
                    voicingIndex: elem.voicing_index || elem.voicing_index == 0 ? elem.voicing_index : -1,
                    voicingIndexLeftHand: elem.voicing_index_left_hand || elem.voicing_index_left_hand == 0 ? elem.voicing_index_left_hand : -1,
                    voicings: [], 
                    chord_details: [],
                    octave_change: elem.octave_change
                };

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
        result.noteInfo = newResultInfo
        result.measureIndeces = newMeasureIndeces

        console.log("HIIIIII")
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