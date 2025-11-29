// Main logic for the Sac v2 checklist application. This version extends the
// original project to support quantity calculations based on trip duration
// (duree) and a new `days_dependent` flag on each equipment item. Items marked
// as `days_dependent: true` will be multiplied by the number of days in the
// trip. The file also normalises the `meteo` property to ensure it is always
// an array of strings.

let materiel = [];

// Configuration des destinations prédéfinies. Chaque destination définit
// l'activité, la météo attendue, le niveau d'autonomie et le niveau technique.
const destinations = {
  gr20: {
    label: "GR20 autonomie",
    activite: "Trek",
    meteo: "Froid",
    autonomie: true,
    techLevel: 2
  },
  compostelle: {
    label: "Compostelle",
    activite: "Randonnée",
    meteo: "Tempéré",
    autonomie: false,
    techLevel: 1
  },
  thailande: {
    label: "Thaïlande",
    activite: "Tropical",
    meteo: "Chaud",
    autonomie: false,
    techLevel: 1
  },
  alpes: {
    label: "Alpes (rando)",
    activite: "Randonnée",
    meteo: "Froid",
    autonomie: false,
    techLevel: 2
  },
  alpinisme: {
    label: "Chamonix (alpinisme)",
    activite: "Alpinisme",
    meteo: "Froid",
    autonomie: false,
    techLevel: 3
  },
  ski: {
    label: "Ski de rando",
    activite: "Ski rando",
    meteo: "Neige",
    autonomie: false,
    techLevel: 3
  }
};

// Charge les données du fichier JSON et initialise l'interface une fois le DOM prêt.
document.addEventListener("DOMContentLoaded", async () => {
  await chargerMateriel();
  initialiserUI();
});

