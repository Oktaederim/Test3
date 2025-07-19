document.addEventListener('DOMContentLoaded', () => {
    const inputs = document.querySelectorAll('input[type="number"], input[type="radio"]');
    inputs.forEach(input => input.addEventListener('input', calculate));
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    document.querySelectorAll('input[name="betriebsmodus"], input[name="heizkonzept"]').forEach(radio => radio.addEventListener('change', toggleUI));
    toggleUI();
    calculate();
});

const defaultValues = {
    tempAussen: -5.0, rhAussen: 80.0,
    tempZuluft: 22.0, rhZuluft: 50.0,
    volumenstrom: 5000, druck: 1013.25,
    tempVEZiel: 5.0,
    betriebsmodus: 'entfeuchten',
    heizkonzept: 'standard' // NEU
};

function resetAll() {
    for (const key in defaultValues) {
        const el = document.getElementById(key);
        if (el) {
            el.value = defaultValues[key];
        } else {
            document.querySelector(`input[name="${key}"][value="${defaultValues[key]}"]`).checked = true;
        }
    }
    toggleUI();
    calculate();
}

function toggleUI() {
    const betriebsmodus = document.querySelector('input[name="betriebsmodus"]:checked').value;
    const heizkonzept = document.querySelector('input[name="heizkonzept"]:checked').value; // NEU
    
    document.getElementById('sollFeuchteWrapper').style.display = (betriebsmodus === 'entfeuchten') ? 'block' : 'none';
    document.getElementById('kuehlwasserWrapper').style.display = (betriebsmodus === 'heizen') ? 'none' : 'block';
    
    // NEU: Die VE Ziel-Temperatur ist nur im Standard-Konzept relevant
    const veZielTempWrapper = document.getElementById('veZielTempWrapper');
    veZielTempWrapper.style.display = (heizkonzept === 'standard') ? 'block' : 'none';
    veZielTempWrapper.querySelector('label').textContent = (heizkonzept === 'standard') ? 'VE Frostschutz-Zieltemp. (°C)' : 'VE Ziel-Temperatur (°C)';
}

// --- Psychrometrische Hilfsfunktionen (unverändert) ---
const getSVP = (T) => 6.112 * Math.exp((17.62 * T) / (243.12 + T));
const getAbsFeuchte = (T, rh, p) => 622 * (rh / 100 * getSVP(T)) / (p - (rh / 100 * getSVP(T)));
const getRelFeuchte = (T, x, p) => {
    const svp = getSVP(T);
    if (svp <= 0) return 0;
    const rh = (x * p) / (svp * (622 + x)) * 100;
    return Math.min(100, Math.max(0, rh));
};
const getEnthalpie = (T, x) => 1.006 * T + (x / 1000) * (2501 + 1.86 * T);
const getTaupunkt = (T, rh) => {
    if (rh <= 0) return -273.15;
    const a = 17.62, b = 243.12;
    const alpha = Math.log(rh / 100) + (a * T) / (b + T);
    return (b * alpha) / (a - alpha);
};
const createZustand = (T, rh, x_val, p) => {
    const zustand = { T, p };
    if (x_val !== null) {
        zustand.x = x_val;
        zustand.rh = getRelFeuchte(T, x_val, p);
    } else {
        zustand.rh = rh;
        zustand.x = getAbsFeuchte(T, rh, p);
    }
    zustand.h = getEnthalpie(zustand.T, zustand.x);
    zustand.td = getTaupunkt(zustand.T, zustand.rh);
    return zustand;
};

