import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import config from "../firebase-applet-config.json";

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

async function inspect() {
  await signInWithEmailAndPassword(auth, "sergioruizv04@gmail.com", "sergio11");
  console.log("Authenticated");

  const clientsSnap = await getDocs(collection(db, "clients"));
  const clients: any[] = [];
  clientsSnap.forEach(d => {
    clients.push({ id: d.id, ...d.data() });
  });

  console.log(`Total clients: ${clients.length}`);

  // Find client with clientCode === "0097"
  const c97 = clients.find(c => c.clientCode === "0097" || c.clientCode === "97");
  console.log("Client with code 0097:", c97);

  // Look at clients sorted by code around 90-105 and 125-135
  const withCodes = clients.filter(c => c.clientCode).sort((a, b) => parseInt(a.clientCode) - parseInt(b.clientCode));
  console.log("\nClients between 0090 and 0105:");
  withCodes.filter(c => parseInt(c.clientCode) >= 90 && parseInt(c.clientCode) <= 105).forEach(c => {
    console.log(`Code: #${c.clientCode} | Name: "${c.name}" | Phone: "${c.phone}" | Created: ${c.createdAt} | LastPurchase: ${c.lastPurchaseDate} | Receipts: ${c.receiptIds?.length}`);
  });

  console.log("\nClients from 0125 onwards:");
  withCodes.filter(c => parseInt(c.clientCode) >= 125).forEach(c => {
    console.log(`Code: #${c.clientCode} | Name: "${c.name}" | Phone: "${c.phone}" | Created: ${c.createdAt} | LastPurchase: ${c.lastPurchaseDate} | Receipts: ${c.receiptIds?.length}`);
  });

  // Also check all receipts ordered by date to see who bought yesterday and today!
  const receiptsSnap = await getDocs(collection(db, "receipts"));
  const receipts: any[] = [];
  receiptsSnap.forEach(d => {
    receipts.push({ id: d.id, ...d.data() });
  });
  receipts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  console.log("\nLast 15 receipts created (chronological):");
  receipts.slice(-15).forEach(r => {
    console.log(`Consecutive: #${r.consecutive} | Date: ${r.date} | ClientName: "${r.clientName}" | ClientId: "${r.clientId}" | Phone: "${r.clientPhone}"`);
  });

  process.exit(0);
}

inspect();
