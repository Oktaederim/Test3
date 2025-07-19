document.addEventListener('DOMContentLoaded', () => {

    // --- DOM-Elemente direkt und einzeln definieren, um Fehlerquellen zu minimieren ---
    const wirkungsgradInput = document.getElementById('wirkungsgrad');
    const volumenstromInput = document.getElementById('volumenstrom');
    const liveTempInInput = document.getElementById('live-temp-in');
    const liveRhInInput = document.getElementById('live-rh-in');

    const waterLiveOutput = document.getElementById('res-water-live');
    const powerLiveOutput = document.getElementById('res-power-live');
    const tempOutOutput = document.getElementById('res-temp-out');
    const rhOutOutput = document.getElementById('res-rh-out');
    const tdpOutOutput = document.getElementById('res-tdp-out');

    const vis_t_in = document.getElementById('vis-t-in');
    const vis_rh_in = document.getElementById('vis-rh-in');
    const vis_x_in = document.getElementById('vis-x-in');
    const vis_h_in = document.getElementById('vis-h-in');
    const vis_twb_in = document.getElementById('vis-twb-in');
    const vis_tdp_in = document.getElementById('vis-tdp-in');

    const vis_t_out = document.getElementById('vis-t-out');
    const vis_rh_out = document.getElementById('vis-rh-out');
    const vis_x_out = document.getElementById('vis-x-out');
    const vis_h_out = document.getElementById('vis-h-out');
    const vis_twb_out = document.getElementById('vis-twb-out');
    const vis_tdp_out = document.getElementById('vis-tdp-out');

    // --- Konstanten ---
    const RHO_LUFT = 1.2,
        DRUCK = 101325;

    // --- Psychrometrische Funktionen ---
    const getPs = T => 611.2 * Math.exp((17.62 * T) / (243.12 + T));
    const getX = (T, rH, p) => (622 * (rH / 100 * getPs(T))) / (p - (rH / 100 * getPs(T)));
    const getH = (T, x) => 1.006 * T + (x / 1000) * (2501 + 1.86 * T);
    const getTd = (x, p) => (243.12 * Math.log(((p * x) / (622 + x)) / 611.2)) / (17.62 - Math.log(((p * x) / (622 + x)) / 611.2));
    const getTwb = (T, x, p) => {
        const h_target = getH(T, x);
        let low = getTd(x, p),
            high = T;
        if (high - low < 0.01) return T;
        for (let i = 0; i < 15; i++) {
            let mid = (low + high) / 2;
            let h_mid = getH(mid, getX(mid, 100, p));
            if (h_mid < h_target) low = mid;
            else high = mid;
        }
        return (low + high) / 2;
    };
    const getRh = (T, x, p) => Math.min(100, (100 * (p * x) / (622 + x)) / getPs(T));

    // --- Hauptfunktion ---
    function runAllCalculations() {
        // Sicherstellen, dass alle Elemente geladen sind, bevor wir darauf zugreifen
        if (!wirkungsgradInput || !volumenstromInput || !liveTempInInput || !liveRhInInput) {
            console.error("Ein oder mehrere Eingabeelemente wurden nicht im DOM gefunden.");
            return;
        }

        const eta = parseFloat(wirkungsgradInput.value) / 100;
        const vol = parseFloat(volumenstromInput.value);
        const T_in = parseFloat(liveTempInInput.value);
        const RH_in = parseFloat(liveRhInInput.value);

        if (isNaN(eta) || isNaN(vol) || isNaN(T_in) || isNaN(RH_in)) {
            console.warn("Eine oder mehrere Eingaben sind ungültig.");
            return;
        }

        const massenstrom = (vol / 3600) * RHO_LUFT;

        // Zustand VOR Befeuchter
        const state_in = {
            T: T_in,
            RH: RH_in
        };
        state_in.x = getX(state_in.T, state_in.RH, DRUCK);
        state_in.h = getH(state_in.T, state_in.x);
        state_in.Twb = getTwb(state_in.T, state_in.x, DRUCK);
        state_in.Tdp = getTd(state_in.x, DRUCK);

        // Zustand NACH Befeuchter
        const state_out = {};
        state_out.T = state_in.T - eta * (state_in.T - state_in.Twb);
        state_out.h = state_in.h;
        state_out.x = 1000 * (state_out.h - 1.006 * state_out.T) / (2501 + 1.86 * state_out.T);
        state_out.RH = getRh(state_out.T, state_out.x, DRUCK);
        state_out.Twb = getTwb(state_out.T, state_out.x, DRUCK);
        state_out.Tdp = getTd(state_out.x, DRUCK);

        // Leistungswerte
        const wasser_l_h = massenstrom * (state_out.x - state_in.x) / 1000 * 3600;
        const cp_moist = 1.006 + 1.86 * (state_in.x / 1000);
        const leistung_kW = massenstrom * cp_moist * (state_in.T - state_out.T);

        // Render-Funktion aufrufen
        render({
            state_in,
            state_out,
            wasser_l_h,
            leistung_kW
        });
    }

    // --- Render-Funktion ---
    function render(data) {
        const f = (num, dec = 1) => isNaN(num) ? '--' : num.toLocaleString('de-DE', {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec
        });

        // Ergebnisbox
        waterLiveOutput.textContent = f(data.wasser_l_h, 2);
        powerLiveOutput.textContent = f(data.leistung_kW, 1);
        tempOutOutput.textContent = f(data.state_out.T, 1);
        rhOutOutput.textContent = f(data.state_out.RH, 1);
        tdpOutOutput.textContent = f(data.state_out.Tdp, 1);

        // Visualisierung
        vis_t_in.textContent = `${f(data.state_in.T)} °C`;
        vis_rh_in.textContent = `${f(data.state_in.RH)} %`;
        vis_x_in.textContent = `${f(data.state_in.x, 2)} g/kg`;
        vis_h_in.textContent = `${f(data.state_in.h, 2)} kJ/kg`;
        vis_twb_in.textContent = `${f(data.state_in.Twb)} °C`;
        vis_tdp_in.textContent = `${f(data.state_in.Tdp)} °C`;

        vis_t_out.textContent = `${f(data.state_out.T)} °C`;
        vis_rh_out.textContent = `${f(data.state_out.RH, 1)} %`;
        vis_x_out.textContent = `${f(data.state_out.x, 2)} g/kg`;
        vis_h_out.textContent = `${f(data.state_out.h, 2)} kJ/kg`;
        vis_twb_out.textContent = `${f(data.state_out.Twb)} °C`;
        vis_tdp_out.textContent = `${f(data.state_out.Tdp)} °C`;
    }

    // --- Initialisierung & Event Listeners ---
    const allInputs = [wirkungsgradInput, volumenstromInput, liveTempInInput, liveRhInInput];
    allInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', runAllCalculations);
        }
    });

    runAllCalculations(); // Erster Lauf bei Seitenaufruf
});