function calculate() {
    const inputs = {
        betriebsmodus: document.querySelector('input[name="betriebsmodus"]:checked').value,
        heizkonzept: document.querySelector('input[name="heizkonzept"]:checked').value, // NEU
        tAussen: parseFloat(document.getElementById('tempAussen').value),
        rhAussen: parseFloat(document.getElementById('rhAussen').value),
        tZuluft: parseFloat(document.getElementById('tempZuluft').value),
        rhZuluft: parseFloat(document.getElementById('rhZuluft').value),
        volumenstrom: parseFloat(document.getElementById('volumenstrom').value),
        druck: parseFloat(document.getElementById('druck').value),
        tVEZiel: parseFloat(document.getElementById('tempVEZiel').value),
        tHeizV: parseFloat(document.getElementById('tempHeizVorlauf').value),
        tHeizR: parseFloat(document.getElementById('tempHeizRuecklauf').value),
        tKuehlV: parseFloat(document.getElementById('tempKuehlVorlauf').value),
        tKuehlR: parseFloat(document.getElementById('tempKuehlRuecklauf').value)
    };
    
    const massenstrom = (inputs.volumenstrom * 1.2) / 3600;
    let p_ve = 0, p_k = 0, p_ne = 0, kondensat = 0;

    const zustand0 = createZustand(inputs.tAussen, inputs.rhAussen, null, inputs.druck);
    let zustand1 = { ...zustand0 }, zustand2 = {}, zustand3 = {};
    
    // ########## NEUE LOGIK BASIEREND AUF HEIZKONZEPT ##########
    if (inputs.heizkonzept === 've_hauptleistung') {
        // ### LOGIK FÜR "VE ALS HAUPTERHITZER" (IHR SZENARIO) ###
        
        // 1. VE: Ist der Haupterhitzer. Läuft immer, wenn Heizen nötig ist.
        if (inputs.tZuluft > zustand0.T + 0.01) {
            zustand1 = createZustand(inputs.tZuluft, null, zustand0.x, inputs.druck);
            p_ve = massenstrom * (zustand1.h - zustand0.h);
        }
        
        // 2. Kühler: Kühlt von Zustand 1 (also von der ZULUFT-Temperatur!) herunter, falls Entfeuchtung nötig ist.
        zustand2 = { ...zustand1 };
        if (inputs.betriebsmodus === 'entfeuchten') {
            const x_soll_zuluft = getAbsFeuchte(inputs.tZuluft, inputs.rhZuluft, inputs.druck);
            if (zustand1.x > x_soll_zuluft + 0.1) {
                const t_kuehl_ziel = getTaupunkt(inputs.tZuluft, getRelFeuchte(inputs.tZuluft, x_soll_zuluft, inputs.druck));
                zustand2 = createZustand(t_kuehl_ziel, 100, x_soll_zuluft, inputs.druck);
                p_k = massenstrom * (zustand2.h - zustand1.h);
                kondensat = massenstrom * (zustand1.x - zustand2.x) * 3.6;
            }
        }
        
        // 3. NE: Ist der Nacherhitzer. Läuft NUR, wenn zuvor entfeuchtet (gekühlt) wurde.
        zustand3 = { ...zustand2 };
        if (inputs.tZuluft > zustand2.T + 0.01) {
            zustand3 = createZustand(inputs.tZuluft, null, zustand2.x, inputs.druck);
            p_ne = massenstrom * (zustand3.h - zustand2.h);
        }

    } else {
        // ### LOGIK FÜR "STANDARD (NE HAUPTERHITZER)" ###

        // 1. VE: Dient primär dem Frostschutz.
        if (zustand0.T < inputs.tVEZiel - 0.01) {
             zustand1 = createZustand(inputs.tVEZiel, null, zustand0.x, inputs.druck);
             p_ve = massenstrom * (zustand1.h - zustand0.h);
        }
        
        // 2. Kühler: Kühlt/Entfeuchtet bei Bedarf von Zustand 1 aus.
        zustand2 = { ...zustand1 };
        if (inputs.betriebsmodus !== 'heizen' && inputs.tZuluft < zustand1.T - 0.01) {
             const x_soll_zuluft = (inputs.betriebsmodus === 'entfeuchten') ? getAbsFeuchte(inputs.tZuluft, inputs.rhZuluft, inputs.druck) : zustand1.x;
             const t_kuehl_ziel = (inputs.betriebsmodus === 'entfeuchten') ? getTaupunkt(zustand1.T, getRelFeuchte(zustand1.T, x_soll_zuluft, inputs.druck)) : inputs.tZuluft;
             
             if(zustand1.T > t_kuehl_ziel + 0.01) {
                zustand2 = createZustand(t_kuehl_ziel, 100, x_soll_zuluft, inputs.druck);
                p_k = massenstrom * (zustand2.h - zustand1.h);
                kondensat = massenstrom * (zustand1.x - zustand2.x) * 3.6;
             }
        }
        
        // 3. NE: Ist der Haupterhitzer, erwärmt auf die finale Zuluft-Temperatur.
        zustand3 = { ...zustand2 };
        if (inputs.tZuluft > zustand2.T + 0.01) {
            zustand3 = createZund(inputs.tZuluft, null, zustand2.x, inputs.druck);
            p_ne = massenstrom * (zustand3.h - zustand2.h);
        }
    }

    const cp_wasser = 4.187, rho_wasser = 1000;
    const wv_ve = (p_ve > 0 && inputs.tHeizV > inputs.tHeizR) ? (p_ve * 3600) / (cp_wasser * (inputs.tHeizV - inputs.tHeizR) * rho_wasser) : 0;
    const wv_ne = (p_ne > 0 && inputs.tHeizV > inputs.tHeizR) ? (p_ne * 3600) / (cp_wasser * (inputs.tHeizV - inputs.tHeizR) * rho_wasser) : 0;
    const wv_k = (p_k < 0 && inputs.tKuehlR > inputs.tKuehlV) ? (Math.abs(p_k) * 3600) / (cp_wasser * (inputs.tKuehlR - inputs.tKuehlV) * rho_wasser) : 0;

    updateUI([zustand0, zustand1, zustand2, zustand3], { p_ve, p_k, p_ne, kondensat, wv_ve, wv_k, wv_ne });
}

