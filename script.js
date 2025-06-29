// IndexedDB helpers
let db;
const DB_NAME = "FlashcardDB";
const DB_VERSION = 1;

function initDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = e => {
    db = e.target.result;
    const deckStore = db.createObjectStore("decks", { keyPath: "id", autoIncrement: true });
    deckStore.createIndex("name", "name", { unique: false });

    const cardStore = db.createObjectStore("cards", { keyPath: "id", autoIncrement: true });
    cardStore.createIndex("deckId", "deckId", { unique: false });
  };

  request.onsuccess = e => {
    db = e.target.result;
    loadDecks();
  };

  request.onerror = e => {
    console.error("DB error:", e.target.error);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  initDB();
  setupUI();
});

let currentDeckId = null;

function setupUI() {
  document.getElementById("createDeckBtn").addEventListener("click", createDeck);
  document.getElementById("addCardBtn").addEventListener("click", addCard);
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", importData);
}

function createDeck() {
  const name = prompt("Deck name:");
  if (!name) return;

  const tx = db.transaction("decks", "readwrite");
  tx.objectStore("decks").add({ name }).onsuccess = loadDecks;
}

function loadDecks() {
  const list = document.getElementById("deckList");
  list.innerHTML = "";
  const tx = db.transaction("decks", "readonly");
  tx.objectStore("decks").getAll().onsuccess = e => {
    e.target.result.forEach(deck => {
      const btn = document.createElement("button");
      btn.textContent = deck.name;
      btn.onclick = () => selectDeck(deck.id, deck.name);
      list.appendChild(btn);
    });
  };
}

function selectDeck(id, name) {
  currentDeckId = id;
  document.getElementById("deckTitle").textContent = name;
  loadCards();
}

function addCard() {
  if (!currentDeckId) return alert("Select a deck first!");

  const frontText = document.getElementById("frontText").value.trim();
  const backText = document.getElementById("backText").value.trim();

  if (!frontText || !backText) return alert("Enter text for both sides!");

  const frontFile = document.getElementById("frontImage").files[0];
  const backFile = document.getElementById("backImage").files[0];

  const readFile = file => new Promise(resolve => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });

  Promise.all([readFile(frontFile), readFile(backFile)]).then(([frontImg, backImg]) => {
    const tx = db.transaction("cards", "readwrite");
    tx.objectStore("cards").add({
      deckId: currentDeckId,
      frontText,
      backText,
      frontImg,
      backImg
    }).onsuccess = loadCards;
  });
}

function loadCards() {
  const container = document.getElementById("cardsContainer");
  container.innerHTML = "";

  const tx = db.transaction("cards", "readonly");
  const index = tx.objectStore("cards").index("deckId");
  const request = index.getAll(IDBKeyRange.only(currentDeckId));
  request.onsuccess = e => {
    e.target.result.forEach(card => {
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <strong>${card.frontText}</strong>
        ${card.frontImg ? `<img src="${card.frontImg}" alt="Front image"/>` : ""}
        <p>${card.backText}</p>
        ${card.backImg ? `<img src="${card.backImg}" alt="Back image"/>` : ""}
      `;
      container.appendChild(div);
    });
  };
}

function exportData() {
  const txDecks = db.transaction("decks", "readonly");
  const txCards = db.transaction("cards", "readonly");

  Promise.all([
    txDecks.objectStore("decks").getAll(),
    txCards.objectStore("cards").getAll()
  ]).then(([decks, cards]) => {
    const data = { decks, cards };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `flashcards_backup_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.decks || !data.cards) throw new Error("Invalid format");

      const tx = db.transaction(["decks", "cards"], "readwrite");
      const decksStore = tx.objectStore("decks");
      const cardsStore = tx.objectStore("cards");
      data.decks.forEach(deck => decksStore.add(deck));
      data.cards.forEach(card => cardsStore.add(card));

      tx.oncomplete = () => {
        loadDecks();
        alert("Import complete.");
      };
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  };
  reader.readAsText(file);
}
