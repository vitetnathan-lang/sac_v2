let materiel = [];
let destinations = {
  gr20: {
    label: "GR20 autonomie",
    activite: "Trek",
    meteo: "Froid",
    autonomie: true,
    techLevel: 1
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
    label: "Alpinisme",
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

document.addEventListener("DOMContentLoaded", async () => {
  await chargerMateriel();
  initialiserUI();
});

/* ---------------------------------------------------
   Chargement du JSON enrichi
--------------------------------------------------- */
async function chargerMateriel() {
  try {
    const res = await fetch("materiel_enriched.json");
    materiel = await res.json();
  } catch (e) {
    console.error("Erreur chargement materiel_enriched.json", e);
    materiel = [];
  }
}

/* ---------------------------------------------------
   Initialisation interface
--------------------------------------------------- */
function initialiserUI() {
  const destinationSelect = document.getElementById("destination");
  const activiteSelect = document.getElementById("activite");
  const meteoSelect = document.getElementById("meteo");
  const autonomieSelect = document.getElementById("autonomie");
  const techLevelSelect = document.getElementById("techLevel");
  const dureeInput = document.getElementById("duree");

  const adresseInput = document.getElementById("adresse");
  const dateDebutInput = document.getElementById("dateDebut");
  const dateFinInput = document.getElementById("dateFin");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnFromAddress = document.getElementById("btnFromAddress");
  const btnReset = document.getElementById("btnReset");
  const btnExportPdf = document.getElementById("btnExportPdf");

  destinationSelect.addEventListener("change", () => {
    const val = destinationSelect.value;
    if (val && destinations[val]) {
      const d = destinations[val];
      if (!activiteSelect.value) activiteSelect.value = d.activite;
      if (!meteoSelect.value) meteoSelect.value = d.meteo;
      if (!autonomieSelect.value) autonomieSelect.value = d.autonomie ? "oui" : "non";
      techLevelSelect.value = d.techLevel.toString();
    }
  });

  btnGenerate.addEventListener("click", () => {
    const criteres = {
      destination: destinationSelect.value || null,
      activite: activiteSelect.value || null,
      meteo: meteoSelect.value || null,
      autonomie: autonomieSelect.value === "" ? null : (autonomieSelect.value === "oui"),
      techLevel: parseInt(techLevelSelect.value, 10) || 1,
      duree: parseInt(dureeInput.value, 10) || 1
    };
    genererChecklist(criteres);
  });

  btnFromAddress.addEventListener("click", async () => {
    const adresse = (adresseInput.value || "").trim();
    const dateDebut = dateDebutInput.value;
    const dateFin = dateFinInput.value;

    if (!adresse || !dateDebut || !dateFin) {
      alert("Merci de saisir une adresse et une plage de dates.");
      return;
    }

    try {
      miseAJourResume({ infoOnly: true, texte: "Analyse météo en cours..." }, []);
      const loc = await geocoderAdresse(adresse);
      if (!loc) {
        alert("Adresse introuvable.");
        miseAJourResume(null, []);
        return;
      }

      const meteoInfo = await analyserMeteoPourPeriode(loc.lat, loc.lon, dateDebut, dateFin);

      // Appliquer la météo déduite
      if (meteoInfo.meteoCategorie) {
        meteoSelect.value = meteoInfo.meteoCategorie;
      }
      // Option : si beaucoup de pluie, tu peux forcer "Pluie"
      if (meteoInfo.pluieImportante) {
        meteoSelect.value = "Pluie";
      }

      // Activité : si rien choisi, on laisse vide pour que tu choisisses ou on met Randonnée par défaut
      if (!activiteSelect.value) {
        activiteSelect.value = "Randonnée";
      }

      // Autonomie = auto (tu peux changer la logique ici si tu veux)
      const critAutonomie = autonomieSelect.value === "" ? null : (autonomieSelect.value === "oui");

      const criteres = {
        destination: null,
        activite: activiteSelect.value || null,
        meteo: meteoSelect.value || null,
        autonomie: critAutonomie,
        techLevel: parseInt(techLevelSelect.value, 10) || 1,
        duree: parseInt(dureeInput.value, 10) || 1,
        lieu: loc.displayName,
        meteoAutoLabel: meteoInfo.label
      };

      genererChecklist(criteres);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'analyse météo.");
      miseAJourResume(null, []);
    }
  });

  btnReset.addEventListener("click", () => {
    destinationSelect.value = "";
    activiteSelect.value = "";
    meteoSelect.value = "";
    autonomieSelect.value = "";
    techLevelSelect.value = "1";
    dureeInput.value = "7";
    adresseInput.value = "";
    dateDebutInput.value = "";
    dateFinInput.value = "";
    miseAJourChecklist([]);
    miseAJourResume(null);
  });

  btnExportPdf.addEventListener("click", exporterPdf);
}

/* ---------------------------------------------------
   Géocodage (adresse -> lat/lon)
--------------------------------------------------- */
async function geocoderAdresse(adresse) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(adresse);

  const res = await fetch(url, {
    headers: {
      "Accept-Language": "fr",
      "User-Agent": "sac-v2-app"
    }
  });
  const data = await res.json();
  if (!data || data.length === 0) return null;

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name
  };
}