// Die Funktionen updateUI und updateProcessVisuals bleiben größtenteils gleich,
// daher werden sie hier zur Übersichtlichkeit nicht erneut vollständig aufgeführt.
// Die Logik in diesen Funktionen zur Darstellung der berechneten Werte ist universell.
function updateUI(states, powers) {
    const f = (val, dec) => val.toFixed(dec);

    states.forEach((state, i) => {
        document.getElementById(`res-t-${i}`).textContent = f(state.T, 1);
        document.getElementById(`res-rh-${i}`).textContent = f(state.rh, 1);
        document.getElementById(`res-x-${i}`).textContent = f(state.x, 2);
    });
    const finalState = states[states.length - 1];
    document.getElementById('res-t-final').textContent = f(finalState.T, 1);
    document.getElementById('res-rh-final').textContent = f(finalState.rh, 1);
    document.getElementById('res-x-final').textContent = f(finalState.x, 2);

    document.getElementById('res-p-ve').textContent = f(powers.p_ve, 2);
    document.getElementById('res-p-k').textContent = f(Math.abs(powers.p_k), 2);
    document.getElementById('res-p-ne').textContent = f(powers.p_ne, 2);
    document.getElementById('res-kondensat').textContent = f(Math.max(0, powers.kondensat), 2);
    document.getElementById('res-wv-ve').textContent = f(powers.wv_ve, 2);
    document.getElementById('res-wv-k').textContent = f(powers.wv_k, 2);
    document.getElementById('res-wv-ne').textContent = f(powers.wv_ne, 2);

    const totalHeat = powers.p_ve + powers.p_ne;
    const totalCool = Math.abs(powers.p_k);
    document.getElementById('summary-power-heat').textContent = `${f(totalHeat, 2)} kW`;
    document.getElementById('summary-power-cool').textContent = `${f(totalCool, 2)} kW`;
    
    ['t', 'rh', 'x', 'h', 'td'].forEach(param => {
        const unit = {'t':'°C', 'rh':'%', 'x':'g/kg', 'h':'kJ/kg', 'td':'°C'}[param];
        const dec = (param === 't' || param === 'rh' || param === 'td') ? 1 : 2;
        document.getElementById(`summary-${param}-aussen`).textContent = `${f(states[0][param], dec)} ${unit}`;
        document.getElementById(`summary-${param}-zuluft`).textContent = `${f(finalState[param], dec)} ${unit}`;
    });

    updateProcessVisuals(powers);
}

function updateProcessVisuals(powers) {
    const isHeating = powers.p_ve > 0.01 || powers.p_ne > 0.01;
    const isCooling = powers.p_k < -0.01;
    const isDehumidifying = powers.kondensat > 0.01;
    
    let processText = "Keine Luftbehandlung notwendig.";
    if (isHeating && !isCooling) processText = "Reiner Heizprozess.";
    if (!isHeating && isCooling && !isDehumidifying) processText = "Sensibler Kühlprozess.";
    if (isCooling && isDehumidifying && !isHeating) processText = "Reiner Entfeuchtungsprozess.";
    if (isCooling && isDehumidifying && powers.p_ne > 0.01) processText = "Kühlen mit Entfeuchtung und Nacherwärmung.";
    if (powers.p_ve > 0.01 && isCooling) processText = "Vorwärmung mit anschließendem Kühlprozess.";
    
    const overview = document.createElement('div');
    overview.className = 'process-overview process-info';
    overview.textContent = processText;
    const container = document.getElementById('process-overview-container');
    container.innerHTML = '';
    container.appendChild(overview);
    
    document.getElementById('comp-ve').classList.toggle('inactive', powers.p_ve < 0.01);
    document.getElementById('comp-k').classList.toggle('inactive', powers.p_k > -0.01);
    document.getElementById('comp-ne').classList.toggle('inactive', powers.p_ne < 0.01);
    
    const setNodeColor = (nodeId, temp, baseTemp) => {
        const node = document.getElementById(nodeId);
        node.classList.remove('color-red', 'color-blue');
        if (temp > baseTemp + 0.1) node.classList.add('color-red');
        else if (temp < baseTemp - 0.1) node.classList.add('color-blue');
    };
    
    const nodeIds = [ 'node-0', 'node-1', 'node-2', 'node-3' ];
    for(let i = 1; i < nodeIds.length; i++) {
        const temp = parseFloat(document.getElementById(`res-t-${i}`).textContent);
        const prevTemp = parseFloat(document.getElementById(`res-t-${i-1}`).textContent);
        setNodeColor(nodeIds[i], temp, prevTemp);
    }
     const finalTemp = parseFloat(document.getElementById('res-t-final').textContent);
     const prevTemp = parseFloat(document.getElementById('res-t-3').textContent);
     setNodeColor('node-final', finalTemp, prevTemp);
}
