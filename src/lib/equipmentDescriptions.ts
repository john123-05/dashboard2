// Display translations for known German equipment description lines.
// Unknown or park-specific lines remain as stored in the database.
const DESCRIPTION_TRANSLATIONS: Record<string, Record<string, string>> = {
  "Nachrüstbares Modul": {
    "de": "Nachrüstbares Modul",
    "en": "Retrofittable module",
    "lv": "Papildus uzstādāms modulis",
    "es": "Módulo reequipable",
    "it": "Modulo aggiornabile",
    "fr": "Module pouvant être installé ultérieurement",
    "nl": "Achteraf aanpasbare module"
  },
  "Wandmontiertes Metallgehäuse (Aluminium/Stahl), IP 54": {
    "de": "Wandmontiertes Metallgehäuse (Aluminium/Stahl), IP 54",
    "en": "Wall-mounted metal housing (aluminium/steel), IP 54",
    "es": "Caja metálica de pared (aluminio/acero), IP 54",
    "lv": "Sienas metāla korpuss (alumīnijs/tērauds), IP 54",
    "nl": "Metalen wandbehuizing (aluminium/staal), IP 54",
    "it": "Custodia metallica per montaggio a parete (alluminio/acciaio), IP 54",
    "fr": "Boîtier métallique mural (aluminium/acier), IP 54"
  },
  "Abschließbare Fronttür": {
    "de": "Abschließbare Fronttür",
    "en": "Lockable front panel",
    "es": "Puerta frontal con cerradura",
    "fr": "Porte avant verrouillable",
    "nl": "Afsluitbare voorzijde",
    "it": "Sportello anteriore con serratura",
    "lv": "Slēdzamas priekšējās durvis"
  },
  "Maße (H × B × T): 50 × 50 × 50 cm": {
    "de": "Maße (H × B × T): 50 × 50 × 50 cm",
    "en": "Dimensions (H × W × D): 50 × 50 × 50 cm",
    "lv": "Izmēri (A × P × D): 50 × 50 × 50 cm",
    "es": "Dimensiones (Alto × Ancho × Fondo): 50 × 50 × 50 cm",
    "fr": "Dimensions (H × L × P) : 50 × 50 × 50 cm",
    "it": "Dimensioni (A × L × P): 50 × 50 × 50 cm",
    "nl": "Afmetingen (H x B x D): 50 x 50 x 50 cm"
  },
  "Oberfläche und Grafik projektspezifisch": {
    "de": "Oberfläche und Grafik projektspezifisch",
    "en": "Finish and graphics customised for the project",
    "es": "Acabado y gráficos adaptados al proyecto",
    "it": "Finitura e grafica personalizzate per il progetto",
    "fr": "Finition et graphisme adaptés au projet",
    "lv": "Virsmas apdare un grafika atbilstoši projektam",
    "nl": "Afwerking en ontwerp op maat van het project"
  },
  "Inklusive Fotodrucker DNP RX1 HS": {
    "de": "Inklusive Fotodrucker DNP RX1 HS",
    "en": "Includes photo printer DNP RX1 HS",
    "fr": "Comprend une imprimante photo DNP RX1 HS",
    "es": "Incluye impresora fotográfica DNP RX1 HS",
    "lv": "Iekļauts fotoprinteris DNP RX1 HS",
    "it": "Include stampante fotografica DNP RX1 HS",
    "nl": "Inclusief fotoprinter DNP RX1 HS"
  },
  "Bildausgabe ca. 300 × 70 mm": {
    "de": "Bildausgabe ca. 300 × 70 mm",
    "en": "Image output approx. 300 × 70 mm",
    "es": "Salida de imagen aprox. 300 × 70 milímetros",
    "fr": "Sortie d'image env. 300 × 70 mm",
    "lv": "Attēla izvade apm. 300 × 70 mm",
    "it": "Uscita immagine ca. 300×70 mm",
    "nl": "Beelduitvoer ca. 300 × 70 mm"
  },
  "Voraussetzung: Dialogbox M oder L, USB-Anschluss": {
    "de": "Voraussetzung: Dialogbox M oder L, USB-Anschluss",
    "en": "Requires Dialogbox M or L and a USB port",
    "es": "Requiere Dialogbox M o L y conexión USB",
    "nl": "Vereist Dialogbox M of L en een USB aansluiting",
    "fr": "Nécessite une Dialogbox M ou L et un port USB",
    "lv": "Nepieciešama Dialogbox M vai L un USB pieslēgvieta",
    "it": "Richiede Dialogbox M o L e porta USB"
  },
  "Maße (H × B × T): 50 × 23 × 23 cm": {
    "de": "Maße (H × B × T): 50 × 23 × 23 cm",
    "en": "Dimensions (H × W × D): 50 × 23 × 23 cm",
    "nl": "Afmetingen (H x B x D): 50 x 23 x 23 cm",
    "fr": "Dimensions (H × L × P) : 50 × 23 × 23 cm",
    "es": "Dimensiones (Al × An × Pr): 50 × 23 × 23 cm",
    "lv": "Izmēri (A × P × D): 50 × 23 × 23 cm",
    "it": "Dimensioni (A × L × P): 50 × 23 × 23 cm"
  },
  "Lackierung und Grafik projektspezifisch": {
    "de": "Lackierung und Grafik projektspezifisch",
    "en": "Paintwork and graphics customised for the project",
    "lv": "Krāsojums un grafika atbilstoši projektam",
    "es": "Pintura y gráficos adaptados al proyecto",
    "nl": "Lakwerk en ontwerp op maat van het project",
    "fr": "Peinture et graphisme adaptés au projet",
    "it": "Verniciatura e grafica personalizzate per il progetto"
  },
  "Inklusive Münzsystem (6 Münzsorten, Europa)": {
    "de": "Inklusive Münzsystem (6 Münzsorten, Europa)",
    "en": "Including coin system (6 types of coins, Europe)",
    "es": "Incluye sistema de monedas (6 tipos de monedas, Europa)",
    "lv": "Ietver monētu sistēmu (6 veidu monētas, Eiropa)",
    "nl": "Inclusief muntsysteem (6 soorten munten, Europa)",
    "fr": "Y compris système de pièces (6 types de pièces, Europe)",
    "it": "Incluso sistema di monete (6 tipi di monete, Europa)"
  },
  "Münzeinwurf ca. 3 × 10 cm, Münzrückgabe ca. 100 × 40 mm, Display ca. 60 × 40 mm": {
    "de": "Münzeinwurf ca. 3 × 10 cm, Münzrückgabe ca. 100 × 40 mm, Display ca. 60 × 40 mm",
    "en": "Coin insertion approx. 3 × 10 cm, coin return approx. 100 × 40 mm, display approx. 60 × 40 mm",
    "es": "Inserción de monedas aprox. 3 × 10 cm, retorno de moneda aprox. 100 × 40 mm, pantalla aprox. 60×40mm",
    "fr": "Insertion de pièces env. 3 × 10 cm, retour des pièces env. 100 × 40 mm, affichage env. 60 × 40 mm",
    "lv": "Monētas ievietošana apm. 3 × 10 cm, monētu atgriešana apm. 100 × 40 mm, displejs apm. 60 × 40 mm",
    "it": "Inserimento monete ca. 3 × 10 cm, restituzione della moneta ca. 100 × 40 mm, display ca. 60×40mm",
    "nl": "Muntinworp ca. 3 x 10 cm, muntinworp ca. 100×40 mm, display ca. 60 × 40 mm"
  },
  "Optional: Scheinprüfer (3 Sorten, Europa), ca. 60 × 60 mm, 1.400 € einmalig": {
    "de": "Optional: Scheinprüfer (3 Sorten, Europa), ca. 60 × 60 mm, 1.400 € einmalig",
    "en": "Optional banknote validator (3 denominations, Europe), approx. 60 × 60 mm, €1,400 once",
    "es": "Validador de billetes opcional (3 denominaciones, Europa), aprox. 60 × 60 mm, 1.400 € pago único",
    "fr": "Validateur de billets en option (3 coupures, Europe), env. 60 × 60 mm, 1 400 € une seule fois",
    "nl": "Optionele biljetlezer (3 coupures, Europa), ca. 60 × 60 mm, eenmalig € 1.400",
    "it": "Lettore di banconote opzionale (3 tagli, Europa), ca. 60 × 60 mm, 1.400 € una tantum",
    "lv": "Papildu banknošu pieņēmējs (3 nominālvērtības, Eiropa), apm. 60 × 60 mm, 1400 € vienreizēji"
  },
  "Dein eigener Foto-Shop im Design deines Parks (Name, Logo, Farben, Schrift)": {
    "de": "Dein eigener Foto-Shop im Design deines Parks (Name, Logo, Farben, Schrift)",
    "en": "Your own photo shop in the design of your park (name, logo, colors, font)",
    "nl": "Uw eigen fotowinkel in het ontwerp van uw park (naam, logo, kleuren, lettertype)",
    "es": "Tu propia tienda de fotografía en el diseño de tu parque (nombre, logo, colores, tipografía)",
    "fr": "Votre propre boutique photo dans le design de votre parc (nom, logo, couleurs, police)",
    "it": "Il tuo negozio fotografico nel design del tuo parco (nome, logo, colori, carattere)",
    "lv": "Jūsu foto veikals jūsu parka dizainā (nosaukums, logotips, krāsas, fonts)"
  },
  "Gäste kaufen ihr Foto auch nach dem Besuch online": {
    "de": "Gäste kaufen ihr Foto auch nach dem Besuch online",
    "en": "Guests also purchase their photo online after their visit",
    "es": "Los invitados también compran su foto en línea después de su visita.",
    "fr": "Les invités achètent également leur photo en ligne après leur visite",
    "lv": "Viesi arī iegādājas fotoattēlu tiešsaistē pēc apmeklējuma",
    "nl": "Gasten kopen na hun bezoek ook online hun foto",
    "it": "Gli ospiti acquistano anche la loro foto online dopo la loro visita"
  },
  "Digitaler Download, Fotoabzug 13×18 und Postkarte": {
    "de": "Digitaler Download, Fotoabzug 13×18 und Postkarte",
    "en": "Digital download, photo print 13×18 and postcard",
    "nl": "Digitale download, fotoprint 13×18 en ansichtkaart",
    "it": "Download digitale, stampa fotografica 13×18 e cartolina",
    "fr": "Téléchargement numérique, tirage photo 13×18 et carte postale",
    "lv": "Digitālā lejupielāde, fotoattēlu izdruka 13×18 un pastkarte",
    "es": "Descarga digital, impresión fotográfica 13×18 y postal."
  },
  "Merchandising: Tasse, T-Shirt und Kühlschrankmagnet mit dem Foto": {
    "de": "Merchandising: Tasse, T-Shirt und Kühlschrankmagnet mit dem Foto",
    "en": "Merchandising: mug, t-shirt and fridge magnet with the photo",
    "it": "Merchandising: tazza, maglietta e calamita da frigo con la foto",
    "fr": "Merchandising : mug, t-shirt et aimant frigo avec photo",
    "lv": "Tirdzniecība: krūze, t-krekls un ledusskapja magnēts ar fotoattēlu",
    "es": "Merchandising: taza, camiseta e imán de nevera con la foto",
    "nl": "Merchandising: mok, t-shirt en koelkastmagneet met de foto"
  },
  "Tagespass: alle Fotos des Tages als Download": {
    "de": "Tagespass: alle Fotos des Tages als Download",
    "en": "Day pass: all photos of the day as a download",
    "it": "Biglietto giornaliero: tutte le foto della giornata da scaricare",
    "es": "Pase de día: todas las fotos del día para descargar.",
    "fr": "Pass journée : toutes les photos de la journée en téléchargement",
    "nl": "Dagpas: alle foto's van de dag als download",
    "lv": "Dienas biļete: visas dienas fotogrāfijas kā lejupielāde"
  },
  "Unverkaufte Fotos erneut zum Kauf anbieten": {
    "de": "Unverkaufte Fotos erneut zum Kauf anbieten",
    "en": "Offer unsold photos for sale again",
    "es": "Ofrecer nuevamente a la venta fotos no vendidas",
    "nl": "Onverkochte foto's opnieuw te koop aanbieden",
    "fr": "Proposer à nouveau des photos invendues à la vente",
    "it": "Metti di nuovo in vendita le foto invendute",
    "lv": "Atkal piedāvājiet pārdošanai nepārdotās fotogrāfijas"
  },
  "Zahlung über Stripe, Verkäufe und Umsatz live im Dashboard": {
    "de": "Zahlung über Stripe, Verkäufe und Umsatz live im Dashboard",
    "en": "Payment via Stripe, sales and revenue live in the dashboard",
    "es": "Pago a través de Stripe, ventas e ingresos en vivo en el panel",
    "lv": "Maksājums, izmantojot Stripe, pārdošanas apjomi un ieņēmumi tiek rādīti informācijas panelī",
    "fr": "Paiement via Stripe, ventes et revenus en direct dans le tableau de bord",
    "it": "Pagamento tramite Stripe, vendite e ricavi in ​​diretta nella dashboard",
    "nl": "Betaling via Stripe, verkoop en omzet live in het dashboard"
  },
  "Hosting, Service und Wartung inklusive": {
    "de": "Hosting, Service und Wartung inklusive",
    "en": "Hosting, service and maintenance included",
    "es": "Alojamiento, servicio y mantenimiento incluidos.",
    "it": "Hosting, assistenza e manutenzione inclusi",
    "fr": "Hébergement, service et maintenance inclus",
    "lv": "Iekļauts hostings, serviss un apkope",
    "nl": "Hosting, service en onderhoud inbegrepen"
  },
  "Voraussetzung für PrintBox und Cashbox": {
    "de": "Voraussetzung für PrintBox und Cashbox",
    "en": "Requirement for PrintBox and Cashbox",
    "fr": "Exigence pour PrintBox et Cashbox",
    "lv": "Prasības PrintBox un Cashbox",
    "es": "Requisito para PrintBox y Cashbox",
    "nl": "Vereiste voor PrintBox en Cashbox",
    "it": "Requisiti per PrintBox e Cashbox"
  },
  "Optional Full-Service: Druck und Versand übernehmen wir": {
    "de": "Optional Full-Service: Druck und Versand übernehmen wir",
    "en": "Optional full service: We take care of printing and shipping",
    "lv": "Pilns serviss pēc izvēles: mēs rūpējamies par drukāšanu un nosūtīšanu",
    "es": "Servicio completo opcional: Nosotros nos encargamos de la impresión y el envío.",
    "fr": "Service complet en option : Nous nous chargeons de l'impression et de l'expédition",
    "it": "Servizio completo opzionale: ci occupiamo della stampa e della spedizione",
    "nl": "Optioneel full service: Wij verzorgen het drukwerk en de verzending"
  },
  "Geschwindigkeits-Hardware an der Bahn, kostenlos von uns geliefert": {
    "de": "Geschwindigkeits-Hardware an der Bahn, kostenlos von uns geliefert",
    "en": "Speed ​​hardware on the track, delivered free of charge by us",
    "es": "Hardware de velocidad en la pista, entregado gratuitamente por nosotros",
    "fr": "Matériel de vitesse sur piste, livré gratuitement par nos soins",
    "it": "Hardware di velocità in pista, consegnato gratuitamente da noi",
    "nl": "Snelheidshardware op de baan, gratis door ons geleverd",
    "lv": "Ātruma aparatūra trasē, ko mēs piegādājam bez maksas"
  },
  "Geschwindigkeit direkt auf dem Foto": {
    "de": "Geschwindigkeit direkt auf dem Foto",
    "en": "Speed ​​directly in the photo",
    "nl": "Snelheid direct op de foto",
    "es": "Velocidad directamente en la foto.",
    "it": "La velocità direttamente nella foto",
    "lv": "Ātrums tieši fotoattēlā",
    "fr": "Vitesse directement sur la photo"
  },
  "Tagesschnellster, Langsamster und Durchschnitt live im Dashboard": {
    "de": "Tagesschnellster, Langsamster und Durchschnitt live im Dashboard",
    "en": "Today’s fastest, slowest and average speeds live in the dashboard",
    "lv": "Šodienas lielākais, mazākais un vidējais ātrums tiešsaistē informācijas panelī",
    "es": "Velocidades máxima, mínima y media del día en tiempo real en el panel",
    "fr": "Vitesse maximale, minimale et moyenne du jour en direct dans le tableau de bord",
    "nl": "Snelste, langzaamste en gemiddelde snelheid van vandaag live in het dashboard",
    "it": "Velocità massima, minima e media di oggi in tempo reale nella dashboard"
  },
  "Tagesbestenliste im Design deines Parks": {
    "de": "Tagesbestenliste im Design deines Parks",
    "en": "Daily leaderboard in the design of your park",
    "es": "Tabla de clasificación diaria en el diseño de tu parque.",
    "fr": "Classement quotidien dans la conception de votre parc",
    "nl": "Dagelijks klassement in het ontwerp van uw park",
    "it": "Classifica giornaliera nella progettazione del tuo parco",
    "lv": "Ikdienas līderu saraksts jūsu parka dizainā"
  },
  "Gäste legen Profilbild und Nutzername an und messen sich mit anderen": {
    "de": "Gäste legen Profilbild und Nutzername an und messen sich mit anderen",
    "en": "Guests create a profile picture and username and compete with others",
    "es": "Los invitados crean una imagen de perfil y un nombre de usuario y compiten con otros.",
    "fr": "Les invités créent une photo de profil et un nom d'utilisateur et rivalisent avec les autres",
    "lv": "Viesi izveido profila attēlu un lietotājvārdu un sacenšas ar citiem",
    "it": "Gli ospiti creano un'immagine del profilo e un nome utente e competono con gli altri",
    "nl": "Gasten maken een profielfoto en gebruikersnaam aan en concurreren met anderen"
  },
  "Gäste tragen sich per Foto-Code ein, kein Passwort nötig": {
    "de": "Gäste tragen sich per Foto-Code ein, kein Passwort nötig",
    "en": "Guests register using a photo code, no password required",
    "es": "Los invitados se registran usando un código de foto, no se requiere contraseña",
    "fr": "Les invités s'inscrivent à l'aide d'un code photo, aucun mot de passe requis",
    "lv": "Viesi reģistrējas, izmantojot foto kodu, parole nav nepieciešama",
    "it": "Gli ospiti si registrano utilizzando un codice foto, non è richiesta alcuna password",
    "nl": "Gasten registreren zich met een fotocode, geen wachtwoord vereist"
  },
  "Nur freigeschaltete, gekaufte Fotos erscheinen in der Liste": {
    "de": "Nur freigeschaltete, gekaufte Fotos erscheinen in der Liste",
    "en": "Only unlocked, purchased photos appear in the list",
    "es": "En la lista solo aparecen fotos desbloqueadas y compradas.",
    "lv": "Sarakstā tiek parādīti tikai atbloķēti, iegādāti fotoattēli",
    "it": "Nell'elenco vengono visualizzate solo le foto acquistate e sbloccate",
    "fr": "Seules les photos déverrouillées et achetées apparaissent dans la liste",
    "nl": "Alleen ontgrendelde, gekochte foto's verschijnen in de lijst"
  },
  "Gäste teilen ihre Platzierung auf Social Media": {
    "de": "Gäste teilen ihre Platzierung auf Social Media",
    "en": "Guests share their leaderboard position on social media",
    "fr": "Les visiteurs partagent leur place au classement sur les réseaux sociaux",
    "lv": "Viesi sociālajos tīklos dalās ar savu vietu līderu sarakstā",
    "it": "Gli ospiti condividono la loro posizione in classifica sui social media",
    "nl": "Gasten delen hun plek op de ranglijst via sociale media",
    "es": "Los visitantes comparten su posición en la clasificación en redes sociales"
  },
  "Optional großes Display an der Bahn": {
    "de": "Optional großes Display an der Bahn",
    "en": "Optional large display beside the ride",
    "it": "Grande display opzionale accanto alla pista",
    "nl": "Optioneel groot scherm naast de baan",
    "lv": "Papildu liels displejs pie trases",
    "es": "Pantalla grande opcional junto a la pista",
    "fr": "Grand écran en option près de la piste"
  },
  "Einrichtung, Support, Hosting, Datenbank und Wartung durch uns": {
    "de": "Einrichtung, Support, Hosting, Datenbank und Wartung durch uns",
    "en": "Setup, support, hosting, database and maintenance by us",
    "es": "Configuración, soporte, hosting, base de datos y mantenimiento por nuestra parte",
    "lv": "Mēs veicam iestatīšanu, atbalstu, mitināšanu, datu bāzi un apkalpošanu",
    "it": "Configurazione, supporto, hosting, database e manutenzione da parte nostra",
    "fr": "Installation, support, hébergement, base de données et maintenance par nos soins",
    "nl": "Installatie, support, hosting, database en onderhoud door ons"
  },
  "Großes Display direkt an der Bahn": {
    "de": "Großes Display direkt an der Bahn",
    "en": "Large display directly beside the ride",
    "es": "Pantalla grande directamente junto a la pista",
    "nl": "Groot scherm direct naast de baan",
    "fr": "Grand écran directement près de la piste",
    "it": "Grande display direttamente accanto alla pista",
    "lv": "Liels displejs tieši pie trases"
  },
  "Zeigt Zeit und Geschwindigkeit jeder Fahrt für alle Gäste": {
    "de": "Zeigt Zeit und Geschwindigkeit jeder Fahrt für alle Gäste",
    "en": "Shows time and speed of each ride for all guests",
    "es": "Muestra el tiempo y la velocidad de cada viaje para todos los invitados.",
    "lv": "Rāda katra brauciena laiku un ātrumu visiem viesiem",
    "fr": "Affiche l'heure et la vitesse de chaque trajet pour tous les invités",
    "nl": "Toont de tijd en snelheid van elke rit voor alle gasten",
    "it": "Mostra il tempo e la velocità di ogni corsa per tutti gli ospiti"
  },
  "Der Tagesbeste ist sofort zu sehen und motiviert zum nächsten Versuch": {
    "de": "Der Tagesbeste ist sofort zu sehen und motiviert zum nächsten Versuch",
    "en": "The day’s top performer is immediately visible and inspires another try",
    "es": "El mejor resultado del día se ve al instante y anima a intentarlo de nuevo",
    "it": "Il miglior risultato del giorno è subito visibile e invoglia a riprovare",
    "lv": "Dienas labākais rezultāts ir redzams uzreiz un mudina mēģināt vēlreiz",
    "fr": "Le meilleur score du jour s’affiche aussitôt et donne envie de réessayer",
    "nl": "De beste score van de dag is meteen zichtbaar en nodigt uit tot een nieuwe poging"
  },
  "Geschwindigkeit steht zusätzlich direkt auf dem Foto": {
    "de": "Geschwindigkeit steht zusätzlich direkt auf dem Foto",
    "en": "Speed ​​is also directly on the photo",
    "es": "La velocidad también está directamente en la foto.",
    "fr": "La vitesse est aussi directement sur la photo",
    "nl": "Snelheid staat ook direct op de foto",
    "lv": "Ātrums ir arī tieši uz fotoattēla",
    "it": "Anche la velocità è direttamente sulla foto"
  },
  "Keine Einmalkosten für das Display": {
    "de": "Keine Einmalkosten für das Display",
    "en": "No one-off costs for the display",
    "es": "Sin costes únicos para la pantalla",
    "nl": "Geen eenmalige kosten voor de display",
    "lv": "Nav vienreizēju izmaksu par displeju",
    "it": "Nessun costo una tantum per l'esposizione",
    "fr": "Pas de frais uniques pour l'affichage"
  },
  "Ab dem 2. Jahr im Preis inklusive": {
    "de": "Ab dem 2. Jahr im Preis inklusive",
    "en": "Included in the price from the 2nd year",
    "es": "Incluido en el precio a partir del 2º año.",
    "it": "Incluso nel prezzo dal 2° anno",
    "lv": "Iekļauts cenā no 2. gada",
    "fr": "Inclus dans le prix à partir de la 2ème année",
    "nl": "Inbegrepen in de prijs vanaf het 2e jaar"
  },
  "Benötigt die Speedmessung": {
    "de": "Benötigt die Speedmessung",
    "en": "Requires speed measurement",
    "es": "Requiere medición de velocidad",
    "it": "Richiede la misurazione della velocità",
    "fr": "Nécessite une mesure de la vitesse",
    "nl": "Vereist snelheidsmeting",
    "lv": "Nepieciešama ātruma mērīšana"
  },
  "Einrichtung, Support und Wartung durch uns": {
    "de": "Einrichtung, Support und Wartung durch uns",
    "en": "Setup, support and maintenance by us",
    "nl": "Installatie, ondersteuning en onderhoud door ons",
    "es": "Configuración, soporte y mantenimiento por nuestra parte",
    "it": "Configurazione, supporto e manutenzione da parte nostra",
    "fr": "Installation, support et maintenance par nos soins",
    "lv": "Mēs veicam iestatīšanu, atbalstu un apkopi"
  },
  "QR-Code auf gedruckten Fotos zum Freischalten": {
    "de": "QR-Code auf gedruckten Fotos zum Freischalten",
    "en": "QR code on printed photos to unlock",
    "es": "Código QR en fotografías impresas para desbloquear",
    "lv": "QR kods uz izdrukātajiem fotoattēliem, lai to atbloķētu",
    "fr": "Code QR sur les photos imprimées pour déverrouiller",
    "it": "Codice QR sulle foto stampate per sbloccare",
    "nl": "QR-code op afgedrukte foto's om te ontgrendelen"
  },
  "Hosting der Bilder online für deine Gäste": {
    "de": "Hosting der Bilder online für deine Gäste",
    "en": "Hosting the images online for your guests",
    "it": "Hosting delle immagini online per i tuoi ospiti",
    "es": "Alojar las imágenes en línea para sus invitados",
    "fr": "Hébergement des images en ligne pour vos invités",
    "nl": "Het online hosten van de afbeeldingen voor uw gasten",
    "lv": "Attēlu mitināšana tiešsaistē saviem viesiem"
  },
  "Gäste bekommen die digitale Version ihres Fotos": {
    "de": "Gäste bekommen die digitale Version ihres Fotos",
    "en": "Guests receive the digital version of their photo",
    "es": "Los invitados reciben la versión digital de su foto.",
    "fr": "Les invités reçoivent la version numérique de leur photo",
    "nl": "Gasten ontvangen de digitale versie van hun foto",
    "it": "Gli ospiti ricevono la versione digitale della loro foto",
    "lv": "Viesi saņem sava fotoattēla digitālo versiju"
  },
  "E-Mail-Adressen und Kontakte deiner Gäste sammeln, Liste und Export": {
    "de": "E-Mail-Adressen und Kontakte deiner Gäste sammeln, Liste und Export",
    "en": "Collect email addresses and contacts of your guests, list and export",
    "es": "Recopile direcciones de correo electrónico y contactos de sus invitados, enumere y exporte",
    "lv": "Viesu e-pasta adrešu un kontaktinformācijas vākšana, saraksts un eksports",
    "fr": "Collectez les adresses e-mail et les contacts de vos invités, répertoriez et exportez",
    "it": "Raccogli indirizzi email e contatti dei tuoi ospiti, elencali ed esportali",
    "nl": "Verzamel e-mailadressen en contacten van uw gasten, maak een lijst en exporteer"
  },
  "Freischalt-Weg wählen: E-Mail, Umfrage oder Social Media": {
    "de": "Freischalt-Weg wählen: E-Mail, Umfrage oder Social Media",
    "en": "Choose activation method: email, survey or social media",
    "es": "Elija el método de activación: correo electrónico, encuesta o redes sociales",
    "lv": "Atbloķēšanas veida izvēle: e-pasts, aptauja vai sociālie mediji",
    "fr": "Choisissez la méthode d'activation : e-mail, sondage ou réseaux sociaux",
    "nl": "Kies de activatiemethode: e-mail, enquête of sociale media",
    "it": "Scegli il metodo di attivazione: email, sondaggio o social media"
  },
  "Umfrage mit Bewertung und Weiterempfehlung (NPS)": {
    "de": "Umfrage mit Bewertung und Weiterempfehlung (NPS)",
    "en": "Survey with rating and recommendation (NPS)",
    "it": "Sondaggio con rating e raccomandazione (NPS)",
    "es": "Encuesta con calificación y recomendación (NPS)",
    "fr": "Enquête avec note et recommandation (NPS)",
    "nl": "Enquête met beoordeling en aanbeveling (NPS)",
    "lv": "Aptauja ar vērtējumu un ieteikumu (NPS)"
  },
  "Social-Media-Aktion installieren": {
    "de": "Social-Media-Aktion installieren",
    "en": "Install social media campaign",
    "lv": "Sociālo mediju kampaņas ierīkošana",
    "it": "Installa una campagna sui social media",
    "es": "Instalar campaña en redes sociales",
    "fr": "Installer une campagne sur les réseaux sociaux",
    "nl": "Social media campagne opzetten"
  },
  "Werbe-Pixel installieren (Meta und Google)": {
    "de": "Werbe-Pixel installieren (Meta und Google)",
    "en": "Install advertising pixels (Meta and Google)",
    "fr": "Installer des pixels publicitaires (Meta et Google)",
    "es": "Instalar píxeles publicitarios (Meta y Google)",
    "nl": "Advertentiepixels installeren (Meta en Google)",
    "it": "Installare pixel pubblicitari (Meta e Google)",
    "lv": "Reklāmas pikseļu instalēšana (Meta un Google)"
  },
  "Besucher nach Standort und Sprache auf der Weltkarte": {
    "de": "Besucher nach Standort und Sprache auf der Weltkarte",
    "en": "Visitors by location and language on the world map",
    "es": "Visitantes por ubicación e idioma en el mapa mundial",
    "it": "Visitatori per posizione e lingua sulla mappa del mondo",
    "lv": "Apmeklētāji pēc atrašanās vietas un valodas pasaules kartē",
    "fr": "Visiteurs par lieu et langue sur la carte du monde",
    "nl": "Bezoekers per locatie en taal op de wereldkaart"
  },
  "Verwaltung aller Gästedaten im Dashboard": {
    "de": "Verwaltung aller Gästedaten im Dashboard",
    "en": "Management of all guest data in the dashboard",
    "es": "Gestión de todos los datos de los huéspedes en el panel de control.",
    "it": "Gestione di tutti i dati degli ospiti nella dashboard",
    "fr": "Gestion de toutes les données clients dans le tableau de bord",
    "nl": "Beheer van alle gastgegevens in het dashboard",
    "lv": "Visu viesu datu pārvaldība informācijas panelī"
  },
  "Verwaltete Datenbank, Wartung und Updates durch uns": {
    "de": "Verwaltete Datenbank, Wartung und Updates durch uns",
    "en": "Managed database, maintenance and updates by us",
    "fr": "Base de données gérée, maintenance et mises à jour par nos soins",
    "es": "Base de datos administrada, mantenimiento y actualizaciones por nuestra parte.",
    "nl": "Beheerde database, onderhoud en updates door ons",
    "lv": "Mūsu pārvaldītā datubāze, apkope un atjauninājumi",
    "it": "Database gestito, manutenzione e aggiornamenti da noi"
  }
};

export function equipmentDescription(text: string | null, language: string): string {
  if (!text) return '';
  return text.split('\n').map((line) => {
    const trimmed = line.trim();
    return DESCRIPTION_TRANSLATIONS[trimmed]?.[language] ?? trimmed;
  }).join('\n');
}
