# Printer Routing Setup

## Doel

Gebruik aparte printerrecords voor aparte fysieke printers, ook als het hetzelfde model is.

Voorbeeld:

- `ZM400-MAZAK-PC` met routing keys `MAZAK, FLANGE`
- `ZM400-BH18-PC` met routing keys `GENERAL, LARGE, STATION:BH18`

Zo kan de applicatie labels routeren zonder een globale default printer.

## Inrichting per computer

1. Maak in Printer Beheer voor elke fysieke printer een apart record aan.
2. Geef per printer duidelijke routing keys op.
3. Open op de betreffende computer de print listener of print station pagina.
4. Koppel op die computer alleen de lokaal aangesloten USB-printer.
5. Laat de andere computer hetzelfde doen voor zijn eigen printer.

De queue processor pakt dan alleen jobs op voor de printer die op die computer echt gekoppeld is.

## Aanbevolen routing keys

- `MAZAK`: Mazak labels en FL-producten
- `FLANGE`: extra alias voor Mazak/flenslabels
- `GENERAL`: algemene grote labels voor BH-stations
- `LARGE`: alias voor grote labels
- `STATION:BH18`: expliciete printer voor BH18
- `STATION:BM01`: expliciete printer voor BM01

## Zonder beheerdersaccount

Voor WebUSB-printen is normaal geen lokaal Windows-beheerdersaccount nodig zodra:

1. de printerdriver al aanwezig is, of
2. de browser de USB-printer eenmalig mag autoriseren voor die gebruiker.

Praktisch advies:

- gebruik een vaste browserlogin op de Mazak-pc
- koppel daar alleen de Mazak-printer
- gebruik op de BH18-pc een aparte browserlogin of aparte werkplekpagina
- geef operators geen Printer Beheer rechten als dat niet nodig is

Als een driver nog helemaal niet op de pc staat, is meestal wel een eenmalige installatie door IT of een beheerder nodig. Daarna kan de gebruiker zonder adminrechten blijven printen.

## Voorbeeldconfiguratie

### Mazak-pc

- printernaam: `ZM400 Mazak`
- routing keys: `MAZAK, FLANGE`
- gekoppelde lokale USB-printer: alleen de Mazak printer

### Grote-labels-pc

- printernaam: `ZM400 BH18 Groot`
- routing keys: `GENERAL, LARGE, STATION:BH18`
- gekoppelde lokale USB-printer: alleen de printer voor grote labels

## Resultaat

- FL en Mazak gaan naar de Mazak-pc
- BH18 en andere algemene grote labels kunnen naar de andere pc
- minder kritische flows kunnen dezelfde routing helper gebruiken zolang ze een station of routeKey meegeven