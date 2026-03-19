import { useState, useMemo, useEffect, useContext, createContext, useRef } from "react";

const DAYS_HE = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const DAYS_FULL_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const UNIT_TYPES = ["עמוד","פרק","סימן","דף","נושא","שיעור","פסקה","חלק"];

// Parses "YYYY-MM-DD" as local time to avoid timezone bugs
function parseDateKey(k) {
  const [y, mo, d] = k.split("-").map(Number);
  return new Date(y, mo - 1, d);
}
function dateKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function daysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
function uid() { return Math.random().toString(36).slice(2,9); }
function todayKey() { return dateKey(new Date()); }

function isValidPlan(p) {
  return p && typeof p === "object" &&
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.totalUnits === "number" &&
    Array.isArray(p.restDays);
}

function buildSchedule(plan) {
  const { totalUnits, startDate, endDate, restDays, specificRestDates = [] } = plan;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!totalUnits || start > end) return {};
  const specificSet = new Set(specificRestDates);
  let studyCount = 0;
  let cur = new Date(start);
  while (cur <= end) {
    const k = dateKey(cur);
    if (!restDays.includes(cur.getDay()) && !specificSet.has(k)) studyCount++;
    cur = addDays(cur, 1);
  }
  const perDay = Math.ceil(totalUnits / Math.max(1, studyCount));
  const schedule = {};
  let unit = 1;
  cur = new Date(start);
  while (cur <= end) {
    const k = dateKey(cur);
    const isRest = restDays.includes(cur.getDay()) || specificSet.has(k);
    if (!isRest) {
      const chunk = Math.min(perDay, Math.max(1, totalUnits - unit + 1));
      schedule[k] = { from: unit, to: Math.min(unit + chunk - 1, totalUnits), rest: false };
      unit += chunk;
    } else {
      const nearUnit = Math.min(unit, totalUnits);
      schedule[k] = { from: nearUnit, to: nearUnit, rest: true };
    }
    cur = addDays(cur, 1);
  }
  return schedule;
}

function formatRange(plan, from, to) {
  const u = plan.unitLabel || "עמוד";
  return from === to ? `${u} ${from}` : `${u} ${from}–${to}`;
}

const QUOTES = [
  "העיקר הוא ההתמדה, לא ההספק.",
  "כל יום לימוד הוא נצחון קטן.",
  "מעט בקביעות — עדיף על הרבה לעיתים.",
  "התמדה היא סוד ההצלחה.",
  "לימוד יום אחד — בנין לעולם.",
  "גדולים מעשים קטנים שנעשים בקביעות.",
  "טיפה אחר טיפה ממלאת את הים.",
];

function getDailyQuote() {
  const day = new Date().getDay() + new Date().getDate();
  return QUOTES[day % QUOTES.length];
}

function calcStreak(plan) {
  const schedule = buildSchedule(plan);
  const sorted = Object.keys(schedule).sort().reverse();
  const today = dateKey(new Date());
  let streak = 0;
  for (const k of sorted) {
    if (k > today) continue;
    const done = plan.completedDates?.[k] === true || plan.restDonesDates?.[k] === true;
    if (done) streak++;
    else break;
  }
  return streak;
}

function usePlans() {
  const [plans, setPlans] = useState(() => {
    try {
      const saved = localStorage.getItem("hmPlans");
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidPlan);
    } catch { return []; }
  });
  const save = (p) => {
    try { localStorage.setItem("hmPlans", JSON.stringify(p)); } catch {}
    setPlans(p);
  };
  return [plans, save];
}

// Dark mode context
const DarkCtx = createContext({ dark: false, toggle: () => {} });
function useDark() { return useContext(DarkCtx); }

const A11yCtx = createContext({ fs: "normal", setFs:()=>{}, hc: false, setHc:()=>{}, rm: false, setRm:()=>{} });
function useA11y() { return useContext(A11yCtx); }

export default function App() {
  const [plans, setPlans] = usePlans();
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("hmDark");
      if (saved !== null) return saved === "1";
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
    } catch { return false; }
  });
  const toggleDark = () => setDark(d => {
    const next = !d;
    try { localStorage.setItem("hmDark", next ? "1" : "0"); } catch {}
    return next;
  });
  const [fs, setFsRaw] = useState(() => { try { return localStorage.getItem("hmFs") || "normal"; } catch { return "normal"; } });
  const [hc, setHcRaw] = useState(() => { try { return localStorage.getItem("hmHc") === "1"; } catch { return false; } });
  const [rm, setRmRaw] = useState(() => { try { return localStorage.getItem("hmRm") === "1"; } catch { return false; } });
  const setFs = v => { setFsRaw(v); try { localStorage.setItem("hmFs", v); } catch {} };
  const setHc = v => { setHcRaw(v); try { localStorage.setItem("hmHc", v?"1":"0"); } catch {} };
  const setRm = v => { setRmRaw(v); try { localStorage.setItem("hmRm", v?"1":"0"); } catch {} };
  const [activePlanId, setActivePlanId] = useState(plans[0]?.id);
  const [screen, setScreen] = useState("plans");
  const [editingPlan, setEditingPlan] = useState(null);
  const [showIntro, setShowIntro] = useState(() => {
    try { return !localStorage.getItem("hmIntroSeen"); } catch { return true; }
  });
  const activePlan = plans.find(p => p.id === activePlanId) || plans[0];
  const updatePlan = (updated) => setPlans(plans.map(p => p.id === updated.id ? updated : p));
  const deletePlan = (id) => {
    const rest = plans.filter(p => p.id !== id);
    setPlans(rest);
    if (activePlanId === id) setActivePlanId(rest[0]?.id);
    setScreen("plans");
  };
  const createPlan = (plan) => {
    const np = { ...plan, id: uid(), completedUnits: 0, completedDates: {}, restDonesDates: {}, color: "#25D366" };
    const updated = [...plans, np];
    setPlans(updated);
    setActivePlanId(np.id);
    setScreen("calendar");
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-dark", dark ? "true" : "false");
    document.documentElement.setAttribute("data-fs", fs);
    document.documentElement.setAttribute("data-hc", hc ? "true" : "false");
    document.documentElement.setAttribute("data-rm", rm ? "true" : "false");
  }, [dark, fs, hc, rm]);

  const a11yValue = { fs, setFs, hc, setHc, rm, setRm };

  if (showIntro) return (
    <DarkCtx.Provider value={{ dark, toggle: toggleDark }}>
      <A11yCtx.Provider value={a11yValue}>
        <div style={S.root}>
          <style>{CSS}</style>
          <IntroScreen onDone={() => {
            try { localStorage.setItem("hmIntroSeen","1"); } catch {}
            setShowIntro(false);
          }}/>
        </div>
      </A11yCtx.Provider>
    </DarkCtx.Provider>
  );

  return (
    <DarkCtx.Provider value={{ dark, toggle: toggleDark }}>
      <A11yCtx.Provider value={a11yValue}>
        <div style={S.root}>
          <style>{CSS}</style>
          {screen === "plans" && (
            <PlansScreen plans={plans} activePlanId={activePlanId}
              onSelect={id => { setActivePlanId(id); setScreen("calendar"); }}
              onNew={() => { setEditingPlan(null); setScreen("create"); }}
              onDelete={deletePlan} />
          )}
          {screen === "create" && (
            <CreateScreen initial={editingPlan}
              onSave={editingPlan ? p => { updatePlan(p); setScreen("calendar"); } : createPlan}
              onBack={() => setScreen(editingPlan ? "calendar" : "plans")}
              onDelete={editingPlan ? (id) => { deletePlan(id); setScreen("plans"); } : null} />
          )}
          {(screen === "calendar" || screen === "progress") && activePlan && (
            <PlanShell plan={activePlan} screen={screen} setScreen={setScreen}
              onUpdate={updatePlan}
              onEditPlan={() => { setEditingPlan(activePlan); setScreen("create"); }} />
          )}
        </div>
      </A11yCtx.Provider>
    </DarkCtx.Provider>
  );
}

