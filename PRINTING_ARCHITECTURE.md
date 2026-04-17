# ☁️ Architectuur: Gecentraliseerd Printen via Cloud Queue

**Status:** Geïmplementeerd
**Doel:** Betrouwbaar printen van ZPL-labels naar een USB-printer vanaf elke tablet/werkstation in de fabriek.

---

## 🎯 Probleemstelling

Direct printen vanuit een web-app naar een USB-printer is complex en onbetrouwbaar. Netwerkprinters zijn een optie, maar vereisen een stabiel lokaal netwerk en correcte IP-configuraties. Voor een robuuste oplossing, met name voor USB-printers die aan een specifieke PC hangen (zoals bij BH18), is een andere aanpak nodig.

## ✅ Oplossing: Firestore als Print-Wachtrij

We implementeren een asynchroon "Store and Forward" mechanisme met Firestore als centrale wachtrij.

### De Workflow

```
                                  +-----------------------+
      (Print Job: ZPL, etc.)      |                       |
   +----------------------------> |  Firestore Database   |
   |                              |                       |
   |                              |  /print_queue/{jobId} |
   |                              |                       |
+---+---+                           +-----------+-----------+
|       |                                       | 1. Nieuwe taak (status: pending)
| Web   |                                       |
| App   |                                       | 2. Status update (printing -> completed/error)
|       |                                       |
+-------+                                       |
 (Tablet bijv. Lossen)                         |
                                               |
                                               |
                                               v
                                  +------------+------------+
                                  |                         |
                                  |  Node.js Listener       |
                                  |  (Draait op PC bij BH18) |
                                  |                         |
                                  +------------+------------+
                                               |
                                               | (ZPL data via USB)
                                               v
                                        +--------------+
                                        |              |
                                        |  USB Printer |
                                        |              |
                                        +--------------+

```

1.  **Print Opdracht (Web App):** Een operator op een willekeurige tablet (bijv. in de nieuwe "Printer Pagina") zoekt een product en klikt op "Print".
2.  **Verstuur naar Wachtrij:** De web-app genereert de ZPL-code en schrijft deze als een nieuw document met status `pending` naar de `print_queue` collectie in Firestore.
3.  **Lokale Listener (PC):** Op de PC die fysiek met de USB-printer is verbonden, draait een continu Node.js script. Dit script "luistert" naar nieuwe documenten in de `print_queue`.
4.  **Taak Oppakken:** Zodra het script een nieuwe taak ziet, update het de status naar `printing` om te voorkomen dat een andere listener (indien aanwezig) dezelfde taak oppakt.
5.  **Printen via USB:** Het script stuurt de ZPL-data direct naar de aangesloten USB-printer met behulp van `node-usb`. Dit gebeurt volledig buiten de Windows-printerinstellingen om, wat zorgt voor een directe en betrouwbare aansturing.
6.  **Status Afronden:** Na het succesvol versturen van de printopdracht, wordt de status van de taak in Firestore bijgewerkt naar `completed`. Bij een fout wordt de status `error` met een foutmelding.

### Voordelen
-   **Betrouwbaarheid:** Printopdrachten gaan nooit verloren, zelfs niet als de printer-pc tijdelijk offline is. Zodra de pc weer online komt, worden de openstaande taken alsnog geprint.
-   **Schaalbaarheid:** Meerdere stations kunnen printopdrachten naar dezelfde wachtrij sturen.
-   **Flexibiliteit:** Het systeem is niet afhankelijk van IP-adressen. De printer kan via USB aangesloten zijn.
-   **Inzicht:** De "Print Wachtrij" admin-pagina geeft real-time inzicht in de status van alle printopdrachten en de verbonden printer-pc's.

---