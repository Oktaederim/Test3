document.addEventListener('DOMContentLoaded', () => {
    // Alle Eingabeelemente selektieren
    const inputs = document.querySelectorAll('input[type="number"], input[type="radio"]');
    inputs.forEach(input => {
        input.addEventListener('input', calculate);
    });

    // Event Listener für den Reset Button
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    
    // Event Listener für Betriebsmodus, um UI anzupassen
    document.querySelectorAll('input[name="betriebsmodus"]').forEach(radio => {
        radio.addEventListener('change', toggleUI);
    });

    // Initiale Berechnung und UI-Anpassung beim Laden der Seite
    toggleUI();
    calculate();
});

// Standardwerte für den Reset
const defaultValues = {
    tempAussen: -5.0,  rhAussen: 80.0,
    tempZuluft: 22.0,  rhZuluft: 50.0,
    volumenstrom: 5000, druck: 1013.25,
    tempVEZiel: 5.0, // Standard-Frostschutz-Temperatur
    tempHeizVorlauf: 70, tempHeizRuecklauf: 50,
    tempKuehlVorlauf: 8, tempKuehlRuecklauf: 13,
    betriebsmodus: 'entfeuchten'
};

function resetAll() {
    for (const key in defaultValues) {
        if (key === 'betriebsmodus') {
            document.querySelector(`input[name="betriebsmodus"][value="${defaultValues[key]}"]`).checked = true;
        } else {
            const el = document.getElementById(key);
            if(el) el.value = defaultValues[key];
        }
    }
    toggleUI();
    calculate();
}

function toggleUI() {
    const betriebsmodus = document.querySelector('input[name="betriebsmodus"]:checked').value;
    const sollFeuchteWrapper = document.getElementById('sollFeuchteWrapper');
    const kuehlwasserWrapper = document.getElementById('kuehlwasserWrapper');

    sollFeuchteWrapper.style.display = (betriebsmodus === 'entfeuchten') ? 'block' : 'none';
    kuehlwasserWrapper.style.display = (betriebsmodus === 'heizen') ? 'none' : 'block';
}

// --- Psychrometrische Hilfsfunktionen ---

// Sättigungsdampfdruck (in hPa) über Magnus-Formel
const getSVP = (T) => 6.112 * Math.exp((17.62 * T) / (243.12 + T));

// Absolute Feuchte (g/kg) aus T (°C), rH (%), p (hPa)
const getAbsFeuchte = (T, rh, p) => 622 * (rh / 100 * getSVP(T)) / (p - (rh / 100 * getSVP(T)));

// Relative Feuchte (%) aus T (°C), x (g/kg), p (hPa)
const getRelFeuchte = (T, x, p) => {
    const svp = getSVP(T);
    const rh = (x * p) / (svp * (622 + x)) * 100;
    return Math.min(100, Math.max(0, rh)); // Auf 0-100 begrenzen
};

// Enthalpie (kJ/kg) aus T (°C), x (g/kg)
const getEnthalpie = (T, x) => 1.006 * T + (x / 1000) * (2501 + 1.86 * T);

// Taupunkttemperatur (°C) aus T (°C), rH (%)
const getTaupunkt = (T, rh) => {
    const a = 17.62;
    const b = 243.12;
    const alpha = Math.log(rh / 100) + (a * T) / (b + T);
    return (b * alpha) / (a - alpha);
};

// Erstellt ein Zustandsobjekt mit allen relevanten Werten
function createZustand(T, rh, x_val, p) {
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
}


// ####################################################################
// ################ HAUPT-BERECHNUNGSFUNKTION #########################
// ####################################################################