function DarkToggleBtn() {
  const { dark, toggle } = useDark();
  return (
    <button style={S.darkToggle} onClick={toggle}
      aria-label={dark ? "עבור למצב בהיר" : "עבור למצב כהה"}>
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

function A11yBtn() {
  const [open, setOpen] = useState(false);
  const { fs, setFs, hc, setHc, rm, setRm } = useA11y();
  const fsLabels = [["normal","א"],["lg","א+"],["xl","א++"],["xxl","א+++"]];
  return (
    <>
      <button style={S.darkToggle} onClick={() => setOpen(v => !v)}
        aria-label="הגדרות נגישות" aria-expanded={open}>
        ♿
      </button>
      {open && (
        <div style={S.a11yOverlay} onClick={() => setOpen(false)}
          role="dialog" aria-modal="true" aria-labelledby="a11y-title">
          <div style={S.a11yPanel} onClick={e => e.stopPropagation()}>
            <div id="a11y-title" style={S.a11yTitle}>הגדרות נגישות ♿</div>

            <div style={S.a11ySection}>
              <div style={S.a11ySectionTitle}>גודל טקסט</div>
              <div style={S.a11yFsRow} role="group" aria-label="גודל טקסט">
                {fsLabels.map(([v, label]) => (
                  <button key={v}
                    style={{...S.a11yFsBtn,...(fs===v?S.a11yFsBtnActive:{})}}
                    onClick={() => setFs(v)}
                    aria-pressed={fs===v}
                    aria-label={`גודל ${label}`}>{label}</button>
                ))}
              </div>
            </div>

            <div style={S.a11ySection}>
              <div style={S.a11ySectionTitle}>תצוגה</div>
              <div style={S.a11yToggleRow}>
                <span style={S.a11yToggleLbl}>ניגודיות גבוהה</span>
                <button style={{...S.a11ySwitch,...(hc?S.a11ySwitchOn:{})}}
                  onClick={() => setHc(!hc)} role="switch" aria-checked={hc}
                  aria-label="ניגודיות גבוהה">
                  <div style={{...S.a11yThumb,...(hc?S.a11yThumbOn:{})}}/>
                </button>
              </div>
              <div style={S.a11yToggleRow}>
                <span style={S.a11yToggleLbl}>הפחתת תנועה</span>
                <button style={{...S.a11ySwitch,...(rm?S.a11ySwitchOn:{})}}
                  onClick={() => setRm(!rm)} role="switch" aria-checked={rm}
                  aria-label="הפחתת תנועה">
                  <div style={{...S.a11yThumb,...(rm?S.a11yThumbOn:{})}}/>
                </button>
              </div>
            </div>

            <button style={S.a11yClose} onClick={() => setOpen(false)}>סגור ✕</button>
          </div>
        </div>
      )}
    </>
  );
}

// Renders both control buttons side by side
function ControlBtns() {
  return (
    <div style={{display:"flex",gap:4,alignItems:"center"}}>
      <DarkToggleBtn/>
      <A11yBtn/>
    </div>
  );
}

function IntroScreen({ onDone }) {
  return (
    <div style={S.introWrap}>
      <div style={S.introCard}>
        <div style={{position:"absolute",top:12,left:12}}>
          <ControlBtns/>
        </div>
        <div style={S.introEmoji}>💡</div>
        <div style={S.introTitle}>טיפים לשימוש נכון</div>
        <div style={S.introText}>
          אם אתה רק מתחיל לבנות את סדר הלימוד שלך, ואין לך אחד כזה קבוע —
          מומלץ להתחיל בקצת ולא להעמיס הרבה.
        </div>
        <div style={S.introText}>
          תחושת ההצלחה תעזור לך לרצות להמשיך.
        </div>
        <div style={{...S.introText, fontWeight:800, color:"var(--gd)", marginTop:8}}>
          העיקר הוא ההתמדה, לא ההספק. 📖
        </div>
        <button style={S.introBtn} onClick={onDone}>בואו נתחיל ←</button>
      </div>
    </div>
  );
}

function PlansScreen({ plans, activePlanId, onSelect, onNew, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);
  const confirmPlan = plans.find(p => p.id === confirmId);
  return (
    <div style={S.screen}>
      <div style={S.splashHeader}>
        <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.12)"}}>
          <div style={{display:"flex",gap:4,background:"rgba(255,255,255,0.12)",borderRadius:12,padding:"4px 6px",backdropFilter:"blur(8px)"}}>
            <ControlBtns/>
          </div>
        </div>
        <div style={S.appLogoWrap}>
          <img src="data:image/png;base64,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" alt="לוגו" style={{width:"100%", maxWidth:340, height:"auto", objectFit:"contain"}}/>
        </div>
        <div style={S.appTitle}>המתמידים</div>
        <div style={S.appSub}>ניהול סדר הלימוד שלך</div>
      </div>
      <div style={S.appQuoteWrap}>
        <span style={S.appQuoteBubble}>{getDailyQuote()}</span>
      </div>
      <div style={S.scrollArea}>
        {plans.length === 0 && (
          <div style={S.emptyWrap}>
            <div style={S.emptyIcon}>🧑‍🎓</div>
            <div style={S.emptyTitle}>אין עדיין תוכניות</div>
            <div style={S.emptyDesc}>צור את תוכנית הלימוד הראשונה שלך</div>
          </div>
        )}
        {plans.map((plan, idx) => {
          const pct = Math.round(((plan.completedUnits||0) / plan.totalUnits) * 100);
          const endD = new Date(plan.endDate);
          const now = new Date();
          const daysLeft = Math.ceil((endD - now) / (1000*60*60*24));
          const endLabel = daysLeft < 0 ? "עבר המועד" : daysLeft === 0 ? "היום!" : daysLeft <= 7 ? `${daysLeft} ימים נותרו` : plan.endDate;
          const endColor = daysLeft < 0 ? "#e74c3c" : daysLeft <= 7 ? "#f0a500" : "var(--txs)";
          return (
            <div key={plan.id}
              style={{ ...S.planCard, animationDelay: `${Math.min(idx,10)*0.06}s` }}
              className="card-in"
              role="button"
              tabIndex={0}
              aria-label={`בחר תוכנית ${plan.name}`}
              onClick={() => onSelect(plan.id)}
              onKeyDown={e => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); onSelect(plan.id); }}}>
              <div style={S.planCardRow}>
                <div style={S.planIcon} aria-hidden="true">📚</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={S.planName}>{plan.name}</div>
                  <div style={S.planMeta}>
                    <span style={{color:endColor, fontWeight: daysLeft<=7?"800":"400"}}>📅 {endLabel}</span>
                    {(() => { const s = calcStreak(plan); return s > 1 ? <span style={{color:"#f0a500",fontWeight:800}}>🔥 {s} ימים ברצף</span> : null; })()}
                  </div>
                </div>
                <div style={S.pctBadge} aria-label={`${pct}% הושלם`}>{pct}%</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
                <div style={{flex:1}}>
                  <ProgressBar pct={pct} />
                </div>
                <button style={S.cardDeleteIcon}
                  onClick={e => { e.stopPropagation(); setConfirmId(plan.id); }}
                  aria-label={`מחק תוכנית ${plan.name}`}>🗑</button>
              </div>
            </div>
          );
        })}
        <div style={{height:100}}/>
      </div>
      <button style={S.fab} onClick={onNew} className="fab-pulse" aria-label="יצירת תוכנית חדשה">+ תוכנית חדשה</button>
      {confirmId && (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-labelledby="dlg-title"
          onClick={() => setConfirmId(null)}>
          <div style={S.dialog} onClick={e => e.stopPropagation()}>
            <div style={S.dialogIcon} aria-hidden="true">🗑</div>
            <div id="dlg-title" style={S.dialogTitle}>מחיקת תוכנית</div>
            <div style={S.dialogMsg}>האם למחוק את תוכנית<br/><strong>"{confirmPlan?.name}"</strong>?<br/><span style={{fontSize:12,color:"var(--txs)"}}>פעולה זו אינה ניתנת לביטול</span></div>
            <div style={S.dialogBtns}>
              <button style={S.dialogCancel} onClick={() => setConfirmId(null)}>ביטול</button>
              <button style={S.dialogConfirm} onClick={() => { onDelete(confirmId); setConfirmId(null); }}>מחק</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateScreen({ initial, onSave, onBack, onDelete }) {
  const td = dateKey(new Date());
  const [form, setForm] = useState(initial || {
    name:"", subject:"", totalUnits:30, unitLabel:"עמוד",
    startDate:td, endDate:dateKey(addDays(new Date(),40)), restDays:[], specificRestDates:[],
  });
  const [daysMode, setDaysMode] = useState(false);
  const [daysCount, setDaysCount] = useState(40);
  // paceMode: user picks study days + pages/day → auto-calc end date
  const [paceMode, setPaceMode] = useState(false);
  const [pacePerDay, setPacePerDay] = useState(2);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const toggleRest = (d) => set("restDays", form.restDays.includes(d) ? form.restDays.filter(x=>x!==d) : [...form.restDays,d]);

  // When daysMode: auto-calc end date from daysCount
  useEffect(() => {
    if (daysMode && form.startDate && daysCount > 0) {
      set("endDate", dateKey(addDays(new Date(form.startDate), daysCount)));
    }
  }, [daysMode, daysCount, form.startDate]); // eslint-disable-line

  // When paceMode: calc studyDays needed, then find end date
  useEffect(() => {
    if (!paceMode || !form.startDate || pacePerDay <= 0 || form.totalUnits <= 0) return;
    const studyDaysNeeded = Math.ceil(form.totalUnits / pacePerDay);
    const studyDOW = DAYS_FULL_HE.map((_,i) => i).filter(i => !form.restDays.includes(i));
    if (studyDOW.length === 0) return;
    let cur = new Date(form.startDate);
    let counted = 0;
    for (let i = 0; i < 3650; i++) {
      if (studyDOW.includes(cur.getDay())) counted++;
      if (counted >= studyDaysNeeded) { set("endDate", dateKey(cur)); return; }
      cur = addDays(cur, 1);
    }
  }, [paceMode, pacePerDay, form.totalUnits, form.startDate, form.restDays]); // eslint-disable-line

  const preview = useMemo(()=>buildSchedule({...form,completedUnits:0}),[form]);
  const studyDays = Object.keys(preview).filter(k=>!preview[k].rest).length;
  const perDay = studyDays>0 ? Math.ceil(form.totalUnits/studyDays) : 0;
  const datesValid = !form.startDate || !form.endDate || form.startDate < form.endDate;
  const valid = form.name && form.totalUnits>0 && form.startDate && form.endDate && datesValid;
  return (
    <div style={S.screen}>
      <TopBar title={initial?"עריכת תוכנית":"יצירת תוכנית חדשה"} onBack={onBack}
        rightEl={<ControlBtns/>}/>
      <div style={S.scrollArea}>
        <Sec title="פרטי התוכנית">
          <Fld label="שם התוכנית">
            <input style={S.inp} value={form.name} onChange={e=>set("name",e.target.value)}
              placeholder="למשל: לימוד משנה" aria-label="שם התוכנית"/>
          </Fld>
        </Sec>
        <Sec title="מספר הדפים">
          <Fld label="סה״כ דפים">
            <input style={S.inp} type="number" min={1} value={form.totalUnits}
              onChange={e=>set("totalUnits",Number(e.target.value))} aria-label="מספר יחידות"/>
          </Fld>
        </Sec>
        <Sec title="לוח זמנים">
          <Fld label="תאריך התחלה">
            <input style={S.inp} type="date" value={form.startDate}
              onChange={e=>set("startDate",e.target.value)} aria-label="תאריך התחלה"/>
          </Fld>
          {/* Toggle: end date vs days count */}
          <div style={S.daysModeRow}>
            <button style={{...S.daysModeBtn,...(!daysMode&&!paceMode?S.daysModeBtnActive:{})}}
              onClick={()=>{setDaysMode(false);setPaceMode(false);}} aria-pressed={!daysMode&&!paceMode}>
              תאריך סיום
            </button>
            <button style={{...S.daysModeBtn,...(daysMode?S.daysModeBtnActive:{})}}
              onClick={()=>{setDaysMode(true);setPaceMode(false);}} aria-pressed={daysMode}>
              כמה ימים?
            </button>
            <button style={{...S.daysModeBtn,...(paceMode?S.daysModeBtnActive:{})}}
              onClick={()=>{setPaceMode(true);setDaysMode(false);}} aria-pressed={paceMode}>
              לפי קצב
            </button>
          </div>
          {paceMode ? (
            <Fld label="כמה דפים אתה לומד ביום לימוד?">
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input style={{...S.inp, flex:1}} type="number" min={1} value={pacePerDay}
                  onChange={e=>setPacePerDay(Math.max(1,Number(e.target.value)))}
                  aria-label="דפים ביום"/>
                {form.endDate && <span style={{fontSize:12,color:"var(--gd)",fontWeight:700,whiteSpace:"nowrap"}}>
                  עד {form.endDate}
                </span>}
              </div>
              <div style={{fontSize:11,color:"var(--txs)",marginTop:6}}>
                הסיום מחושב לפי ימי הלימוד שתבחר למטה
              </div>
            </Fld>
          ) : daysMode ? (
            <Fld label="בכמה ימים אתה רוצה לסיים?">
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input style={{...S.inp, flex:1}} type="number" min={1} value={daysCount}
                  onChange={e=>setDaysCount(Math.max(1,Number(e.target.value)))}
                  aria-label="מספר ימים לסיום"/>
                {form.endDate && <span style={{fontSize:12,color:"var(--gd)",fontWeight:700,whiteSpace:"nowrap"}}>
                  עד {form.endDate}
                </span>}
              </div>
            </Fld>
          ) : (
            <Fld label="תאריך סיום מטרה">
              <input style={S.inp} type="date" value={form.endDate}
                onChange={e=>set("endDate",e.target.value)} aria-label="תאריך סיום"/>
            </Fld>
          )}
          {!datesValid && (
            <div style={{color:"var(--red)",fontSize:12,marginTop:4,fontWeight:600}}>
              תאריך הסיום חייב להיות אחרי תאריך ההתחלה
            </div>
          )}
        </Sec>
        <Sec title="ימי מנוחה קבועים בשבוע">
          <div style={S.restHint}>בחר אילו ימים בשבוע הם תמיד ימי מנוחה (יחולו על כל השבועות)</div>
          <div style={S.daysRow} role="group" aria-label="ימי מנוחה">
            {DAYS_FULL_HE.map((d,i)=>(
              <button key={i}
                style={{...S.dayChip,...(form.restDays.includes(i)?S.dayChipRestOn:{})}}
                onClick={()=>toggleRest(i)}
                aria-pressed={form.restDays.includes(i)}
                aria-label={`${d} — יום מנוחה`}>{d}</button>
            ))}
          </div>
        </Sec>
        {studyDays>0 && (
          <div style={S.previewCard} aria-live="polite">
            <div style={S.previewTitle}>תצוגה מקדימה</div>
            <div style={S.previewGrid}>
              <PreviewStat label="ימי לימוד" val={studyDays}/>
              <PreviewStat label="יחידות ליום" val={`~${perDay}`}/>
              <PreviewStat label="סה״כ יחידות" val={form.totalUnits}/>
            </div>
          </div>
        )}
        <button style={{...S.mainBtn, opacity:valid?1:0.45}} disabled={!valid}
          onClick={()=>onSave(form)} aria-disabled={!valid}>
          {initial?"שמור שינויים":"צור תוכנית לימוד"}
        </button>
        {initial && onDelete && (
          <button style={S.deleteFullBtn} onClick={() => setConfirmDelete(true)}
            aria-label="מחק תוכנית זו">🗑 מחק תוכנית זו</button>
        )}
        <div style={{height:80}}/>
      </div>
      {valid && (
        <button style={S.doneFab} onClick={()=>onSave(form)} aria-label="בוצע, שמור תוכנית">✓</button>
      )}
      {confirmDelete && (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-labelledby="dlg2-title"
          onClick={() => setConfirmDelete(false)}>
          <div style={S.dialog} onClick={e => e.stopPropagation()}>
            <div style={S.dialogIcon} aria-hidden="true">🗑</div>
            <div id="dlg2-title" style={S.dialogTitle}>מחיקת תוכנית</div>
            <div style={S.dialogMsg}>האם למחוק את תוכנית<br/><strong>"{form.name}"</strong>?<br/><span style={{fontSize:12,color:"var(--txs)"}}>פעולה זו אינה ניתנת לביטול</span></div>
            <div style={S.dialogBtns}>
              <button style={S.dialogCancel} onClick={() => setConfirmDelete(false)}>ביטול</button>
              <button style={S.dialogConfirm} onClick={() => onDelete(initial.id)}>מחק</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanShell({ plan, screen, setScreen, onUpdate, onEditPlan }) {
  const [showRestPanel, setShowRestPanel] = useState(false);
  const [rDay, setRDay] = useState("");
  const [rMonth, setRMonth] = useState("");
  const [rYear, setRYear] = useState(String(new Date().getFullYear()));

  const addSpecificRest = () => {
    const dayNum = parseInt(rDay), monthNum = parseInt(rMonth), yearNum = parseInt(rYear);
    if (!dayNum || !monthNum || !yearNum) return;
    if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return;
    // Validate date is real (e.g. not Feb 30)
    const testDate = new Date(yearNum, monthNum - 1, dayNum);
    if (testDate.getDate() !== dayNum || testDate.getMonth() !== monthNum - 1) return;
    const dateStr = `${yearNum}-${String(monthNum).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
    const dates = plan.specificRestDates || [];
    if (!dates.includes(dateStr)) onUpdate({ ...plan, specificRestDates: [...dates, dateStr].sort() });
    setRDay(""); setRMonth(""); setRYear(String(new Date().getFullYear()));
  };
  const removeSpecificRest = (date) => onUpdate({ ...plan, specificRestDates: (plan.specificRestDates||[]).filter(d=>d!==date) });

  const formatDateHe = (dateStr) => {
    const [y,m,d] = dateStr.split("-");
    const monthIdx = parseInt(m) - 1;
    const monthName = monthIdx >= 0 && monthIdx < 12 ? MONTHS_HE[monthIdx] : "";
    return `${parseInt(d)} ב${monthName} ${y}`;
  };

  const count = (plan.specificRestDates||[]).length;

  return (
    <div style={S.screen}>
      <TopBar title={plan.name} onBack={()=>setScreen("plans")}
        rightEl={
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <ControlBtns/>
            <button style={S.editBtn} onClick={onEditPlan} aria-label="עריכת תוכנית">עריכה</button>
          </div>
        }/>
      <div style={S.tabs} role="tablist" aria-label="תצוגות">
        {[["calendar","לוח שנה"],["progress","התקדמות"]].map(([s,l])=>(
          <button key={s} role="tab" aria-selected={screen===s}
            style={{...S.tab,...(screen===s?S.tabActive:{})}}
            onClick={()=>setScreen(s)}>{l}</button>
        ))}
      </div>

      <div style={S.restToggleBar}
        role="button" aria-expanded={showRestPanel} tabIndex={0}
        aria-label="ימי מנוחה ספציפיים"
        onClick={()=>setShowRestPanel(v=>!v)}
        onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setShowRestPanel(v=>!v); }}}>
        <div style={S.restToggleLeft}>
          <span style={S.restToggleIcon} aria-hidden="true">🚫</span>
          <span style={S.restToggleLabel}>ימי מנוחה ספציפיים</span>
          {count > 0 && <span style={S.restToggleBadge} aria-label={`${count} ימי מנוחה`}>{count}</span>}
        </div>
        <span style={{...S.restToggleArrow, transform: showRestPanel ? "rotate(180deg)" : "rotate(0deg)"}} aria-hidden="true">▾</span>
      </div>

      {showRestPanel && (
        <div style={S.restPanel} role="region" aria-label="הוספת ימי מנוחה ספציפיים">
          <div style={S.restPanelHint}>חגים, חופשות, אירועים — תאריכים חד-פעמיים</div>
          <div style={S.datePickerRow}>
            <div style={S.datePickerField}>
              <label style={S.datePickerLbl} htmlFor="rDay">יום</label>
              <input id="rDay" style={S.datePickerInp} type="number" min={1} max={31} placeholder="יי"
                value={rDay} onChange={e=>setRDay(e.target.value)} maxLength={2} aria-label="יום"/>
            </div>
            <div style={S.datePickerField}>
              <label style={S.datePickerLbl} htmlFor="rMonth">חודש</label>
              <select id="rMonth" style={S.datePickerSel} value={rMonth}
                onChange={e=>setRMonth(e.target.value)} aria-label="חודש">
                <option value="">—</option>
                {MONTHS_HE.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div style={S.datePickerField}>
              <label style={S.datePickerLbl} htmlFor="rYear">שנה</label>
              <input id="rYear" style={{...S.datePickerInp, width:70}} type="number" placeholder="שנה"
                value={rYear} onChange={e=>setRYear(e.target.value)} aria-label="שנה"/>
            </div>
            <button style={S.specificRestAdd} onClick={addSpecificRest} aria-label="הוסף יום מנוחה">+ הוסף</button>
          </div>
          {count > 0 && (
            <div style={S.specificRestList} role="list" aria-label="ימי מנוחה שנבחרו">
              {plan.specificRestDates.map(date=>(
                <div key={date} style={S.specificRestChip} role="listitem">
                  <span style={S.specificRestChipTxt}>{formatDateHe(date)}</span>
                  <button style={S.specificRestRemove} onClick={()=>removeSpecificRest(date)}
                    aria-label={`הסר ${formatDateHe(date)}`}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {screen==="calendar" && <CalendarTab plan={plan} onUpdate={onUpdate}/>}
      {screen==="progress" && <ProgressTab plan={plan} onUpdate={onUpdate}/>}
    </div>
  );
}

function CalendarTab({ plan, onUpdate }) {
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth());
  const [tapped, setTapped] = useState(null);
  const [longPressed, setLongPressed] = useState(null);
  const tappedTimer = useRef(null);
  const schedule = useMemo(()=>buildSchedule(plan),[plan]);
  const tk = todayKey();
  const todayTask = schedule[tk];
  const firstDow = new Date(y,m,1).getDay();
  const days = daysInMonth(y,m);
  const cells = Array(firstDow).fill(null).concat(Array.from({length:days},(_,i)=>i+1));
  const key = (d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const isRest = (d) => { const k=key(d); return schedule[k]?.rest===true || plan.restDays.includes(new Date(y,m,d).getDay()); };
  const isDone = (d) => { const k=key(d); return plan.completedDates?.[k]===true || plan.restDonesDates?.[k]===true; };
  const isToday = (d) => d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
  const prevMonth = () => { if(m===0){setM(11);setY(y-1);}else setM(m-1); };
  const nextMonth = () => { if(m===11){setM(0);setY(y+1);}else setM(m+1); };
  const goToday = () => { setY(today.getFullYear()); setM(today.getMonth()); };
  const isCurrentMonth = y===today.getFullYear() && m===today.getMonth();

  useEffect(() => () => { if (tappedTimer.current) clearTimeout(tappedTimer.current); }, []);

  const toggleDay = (d) => {
    const k=key(d), rest=isRest(d), entry=schedule[k];
    if (tappedTimer.current) clearTimeout(tappedTimer.current);
    if (rest) {
      const wasRestDone = plan.restDonesDates?.[k]===true;
      const newRestDones = {...plan.restDonesDates,[k]:!wasRestDone};
      let maxTo=0;
      for(const [dk,dv] of Object.entries(schedule)) if(plan.completedDates?.[dk]===true||newRestDones[dk]===true) maxTo=Math.max(maxTo,dv.to);
      onUpdate({...plan,restDonesDates:newRestDones,completedUnits:maxTo});
      setTapped(k); tappedTimer.current = setTimeout(()=>setTapped(null),400); return;
    }
    if (!entry) return;
    const wasDone=plan.completedDates?.[k]===true;
    const newDates={...plan.completedDates,[k]:!wasDone};
    let maxTo=0;
    for(const [dk,dv] of Object.entries(schedule)) if(newDates[dk]===true||plan.restDonesDates?.[dk]===true) maxTo=Math.max(maxTo,dv.to);
    onUpdate({...plan,completedDates:newDates,completedUnits:maxTo});
    setTapped(k); tappedTimer.current = setTimeout(()=>setTapped(null),400);
  };
  const isRestDone = (d) => plan.restDonesDates?.[key(d)]===true;
  return (
    <div style={S.tabContent} role="tabpanel" aria-label="לוח שנה">
      <div style={todayTask?S.todayBanner:S.restBanner} aria-live="polite">
        {todayTask?<><span style={S.todayLabel}>היום: </span>{formatRange(plan,todayTask.from,todayTask.to)}</>:<span>יום מנוחה היום 🌿</span>}
      </div>
      <div style={S.calHint}>לחץ על יום לסימון כהושלם — גם על ימי מנוחה</div>
      <div style={S.monthRow}>
        <button style={S.navBtn} onClick={nextMonth} aria-label="חודש הבא">הבא ›</button>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <span style={S.monthLabel} aria-live="polite">{MONTHS_HE[m]} {y}</span>
          {!isCurrentMonth && <button style={S.todayNavBtn} onClick={goToday} aria-label="חזור להיום">← היום</button>}
        </div>
        <button style={S.navBtn} onClick={prevMonth} aria-label="חודש קודם">‹ הקודם</button>
      </div>
      <div style={S.calGrid} role="grid" aria-label={`לוח שנה ${MONTHS_HE[m]} ${y}`}>
        {DAYS_HE.map(d=><div key={d} style={S.calHead} role="columnheader" aria-label={DAYS_FULL_HE[DAYS_HE.indexOf(d)]}>{d}</div>)}
        {cells.map((d,i)=>{
          if(!d) return <div key={`empty-${y}-${m}-${i}`} role="gridcell"/>;
          const k=key(d),task=schedule[k],rest=isRest(d),done=isDone(d),today_=isToday(d);
          const restDone=rest&&isRestDone(d),isTapped=tapped===k,isLastDay=k===plan.endDate;
          const ariaLabel = `${d} ב${MONTHS_HE[m]}${done?" — הושלם":rest?" — מנוחה":task?` — ${formatRange(plan,task.from,task.to)}`:""}`;
          return (
            <div key={k}
              role="gridcell"
              tabIndex={0}
              aria-label={ariaLabel}
              aria-pressed={done}
              onClick={()=>toggleDay(d)}
              onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleDay(d); }}}
              style={{
                ...S.calCell,
                ...(rest&&!restDone?S.calRest:{}),
                ...(task&&!rest?S.calHasTask:{}),
                ...(done?S.calDone:{}),
                ...(restDone?S.calDone:{}),
                ...(isLastDay?S.calLastDay:{}),
                ...(today_?S.calToday:{}),
                cursor:"pointer",
                ...(isTapped?{transform:"scale(0.92)",transition:"transform 0.15s"}:{transition:"transform 0.15s"}),
              }}>
              <span style={{
                ...S.calDayNum,
                ...(rest&&!restDone?{color:"var(--red)"}:{}),
                ...(isLastDay&&!today_?{color:"#7a5c00",fontWeight:900}:{}),
                ...(today_?{color:"#fff",background:"#25D366",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center"}:{}),
                ...((done||restDone)&&!today_&&!isLastDay?{color:"#fff"}:{}),
                ...((done||restDone)&&isLastDay&&!today_?{color:"#7a5c00"}:{}),
              }} aria-hidden="true">{d}</span>
              {task&&!rest&&!isLastDay&&<span style={{...S.calTaskTxt,...(done?{color:"rgba(255,255,255,0.9)"}:{})}} aria-hidden="true">{done?"✓":""}</span>}
              {task&&!rest&&isLastDay&&<span style={S.calLastLabel} aria-hidden="true">{done?"✓ סוף":"סוף"}</span>}
              {rest&&<span style={{...S.restDot,...(restDone?{color:"rgba(255,255,255,0.9)"}:{})}} aria-hidden="true">{restDone?"✓ מנוחה":"מנוחה"}</span>}
            </div>
          );
        })}
      </div>
      <div style={S.legend} role="list" aria-label="מקרא">
        <LegItem bg="var(--gl)" label="לימוד"/>
        <LegItem bg="var(--red-bg)" border="1px solid var(--red-border)" label="מנוחה"/>
        <LegItem bg="#25D366" label="הושלם"/>
        <LegItem bg="#fff3b0" border="1px solid #f0c040" label="סוף"/>
        <LegItem bg="transparent" border="2px solid #25D366" label="היום"/>
      </div>
      {(()=>{
        const totalDays=Object.keys(schedule).length;
        const doneDays=Object.keys(schedule).filter(k=>plan.completedDates?.[k]===true||plan.restDonesDates?.[k]===true).length;
        const pct=totalDays>0?Math.round((doneDays/totalDays)*100):0;
        return (
          <div style={S.calSummary} aria-label={`${doneDays} ימים הושלמו מתוך ${totalDays}, ${pct}% הושלם`}>
            <div style={S.calSummaryItem}><span style={S.calSummaryVal}>{doneDays}</span><span style={S.calSummaryLbl}>ימים הושלמו</span></div>
            <div style={S.calSummaryDivider} aria-hidden="true"/>
            <div style={S.calSummaryItem}><span style={S.calSummaryVal}>{totalDays}</span><span style={S.calSummaryLbl}>סה״כ ימי לימוד</span></div>
            <div style={S.calSummaryDivider} aria-hidden="true"/>
            <div style={S.calSummaryItem}><span style={{...S.calSummaryVal,color:"#25D366"}}>{pct}%</span><span style={S.calSummaryLbl}>הושלם</span></div>
          </div>
        );
      })()}
      {longPressed&&<div style={S.longPressToast} role="status">{longPressed}</div>}
    </div>
  );
}

function ProgressTab({ plan, onUpdate }) {
  const { dark } = useDark();
  const schedule = useMemo(()=>buildSchedule(plan),[plan]);
  const tk = todayKey();
  const plannedDone = useMemo(()=>{ let max=0; for(const [k,v] of Object.entries(schedule)) if(k<=tk) max=v.to; return Math.min(max,plan.totalUnits); },[schedule,tk,plan]);
  const actual = useMemo(()=>{ let maxTo=0; for(const [dk,dv] of Object.entries(schedule)) if(plan.completedDates?.[dk]===true||plan.restDonesDates?.[dk]===true) maxTo=Math.max(maxTo,dv.to); return maxTo||plan.completedUnits||0; },[schedule,plan]);
  const total=plan.totalUnits;
  const pct=Math.min(Math.round((actual/total)*100),100);
  const status=actual>=plannedDone?(actual>plannedDone?"ahead":"ontrack"):"behind";
  const statusInfo={
    ahead:{txt:"מקדים את הלוח זמנים",color:dark?"#3dd68c":"#25D366",bg:dark?"#1a3327":"#d4f5e2"},
    ontrack:{txt:"בדיוק לפי התוכנית",color:"#4a90d9",bg:dark?"#1a2535":"#deeeff"},
    behind:{txt:"מאחר מהתוכנית",color:"#e05050",bg:dark?"#2a1515":"#fde8e8"}
  }[status];
  const setCompleted=(n)=>onUpdate({...plan,completedUnits:Math.max(0,Math.min(n,total))});
  const days=useMemo(()=>Object.entries(schedule).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>({k,from:v.from,to:v.to,done:plan.completedDates?.[k]===true||plan.restDonesDates?.[k]===true})),[schedule,plan]);

  // Fix: use parseDateKey to avoid timezone issues
  const toggleDate=(k,wasDone)=>{
    const dayDate = parseDateKey(k);
    const isRest=plan.restDays.includes(dayDate.getDay());
    let updatedPlan;
    if(isRest){const newRD={...plan.restDonesDates,[k]:!wasDone};let maxTo=0;for(const [dk,dv] of Object.entries(schedule))if(plan.completedDates?.[dk]===true||newRD[dk]===true)maxTo=Math.max(maxTo,dv.to);updatedPlan={...plan,restDonesDates:newRD,completedUnits:maxTo};}
    else{const newD={...plan.completedDates,[k]:!wasDone};let maxTo=0;for(const [dk,dv] of Object.entries(schedule))if(newD[dk]===true||plan.restDonesDates?.[dk]===true)maxTo=Math.max(maxTo,dv.to);updatedPlan={...plan,completedDates:newD,completedUnits:maxTo};}
    onUpdate(updatedPlan);
  };
  const [showFinish,setShowFinish]=useState(false);
  const handleFinish=()=>{
    const newDates={},newRD={};
    for(const [k,v] of Object.entries(schedule)){if(v.rest)newRD[k]=true;else newDates[k]=true;}
    onUpdate({...plan,completedDates:newDates,restDonesDates:newRD,completedUnits:total});
    setShowFinish(true);
  };
  if(showFinish) return(
    <div style={S.finishScreen} role="main" aria-label="סיום תוכנית">
      <div style={S.finishEmoji} aria-hidden="true">🎉</div>
      <div style={S.finishTitle}>כל הכבוד!</div>
      <div style={S.finishSub}>סיימת את כל התוכנית</div>
      <div style={S.finishPlanName}>"{plan.name}"</div>
      <button style={S.finishBtn} onClick={()=>setShowFinish(false)}>חזור לתוכנית</button>
    </div>
  );
  const streak = calcStreak(plan);

  return (
    <div style={S.tabContent} role="tabpanel" aria-label="התקדמות">
      <div style={{...S.statusBanner,background:statusInfo.bg,display:"flex",justifyContent:"space-between",alignItems:"center"}}
        aria-live="polite" aria-label={statusInfo.txt}>
        <span style={{...S.statusTxt,color:statusInfo.color}}>{statusInfo.txt}</span>
        {streak > 0 && <span style={{fontSize:13,fontWeight:800,color:"#f0a500"}} aria-label={`${streak} ימים ברצף`}>🔥 {streak} ברצף</span>}
      </div>

      <div style={S.bigPctWrap} aria-label={`${pct}% הושלם, ${actual} מתוך ${total} ${plan.unitLabel}ים`}>
        <div style={S.bigPct} aria-hidden="true">{pct}%</div>
        <div style={S.bigPctSub} aria-hidden="true">{actual} מתוך {total} {plan.unitLabel}ים</div>
        <ProgressBar pct={pct} height={14}/>
      </div>

      <div style={S.statsGrid} role="list" aria-label="סטטיסטיקות">
        <StatCard label="בוצע" val={actual} color="#25D366"/>
        <StatCard label="מתוכנן" val={plannedDone} color="#4a90d9"/>
        <StatCard label="נותר" val={Math.max(0,total-actual)} color="#f0a500"/>
      </div>

      <div style={{display:"flex",gap:10,marginTop:16,alignItems:"center"}}>
        <button style={{...S.finishPlanBtn,margin:0,flex:1}} onClick={handleFinish}
          aria-label="סמן את כל התוכנית כהושלמה">🏁 סיום</button>
        <div style={{...S.counterRow,padding:0,gap:10}} role="group" aria-label="עדכון ידני">
          <button style={S.counterBtn} onClick={()=>setCompleted(actual-1)} aria-label="הפחת יחידה">−</button>
          <span style={{...S.counterVal,minWidth:60,fontSize:14}} aria-label={`${actual} מתוך ${total}`}>{actual}/{total}</span>
          <button style={S.counterBtn} onClick={()=>setCompleted(actual+1)} aria-label="הוסף יחידה">+</button>
        </div>
      </div>

      <div style={{...S.secLabel,marginTop:20}}>רשימת יחידות</div>
      <div style={S.checkList} role="list" aria-label="רשימת ימי לימוד">
        {days.map(({k,from,to,done})=>(
          <div key={k}
            style={{...S.checkItem,...(done?S.checkItemDone:{})}}
            role="checkbox"
            aria-checked={done}
            tabIndex={0}
            aria-label={`${k} — ${formatRange(plan,from,to)}${done?" — הושלם":""}`}
            onClick={()=>toggleDate(k,done)}
            onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleDate(k,done); }}}>
            <div style={{...S.checkBox,...(done?S.checkBoxDone:{})}} aria-hidden="true">{done&&"✓"}</div>
            <div>
              <div style={S.checkDate}>{k}</div>
              <div style={S.checkTask}>{formatRange(plan,from,to)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{height:30}}/>
    </div>
  );
}

function TopBar({ title, onBack, rightEl }) {
  return (
    <header style={S.topBar}>
      {rightEl || <div style={{width:60}}/>}
      <span style={S.topBarTitle}>{title}</span>
      <button style={S.backBtn} onClick={onBack} aria-label="חזור">›</button>
    </header>
  );
}
function Sec({ title, children }) { return <div style={S.sec}><div style={S.secLabel}>{title}</div>{children}</div>; }
function Fld({ label, children }) { return <div style={S.fld}><label style={S.fldLbl}>{label}</label>{children}</div>; }
function ProgressBar({ pct, height=7 }) { return <div style={{...S.pbTrack,height}} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% הושלם`}><div style={{...S.pbFill,width:`${Math.min(pct,100)}%`}}/></div>; }
function StatCard({ label, val, color }) { return <div style={S.statCard} role="listitem" aria-label={`${label}: ${val}`}><div style={{...S.statVal,color}} aria-hidden="true">{val}</div><div style={S.statLbl} aria-hidden="true">{label}</div></div>; }
function LegItem({ bg, border, label }) { return <div style={S.legItem} role="listitem"><div style={{width:14,height:14,borderRadius:4,background:bg,border:border||"none",flexShrink:0}} aria-hidden="true"/><span>{label}</span></div>; }
function PreviewStat({ label, val }) { return <div style={S.prevStat}><div style={S.prevVal}>{val}</div><div style={S.prevLbl}>{label}</div></div>; }

const R=16,RS=10;

const S = {
  root:{fontFamily:"'Heebo','Assistant','Rubik',sans-serif",background:"var(--bg)",minHeight:"100vh",maxWidth:480,margin:"0 auto",direction:"rtl",position:"relative"},
  screen:{display:"flex",flexDirection:"column",minHeight:"100vh",background:"var(--bg)"},
  scrollArea:{flex:1,overflowY:"auto",padding:"0 16px 20px"},
  tabContent:{flex:1,overflowY:"auto",padding:"0 16px 80px"},
  splashHeader:{background:"linear-gradient(160deg, #0a1a4a 0%, #1a3a8a 50%, #0d2060 100%)",padding:"0 0 28px",textAlign:"center",borderRadius:"0 0 32px 32px",marginBottom:4,boxShadow:"0 6px 32px #00000040",overflow:"hidden"},
  appLogoWrap:{display:"flex",justifyContent:"center",marginBottom:0},
  appLogo:{fontSize:44},
  appTitle:{fontSize:32,fontWeight:900,color:"#fff",letterSpacing:0,textShadow:"0 2px 12px rgba(0,0,0,0.4)"},
  appSub:{fontSize:15,color:"rgba(255,255,255,0.85)",marginTop:6,fontWeight:600,letterSpacing:0.3},
  appQuoteWrap:{padding:"10px 16px 0",textAlign:"center",background:"var(--bg)"},
  appQuoteBubble:{display:"inline-block",background:"var(--gl)",borderRadius:20,padding:"7px 16px",fontSize:12,color:"var(--gd)",fontStyle:"italic",lineHeight:1.5,border:"1px solid var(--gm)"},
  topBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:"var(--sur)",borderBottom:"1px solid var(--gl)",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 12px #25d36612"},
  topBarTitle:{fontSize:17,fontWeight:800,color:"var(--tx)",textAlign:"center",flex:1},
  backBtn:{background:"none",border:"none",fontSize:24,color:"var(--gd)",cursor:"pointer",padding:"8px",fontWeight:700,lineHeight:1,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"},
  editBtn:{background:"var(--gl)",border:"none",borderRadius:RS,padding:"8px 12px",fontSize:13,fontWeight:700,color:"var(--gd)",cursor:"pointer",minHeight:36},
  darkToggle:{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"6px 8px",borderRadius:8,lineHeight:1,minWidth:36,minHeight:36,display:"flex",alignItems:"center",justifyContent:"center"},
  tabs:{display:"flex",background:"var(--sur)",borderBottom:"1px solid var(--gl)",padding:"0 16px"},
  tab:{flex:1,padding:"12px 4px",background:"none",border:"none",borderBottom:"3px solid transparent",fontSize:14,fontWeight:700,color:"var(--txm)",cursor:"pointer",minHeight:44},
  tabActive:{borderBottomColor:"var(--g)",color:"var(--g)"},
  planCard:{background:"var(--sur)",borderRadius:R,padding:"16px",margin:"14px 0 0",boxShadow:"0 2px 16px #25d36610",position:"relative",cursor:"pointer",animation:"cardIn 0.35s ease both"},
  planCardRow:{display:"flex",gap:12,alignItems:"flex-start"},
  planIcon:{fontSize:28,lineHeight:1,marginTop:2},
  planName:{fontSize:16,fontWeight:800,color:"var(--tx)"},
  planSub:{fontSize:13,color:"var(--txs)",marginTop:2},
  planMeta:{display:"flex",gap:12,fontSize:11,color:"var(--txs)",marginTop:8,flexWrap:"wrap"},
  pctBadge:{background:"var(--gl)",borderRadius:20,padding:"4px 10px",fontSize:13,fontWeight:800,color:"var(--gd)",flexShrink:0,alignSelf:"flex-start"},
  cardDeleteIcon:{background:"var(--red-bg)",border:"1.5px solid var(--red-border)",borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,cursor:"pointer",flexShrink:0},
  deleteFullBtn:{width:"100%",padding:"14px 0",marginTop:12,background:"var(--red-bg)",border:"1.5px solid var(--red-border)",borderRadius:R,fontSize:15,fontWeight:700,color:"var(--red)",cursor:"pointer",fontFamily:"inherit"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24},
  dialog:{background:"var(--sur)",borderRadius:20,padding:"28px 24px",width:"100%",maxWidth:320,textAlign:"center",boxShadow:"0 8px 40px #0005"},
  dialogIcon:{fontSize:38,marginBottom:10},
  dialogTitle:{fontSize:18,fontWeight:900,color:"var(--tx)",marginBottom:8},
  dialogMsg:{fontSize:14,color:"var(--txm)",lineHeight:1.7,marginBottom:22},
  dialogBtns:{display:"flex",gap:10},
  dialogCancel:{flex:1,padding:"12px 0",borderRadius:RS,border:"1.5px solid var(--border)",background:"var(--cancel-bg)",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",color:"var(--cancel-color)"},
  dialogConfirm:{flex:1,padding:"12px 0",borderRadius:RS,border:"none",background:"#e74c3c",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",color:"#fff"},
  finishPlanBtn:{width:"100%",margin:"16px 0 0",padding:"14px 0",background:"var(--gd)",color:"#fff",border:"none",borderRadius:R,fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"},
  finishScreen:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 24px",textAlign:"center",flex:1},
  finishEmoji:{fontSize:72,marginBottom:16},
  finishTitle:{fontSize:32,fontWeight:900,color:"var(--tx)",marginBottom:8},
  finishSub:{fontSize:16,color:"var(--txm)",marginBottom:6},
  finishPlanName:{fontSize:18,fontWeight:800,color:"var(--gd)",marginBottom:32},
  finishBtn:{background:"var(--g)",color:"#fff",border:"none",borderRadius:R,padding:"14px 40px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"},
  emptyWrap:{textAlign:"center",padding:"60px 20px"},
  emptyIcon:{fontSize:52,marginBottom:14},
  emptyTitle:{fontSize:18,fontWeight:800,color:"var(--tx)",marginBottom:6},
  emptyDesc:{fontSize:14,color:"var(--txm)"},
  fab:{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"var(--g)",color:"#fff",borderRadius:40,padding:"14px 34px",fontWeight:800,fontSize:15,border:"none",cursor:"pointer",boxShadow:"0 6px 24px #25d36645",zIndex:20,fontFamily:"inherit",animation:"fabPulse 2.5s ease-in-out infinite",minHeight:48},
  doneFab:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"var(--g)",color:"#fff",width:62,height:62,borderRadius:"50%",fontSize:28,fontWeight:900,border:"none",cursor:"pointer",boxShadow:"0 6px 24px #25d36660",zIndex:20,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"},
  sec:{marginTop:22},
  secLabel:{fontSize:12,fontWeight:800,color:"var(--gd)",letterSpacing:0.7,textTransform:"uppercase",marginBottom:10},
  fld:{marginBottom:12},
  fldLbl:{display:"block",fontSize:13,color:"var(--txm)",marginBottom:4,fontWeight:600},
  inp:{width:"100%",padding:"12px 14px",borderRadius:RS,border:"1.5px solid var(--gm)",background:"var(--sur)",fontSize:15,color:"var(--tx)",outline:"none",boxSizing:"border-box",fontFamily:"inherit",textAlign:"right"},
  daysRow:{display:"flex",gap:6,flexWrap:"wrap"},
  dayChip:{padding:"10px 12px",borderRadius:RS,border:"1.5px solid var(--gm)",background:"var(--sur)",fontSize:13,fontWeight:700,color:"var(--txm)",cursor:"pointer",fontFamily:"inherit",minHeight:44},
  dayChipOn:{background:"var(--g)",color:"#fff",border:"1.5px solid var(--g)"},
  dayChipRestOn:{background:"#e74c3c",color:"#fff",border:"1.5px solid #c0392b"},
  restHint:{fontSize:12,color:"var(--red)",marginBottom:10,fontWeight:600,background:"var(--red-bg)",borderRadius:8,padding:"7px 10px",border:"1px solid var(--red-border)"},
  restToggleBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:"var(--red-toggle)",borderBottom:"1.5px solid var(--red-border)",cursor:"pointer",userSelect:"none",transition:"background 0.15s",boxShadow:"0 2px 6px #e0000010"},
  restToggleLeft:{display:"flex",alignItems:"center",gap:8},
  restToggleIcon:{fontSize:15},
  restToggleLabel:{fontSize:13,fontWeight:800,color:"var(--red)"},
  restToggleBadge:{background:"var(--red)",color:"#fff",borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:800},
  restToggleArrow:{fontSize:16,color:"var(--red)",transition:"transform 0.2s",lineHeight:1},
  restPanel:{background:"var(--red-panel)",borderBottom:"1.5px solid var(--red-border)",padding:"14px 16px 16px"},
  restPanelHint:{fontSize:12,color:"var(--txs)",marginBottom:12,fontWeight:500},
  datePickerRow:{display:"flex",gap:8,alignItems:"flex-end",marginBottom:12,flexWrap:"wrap"},
  datePickerField:{display:"flex",flexDirection:"column",gap:4},
  datePickerLbl:{fontSize:11,fontWeight:700,color:"var(--red)"},
  datePickerInp:{width:52,padding:"9px 8px",borderRadius:RS,border:"1.5px solid var(--red-border)",background:"var(--sur)",fontSize:14,color:"var(--tx)",outline:"none",textAlign:"center",fontFamily:"inherit"},
  datePickerSel:{padding:"9px 8px",borderRadius:RS,border:"1.5px solid var(--red-border)",background:"var(--sur)",fontSize:13,color:"var(--tx)",outline:"none",fontFamily:"inherit",cursor:"pointer"},
  specificRestAdd:{background:"var(--red)",color:"#fff",border:"none",borderRadius:RS,padding:"10px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",alignSelf:"flex-end",minHeight:44},
  specificRestList:{display:"flex",flexWrap:"wrap",gap:8,marginTop:4},
  specificRestChip:{display:"flex",alignItems:"center",gap:6,background:"var(--red-bg)",border:"1.5px solid var(--red-border)",borderRadius:20,padding:"5px 10px"},
  specificRestChipTxt:{fontSize:12,fontWeight:700,color:"var(--red)"},
  specificRestRemove:{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:13,fontWeight:900,padding:"0 0 0 4px",lineHeight:1,fontFamily:"inherit",minWidth:30,minHeight:30,display:"flex",alignItems:"center",justifyContent:"center"},
  previewCard:{background:"var(--gl)",borderRadius:R,padding:"16px",marginTop:20},
  previewTitle:{fontSize:12,fontWeight:800,color:"var(--gd)",marginBottom:12,textTransform:"uppercase",letterSpacing:0.7},
  previewGrid:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10},
  prevStat:{textAlign:"center"},
  prevVal:{fontSize:22,fontWeight:900,color:"var(--gd)"},
  prevLbl:{fontSize:11,color:"var(--txm)",fontWeight:600,marginTop:2},
  mainBtn:{width:"100%",padding:"16px",background:"var(--g)",color:"#fff",border:"none",borderRadius:R,fontSize:16,fontWeight:800,cursor:"pointer",marginTop:24,boxShadow:"0 4px 18px #25d36635",fontFamily:"inherit",minHeight:50},
  todayBanner:{background:"var(--g)",color:"#fff",padding:"12px 16px",fontSize:14,fontWeight:600},
  restBanner:{background:"var(--cancel-bg)",color:"var(--txm)",padding:"12px 16px",fontSize:14,fontWeight:600},
  todayLabel:{fontWeight:800,marginLeft:4},
  calHint:{textAlign:"center",fontSize:12,color:"var(--txs)",padding:"6px 0 2px",background:"var(--sur)",fontStyle:"italic"},
  monthRow:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 8px",background:"var(--sur)"},
  navBtn:{background:"var(--gd)",border:"none",borderRadius:RS,height:44,padding:"0 14px",fontSize:13,cursor:"pointer",color:"#fff",fontWeight:800,fontFamily:"inherit",whiteSpace:"nowrap",minWidth:72},
  monthLabel:{fontSize:16,fontWeight:800,color:"var(--tx)"},
  calGrid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,padding:"4px 8px",background:"var(--sur)"},
  calHead:{textAlign:"center",fontSize:11,fontWeight:800,color:"var(--txs)",padding:"6px 0"},
  calCell:{minHeight:48,borderRadius:8,background:"var(--empty-cell)",padding:"4px 2px",display:"flex",flexDirection:"column",alignItems:"center"},
  calSummary:{display:"flex",alignItems:"center",justifyContent:"space-around",background:"var(--sur)",margin:"0 8px 16px",borderRadius:R,padding:"14px 10px",boxShadow:"0 2px 10px #25d36612"},
  calSummaryItem:{display:"flex",flexDirection:"column",alignItems:"center",gap:3},
  calSummaryVal:{fontSize:22,fontWeight:900,color:"var(--tx)"},
  calSummaryLbl:{fontSize:11,fontWeight:600,color:"var(--txs)"},
  calSummaryDivider:{width:1,height:32,background:"var(--gm)"},
  calRest:{background:"var(--red-bg)",border:"1px solid var(--red-border)"},
  calHasTask:{background:"var(--gl)"},
  calDone:{background:"var(--g)"},
  calLastDay:{background:"#fff3b0",border:"2px solid #f0c040"},
  calLastLabel:{fontSize:10,fontWeight:900,color:"#7a5c00",marginTop:2,letterSpacing:0.3},
  calToday:{outline:"2px solid var(--g)",outlineOffset:-2},
  calDayNum:{fontSize:11,fontWeight:700,color:"var(--txm)",lineHeight:"18px"},
  calTaskTxt:{fontSize:10,fontWeight:800,color:"var(--gd)",textAlign:"center",marginTop:1},
  restDot:{fontSize:8,color:"var(--red)",marginTop:2,fontWeight:800,textAlign:"center",lineHeight:1.2},
  legend:{display:"flex",gap:12,padding:"10px 16px",background:"var(--sur)",flexWrap:"wrap"},
  legItem:{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"var(--txm)"},
  longPressToast:{position:"fixed",bottom:40,left:"50%",transform:"translateX(-50%)",background:"#333",color:"#fff",borderRadius:40,padding:"10px 22px",fontSize:13,fontWeight:700,zIndex:50,animation:"cardIn 0.2s ease",whiteSpace:"nowrap",boxShadow:"0 4px 16px #0003"},
  statusBanner:{borderRadius:R,padding:"14px 16px",marginTop:16},
  statusTxt:{fontSize:15,fontWeight:800},
  statsGrid:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:14},
  statCard:{background:"var(--sur)",borderRadius:RS,padding:"14px 8px",textAlign:"center",boxShadow:"0 2px 8px #0001"},
  statVal:{fontSize:24,fontWeight:900,lineHeight:1},
  statLbl:{fontSize:11,fontWeight:700,color:"var(--txm)",marginTop:4,textTransform:"uppercase",letterSpacing:0.4},
  bigPctWrap:{background:"var(--sur)",borderRadius:R,padding:"20px 16px",marginTop:14,boxShadow:"0 2px 12px #0001"},
  bigPct:{fontSize:52,fontWeight:900,color:"var(--g)",textAlign:"center",lineHeight:1,marginBottom:4},
  bigPctSub:{textAlign:"center",color:"var(--txm)",fontSize:13,marginBottom:12},
  pctCompare:{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:12},
  counterWrap:{marginTop:20},
  counterRow:{display:"flex",alignItems:"center",justifyContent:"center",gap:20,padding:"10px 0"},
  counterBtn:{width:44,height:44,borderRadius:"50%",background:"var(--g)",color:"#fff",border:"none",fontSize:22,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px #25d36635",fontFamily:"inherit"},
  counterVal:{fontSize:16,fontWeight:700,color:"var(--tx)",minWidth:110,textAlign:"center"},
  checkList:{display:"flex",flexDirection:"column",gap:6,marginTop:8},
  checkItem:{display:"flex",alignItems:"center",gap:12,background:"var(--sur)",borderRadius:RS,padding:"12px 12px",cursor:"pointer",boxShadow:"0 1px 4px #0001"},
  checkItemDone:{background:"var(--gl)"},
  checkBox:{width:24,height:24,borderRadius:6,border:"2px solid var(--gm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0},
  checkBoxDone:{background:"var(--g)",border:"2px solid var(--g)"},
  checkDate:{fontSize:11,color:"var(--txs)"},
  checkTask:{fontSize:13,fontWeight:700,color:"var(--tx)"},
  pbTrack:{background:"var(--gl)",borderRadius:99,overflow:"hidden",width:"100%"},
  introWrap:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"var(--bg)"},
  introCard:{background:"var(--sur)",borderRadius:24,padding:"32px 24px",maxWidth:380,width:"100%",textAlign:"center",boxShadow:"0 8px 40px #25d36620",position:"relative"},
  introEmoji:{fontSize:48,marginBottom:12},
  introTitle:{fontSize:22,fontWeight:900,color:"var(--tx)",marginBottom:16},
  introText:{fontSize:14,color:"var(--txm)",lineHeight:1.8,marginBottom:8},
  introBtn:{marginTop:28,width:"100%",padding:"16px",background:"var(--g)",color:"#fff",border:"none",borderRadius:R,fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px #25d36635",minHeight:50},
  todayNavBtn:{background:"none",border:"1.5px solid var(--g)",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,color:"var(--g)",cursor:"pointer",fontFamily:"inherit"},
  pbFill:{height:"100%",background:"var(--g)",borderRadius:99,transition:"width 0.4s ease"},
  // days mode toggle
  daysModeRow:{display:"flex",gap:0,marginBottom:12,borderRadius:RS,overflow:"hidden",border:"1.5px solid var(--gm)"},
  daysModeBtn:{flex:1,padding:"10px 8px",border:"none",background:"var(--sur)",fontSize:13,fontWeight:700,color:"var(--txm)",cursor:"pointer",fontFamily:"inherit"},
  daysModeBtnActive:{background:"var(--g)",color:"#fff"},
  // accessibility panel
  a11yOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  a11yPanel:{background:"var(--sur)",borderRadius:"20px 20px 0 0",padding:"24px 20px 36px",width:"100%",maxWidth:480,boxShadow:"0 -4px 32px #0004"},
  a11yTitle:{fontSize:17,fontWeight:900,color:"var(--tx)",marginBottom:20,textAlign:"center"},
  a11ySection:{marginBottom:18},
  a11ySectionTitle:{fontSize:11,fontWeight:800,color:"var(--gd)",letterSpacing:0.7,textTransform:"uppercase",marginBottom:10},
  a11yFsRow:{display:"flex",gap:8},
  a11yFsBtn:{flex:1,padding:"12px 0",borderRadius:RS,border:"1.5px solid var(--gm)",background:"var(--cancel-bg)",fontSize:14,fontWeight:700,color:"var(--txm)",cursor:"pointer",fontFamily:"inherit"},
  a11yFsBtnActive:{background:"var(--g)",color:"#fff",border:"1.5px solid var(--g)"},
  a11yToggleRow:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14},
  a11yToggleLbl:{fontSize:14,fontWeight:600,color:"var(--tx)"},
  a11ySwitch:{width:52,height:30,borderRadius:15,background:"#b0b8c1",border:"none",cursor:"pointer",position:"relative",padding:0,flexShrink:0,transition:"background 0.2s"},
  a11ySwitchOn:{background:"var(--g)"},
  a11yThumb:{width:24,height:24,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:3,transition:"left 0.2s",boxShadow:"0 1px 5px #0004"},
  a11yThumbOn:{left:"unset",right:3},
  a11yClose:{width:"100%",padding:"13px",marginTop:4,background:"var(--gl)",border:"none",borderRadius:12,fontSize:14,fontWeight:700,color:"var(--gd)",cursor:"pointer",fontFamily:"inherit"},
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap');

  :root {
    --bg: #f2faf6;
    --sur: #ffffff;
    --tx: #1a2e22;
    --txm: #4a6358;
    --txs: #8fb59f;
    --g: #25D366;
    --gl: #d4f5e2;
    --gm: #b2e8c9;
    --gd: #128C7E;
    --red: #c0392b;
    --red-bg: #fde8e8;
    --red-border: #f5c6c6;
    --red-panel: #fff8f8;
    --red-toggle: #fff0f0;
    --border: #dddddd;
    --cancel-bg: #f7f7f7;
    --cancel-color: #555555;
    --empty-cell: #f7f7f7;
  }

  [data-dark="true"] {
    --bg: #0f1f17;
    --sur: #1a2e22;
    --tx: #e8f5ee;
    --txm: #a8c8b8;
    --txs: #5a8a6e;
    --g: #25D366;
    --gl: #1a3327;
    --gm: #1e4033;
    --gd: #3dd68c;
    --red: #e05050;
    --red-bg: #2a1515;
    --red-border: #5a2020;
    --red-panel: #1f1515;
    --red-toggle: #2a1515;
    --border: #2a4030;
    --cancel-bg: #162819;
    --cancel-color: #a8c8b8;
    --empty-cell: #162819;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg); transition: background 0.25s; }

  @keyframes cardIn { from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);} }
  @keyframes fabPulse { 0%,100%{box-shadow:0 6px 24px #25d36645;}50%{box-shadow:0 6px 32px #25d36670;} }

  input[type=date]::-webkit-calendar-picker-indicator { opacity: 0.5; }
  select { -webkit-appearance: none; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #25d36640; border-radius: 4px; }

  button, input, select { font-family: inherit; }

  /* Focus visible for keyboard navigation */
  :focus-visible {
    outline: 2px solid var(--g);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Mobile optimizations */
  @media (max-width: 480px) {
    :root { font-size: 15px; }
    input, select, button { font-size: 16px; } /* prevents iOS zoom on focus */
  }

  /* Ensure full width on mobile */
  @media (max-width: 480px) {
    #root > div { max-width: 100%; }
  }

  /* ── Font scaling ── */
  html[data-fs="lg"]  { zoom: 1.15; }
  html[data-fs="xl"]  { zoom: 1.3; }
  html[data-fs="xxl"] { zoom: 1.5; }

  /* ── High contrast (light) ── */
  html[data-hc="true"] {
    --tx: #000000; --txm: #111111; --txs: #333333;
    --sur: #ffffff; --bg: #f0f0f0;
    --gl: #a8e8a8; --gm: #60c860; --gd: #004d00; --g: #006600;
    --red: #aa0000; --red-bg: #ffe0e0; --red-border: #cc8888;
    --border: #555555; --cancel-bg: #e8e8e8; --cancel-color: #000000;
    --empty-cell: #e0e0e0;
  }
  /* ── High contrast (dark) ── */
  html[data-dark="true"][data-hc="true"] {
    --tx: #ffffff; --txm: #eeeeee; --txs: #cccccc;
    --sur: #000000; --bg: #0a0a0a;
    --gl: #003300; --gm: #005500; --gd: #00ff55; --g: #00ee33;
    --red: #ff5555; --red-bg: #330000; --red-border: #882222;
    --border: #888888; --cancel-bg: #111111; --cancel-color: #ffffff;
    --empty-cell: #111111;
  }

  /* ── Reduce motion ── */
  html[data-rm="true"] * {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
`;
