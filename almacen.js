/* Cuentas Claras — almacenamiento local.
   Guarda compras, notas, ingresos y fotos en este dispositivo (IndexedDB)
   y ofrece la misma interfaz que la app usa dentro de Claude. */
(function () {
  "use strict";
  const DBNAME = "cuentas-claras", VER = 1;
  const mem = new Map();      // "coleccion/id" -> datos
  const fotos = new Map();    // id de foto -> URL local
  const listeners = new Set();
  let idb = null;

  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const genId = (n = 20) => {
    const a = "abcdefghijklmnopqrstuvwxyz0123456789"; let s = "";
    const r = crypto.getRandomValues(new Uint8Array(n));
    for (const b of r) s += a[b % a.length];
    return s;
  };
  const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DBNAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("docs")) d.createObjectStore("docs");
        if (!d.objectStoreNames.contains("fotos")) d.createObjectStore("fotos");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function run(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = idb.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  async function loadAll() {
    mem.clear();
    const keys = await run("docs", "readonly", (s) => s.getAllKeys());
    const vals = await run("docs", "readonly", (s) => s.getAll());
    keys.forEach((k, i) => mem.set(String(k), vals[i]));
    fotos.forEach((u) => URL.revokeObjectURL(u)); fotos.clear();
    const fk = await run("fotos", "readonly", (s) => s.getAllKeys());
    const fv = await run("fotos", "readonly", (s) => s.getAll());
    fk.forEach((k, i) => { if (fv[i]) fotos.set(String(k), URL.createObjectURL(fv[i])); });
  }

  let persistent = true;
  const ready = (async () => {
    try { idb = await openDB(); await loadAll(); }
    catch (e) { persistent = false; console.warn("Sin almacenamiento local", e); }
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  })();

  function notify() { queueMicrotask(() => listeners.forEach((l) => { try { l(); } catch (e) { console.error(e); } })); }
  async function write(path, data) {
    if (data === null) mem.delete(path); else mem.set(path, data);
    if (persistent) {
      if (data === null) await run("docs", "readwrite", (s) => s.delete(path));
      else await run("docs", "readwrite", (s) => s.put(data, path));
    }
    notify();
  }
  const meta = { fromCache: false, hasPendingWrites: false };
  function docSnap(path) {
    const has = mem.has(path);
    return { id: path.split("/").pop(), exists: has, data: () => (has ? clone(mem.get(path)) : undefined), metadata: meta };
  }
  function colSnap(col) {
    const pre = col + "/", docs = [];
    [...mem.keys()].sort().forEach((k) => { if (k.startsWith(pre) && !k.slice(pre.length).includes("/")) docs.push(docSnap(k)); });
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta };
  }
  function subscribe(make, next) {
    let live = true;
    const fire = () => { if (live) next(make()); };
    listeners.add(fire);
    ready.then(fire);
    return () => { live = false; listeners.delete(fire); };
  }
  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      get: async () => { await ready; return docSnap(path); },
      set: async (d) => { await ready; await write(path, clone(d)); },
      update: async (d) => {
        await ready;
        if (!mem.has(path)) throw { code: "invalid_argument", message: "No existe" };
        const cur = clone(mem.get(path));
        for (const [k, v] of Object.entries(d)) { if (v && typeof v === "object" && v.__delete__) delete cur[k]; else cur[k] = clone(v); }
        await write(path, cur);
      },
      delete: async () => { await ready; await write(path, null); },
      onSnapshot: (next) => subscribe(() => docSnap(path), next),
      collection: (sub) => colRef(path + "/" + sub),
    };
  }
  function colRef(col) {
    return {
      path: col,
      doc: (id) => docRef(col + "/" + (id || genId())),
      add: async (d) => { const r = docRef(col + "/" + genId()); await r.set(d); return r; },
      onSnapshot: (next) => subscribe(() => colSnap(col), next),
      get: async () => { await ready; return colSnap(col); },
    };
  }
  const db = { doc: docRef, collection: colRef };

  const assets = {
    async upload(blob, opts) {
      await ready;
      const id = hexId();
      if (persistent) await run("fotos", "readwrite", (s) => s.put(blob, id));
      const url = URL.createObjectURL(blob); fotos.set(id, url);
      return { id, url, sizeBytes: blob.size, contentType: (opts && opts.type) || blob.type || "image/jpeg" };
    },
    async delete(id) {
      await ready;
      const had = fotos.has(id);
      if (persistent) await run("fotos", "readwrite", (s) => s.delete(id));
      if (had) { URL.revokeObjectURL(fotos.get(id)); fotos.delete(id); }
      return { deleted: had };
    },
    async list() { await ready; return { assets: [...fotos.keys()].map((id) => ({ id, url: fotos.get(id) })), usage: {} }; },
  };

  function saveFile(filename, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const downloads = {
    async save({ filename, data }) {
      const type = /\.csv$/i.test(filename) ? "text/csv;charset=utf-8" : /\.json$/i.test(filename) ? "application/json" : undefined;
      saveFile(filename, data, type); return { status: "saved" };
    },
  };

  /* Respaldo: todo (compras, notas, ingresos y fotos) en un solo archivo .json */
  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  async function exportAll() {
    await ready;
    const docs = {}; mem.forEach((v, k) => (docs[k] = v));
    const fotosOut = {};
    if (persistent) {
      const fk = await run("fotos", "readonly", (s) => s.getAllKeys());
      const fv = await run("fotos", "readonly", (s) => s.getAll());
      for (let i = 0; i < fk.length; i++) if (fv[i]) fotosOut[fk[i]] = await blobToDataURL(fv[i]);
    }
    return { app: "cuentas-claras", version: 1, exportado: new Date().toISOString(), docs, fotos: fotosOut };
  }
  async function importAll(data) {
    await ready;
    if (!data || data.app !== "cuentas-claras" || typeof data.docs !== "object") throw new Error("Este archivo no es un respaldo de Cuentas Claras.");
    if (!persistent) throw new Error("Este navegador no deja guardar datos en el dispositivo.");
    await run("docs", "readwrite", (s) => s.clear());
    await run("fotos", "readwrite", (s) => s.clear());
    for (const [k, v] of Object.entries(data.docs)) await run("docs", "readwrite", (s) => s.put(v, k));
    for (const [id, du] of Object.entries(data.fotos || {})) {
      const blob = await (await fetch(du)).blob();
      await run("fotos", "readwrite", (s) => s.put(blob, id));
    }
    await loadAll();
    notify();
    return { compras: Object.keys(data.docs).filter((k) => k.startsWith("gastos/")).length, fotos: Object.keys(data.fotos || {}).length };
  }

  const caps = { db, assets, downloads };
  window.claude = { use: (name) => Promise.resolve(caps[name] || null) };
  window.__fotoURL = (id) => fotos.get(id) || "";
  window.__cc = { ready, exportAll, importAll, saveFile, isPersistent: () => persistent, count: () => [...mem.keys()].filter((k) => k.startsWith("gastos/")).length };
})();
