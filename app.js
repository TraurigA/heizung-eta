// Heizungs-Logbuch – minimal PWA client (Supabase + Charts)
// Uses Supabase JS v2 and Chart.js (loaded in index.html)

(() => {
  const cfg = window.HEIZLOG_CONFIG;
  const supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  let session = null;
  let dailyChart = null;
  let compareChart = null;

  const $ = (id) => document.getElementById(id);

  // ---------- Utilities ----------
  const pad2 = (n) => String(n).padStart(2, "0");

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function parseISODate(s) {
    // s: YYYY-MM-DD
    const [y,m,da] = s.split("-").map(Number);
    return new Date(y, m-1, da);
  }
  function monthStartEnd(monthStr) {
    // monthStr: YYYY-MM
    const [y,m] = monthStr.split("-").map(Number);
    const start = new Date(y, m-1, 1);
    const end = new Date(y, m, 0); // last day
    return { start, end };
  }
  function daysInMonth(y,m1based) {
    return new Date(y, m1based, 0).getDate();
  }
  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

  function fmt1(x){ return (x==null || Number.isNaN(x)) ? "—" : Number(x).toFixed(1); }
  function fmt2(x){ return (x==null || Number.isNaN(x)) ? "—" : Number(x).toFixed(2); }
  function fmt0(x){ return (x==null || Number.isNaN(x)) ? "—" : String(Math.round(Number(x))); }
  function fmtHM(mins){
    if(mins==null || Number.isNaN(mins)) return "—";
    const m = Math.round(Number(mins));
    const h = Math.floor(m/60);
    const mm = m%60;
    return `${h}h ${pad2(mm)}m`;
  }
  function rgbFromHex(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if(!m) return {r:79,g:140,b:255};
    return {r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16)};
  }

  function heatingYearRange(startDate){
    // startDate: Date (should be 04.09.YYYY)
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(startDate.getFullYear()+1, startDate.getMonth(), startDate.getDate()); // exclusive-ish for diff
    return {start, end};
  }

  // ---------- Settings ----------
  const settingsKey = "heizlog_settings_v1";
  function loadSettings(){
    const def = { houseName: "Haus", rosiName: "Gebäude 2", accent: "#4f8cff" };
    try{
      const s = JSON.parse(localStorage.getItem(settingsKey) || "null");
      return {...def, ...(s||{})};
    }catch{ return def; }
  }
  function saveSettings(s){
    localStorage.setItem(settingsKey, JSON.stringify(s));
  }
  function applySettings(){
    const s = loadSettings();
    $("nameHouse").value = s.houseName;
    $("nameRosi").value = s.rosiName;
    $("accent").value = s.accent;

    const rgb = rgbFromHex(s.accent);
    document.documentElement.style.setProperty("--accent", s.accent);
    document.documentElement.style.setProperty("--accent-r", String(rgb.r));
    document.documentElement.style.setProperty("--accent-g", String(rgb.g));
    document.documentElement.style.setProperty("--accent-b", String(rgb.b));

    // Update a few labels
    $("lblHeatRosi").textContent = `Wärme ${s.rosiName} (kWh, Zähler)`;
    $("lblHeatTotal").textContent = `Wärme gesamt (kWh, Zähler)`;
    $("costHint").textContent = `Wärme ${s.houseName} = Wärme Gesamt − Wärme ${s.rosiName}.`;

    // Update checkbox labels (quick)
    document.querySelector('label[for=""]'); // noop
    const cbLabels = document.querySelectorAll(".checkboxes label");
    if(cbLabels.length >= 3){
      cbLabels[0].lastChild.textContent = ` Heizkörper ${s.houseName} an`;
      cbLabels[1].lastChild.textContent = ` Heizkörper ${s.rosiName} an`;
      cbLabels[2].lastChild.textContent = ` FBH ${s.rosiName} an`;
    }
  }

  // ---------- Tabs ----------
  const tabDefs = [
    {id:"heute", label:"Heute"},
    {id:"eintraege", label:"Einträge"},
    {id:"auswertung", label:"Auswertung"},
    {id:"vergleich", label:"Vergleich"},
    {id:"kosten", label:"Kosten"},
    {id:"hacks", label:"Hacks"},
    {id:"settings", label:"Einstellungen"},
  ];
  function showTab(id){
    document.querySelectorAll(".tab").forEach(el => {
      const ok = el.dataset.tab === id || (id==="login" && el.dataset.tab==="login");
      el.classList.toggle("hidden", !ok);
    });
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab===id));
  }
  function buildTabs(){
    const tabs = $("tabs");
    tabs.innerHTML = "";
    tabDefs.forEach(t => {
      const b = document.createElement("button");
      b.className = "tabbtn";
      b.dataset.tab = t.id;
      b.textContent = t.label;
      b.addEventListener("click", () => showTab(t.id));
      tabs.appendChild(b);
    });
  }

  // ---------- Auth ----------
  async function refreshSession(){
    const { data } = await supabase.auth.getSession();
    session = data.session;
    renderAuthState();
  }
  function renderAuthState(){
    const loggedIn = !!session;
    $("btnLogout").style.display = loggedIn ? "inline-block" : "none";
    $("syncBadge").textContent = navigator.onLine ? "online" : "offline";
    $("syncBadge").style.color = navigator.onLine ? "var(--ok)" : "var(--muted)";

    if(loggedIn){
      $("whoami").textContent = session.user.email;
      buildTabs();
      showTab("heute");
      document.querySelector('[data-tab="login"]').classList.add("hidden");
      tabDefs.forEach(t => document.querySelector(`[data-tab="${t.id}"]`).classList.remove("hidden"));
    }else{
      $("whoami").textContent = "Nicht eingeloggt";
      $("tabs").innerHTML = "";
      document.querySelector('[data-tab="login"]').classList.remove("hidden");
      tabDefs.forEach(t => document.querySelector(`[data-tab="${t.id}"]`).classList.add("hidden"));
      showTab("login");
    }
  }

  async function login(email, pass){
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if(error) throw error;
    session = data.session;
    renderAuthState();
  }
  async function signup(email, pass){
    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if(error) throw error;
    // With email-confirm disabled, session should be available quickly.
    session = (await supabase.auth.getSession()).data.session;
    renderAuthState();
  }
  async function logout(){
    await supabase.auth.signOut();
    session = null;
    renderAuthState();
  }

  // ---------- Data helpers ----------
  function userId(){ return session?.user?.id; }

  async function upsertDaily(payload){
    payload.user_id = userId();
    const { data, error } = await supabase
      .from("daily_readings")
      .upsert(payload, { onConflict: "user_id,day" })
      .select()
      .limit(1);
    if(error) throw error;
    return data?.[0] || null;
  }

  async function fetchDailyRange(startISO, endISO){
    const { data, error } = await supabase
      .from("daily_readings")
      .select("*")
      .eq("user_id", userId())
      .gte("day", startISO)
      .lte("day", endISO)
      .order("day", { ascending: true });
    if(error) throw error;
    return data || [];
  }

  async function fetchDailyMonth(monthStr){
    const {start, end} = monthStartEnd(monthStr);
    return await fetchDailyRange(toISODate(start), toISODate(end));
  }

  async function fetchChippingRange(startISO, endISO){
    const { data, error } = await supabase
      .from("chipping_events")
      .select("*")
      .eq("user_id", userId())
      .gte("ts", startISO)
      .lte("ts", endISO)
      .order("ts", { ascending: false });
    if(error) throw error;
    return data || [];
  }

  async function addAshEvent(note){
    const { error } = await supabase.from("ash_events").insert({
      user_id: userId(),
      ts: new Date().toISOString(),
      note: note || null
    });
    if(error) throw error;
  }

  async function addChippingEvent(row){
    row.user_id = userId();
    const { error } = await supabase.from("chipping_events").insert(row);
    if(error) throw error;
  }

  async function saveHeatPrice(hyStartISO, ctPerKwh){
    const { error } = await supabase
      .from("heat_price_heating_year")
      .upsert({
        user_id: userId(),
        heating_year_start: hyStartISO,
        ct_per_kwh: Number(ctPerKwh),
      }, { onConflict: "user_id,heating_year_start" });
    if(error) throw error;
  }

  async function fetchHeatPrice(hyStartISO){
    const { data, error } = await supabase
      .from("heat_price_heating_year")
      .select("*")
      .eq("user_id", userId())
      .eq("heating_year_start", hyStartISO)
      .limit(1);
    if(error) throw error;
    return data?.[0] || null;
  }

  // ---------- Calculations (Option B distribution) ----------
  function distributeDaily(readings, monthStr, field){
    // readings: sorted by day, include padding around month if possible
    // returns daily array (length daysInMonth) of distributed consumption for selected field (kWh / minutes / integer counts / kg)
    const {start, end} = monthStartEnd(monthStr);
    const y = start.getFullYear(), m1 = start.getMonth()+1;
    const nDays = daysInMonth(y, m1);

    const dayIndex = (d) => {
      // d Date within month
      return d.getDate()-1;
    };

    const daily = new Array(nDays).fill(0);

    // Filter pairs where field is not null at both endpoints
    for(let i=0; i<readings.length-1; i++){
      const a = readings[i], b = readings[i+1];
      if(a[field]==null || b[field]==null) continue;
      const da = parseISODate(a.day);
      const db = parseISODate(b.day);
      const gap = Math.round((db - da) / (1000*60*60*24));
      if(gap <= 0) continue;

      let delta = Number(b[field]) - Number(a[field]);

      // Special case: chips_kg_since_ash can reset to 0 after ash empty
      if(field === "chips_kg_since_ash" && delta < 0){
        // treat as reset: consumption = b value (since last reset)
        delta = Number(b[field]);
      }
      // If counters reset unexpectedly, ignore negative deltas
      if(delta < 0) continue;

      const perDay = delta / gap;

      // distribute to days (da+1 ... db) inclusive? consumption happened between days.
      // We'll attribute perDay to each day after a up to b (exclusive of a day).
      for(let k=1; k<=gap; k++){
        const d = new Date(da.getFullYear(), da.getMonth(), da.getDate()+k);
        if(d < start || d > end) continue;
        daily[dayIndex(d)] += perDay;
      }
    }

    return daily;
  }

  function monthTotalFromReadings(readings, field){
    // Use first and last non-null within month; if chips resets, sum distributed is safer; we use distributed sum.
    return readings.reduce((acc, r) => acc + (r[field]==null ? 0 : 0), 0);
  }

  function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
  function max(arr){ return arr.reduce((m,v)=>v>m?v:m, -Infinity); }

  async function analyzeMonth(monthStr){
    // Fetch padding around month to distribute properly
    const {start, end} = monthStartEnd(monthStr);
    const padStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()-40);
    const padEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate()+40);
    const readings = await fetchDailyRange(toISODate(padStart), toISODate(padEnd));

    const s = loadSettings();

    const dailyHeatTotal = distributeDaily(readings, monthStr, "heat_total_kwh");
    const dailyHeatRosi  = distributeDaily(readings, monthStr, "heat_rosi_kwh");
    const dailyElecHeat  = distributeDaily(readings, monthStr, "elec_heating_kwh");
    const dailyElecPump  = distributeDaily(readings, monthStr, "elec_pump_kwh"); // optional
    const dailyFullMins  = distributeDaily(readings, monthStr, "full_load_minutes");
    const dailyBuffer    = distributeDaily(readings, monthStr, "buffer_charges");
    const dailyChipsKg   = distributeDaily(readings, monthStr, "chips_kg_since_ash");

    const heatTotal = sum(dailyHeatTotal);
    const heatRosi  = sum(dailyHeatRosi);
    const heatHouse = heatTotal - heatRosi;

    const elecHeat = sum(dailyElecHeat);
    const elecPump = sum(dailyElecPump);

    const fullHours = sum(dailyFullMins) / 60.0;
    const bufferCnt = sum(dailyBuffer);
    const chipsKg   = sum(dailyChipsKg);

    const {start:ms, end:me} = monthStartEnd(monthStr);
    const nDays = me.getDate();
    const avgHeatTotal = heatTotal / nDays;
    const avgChips = chipsKg / nDays;
    const avgHours = fullHours / nDays;

    const peakHeat = max(dailyHeatTotal);
    const peakChips = max(dailyChipsKg);

    // KPIs
    const kpis = [
      {k:"Wärme Gesamt (kWh)", v: fmt1(heatTotal)},
      {k:`Wärme ${s.rosiName} (kWh)`, v: fmt1(heatRosi)},
      {k:`Wärme ${s.houseName} (kWh)`, v: fmt1(heatHouse)},
      {k:"Ø Wärme Gesamt / Tag", v: fmt1(avgHeatTotal)},
      {k:"Strom Heizung (kWh)", v: fmt2(elecHeat)},
      {k:"Strom Fernwärme (kWh)", v: fmt2(elecPump)},
      {k:"Hacks (kg)", v: fmt1(chipsKg)},
      {k:"Ø Hacks / Tag", v: fmt1(avgChips)},
      {k:"Betriebszeit (h)", v: fmt1(fullHours)},
      {k:"Ø Betriebszeit / Tag (h)", v: fmt1(avgHours)},
      {k:"Pufferladungen", v: fmt0(bufferCnt)},
      {k:"Peak Wärme/Tag (kWh)", v: fmt1(peakHeat)},
    ];

    $("kpis").innerHTML = kpis.map(x => `
      <div class="box"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>
    `).join("");

    // Chart (daily heat total)
    const labels = dailyHeatTotal.map((_,i)=>String(i+1));
    if(dailyChart) dailyChart.destroy();
    dailyChart = new Chart($("chartDaily"), {
      type:"line",
      data:{
        labels,
        datasets:[{
          label:"Wärme Gesamt (kWh/Tag)",
          data: dailyHeatTotal.map(v => Number(v.toFixed(3))),
          tension:0.25,
          pointRadius:2,
        }]
      },
      options:{
        responsive:true,
        plugins:{
          legend:{ display:true, labels:{ color:"#e7eefc" } },
          tooltip:{}
        },
        scales:{
          x:{ ticks:{ color:"#93a4c7" }, grid:{ color:"rgba(255,255,255,.06)" } },
          y:{ ticks:{ color:"#93a4c7" }, grid:{ color:"rgba(255,255,255,.06)" } }
        }
      }
    });
  }

  // Comparison: monthly totals for a year (heat_total)
  async function compareYears(yearA, yearB){
    const years = [yearA, yearB].map(Number);
    const minY = Math.min(...years), maxY = Math.max(...years);
    // fetch padding for both years
    const start = new Date(minY, 0, 1);
    const end = new Date(maxY, 11, 31);
    const padStart = new Date(start.getFullYear(), start.getMonth(), start.getDate()-50);
    const padEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate()+50);
    const readings = await fetchDailyRange(toISODate(padStart), toISODate(padEnd));

    function monthlyTotalsForYear(y){
      const totals = [];
      for(let m=1; m<=12; m++){
        const ms = new Date(y, m-1, 1);
        const me = new Date(y, m, 0);
        const monthStr = `${y}-${pad2(m)}`;
        // Use distribution limited to that month
        const daily = distributeDaily(readings, monthStr, "heat_total_kwh");
        totals.push(sum(daily));
      }
      return totals;
    }

    const a = monthlyTotalsForYear(Number(yearA));
    const b = monthlyTotalsForYear(Number(yearB));

    if(compareChart) compareChart.destroy();
    compareChart = new Chart($("chartCompare"), {
      type:"bar",
      data:{
        labels:["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"],
        datasets:[
          { label:String(yearA), data:a.map(v=>Number(v.toFixed(2))) },
          { label:String(yearB), data:b.map(v=>Number(v.toFixed(2))) },
        ]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ labels:{ color:"#e7eefc" } } },
        scales:{
          x:{ ticks:{ color:"#93a4c7" }, grid:{ color:"rgba(255,255,255,.06)" } },
          y:{ ticks:{ color:"#93a4c7" }, grid:{ color:"rgba(255,255,255,.06)" } }
        }
      }
    });
  }

  // Heizjahr cost
  async function calcHeizjahr(hyStartISO){
    const start = parseISODate(hyStartISO);
    const {start:hs, end:he} = heatingYearRange(start);
    // padding for distribution
    const padStart = new Date(hs.getFullYear(), hs.getMonth(), hs.getDate()-50);
    const padEnd = new Date(he.getFullYear(), he.getMonth(), he.getDate()+50);
    const readings = await fetchDailyRange(toISODate(padStart), toISODate(padEnd));

    const hyMonthStrs = [];
    // We'll compute consumption by distributing for each month that overlaps
    let cur = new Date(hs.getFullYear(), hs.getMonth(), 1);
    while(cur < he){
      hyMonthStrs.push(`${cur.getFullYear()}-${pad2(cur.getMonth()+1)}`);
      cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
    }

    let heatTotal=0, heatRosi=0;
    for(const ms of hyMonthStrs){
      const {start:msd, end:med} = monthStartEnd(ms);
      // month overlap with hy range
      const overlapStart = msd < hs ? hs : msd;
      const overlapEnd = med > new Date(he.getFullYear(), he.getMonth(), he.getDate()-1) ? new Date(he.getFullYear(), he.getMonth(), he.getDate()-1) : med;
      if(overlapEnd < overlapStart) continue;

      const dailyTot = distributeDaily(readings, ms, "heat_total_kwh");
      const dailyRos = distributeDaily(readings, ms, "heat_rosi_kwh");

      // sum only overlap days within that month
      for(let d=overlapStart; d<=overlapEnd; d=new Date(d.getFullYear(), d.getMonth(), d.getDate()+1)){
        const idx = d.getDate()-1;
        heatTotal += dailyTot[idx] || 0;
        heatRosi  += dailyRos[idx] || 0;
      }
    }

    const heatHouse = heatTotal - heatRosi;

    const priceRow = await fetchHeatPrice(hyStartISO);
    const ct = priceRow ? Number(priceRow.ct_per_kwh) : null;
    const eur = (kwh) => ct==null ? null : (kwh * ct / 100.0);

    const s = loadSettings();
    const kpis = [
      {k:"Wärme Gesamt (kWh)", v: fmt1(heatTotal)},
      {k:`Wärme ${s.rosiName} (kWh)`, v: fmt1(heatRosi)},
      {k:`Wärme ${s.houseName} (kWh)`, v: fmt1(heatHouse)},
      {k:`ct/kWh`, v: ct==null ? "—" : fmt2(ct)},
      {k:`Kosten Gesamt (€)`, v: ct==null ? "—" : fmt2(eur(heatTotal))},
      {k:`Kosten ${s.rosiName} (€)`, v: ct==null ? "—" : fmt2(eur(heatRosi))},
      {k:`Kosten ${s.houseName} (€)`, v: ct==null ? "—" : fmt2(eur(heatHouse))},
    ];
    $("hyKpis").innerHTML = kpis.map(x => `
      <div class="box"><div class="v">${x.v}</div><div class="k">${x.k}</div></div>
    `).join("");
  }

  // ---------- UI actions ----------
  function setTodayDefaults(){
    const now = new Date();
    $("day").value = toISODate(now);
    $("time").value = cfg.defaultTime || "18:00";
    $("monthPick").value = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;
    $("anMonth").value = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;
    $("chipMonth").value = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;

    // Heizjahr defaults: nearest 04.09.
    const y = now.getFullYear();
    const hyStart = new Date(y, 8, 4); // Sep=8
    const hy = (now < hyStart) ? new Date(y-1, 8, 4) : hyStart;
    $("hyStart").value = toISODate(hy);
    $("hyPick").value = toISODate(hy);

    // year dropdown
    const startY = 2022;
    const endY = now.getFullYear()+1;
    const years = [];
    for(let yy=startY; yy<=endY; yy++) years.push(yy);
    ["yearA","yearB"].forEach(id => {
      const sel = $(id);
      sel.innerHTML = years.map(yy => `<option value="${yy}">${yy}</option>`).join("");
    });
    $("yearA").value = String(now.getFullYear()-1);
    $("yearB").value = String(now.getFullYear());
  }

  async function loadDayToForm(dayISO){
    const { data, error } = await supabase
      .from("daily_readings")
      .select("*")
      .eq("user_id", userId())
      .eq("day", dayISO)
      .limit(1);
    if(error) throw error;
    const r = data?.[0];
    if(!r){
      $("todayMsg").textContent = "Kein Eintrag für dieses Datum.";
      return;
    }
    $("time").value = (r.time_hhmm || cfg.defaultTime || "18:00");
    $("temp_c").value = r.temp_c ?? "";
    $("heat_total_kwh").value = r.heat_total_kwh ?? "";
    $("heat_rosi_kwh").value = r.heat_rosi_kwh ?? "";
    $("elec_heating_kwh").value = r.elec_heating_kwh ?? "";
    $("elec_pump_kwh").value = r.elec_pump_kwh ?? "";
    $("buffer_charges").value = r.buffer_charges ?? "";
    $("chips_kg_since_ash").value = r.chips_kg_since_ash ?? "";
    $("note").value = r.note ?? "";
    $("hk_house").checked = !!r.hk_house;
    $("hk_rosi").checked = !!r.hk_rosi;
    $("fbh_rosi").checked = !!r.fbh_rosi;

    const mins = r.full_load_minutes;
    if(mins!=null){
      $("full_h").value = Math.floor(mins/60);
      $("full_m").value = mins%60;
    }else{
      $("full_h").value = "";
      $("full_m").value = "";
    }
    $("todayMsg").textContent = "Eintrag geladen.";
  }

  async function saveToday(){
    const day = $("day").value;
    const time = $("time").value || null;
    const full_h = $("full_h").value ? Number($("full_h").value) : null;
    const full_m = $("full_m").value ? Number($("full_m").value) : null;
    let full_load_minutes = null;
    if(full_h!=null || full_m!=null){
      full_load_minutes = (full_h||0)*60 + (full_m||0);
    }

    const payload = {
      day,
      time_hhmm: time,
      temp_c: $("temp_c").value ? Number($("temp_c").value) : null,
      heat_total_kwh: $("heat_total_kwh").value ? Number($("heat_total_kwh").value) : null,
      heat_rosi_kwh: $("heat_rosi_kwh").value ? Number($("heat_rosi_kwh").value) : null,
      elec_heating_kwh: $("elec_heating_kwh").value ? Number($("elec_heating_kwh").value) : null,
      elec_pump_kwh: $("elec_pump_kwh").value ? Number($("elec_pump_kwh").value) : null,
      full_load_minutes,
      buffer_charges: $("buffer_charges").value ? Number($("buffer_charges").value) : null,
      chips_kg_since_ash: $("chips_kg_since_ash").value ? Number($("chips_kg_since_ash").value) : null,
      hk_house: $("hk_house").checked,
      hk_rosi: $("hk_rosi").checked,
      fbh_rosi: $("fbh_rosi").checked,
      note: $("note").value ? String($("note").value) : null,
    };

    await upsertDaily(payload);
    $("todayMsg").textContent = "Gespeichert ✅";
  }

  async function loadMonthList(monthStr){
    const rows = await fetchDailyMonth(monthStr);
    const s = loadSettings();
    $("monthInfo").textContent = `${rows.length} Einträge gefunden.`;
    const list = $("entryList");
    list.innerHTML = "";
    rows.slice().reverse().forEach(r => {
      const right = document.createElement("div");
      right.innerHTML = `<strong>${r.day}</strong><small>${r.time_hhmm || ""} ${r.note || ""}</small>`;

      const left = document.createElement("div");
      const heat = (r.heat_total_kwh==null) ? "—" : fmt1(r.heat_total_kwh);
      const rosi = (r.heat_rosi_kwh==null) ? "—" : fmt1(r.heat_rosi_kwh);
      left.innerHTML = `<strong>Wärme</strong><small>Ges: ${heat} | ${s.rosiName}: ${rosi}</small>`;

      const it = document.createElement("div");
      it.className = "item";
      it.appendChild(left);
      it.appendChild(right);
      it.addEventListener("click", async () => {
        $("day").value = r.day;
        await loadDayToForm(r.day);
        showTab("heute");
      });
      list.appendChild(it);
    });
  }

  async function loadChippingList(monthStr){
    const {start, end} = monthStartEnd(monthStr);
    const rows = await fetchChippingRange(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0,0,0).toISOString(),
                                         new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23,59,59).toISOString());
    const list = $("chipList");
    list.innerHTML = "";
    rows.forEach(r => {
      const it = document.createElement("div");
      it.className = "item";
      const ts = new Date(r.ts);
      it.innerHTML = `
        <div>
          <strong>${ts.toLocaleString()}</strong>
          <small>${fmt1(r.ster_rm)} Ster · ${r.who || "—"} ${r.note ? "· "+r.note : ""}</small>
        </div>
        <div style="text-align:right">
          <strong>${r.cost_eur==null ? "—" : fmt2(r.cost_eur)+" €"}</strong>
        </div>
      `;
      list.appendChild(it);
    });
    if(rows.length===0){
      list.innerHTML = `<div class="muted">Keine Häcksel-Events in diesem Monat.</div>`;
    }
  }

  async function exportJson(){
    const uid = userId();
    const tables = ["daily_readings","ash_events","chipping_events","heat_price_heating_year"];
    const out = { exportedAt: new Date().toISOString(), user: session.user.email, user_id: uid, tables:{} };
    for(const t of tables){
      const { data, error } = await supabase.from(t).select("*").eq("user_id", uid);
      if(error) throw error;
      out.tables[t] = data || [];
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `heizlog-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- Wiring ----------
  async function init(){
    applySettings();
    setTodayDefaults();

    window.addEventListener("online", renderAuthState);
    window.addEventListener("offline", renderAuthState);

    $("btnLogout").addEventListener("click", logout);

    $("btnLogin").addEventListener("click", async () => {
      $("authMsg").textContent = "";
      try{
        await login($("authEmail").value.trim(), $("authPass").value);
      }catch(e){
        $("authMsg").textContent = e.message || String(e);
      }
    });

    $("btnSignup").addEventListener("click", async () => {
      $("authMsg").textContent = "";
      try{
        await signup($("authEmail").value.trim(), $("authPass").value);
      }catch(e){
        $("authMsg").textContent = e.message || String(e);
      }
    });

    $("btnSaveToday").addEventListener("click", async () => {
      $("todayMsg").textContent = "";
      try{ await saveToday(); }catch(e){ $("todayMsg").textContent = e.message || String(e); }
    });

    $("btnLoadToday").addEventListener("click", async () => {
      $("todayMsg").textContent = "";
      try{ await loadDayToForm($("day").value); }catch(e){ $("todayMsg").textContent = e.message || String(e); }
    });

    $("btnAsh").addEventListener("click", async () => {
      const note = prompt("Notiz (optional), z.B. 'Asche geleert'");
      try{
        await addAshEvent(note || null);
        $("todayMsg").textContent = "Asche-Event gespeichert ✅";
      }catch(e){
        $("todayMsg").textContent = e.message || String(e);
      }
    });

    $("btnLoadMonth").addEventListener("click", async () => {
      try{ await loadMonthList($("monthPick").value); }catch(e){ $("monthInfo").textContent = e.message || String(e); }
    });

    $("btnAnalyze").addEventListener("click", async () => {
      $("kpis").innerHTML = "";
      try{ await analyzeMonth($("anMonth").value); }catch(e){ $("kpis").innerHTML = `<div class="muted">${e.message || e}</div>`; }
    });

    $("btnCompare").addEventListener("click", async () => {
      try{ await compareYears($("yearA").value, $("yearB").value); }catch(e){ alert(e.message || e); }
    });

    $("btnSavePrice").addEventListener("click", async () => {
      $("costMsg").textContent = "";
      try{
        const d = $("hyStart").value;
        const ct = $("ctPerKwh").value;
        if(!d) throw new Error("Bitte Heizjahr-Startdatum wählen (04.09.YYYY).");
        if(!ct) throw new Error("Bitte ct/kWh eintragen.");
        await saveHeatPrice(d, ct);
        $("costMsg").textContent = "Preis gespeichert ✅";
      }catch(e){
        $("costMsg").textContent = e.message || String(e);
      }
    });

    $("btnCalcHY").addEventListener("click", async () => {
      try{ await calcHeizjahr($("hyPick").value); }catch(e){ $("hyKpis").innerHTML = `<div class="muted">${e.message || e}</div>`; }
    });

    $("btnAddChipping").addEventListener("click", async () => {
      try{
        const ts = $("chipTs").value ? new Date($("chipTs").value).toISOString() : new Date().toISOString();
        const ster = $("chipSter").value ? Number($("chipSter").value) : null;
        if(ster==null) throw new Error("Bitte Menge (Ster) eintragen.");
        const cost = $("chipCost").value ? Number($("chipCost").value) : null;
        const who = $("chipWho").value ? String($("chipWho").value) : null;
        const note = $("chipNote").value ? String($("chipNote").value) : null;
        await addChippingEvent({ ts, ster_rm: ster, cost_eur: cost, who, note });
        $("chipNote").value = "";
        $("chipSter").value = "";
        $("chipCost").value = "";
        $("chipWho").value = "";
        $("chipTs").value = "";
        await loadChippingList($("chipMonth").value);
      }catch(e){ alert(e.message || e); }
    });

    $("btnLoadChipping").addEventListener("click", async () => {
      try{ await loadChippingList($("chipMonth").value); }catch(e){ $("chipList").innerHTML = `<div class="muted">${e.message || e}</div>`; }
    });

    $("btnSaveSettings").addEventListener("click", async () => {
      const s = loadSettings();
      s.houseName = $("nameHouse").value.trim() || "Haus";
      s.rosiName = $("nameRosi").value.trim() || "Gebäude 2";
      s.accent = $("accent").value;
      saveSettings(s);
      applySettings();
      $("settingsMsg").textContent = "Gespeichert ✅";
      setTimeout(()=> $("settingsMsg").textContent="", 1500);
    });

    $("btnExportJson").addEventListener("click", async () => {
      try{ await exportJson(); }catch(e){ alert(e.message || e); }
    });

    // Supabase auth listener
    supabase.auth.onAuthStateChange((_event, _session) => {
      session = _session;
      renderAuthState();
    });

    await refreshSession();
  }

  document.addEventListener("DOMContentLoaded", init);
})();