function calculate() {
    // 1. Alle Eingaben einlesen
    const inputs = {
        betriebsmodus: document.querySelector('input[name="betriebsmodus"]:checked').value,
        tAussen: parseFloat(document.getElementById('tempAussen').value),
        rhAussen: parseFloat(document.getElementById('rhAussen').value),
        tZuluft: parseFloat(document.getElementById('tempZuluft').value),
        rhZuluft: parseFloat(document.getElementById('rhZuluft').value),
        volumenstrom: parseFloat(document.getElementById('volumenstrom').value),
        druck: parseFloat(document.getElementById('druck').value),
        tVEZiel: parseFloat(document.getElementById('tempVEZiel').value), // NEUE EINGABE
        tHeizV: parseFloat(document.getElementById('tempHeizVorlauf').value),
        tHeizR: parseFloat(document.getElementById('tempHeizRuecklauf').value),
        tKuehlV: parseFloat(document.getElementById('tempKuehlVorlauf').value),
        tKuehlR: parseFloat(document.getElementById('tempKuehlRuecklauf').value)
    };
    
    // Massenstrom berechnen (ρ ≈ 1.2 kg/m³)
    const massenstrom = (inputs.volumenstrom * 1.2) / 3600; // in kg/s

    // 2. Zustandspunkte und Leistungen initialisieren
    let zustandsPunkte = [];
    let p_ve = 0, p_k = 0, p_ne = 0, kondensat = 0;

    // 3. Prozess-Simulation (SEQUENTIELLER ABLAUF)

    // ZUSTAND 0: AUSSENLUFT
    const zustand0 = createZustand(inputs.tAussen, inputs.rhAussen, null, inputs.druck);
    zustandsPunkte.push(zustand0);

    // KOMPONENTE: VORERHITZER (VE)
    let zustand1 = { ...zustand0 };
    if (inputs.tVEZiel > zustand0.T) {
        zustand1 = createZustand(inputs.tVEZiel, null, zustand0.x, inputs.druck);
        p_ve = massenstrom * (zustand1.h - zustand0.h);
    }
    zustandsPunkte.push(zustand1);

    // KOMPONENTE: KÜHLER (K)
    let zustand2 = { ...zustand1 };
    const istKuehlmodus = inputs.betriebsmodus === 'kuehlen_sensibel' || inputs.betriebsmodus === 'entfeuchten';
    
    if (istKuehlmodus) {
        let t_kuehl_ziel;
        let x_kuehl_ziel = zustand1.x;
        
        if (inputs.betriebsmodus === 'entfeuchten') {
            const x_soll_zuluft = getAbsFeuchte(inputs.tZuluft, inputs.rhZuluft, inputs.druck);
            // Taupunkt, der erreicht werden muss, um x_soll zu erhalten
            t_kuehl_ziel = getTaupunkt(inputs.tZuluft, getRelFeuchte(inputs.tZuluft, x_soll_zuluft, inputs.druck));
            x_kuehl_ziel = x_soll_zuluft;
        } else { // kuehlen_sensibel
            t_kuehl_ziel = inputs.tZuluft;
        }

        if (t_kuehl_ziel < zustand1.T) {
             // Luft nach Kühler ist bei Entfeuchtung gesättigt (rH=100%)
            const rh_nach_kuehler = inputs.betriebsmodus === 'entfeuchten' ? 100 : null;
            zustand2 = createZustand(t_kuehl_ziel, rh_nach_kuehler, x_kuehl_ziel, inputs.druck);
            p_k = massenstrom * (zustand2.h - zustand1.h); // Wird negativ sein
            kondensat = massenstrom * (zustand1.x - zustand2.x) * 3.6; // in kg/h
        }
    }
    zustandsPunkte.push(zustand2);

    // KOMPONENTE: NACHERHITZER (NE)
    let zustand3 = { ...zustand2 };
    if (inputs.tZuluft > zustand2.T) {
        zustand3 = createZustand(inputs.tZuluft, null, zustand2.x, inputs.druck);
        p_ne = massenstrom * (zustand3.h - zustand2.h);
    }
    zustandsPunkte.push(zustand3);


    // 4. Wasser-Volumenströme berechnen
    const cp_wasser = 4.187; // kJ/(kg*K)
    const rho_wasser = 1000; // kg/m³
    
    const wv_ve = (p_ve > 0 && inputs.tHeizV > inputs.tHeizR) 
        ? (p_ve * 3600) / (cp_wasser * (inputs.tHeizV - inputs.tHeizR) * rho_wasser) : 0;
    
    const wv_ne = (p_ne > 0 && inputs.tHeizV > inputs.tHeizR)
        ? (p_ne * 3600) / (cp_wasser * (inputs.tHeizV - inputs.tHeizR) * rho_wasser) : 0;
        
    const wv_k = (p_k < 0 && inputs.tKuehlR > inputs.tKuehlV)
        ? (Math.abs(p_k) * 3600) / (cp_wasser * (inputs.tKuehlR - inputs.tKuehlV) * rho_wasser) : 0;

    // 5. Ergebnisse in die UI schreiben
    updateUI(zustandsPunkte, { p_ve, p_k, p_ne, kondensat, wv_ve, wv_k, wv_ne });
}

