/**
 * Generic compound parts (SPEC 15.7): everyday, business and tech words, no field jargon. Each one is a
 * parts-only lexicon entry (cls `topic`, prior `common`, `part: true`, `partOnly: true`). The `de` lists
 * have `lang: 'de'`; the shared list has the same spelling and meaning in English (`lang: '*'`), so it
 * adds no German score in language detection (SPEC 6.1).
 */

// biome-ignore format: word list, one line per group
export const PARTS_DE: readonly string[] = [
  // home and living
  'haus', 'wohnung', 'miete', 'zimmer', 'kueche', 'bad', 'garten', 'balkon', 'keller', 'dach', 'fenster', 'tuer',
  'wand', 'boden', 'moebel', 'tisch', 'stuhl', 'bett', 'schrank', 'licht', 'lampe', 'strom', 'wasser', 'gas',
  'heizung', 'waerme', 'energie', 'muell', 'abfall', 'nachbar', 'umzug',
  // mobility and places
  'auto', 'fahrrad', 'rad', 'bahn', 'zug', 'flug', 'flughafen', 'hafen', 'bahnhof', 'strasse', 'weg', 'platz',
  'stadt', 'dorf', 'land', 'kreis', 'bezirk', 'gemeinde', 'ort', 'reise', 'urlaub', 'ferien', 'karte', 'fahrt',
  'verkehr',
  // food
  'essen', 'speise', 'kuchen', 'brot', 'apfel', 'obst', 'gemuese', 'fleisch', 'fisch', 'milch', 'kaffee', 'tee',
  'wein', 'bier', 'rezept', 'getraenk', 'lebensmittel', 'mittag', 'abendessen', 'fruehstueck',
  // family, school, research
  'kind', 'kinder', 'eltern', 'familie', 'schule', 'schueler', 'lehrer', 'klasse', 'unterricht', 'kurs', 'lern',
  'lehr', 'studium', 'pruefung', 'noten', 'forschung', 'studie', 'labor', 'wissen', 'bildung', 'buch',
  // health and sport
  'arzt', 'praxis', 'klinik', 'kranken', 'pflege', 'gesundheit', 'medizin', 'therapie', 'notfall', 'impf', 'sport',
  'verein', 'spiel', 'mannschaft', 'lauf', 'turnier',
  // work and everyday life
  'arbeit', 'beruf', 'stelle', 'gruppe', 'leitung', 'fuehrung', 'kunde', 'kunden', 'markt', 'vertrieb', 'verkauf',
  'handel', 'laden', 'produkt', 'ware', 'preis', 'kosten', 'geld', 'bank', 'konto', 'zahlung', 'rechnung', 'steuer',
  'finanz', 'haushalt', 'vertrag', 'recht', 'gesetz', 'gericht', 'antrag', 'brief', 'post', 'paket', 'lager',
  'lieferung', 'versand', 'logistik', 'reinigung', 'reparatur', 'hilfe', 'beratung', 'sicherheit', 'schutz',
  'versicherung', 'bau', 'gespraech', 'idee', 'ziel', 'loesung', 'erfolg',
  // tech and media
  'daten', 'netz', 'netzwerk', 'seite', 'rechner', 'drucker', 'telefon', 'handy', 'passwort', 'zugang', 'nutzer',
  'benutzer', 'programm', 'fehler', 'schnittstelle', 'speicher', 'datenbank', 'bild', 'foto', 'musik', 'nachricht',
  'zeitung',
  // time and events
  'zeit', 'tag', 'woche', 'monat', 'jahr', 'morgen', 'abend', 'nacht', 'sommer', 'winter', 'fruehling', 'herbst',
  'fest', 'feier', 'geburtstag', 'hochzeit', 'messe', 'ausstellung', 'konzert', 'termin', 'kalender',
  // nature
  'umwelt', 'klima', 'natur', 'tier', 'baum', 'blume', 'wald', 'see', 'berg', 'meer', 'wetter',
]

// biome-ignore format: word list, one line per group
export const PARTS_SHARED: readonly string[] = [
  'web', 'server', 'system', 'service', 'portal', 'cloud', 'test', 'code', 'film', 'hotel', 'ticket', 'shop', 'job',
  'budget', 'fitness', 'training', 'video', 'park', 'bus', 'student', 'patient', 'transport', 'region',
]