/* ---------------------------------------------------
   Analyse météo (Open-Meteo / archive)
   On normalise les dates sur l'année passée pour avoir du passé
--------------------------------------------------- */
function normaliserDatePourArchive(dateStr) {
  if (!dateStr || dateStr.length < 10) return null;
  const mmdd = dateStr.slice(5); // "MM-DD"
  const year = new Date().getFullYear() - 1; // année passée
  return year + "-" + mmdd;
}

async function analyserMeteoPourPeriode(lat, lon, dateDebut, dateFin) {
  const start = normaliserDatePourArchive(dateDebut);
  const end = normaliserDatePourArchive(dateFin);
  if (!start || !end) {
    throw new Error("Dates invalides.");
  }

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_mean,precipitation_sum,snowfall_sum&timezone=auto`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data || !data.daily || !data.daily.time || data.daily.time.length === 0) {
    throw new Error("Données météo indisponibles.");
  }

  const temps = data.daily.temperature_2m_mean || [];
  const precip = data.daily.precipitation_sum || [];
  const neige = data.daily.snowfall_sum || [];

  const n = data.daily.time.length;
  let sumT = 0, sumP = 0, sumS = 0;
  for (let i = 0; i < n; i++) {
    if (typeof temps[i] === "number") sumT += temps[i];
    if (typeof precip[i] === "number") sumP += precip[i];
    if (typeof neige[i] === "number") sumS += neige[i];
  }

  const tMoy = sumT / n;
  const pMoy = sumP / n;
  const sTot = sumS;

  // Catégorie température
  let meteoCat = "Tempéré";
  if (tMoy >= 26) meteoCat = "Chaud";
  else if (tMoy <= 8) meteoCat = "Froid";

  const pluieImportante = pMoy >= 2;  // ~2mm/j
  const neigeProbable = sTot > 0.5;

  let labelParts = [];
  labelParts.push(`T° moy. ~ ${tMoy.toFixed(1)}°C`);
  if (pluieImportante) labelParts.push("pluvieux");
  if (neigeProbable) labelParts.push("neige possible");

  return {
    meteoCategorie: meteoCat,
    pluieImportante,
    neigeProbable,
    label: labelParts.join(", ")
  };
}

/* ---------------------------------------------------
   FILTRAGE INTELLIGENT
--------------------------------------------------- */
function genererChecklist(criteres) {
  let resultat = materiel.filter(item => {

    // ACTIVITÉ
    if (criteres.activite) {
      const acts = (item.activities || []).map(a => a.toLowerCase());
      const cat = (item.category || "").toLowerCase();
      const crit = criteres.activite.toLowerCase();

      if (!(acts.includes(crit) || cat.includes(crit))) {
        return false;
      }
    }

    // METEO
    if (criteres.meteo && item.meteo && item.meteo.length > 0) {
      if (!item.meteo.includes(criteres.meteo)) {
        return false;
      }
    }

    // AUTONOMIE
    if (criteres.autonomie !== null) {
      const isAutonomieItem = (item.packs || [])
        .some(p => p.toLowerCase().includes("autonomie"));

      if (criteres.autonomie === true) {
        if (!(isAutonomieItem || (item.packs || []).includes("Base"))) {
          return false;
        }
      } else {
        if (isAutonomieItem) {
          return false;
        }
      }
    }

    // NIVEAU TECHNIQUE
    const tech = item.tech_level || item.techLevel || 1;
    if (tech > criteres.techLevel) return false;

    return true;
  });

  miseAJourChecklist(resultat);
  miseAJourResume(criteres, resultat);
}

/* ---------------------------------------------------
   AFFICHAGE CHECKLIST
--------------------------------------------------- */
function miseAJourChecklist(liste) {
  const tbody = document.querySelector("#checklistTable tbody");
  tbody.innerHTML = "";
  let totalPoids = 0;

  liste.forEach(e => {
    const tr = document.createElement("tr");

    const tdCheck = document.createElement("td");
    tdCheck.className = "checkbox-cell";
    const box = document.createElement("div");
    box.className = "checkbox";
    box.textContent = "";
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

    const tdActs = document.createElement("td");
    tdActs.textContent = (e.activities || []).join(", ");

    const tdPacks = document.createElement("td");
    tdPacks.textContent = (e.packs || []).join(", ");

    const tdWeight = document.createElement("td");
    tdWeight.textContent = e.weight_g ? e.weight_g.toString() : "";
    if (e.weight_g) totalPoids += e.weight_g;

    tr.appendChild(tdCheck);
    tr.appendChild(tdCat);
    tr.appendChild(tdName);
    tr.appendChild(tdDetails);
    tr.appendChild(tdActs);
    tr.appendChild(tdPacks);
    tr.appendChild(tdWeight);

    tbody.appendChild(tr);
  });

  document.getElementById("totalWeight").textContent = totalPoids + " g";
  document.getElementById("totalItems").textContent = liste.length.toString();
}

/* ---------------------------------------------------
   RÉSUMÉ
--------------------------------------------------- */
function miseAJourResume(criteres, liste = []) {
  const el = document.getElementById("summaryText");
  if (!criteres || criteres.infoOnly) {
    el.textContent = criteres && criteres.texte
      ? criteres.texte
      : "Aucun filtre appliqué.";
    return;
  }
  const parts = [];
  if (criteres.lieu) parts.push("Lieu : " + criteres.lieu);
  if (criteres.destination && destinations[criteres.destination]) {
    parts.push(destinations[criteres.destination].label);
  }
  if (criteres.activite) parts.push("Activité : " + criteres.activite);
  if (criteres.meteo) parts.push("Météo : " + criteres.meteo);
  if (criteres.autonomie !== null) parts.push("Autonomie : " + (criteres.autonomie ? "oui" : "non"));
  parts.push("Niv. technique ≤ " + criteres.techLevel);
  parts.push("Durée : " + criteres.duree + " j");
  if (criteres.meteoAutoLabel) parts.push("Climat : " + criteres.meteoAutoLabel);
  parts.push("Items : " + liste.length);

  el.textContent = parts.join(" · ");
}

/* ---------------------------------------------------
   EXPORT PDF
--------------------------------------------------- */
function exporterPdf() {
  if (typeof window.jspdf === "undefined" && typeof window.jsPDF === "undefined") {
    alert("jsPDF non chargé. Le PDF sera fonctionnel une fois le site en ligne.");
    return;
  }

  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF();

  doc.text("Checklist Sac v2", 10, 10);
  const rows = [];
  const tbody = document.querySelector("#checklistTable tbody");

  tbody.querySelectorAll("tr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    rows.push([
      cells[1]?.textContent || "",
      cells[2]?.textContent || "",
      cells[3]?.textContent || "",
      cells[4]?.textContent || "",
      cells[5]?.textContent || "",
      cells[6]?.textContent || ""
    ]);
  });

  let y = 20;
  rows.forEach(r => {
    doc.text(r.join(" | "), 10, y);
    y += 6;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  });

  doc.save("checklist_sac_v2.pdf");
}