function updateUI(states, powers) {
    const f = (val, dec) => val.toFixed(dec); // Formatierungsfunktion

    // Zustandspunkte im Diagramm
    states.forEach((state, i) => {
        document.getElementById(`res-t-${i}`).textContent = f(state.T, 1);
        document.getElementById(`res-rh-${i}`).textContent = f(state.rh, 1);
        document.getElementById(`res-x-${i}`).textContent = f(state.x, 2);
    });
    const finalState = states[states.length - 1];
    document.getElementById('res-t-final').textContent = f(finalState.T, 1);
    document.getElementById('res-rh-final').textContent = f(finalState.rh, 1);
    document.getElementById('res-x-final').textContent = f(finalState.x, 2);

    // Komponentenleistungen
    document.getElementById('res-p-ve').textContent = f(powers.p_ve, 2);
    document.getElementById('res-p-k').textContent = f(Math.abs(powers.p_k), 2);
    document.getElementById('res-p-ne').textContent = f(powers.p_ne, 2);
    document.getElementById('res-kondensat').textContent = f(powers.kondensat, 2);
    document.getElementById('res-wv-ve').textContent = f(powers.wv_ve, 2);
    document.getElementById('res-wv-k').textContent = f(powers.wv_k, 2);
    document.getElementById('res-wv-ne').textContent = f(powers.wv_ne, 2);

    // Zusammenfassung
    const totalHeat = powers.p_ve + powers.p_ne;
    const totalCool = Math.abs(powers.p_k);
    document.getElementById('summary-power-heat').textContent = `${f(totalHeat, 2)} kW`;
    document.getElementById('summary-power-cool').textContent = `${f(totalCool, 2)} kW`;
    
    // Vergleichstabelle
    document.getElementById('summary-t-aussen').textContent = `${f(states[0].T, 1)} °C`;
    document.getElementById('summary-rh-aussen').textContent = `${f(states[0].rh, 1)} %`;
    document.getElementById('summary-x-aussen').textContent = `${f(states[0].x, 2)} g/kg`;
    document.getElementById('summary-h-aussen').textContent = `${f(states[0].h, 2)} kJ/kg`;
    document.getElementById('summary-td-aussen').textContent = `${f(states[0].td, 1)} °C`;

    document.getElementById('summary-t-zuluft').textContent = `${f(finalState.T, 1)} °C`;
    document.getElementById('summary-rh-zuluft').textContent = `${f(finalState.rh, 1)} %`;
    document.getElementById('summary-x-zuluft').textContent = `${f(finalState.x, 2)} g/kg`;
    document.getElementById('summary-h-zuluft').textContent = `${f(finalState.h, 2)} kJ/kg`;
    document.getElementById('summary-td-zuluft').textContent = `${f(finalState.td, 1)} °C`;

    // Visuelle Anpassungen für Komponenten (aktiv/inaktiv)
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
    
    // Inaktiv-Klassen basierend auf Leistung setzen
    document.getElementById('comp-ve').classList.toggle('inactive', powers.p_ve < 0.01);
    document.getElementById('comp-k').classList.toggle('inactive', powers.p_k > -0.01);
    document.getElementById('comp-ne').classList.toggle('inactive', powers.p_ne < 0.01);

    // Knotenfarben
    const setNodeColor = (nodeId, temp, baseTemp) => {
        const node = document.getElementById(nodeId);
        node.classList.remove('color-red', 'color-blue', 'color-green');
        if (temp > baseTemp + 0.1) node.classList.add('color-red');  // wärmer
        else if (temp < baseTemp - 0.1) node.classList.add('color-blue'); // kälter
    };
    
    const states = [
        document.getElementById('node-0'), document.getElementById('node-1'),
        document.getElementById('node-2'), document.getElementById('node-3')
    ];
    
    for(let i = 1; i < states.length; i++) {
        const temp = parseFloat(document.getElementById(`res-t-${i}`).textContent);
        const prevTemp = parseFloat(document.getElementById(`res-t-${i-1}`).textContent);
        setNodeColor(`node-${i}`, temp, prevTemp);
    }
     const finalTemp = parseFloat(document.getElementById('res-t-final').textContent);
     const prevTemp = parseFloat(document.getElementById('res-t-3').textContent);
     setNodeColor('node-final', finalTemp, prevTemp);
}
