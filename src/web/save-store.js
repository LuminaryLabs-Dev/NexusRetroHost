const DB = "nexusretrohost", STORE = "saves";
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function putSave(id, value) {
  const db = await openDb();
  try { await new Promise((resolve, reject) => { const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(value,id); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); }
  finally { db.close(); }
}
export async function getSave(id) {
  const db=await openDb();
  try { return await new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).get(id);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);}); }
  finally { db.close(); }
}
