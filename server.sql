CREATE TABLE IF NOT EXISTS  person (
    person_id SERIAL PRIMARY KEY,
    user_name varchar(255),
    psw varchar(255)
);

CREATE TABLE IF NOT EXISTS note (
    note_id SERIAL PRIMARY KEY,
    note_key varchar(10),
    duration float,
    relative_to_key varchar(10),
    is_natural BOOLEAN,
    octave SMALLINT,
    is_rest BOOLEAN
);

CREATE TABLE IF NOT EXISTS score (
  score_id SERIAL PRIMARY KEY,
  file_name varchar(255),
  stored_name varchar(255),
  key_sign int
);

CREATE TABLE IF NOT EXISTS measure (
  measure_id SERIAL PRIMARY KEY,

  score_id integer,
  CONSTRAINT fk_score
      FOREIGN KEY(score_id)
        REFERENCES score(score_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS  voicing ( 
  voicing_id SERIAL PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS  voicing_category ( 
  voicing_category_id SERIAL PRIMARY KEY,
  category_name varchar(400)
);

CREATE TABLE IF NOT EXISTS  voicing_category_connection ( 
    voicing_category_connection_id SERIAL PRIMARY KEY,

  voicing_id integer,
  CONSTRAINT fk_voicing
      FOREIGN KEY(voicing_id)
        REFERENCES voicing(voicing_id) ON DELETE CASCADE,

  voicing_category_id integer,
  CONSTRAINT fk_voicing_category
      FOREIGN KEY(voicing_category_id)
        REFERENCES voicing_category(voicing_category_id) ON DELETE CASCADE
); 

CREATE TABLE IF NOT EXISTS measure_elem (
  measure_elem_id SERIAL PRIMARY KEY,

  measure_id integer,

  voicing_index integer,

  CONSTRAINT fk_measure
      FOREIGN KEY(measure_id)
        REFERENCES measure(measure_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS  measure_elem_voicing (
  measure_elem_voicing_id SERIAL PRIMARY KEY,


  voicing_id integer,
    CONSTRAINT fk_voicing
      FOREIGN KEY(voicing_id)
        REFERENCES voicing(voicing_id) ON DELETE CASCADE, 

  measure_elem_id integer,
    CONSTRAINT fk_measure_elem_id
      FOREIGN KEY(measure_elem_id)
        REFERENCES measure_elem(measure_elem_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS measure_elem_voicing_note (
  measure_elem_voicing_note_id SERIAL PRIMARY KEY,
  is_left_hand BOOLEAN,
  is_implied BOOLEAN,

  measure_elem_voicing_id integer,
  CONSTRAINT fk_measure_elem_voicing
      FOREIGN KEY(measure_elem_voicing_id)
        REFERENCES measure_elem_voicing(measure_elem_voicing_id) ON DELETE CASCADE,

  note_id integer,
  CONSTRAINT fk_note
      FOREIGN KEY(note_id)
        REFERENCES note(note_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS measure_elem_note (
  chord_detail_elem_id SERIAL PRIMARY KEY,


  measure_elem_id integer,
  CONSTRAINT fk_measure_elem
      FOREIGN KEY(measure_elem_id)
        REFERENCES measure_elem(measure_elem_id) ON DELETE CASCADE,

  note_id integer,
  CONSTRAINT fk_note
      FOREIGN KEY(note_id)
        REFERENCES note(note_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chord_detail_elem (
  chord_detail_elem_id SERIAL PRIMARY KEY,


  measure_elem_id integer,
  CONSTRAINT fk_measure_elem
      FOREIGN KEY(measure_elem_id)
        REFERENCES measure_elem(measure_elem_id) ON DELETE CASCADE,

  note_id integer,
  CONSTRAINT fk_note
      FOREIGN KEY(note_id)
        REFERENCES note(note_id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS  tuplet (
    tuplet_id SERIAL PRIMARY KEY,
    numerator INT,
    denominator INT,

    note_id integer,
    CONSTRAINT fk_note
      FOREIGN KEY(note_id)
        REFERENCES note(note_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS  note_voicing_elem (
  note_voicing_elem_id SERIAL PRIMARY KEY,
  is_left_hand BOOLEAN,
  is_implied BOOLEAN,
  note_id integer,
    CONSTRAINT fk_note
      FOREIGN KEY(note_id)
        REFERENCES note(note_id) ON DELETE CASCADE,

  voicing_id integer,
    CONSTRAINT fk_voicing
      FOREIGN KEY(voicing_id)
        REFERENCES voicing(voicing_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS  score_person (
  score_id INT,
  person_id INT,
  PRIMARY KEY (score_id, person_id),
  CONSTRAINT fk_score FOREIGN KEY(score_id) REFERENCES score(score_id) ON DELETE CASCADE,
  CONSTRAINT fk_person FOREIGN KEY(person_id) REFERENCES person(person_id) ON DELETE CASCADE
);