from music21 import converter, interval
import sys

inputXml = sys.argv[1]
transposeValue = sys.argv[2]
# MusicXML-Datei laden
score = converter.parse(inputXml)

# Transponieren um eine große Sekunde aufwärts (2 Halbtöne)
transposition_interval = interval.Interval(int(transposeValue))
transposed_score = score.transpose(transposition_interval)

# Transponierte Datei speichern
transposed_score.write('musicxml', inputXml)