/* -------------------------------
   Chargement du JSON matériel
-------------------------------- */
async function chargerMateriel() {
  try {
    const res = await fetch("materiel_enriched.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    materiel = data.map(normaliserItem);
    console.log("Matériel chargé :", materiel.length, "items");
  } catch (e) {
    console.error("Erreur chargement materiel_enriched.json", e);
    materiel = [];
  }
}

// Normalise un champ qui peut être soit une chaîne, soit une liste, soit vide.
function normaliserListeBrute(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.map((v) => `${v ?? ""}`.trim()).filter(Boolean);
  }
  if (typeof valeur === "string") {
    const texte = valeur.trim();
    if (!texte) return [];
    if (texte.startsWith("[") && texte.endsWith("]")) {
      try {
        const parsed = JSON.parse(texte.replace(/'/g, '"'));
        return normaliserListeBrute(parsed);
      } catch (err) {
        return texte
          .slice(1, -1)
          .split(",")
          .map((p) => p.replace(/['"]+/g, "").trim())
          .filter(Boolean);
      }
    }
    return texte
      .split(",")
      .map((p) => p.replace(/['"]+/g, "").trim())
      .filter(Boolean);
  }
  if (valeur === null || valeur === undefined) return [];
  return [`${valeur}`.trim()].filter(Boolean);
}

// Transforme un item brut en objet normalisé. En plus de normaliser les listes
// `packs`, `activities` et `meteo`, cette fonction ajoute un booléen
// `days_dependent` qui indique si l'objet doit être multiplié par la durée du voyage.
function normaliserItem(itemBrut) {
  const item = { ...itemBrut };
  item.packs = normaliserListeBrute(item.packs);
  item.activities = normaliserListeBrute(item.activities);
  item.meteo = normaliserListeBrute(item.meteo);
  item.days_dependent = Boolean(itemBrut.days_dependent);
  return item;
}

/* -------------------------------
   Initialisation de l'interface
-------------------------------- */
function initialiserUI() {
  const destinationSelect = document.getElementById("destination");
  const activiteSelect = document.getElementById("activite");
  const meteoSelect = document.getElementById("meteo");
  const autonomieSelect = document.getElementById("autonomie");
  const techLevelSelect = document.getElementById("techLevel");
  const dureeInput = document.getElementById("duree");
  const adresseInput = document.getElementById("adresse");
  const moisSelect = document.getElementById("mois");
  const btnGenerate = document.getElementById("btnGenerate");
  const btnFromAddress = document.getElementById("btnFromAddress");
  const btnReset = document.getElementById("btnReset");
  const btnExportPdf = document.getElementById("btnExportPdf");
  const themeToggle = document.getElementById("themeToggle");

  // Destination → auto-remplissage des autres champs lorsque l'utilisateur sélectionne une destination.
  destinationSelect.addEventListener("change", () => {
    const val = destinationSelect.value;
    if (val && destinations[val]) {
      const d = destinations[val];
      if (!activiteSelect.value) activiteSelect.value = d.activite || "";
      if (!meteoSelect.value) meteoSelect.value = d.meteo || "";
      if (!autonomieSelect.value)
        autonomieSelect.value = d.autonomie ? "oui" : "non";
      techLevelSelect.value = String(d.techLevel || 1);
    }
  });

  // Générer sac à partir des paramètres saisis manuellement.
  btnGenerate.addEventListener("click", () => {
    const criteres = lireCriteres(false);
    genererChecklist(criteres);
  });

  // Adresse + mois → météo auto → sac
  btnFromAddress.addEventListener("click", async () => {
    const criteres = await lireCriteresAvecMeteoAuto();
    if (criteres) genererChecklist(criteres);
  });

  // Reset
  btnReset.addEventListener("click", () => {
    destinationSelect.value = "";
    activiteSelect.value = "";
    meteoSelect.value = "";
    autonomieSelect.value = "";
    techLevelSelect.value = "1";
    dureeInput.value = "7";
    adresseInput.value = "";
    moisSelect.value = "";
    miseAJourChecklist([]);
    miseAJourResume(null);
  });

  // Export PDF
  btnExportPdf.addEventListener("click", exporterPdf);

  // Mode clair/sombre
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });
}

/* -------------------------------
   Lecture des critères (manuel)
-------------------------------- */
function lireCriteres(includeMeteoAutoInfo) {
  const destinationSelect = document.getElementById("destination");
  const activiteSelect = document.getElementById("activite");
  const meteoSelect = document.getElementById("meteo");
  const autonomieSelect = document.getElementById("autonomie");
  const techLevelSelect = document.getElementById("techLevel");
  const dureeInput = document.getElementById("duree");
  const moisSelect = document.getElementById("mois");
  return {
    destination: destinationSelect.value || null,
    activite: activiteSelect.value || null,
    meteo: meteoSelect.value || null,
    autonomie:
      autonomieSelect.value === ""
        ? null
        : autonomieSelect.value === "oui",
    techLevel: parseInt(techLevelSelect.value, 10) || 1,
    duree: parseInt(dureeInput.value, 10) || 1,
    mois: moisSelect.value ? parseInt(moisSelect.value, 10) : null,
    meteoAutoLabel: includeMeteoAutoInfo ? "" : null,
    lieu: null
  };
}

/* -------------------------------
   Lecture critères + météo auto
-------------------------------- */
async function lireCriteresAvecMeteoAuto() {
  const adresseInput = document.getElementById("adresse");
  const moisSelect = document.getElementById("mois");
  const activiteSelect = document.getElementById("activite");
  const meteoSelect = document.getElementById("meteo");
  const autonomieSelect = document.getElementById("autonomie");
  const techLevelSelect = document.getElementById("techLevel");
  const dureeInput = document.getElementById("duree");
  const adresse = (adresseInput.value || "").trim();
  const moisVal = moisSelect.value;
  if (!adresse || !moisVal) {
    alert("Merci de saisir une adresse ET un mois.");
    return null;
  }
  try {
    miseAJourResume({ infoOnly: true, texte: "Analyse météo en cours..." }, []);
    const mInt = parseInt(moisVal, 10);
    const loc = await geocoderAdresse(adresse);
    if (!loc) {
      alert("Adresse introuvable.");
      miseAJourResume(null, []);
      return null;
    }
    const meteoInfo = await analyserMeteoPourMois(loc.lat, loc.lon, mInt);
    // Si l'utilisateur n'a pas forcé la météo, on utilise celle dérivée
    if (!meteoSelect.value && meteoInfo.meteoCategorie) {
      meteoSelect.value = meteoInfo.meteoCategorie;
    }
    if (meteoInfo.neigeProbable) {
      meteoSelect.value = "Neige";
    } else if (meteoInfo.pluieImportante) {
      meteoSelect.value = "Pluie";
    }
    // Activité : si rien, Randonnée par défaut
    if (!activiteSelect.value) {
      activiteSelect.value = "Randonnée";
    }
    const critAutonomie =
      autonomieSelect.value === ""
        ? null
        : autonomieSelect.value === "oui";
    return {
      destination: null,
      activite: activiteSelect.value || null,
      meteo: meteoSelect.value || null,
      autonomie: critAutonomie,
      techLevel: parseInt(techLevelSelect.value, 10) || 1,
      duree: parseInt(dureeInput.value, 10) || 1,
      mois: mInt,
      lieu: loc.displayName,
      meteoAutoLabel: meteoInfo.label
    };
  } catch (e) {
    console.error(e);
    alert("Erreur lors de l'analyse météo.");
    miseAJourResume(null, []);
    return null;
  }
}

/* -------------------------------
   Géocodage via Nominatim
-------------------------------- */
async function geocoderAdresse(adresse) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(adresse);
  const res = await fetch(url, {
    headers: {
      "Accept-Language": "fr",
      "User-Agent": "sac-v2-app"
    }
  });
  if (!res.ok) throw new Error("Erreur Nominatim " + res.status);
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name
  };
}

/* -------------------------------
   Météo moyenne d'un mois
-------------------------------- */
function getStartEndForMonth(year, monthInt) {
  const lastDayPerMonth = {
    1: 31,
    2: 28,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31
  };
  const mm = String(monthInt).padStart(2, "0");
  const last = lastDayPerMonth[monthInt] || 30;
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, "0")}`
  };
}

async function analyserMeteoPourMois(lat, lon, monthInt) {
  const year = new Date().getFullYear() - 1;
  const { start, end } = getStartEndForMonth(year, monthInt);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_mean,precipitation_sum,snowfall_sum&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Erreur Open-Meteo " + res.status);
  const data = await res.json();
  if (!data || !data.daily || !data.daily.time || !data.daily.time.length) {
    throw new Error("Données météo indisponibles.");
  }
  const temps = data.daily.temperature_2m_mean || [];
  const precip = data.daily.precipitation_sum || [];
  const neige = data.daily.snowfall_sum || [];
  const n = data.daily.time.length;
  let sumT = 0,
    sumP = 0,
    sumS = 0;
  for (let i = 0; i < n; i++) {
    if (typeof temps[i] === "number") sumT += temps[i];
    if (typeof precip[i] === "number") sumP += precip[i];
    if (typeof neige[i] === "number") sumS += neige[i];
  }
  const tMoy = sumT / n;
  const pMoy = sumP / n;
  const sTot = sumS;
  let meteoCat = "Tempéré";
  if (tMoy >= 22) meteoCat = "Chaud";
  else if (tMoy <= 10) meteoCat = "Froid";
  const pluieImportante = pMoy >= 3;
  const neigeProbable = sTot > 0.4;
  let labelParts = [];
  labelParts.push(`T° moy. ≈ ${tMoy.toFixed(1)}°C`);
  if (pluieImportante) labelParts.push("pluvieux");
  if (neigeProbable) labelParts.push("neige possible");
  return {
    meteoCategorie: meteoCat,
    pluieImportante,
    neigeProbable,
    label: labelParts.join(", ")
  };
}

/* -------------------------------
   Filtrage intelligent et calcul de quantité
-------------------------------- */
function genererChecklist(criteres) {
  let resultat = materiel.filter((item) => {
    const acts = (item.activities || []).map((a) => (a || "").toLowerCase());
    const cat = (item.category || "").toLowerCase();
    const fam = (item.family || "").toLowerCase();
    const packs = normaliserListeBrute(item.packs).map((p) => p.toLowerCase());
    // ACTIVITÉ
    if (criteres.activite) {
      const crit = criteres.activite.toLowerCase();
      const matchActivite = acts.includes(crit) || cat.includes(crit);
      const hasDeclaredActivity = acts.length > 0;
      if (!matchActivite) {
        // Items génériques (lampe, Nalgene, etc.) gardés même si activité différente
        const genericFamilies = [
          "électronique",
          "cuisine / hydratation",
          "soin / hygiène / divers",
          "sacs / organisation",
          "accessoires tête/mains/pieds",
          "couchage"
        ];
        const isGeneric = genericFamilies.some((g) => fam.includes(g));
        if (hasDeclaredActivity || !isGeneric) return false;
      }
    }
    // EXCLUSION SKI / NEIGE quand activité = Randonnée
    if (
      criteres.activite &&
      criteres.activite.toLowerCase() === "randonnée"
    ) {
      const nom = `${item.model || ""} ${item.details || ""}`.toLowerCase();
      const hasSkiActivity = acts.includes("ski rando");
      const skiKeywords = [
        "ski",
        "backland",
        "maestrale",
        "dva",
        "arva",
        "pelle avalanche",
        "sonde avalanche",
        "peaux",
        "couteaux de ski"
      ];
      if (
        hasSkiActivity ||
        skiKeywords.some((k) => nom.includes(k))
      ) {
        return false;
      }
    }
    // METEO
    if (criteres.meteo && item.meteo && item.meteo.length > 0) {
      if (!item.meteo.includes(criteres.meteo)) {
        return false;
      }
    }
    // AUTONOMIE : si non, on exclut les items purement autonomie
    if (
      criteres.autonomie === false &&
      (item.autonomy || packs.includes("autonomie"))
    ) {
      return false;
    }
    // NIVEAU TECH
    const tech = item.tech_level || 1;
    if (tech > criteres.techLevel) return false;
    return true;
  });
  // Calcule la quantité pour chaque item en fonction de la durée et du flag days_dependent.
  resultat = resultat.map((item) => {
    const qty = item.days_dependent ? criteres.duree : 1;
    return { ...item, quantity: qty };
  });
  miseAJourChecklist(resultat);
  miseAJourResume(criteres, resultat);
}

/* -------------------------------
   Affichage checklist avec quantités
-------------------------------- */
function miseAJourChecklist(liste) {
  const tbody = document.querySelector("#checklistTable tbody");
  tbody.innerHTML = "";
  let totalPoids = 0;
  let totalItems = 0;
  liste.forEach((e) => {
    const tr = document.createElement("tr");
    const activites = normaliserListeBrute(e.activities);
    const packs = normaliserListeBrute(e.packs);
    // Case à cocher
    const tdCheck = document.createElement("td");
    tdCheck.className = "checkbox-cell";
    const box = document.createElement("div");
    box.className = "checkbox";
    box.addEventListener("click", () => {
      box.classList.toggle("checked");
      box.textContent = box.classList.contains("checked") ? "✓" : "";
    });
    tdCheck.appendChild(box);
    const tdCat = document.createElement("td");
    tdCat.textContent = e.category || "";
    const tdName = document.createElement("td");
    tdName.textContent = (e.brand ? e.brand + " " : "") + (e.model || "");
    const tdDetails = document.createElement("td");
    tdDetails.textContent = e.details || "";
    const tdAct = document.createElement("td");
    tdAct.textContent = activites.join(", ");
    const tdPacks = document.createElement("td");
    tdPacks.textContent = packs.join(", ");
    // Quantité
    const tdQty = document.createElement("td");
    const quantity = e.quantity || 1;
    tdQty.textContent = String(quantity);
    totalItems += quantity;
    const tdWeight = document.createElement("td");
    if (e.weight_g) {
      tdWeight.textContent = (e.weight_g * quantity).toString();
      totalPoids += e.weight_g * quantity;
    } else {
      tdWeight.textContent = "";
    }
    tr.appendChild(tdCheck);
    tr.appendChild(tdCat);
    tr.appendChild(tdName);
    tr.appendChild(tdDetails);
    tr.appendChild(tdAct);
    tr.appendChild(tdPacks);
    tr.appendChild(tdQty);
    tr.appendChild(tdWeight);
    tbody.appendChild(tr);
  });
  document.getElementById("totalWeight").textContent = totalPoids + " g";
  document.getElementById("totalItems").textContent = totalItems.toString();
}

/* -------------------------------
   Résumé en haut à droite
-------------------------------- */
function miseAJourResume(criteres, liste = []) {
  const el = document.getElementById("summaryText");
  if (!criteres || criteres.infoOnly) {
    el.textContent = criteres && criteres.texte ? criteres.texte : "Aucun filtre appliqué.";
    return;
  }
  const parts = [];
  if (criteres.lieu) parts.push("Lieu : " + criteres.lieu);
  if (criteres.destination && destinations[criteres.destination]) {
    parts.push(destinations[criteres.destination].label);
  }
  if (criteres.activite) parts.push("Activité : " + criteres.activite);
  if (criteres.meteo) parts.push("Météo : " + criteres.meteo);
  if (criteres.mois) parts.push("Mois : " + String(criteres.mois).padStart(2, "0"));
  if (criteres.autonomie !== null) parts.push("Autonomie : " + (criteres.autonomie ? "oui" : "non"));
  parts.push("Niv. tech ≤ " + criteres.techLevel);
  parts.push("Durée : " + criteres.duree + " j");
  if (criteres.meteoAutoLabel) parts.push("Climat : " + criteres.meteoAutoLabel);
  // Nombre total d'items = somme des quantités plutôt que simple longueur de liste.
  const totalQty = Array.isArray(liste)
    ? liste.reduce((acc, item) => acc + (item.quantity || 1), 0)
    : 0;
  parts.push("Items : " + totalQty);
  el.textContent = parts.join(" · ");
}

/* -------------------------------
   Export PDF (simple, lisible)
-------------------------------- */
function exporterPdf() {
  if (typeof window.jspdf === "undefined" && typeof window.jsPDF === "undefined") {
    alert(
      "jsPDF non chargé. Le PDF sera fonctionnel en production (GitHub Pages)."
    );
    return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF();
  doc.text("Checklist Sac v2", 10, 10);
  const tbody = document.querySelector("#checklistTable tbody");
  const rows = [];
  tbody.querySelectorAll("tr").forEach((tr) => {
    const cells = tr.querySelectorAll("td");
    rows.push([
      cells[1]?.textContent || "",
      cells[2]?.textContent || "",
      cells[3]?.textContent || "",
      cells[4]?.textContent || "",
      cells[5]?.textContent || "",
      cells[6]?.textContent || "",
      cells[7]?.textContent || ""
    ]);
  });
  let y = 20;
  rows.forEach((r) => {
    doc.text(r.join(" | "), 10, y);
    y += 6;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  });
  doc.save("checklist_sac_v2.pdf");
}