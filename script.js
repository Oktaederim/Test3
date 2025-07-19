document.addEventListener('DOMContentLoaded', () => {

    let referenceState = null;
    let currentTotalCost = 0;
    let currentPowers = { waerme: 0, kaelte: 0 };

    const dom = {
        tempAussen: document.getElementById('tempAussen'), rhAussen: document.getElementById('rhAussen'),
        tempZuluft: document.getElementById('tempZuluft'), rhZuluft: document.getElementById('rhZuluft'),
        volumenstrom: document.getElementById('volumenstrom'),
        kuehlerAktiv: document.getElementById('kuehlerAktiv'),
        druck: document.getElementById('druck'),
        resetBtn: document.getElementById('resetBtn'), preisWaerme: document.getElementById('preisWaerme'),
        preisStrom: document.getElementById('preisStrom'),
        volumenstromSlider: document.getElementById('volumenstromSlider'), tempZuluftSlider: document.getElementById('tempZuluftSlider'),
        rhZuluftSlider: document.getElementById('rhZuluftSlider'), volumenstromLabel: document.getElementById('volumenstromLabel'),
        tempZuluftLabel: document.getElementById('tempZuluftLabel'), rhZuluftLabel: document.getElementById('rhZuluftLabel'),
        resetSlidersBtn: document.getElementById('resetSlidersBtn'),
        processOverviewContainer: document.getElementById('process-overview-container'),
        nodes: [document.getElementById('node-0'), document.getElementById('node-1'), document.getElementById('node-2'), document.getElementById('node-3'), document.getElementById('node-final')],
        compVE: { node: document.getElementById('comp-ve'), p: document.getElementById('res-p-ve'), wv: document.getElementById('res-wv-ve') },
        compK: { node: document.getElementById('comp-k'), p: document.getElementById('res-p-k'), kondensat: document.getElementById('res-kondensat'), wv: document.getElementById('res-wv-k') },
        compNE: { node: document.getElementById('comp-ne'), p: document.getElementById('res-p-ne'), wv: document.getElementById('res-wv-ne') },
        summaryContainer: document.getElementById('summary-container'),
        referenceDetails: document.getElementById('reference-details'),
        kostenReferenz: document.getElementById('kostenReferenz'),
        kostenAenderung: document.getElementById('kostenAenderung'), tempAenderung: document.getElementById('tempAenderung'),
        rhAenderung: document.getElementById('rhAenderung'), volumenAenderung: document.getElementById('volumenAenderung'),
        gesamtleistungWaerme: document.getElementById('gesamtleistungWaerme'), gesamtleistungKaelte: document.getElementById('gesamtleistungKaelte'),
        kostenHeizung: document.getElementById('kostenHeizung'), kostenKuehlung: document.getElementById('kostenKuehlung'),
        kostenGesamt: document.getElementById('kostenGesamt'), setReferenceBtn: document.getElementById('setReferenceBtn'),
        kuehlmodusInputs: document.querySelectorAll('input[name="kuehlmodus"]'), kuehlmodusWrapper: document.getElementById('kuehlmodusWrapper'),
        sollFeuchteWrapper: document.getElementById('sollFeuchteWrapper'),
        tempHeizVorlauf: document.getElementById('tempHeizVorlauf'), tempHeizRuecklauf: document.getElementById('tempHeizRuecklauf'),
        tempKuehlVorlauf: document.getElementById('tempKuehlVorlauf'), tempKuehlRuecklauf: document.getElementById('tempKuehlRuecklauf'),
        preisKaelte: document.getElementById('preisKaelte'),
        stundenHeizen: document.getElementById('stundenHeizen'), stundenKuehlen: document.getElementById('stundenKuehlen'),
        jahreskostenWaerme: document.getElementById('jahreskostenWaerme'),
        jahreskostenKaelte: document.getElementById('jahreskostenKaelte'),
        jahreskostenGesamt: document.getElementById('jahreskostenGesamt'),
        jahresverbrauchWaerme: document.getElementById('jahresverbrauchWaerme'),
        jahresverbrauchKaelte: document.getElementById('jahresverbrauchKaelte'),
        jahresverbrauchVentilator: document.getElementById('jahresverbrauchVentilator'),
        fanCostActive: document.getElementById('fanCostActive'),
        sfp: document.getElementById('sfp'),
        betriebsstundenGesamt: document.getElementById('betriebsstundenGesamt'),
        betriebstageGesamt: document.getElementById('betriebstageGesamt'),
        kostenVentilator: document.getElementById('kostenVentilator'),
        jahreskostenVentilator: document.getElementById('jahreskostenVentilator'),
        fanCostDisplays: document.querySelectorAll('.fan-cost-display'),
        leistungVentilator: document.getElementById('leistungVentilator'),
    };
    
    const allInteractiveElements = document.querySelectorAll('input, select');
    storeInitialValues(); 

    const TOLERANCE = 0.01; const CP_WASSER = 4.186; const RHO_WASSER = 1000;
    const MIN_DEW_POINT = 0.5; 

    function getPs(T) { if (T >= 0) return 611.2 * Math.exp((17.62 * T) / (243.12 + T)); else return 611.2 * Math.exp((22.46 * T) / (272.62 + T)); }
    function getX(T, rH, p) { if (p <= 0) return Infinity; const p_s = getPs(T); const p_v = (rH / 100) * p_s; if (p_v >= p) return Infinity; return 622 * (p_v / (p - p_v)); }
    function getRh(T, x, p) { if (p <= 0) return 0; const p_s = getPs(T); if (p_s <= 0) return 0; const p_v = (p * x) / (622 + x); return Math.min(100, (p_v / p_s) * 100); }
    function getTd(x, p) { const p_v = (p * x) / (622 + x); if (p_v < 611.2) return -60; const log_pv_ratio = Math.log(p_v / 611.2); return (243.12 * log_pv_ratio) / (17.62 - log_pv_ratio); }
    function getH(T, x_g_kg) { if (!isFinite(x_g_kg)) return Infinity; const x_kg_kg = x_g_kg / 1000.0; return 1.006 * T + x_kg_kg * (2501 + 1.86 * T); }

    function enforceLimits(el) {
        if (!el || el.type !== 'number' || !el.hasAttribute('min')) return;
        const value = parseFloat(el.value);
        const min = parseFloat(el.min);
        const max = parseFloat(el.max);
        if (!isNaN(value)) {
            if (value < min) el.value = min;
            if (value > max) el.value = max;
        }
    }

    function calculateAll() {
        try {
            const checkedKuehlmodus = document.querySelector('input[name="kuehlmodus"]:checked');
            const inputs = {
                tempAussen: parseFloat(dom.tempAussen.value) || 0, rhAussen: parseFloat(dom.rhAussen.value) || 0,
                tempZuluft: parseFloat(dom.tempZuluft.value) || 0, rhZuluft: parseFloat(dom.rhZuluft.value) || 0,
                volumenstrom: parseFloat(dom.volumenstrom.value) || 0,
                kuehlerAktiv: dom.kuehlerAktiv.checked, tempVorerhitzerSoll: 5.0,
                druck: (parseFloat(dom.druck.value) || 1013.25) * 100,
                preisWaerme: parseFloat(dom.preisWaerme.value) || 0, preisStrom: parseFloat(dom.preisStrom.value) || 0,
                kuehlmodus: checkedKuehlmodus ? checkedKuehlmodus.value : 'dehumidify',
                tempHeizVorlauf: parseFloat(dom.tempHeizVorlauf.value) || 0, tempHeizRuecklauf: parseFloat(dom.tempHeizRuecklauf.value) || 0,
                tempKuehlVorlauf: parseFloat(dom.tempKuehlVorlauf.value) || 0, tempKuehlRuecklauf: parseFloat(dom.tempKuehlRuecklauf.value) || 0,
                preisKaelte: parseFloat(dom.preisKaelte.value) || 0,
                stundenHeizen: parseFloat(dom.stundenHeizen.value) || 0,
                stundenKuehlen: parseFloat(dom.stundenKuehlen.value) || 0,
                fanCostActive: dom.fanCostActive.checked, sfp: parseFloat(dom.sfp.value) || 0,
                betriebsstundenGesamt: parseFloat(dom.betriebsstundenGesamt.value) || 0,
            };
            
            let plausibilityWarning = null;

            const aussen = { t: inputs.tempAussen, rh: inputs.rhAussen, x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck) };
            if (!isFinite(aussen.x)) { dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Fehler im Außenluft-Zustand.</div>`; return; }
            aussen.h = getH(aussen.t, aussen.x);
            
            const massenstrom_kg_s = (inputs.volumenstrom / 3600) * 1.2;
            const zuluftSoll = { t: inputs.tempZuluft };
            if (inputs.kuehlerAktiv && inputs.kuehlmodus === 'dehumidify') {
                 zuluftSoll.rh = inputs.rhZuluft;
                 zuluftSoll.x = getX(zuluftSoll.t, zuluftSoll.rh, inputs.druck); 
                 const zielTaupunkt = getTd(zuluftSoll.x, inputs.druck);
                 
                 if (zielTaupunkt < inputs.tempKuehlVorlauf) { 
                    plausibilityWarning = `Plausibilitätsfehler: Kühlwassertemperatur (${formatGerman(inputs.tempKuehlVorlauf, 1)}°C) ist zu hoch, um Luft auf den erforderlichen Taupunkt von ${formatGerman(zielTaupunkt, 1)}°C abzukühlen.`;
                 } else if (zielTaupunkt < MIN_DEW_POINT) {
                     plausibilityWarning = `Warnung: Feuchte-Sollwert erfordert Abkühlung unter ${MIN_DEW_POINT}°C.`;
                 }
            } else {
                zuluftSoll.x = aussen.x;
                zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck);
            }
            zuluftSoll.h = getH(zuluftSoll.t, zuluftSoll.x);

            let states = [aussen, {...aussen}, {...aussen}, {...aussen}];
            let operations = { ve: {p:0, wv:0}, k: {p:0, kondensat:0, wv:0}, ne: {p:0, wv:0} };
            
            let currentState = states[0];
            if (currentState.t < inputs.tempVorerhitzerSoll) {
                const hNach = getH(inputs.tempVorerhitzerSoll, currentState.x);
                operations.ve.p = massenstrom_kg_s * (hNach - currentState.h);
                currentState = {t: inputs.tempVorerhitzerSoll, h: hNach, x: currentState.x, rh: getRh(inputs.tempVorerhitzerSoll, currentState.x, inputs.druck)};
            }
            states[1] = { ...currentState };
            
            if (inputs.kuehlerAktiv && currentState.t > zuluftSoll.t + TOLERANCE) {
                if (inputs.kuehlmodus === 'dehumidify' && currentState.x > zuluftSoll.x + TOLERANCE) {
                    const tempNachKuehler = getTd(zuluftSoll.x, inputs.druck);
                    const hNachKuehler = getH(tempNachKuehler, zuluftSoll.x);
                    operations.k.p = massenstrom_kg_s * (currentState.h - hNachKuehler);
                    operations.k.kondensat = massenstrom_kg_s * (currentState.x - zuluftSoll.x) / 1000 * 3600;
                    currentState = { t: tempNachKuehler, h: hNachKuehler, x: zuluftSoll.x, rh: getRh(tempNachKuehler, zuluftSoll.x, inputs.druck) };
                } else if (inputs.kuehlmodus === 'sensible') {
                    const startDewPoint = getTd(currentState.x, inputs.druck);
                    if (zuluftSoll.t < startDewPoint) {
                        const x_final = getX(zuluftSoll.t, 100, inputs.druck);
                        const h_final = getH(zuluftSoll.t, x_final);
                        operations.k.p = massenstrom_kg_s * (currentState.h - h_final);
                        operations.k.kondensat = massenstrom_kg_s * (currentState.x - x_final) / 1000 * 3600;
                        currentState = { t: zuluftSoll.t, h: h_final, x: x_final, rh: getRh(zuluftSoll.t, x_final, inputs.druck) };
                    } else {
                        const h_final = getH(zuluftSoll.t, currentState.x);
                        operations.k.p = massenstrom_kg_s * (currentState.h - h_final);
                        currentState = { t: zuluftSoll.t, h: h_final, x: currentState.x, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck)};
                    }
                }
            }
            states[2] = { ...currentState };

            if (currentState.t < zuluftSoll.t - TOLERANCE) {
                const h_final = getH(zuluftSoll.t, currentState.x);
                operations.ne.p = massenstrom_kg_s * (h_final - currentState.h);
                currentState = { t: zuluftSoll.t, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck), x: currentState.x, h: h_final };
            }
            states[3] = { ...currentState };

            const deltaT_heiz = Math.abs(inputs.tempHeizVorlauf - inputs.tempHeizRuecklauf);
            if (deltaT_heiz > 0) {
                operations.ve.wv = (operations.ve.p / (RHO_WASSER * CP_WASSER * deltaT_heiz)) * 3600;
                operations.ne.wv = (operations.ne.p / (RHO_WASSER * CP_WASSER * deltaT_heiz)) * 3600;
            }
            const deltaT_kuehl = Math.abs(inputs.tempKuehlRuecklauf - inputs.tempKuehlVorlauf);
            if (deltaT_kuehl > 0) operations.k.wv = (operations.k.p / (RHO_WASSER * CP_WASSER * deltaT_kuehl)) * 3600;
            
            currentPowers.waerme = operations.ve.p + operations.ne.p;
            currentPowers.kaelte = operations.k.p;
            
            renderAll(states, operations, inputs, plausibilityWarning);
        } catch (error) {
            console.error("Ein Fehler ist in calculateAll aufgetreten:", error);
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Ein unerwarteter Fehler ist aufgetreten.</div>`;
        }
    }
    
    function formatGerman(num, decimals = 0) {
        if (isNaN(num)) return '--';
        return num.toLocaleString('de-DE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function renderAll(states, operations, inputs, plausibilityWarning) {
        const finalState = states[3];
        const startState = states[0];
        let colors = ['color-green', 'color-green', 'color-green', 'color-green'];
        colors[1] = operations.ve.p > 0 ? 'color-red' : colors[0];
        colors[2] = operations.k.p > 0 ? 'color-blue' : colors[1];
        colors[3] = operations.ne.p > 0 ? 'color-red' : colors[2];
        const finalColor = finalState.t < startState.t - TOLERANCE ? 'color-blue' : (finalState.t > startState.t + TOLERANCE ? 'color-red' : 'color-green');

        for (let i = 0; i <= 4; i++) {
            const node = dom.nodes[i];
            const state = (i < 4) ? states[i] : finalState;
            let color = (i < 4) ? colors[i] : finalColor;
            let isInactive = false;
            if (i > 0 && i < 4) {
                const opKey = Object.keys(operations)[i-1];
                isInactive = operations[opKey].p <= 0;
            }
            updateStateNode(node, state, color, isInactive);
        }
        
        updateComponentNode(dom.compVE, operations.ve.p, -1, operations.ve.wv);
        updateComponentNode(dom.compK, operations.k.p, operations.k.kondensat, operations.k.wv);
        updateComponentNode(dom.compNE, operations.ne.p, -1, operations.ne.wv);

        if (plausibilityWarning) {
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">${plausibilityWarning}</div>`;
        } else {
            const activeSteps = Object.values(operations).filter(op => op.p > 0);
            if (activeSteps.length > 0) {
                const activeNames = Object.entries(operations).filter(([,op]) => op.p > 0).map(([key]) => key.toUpperCase());
                const overviewClass = currentPowers.kaelte > 0 ? 'process-info' : 'process-heating';
                dom.processOverviewContainer.innerHTML = `<div class="process-overview ${overviewClass}">Prozesskette: ${activeNames.join(' → ')}</div>`;
            } else {
                dom.processOverviewContainer.innerHTML = `<div class="process-overview process-success">Idealzustand</div>`;
            }
        }

        dom.summaryContainer.innerHTML = (operations.ve.p > 0 && operations.ne.p > 0) ? `<div class="process-step summary"><h4>➕ Gesamt-Heizleistung</h4><div class="result-grid"><div class="result-item"><span class="label">Leistung (VE + NE)</span><span class="value">${formatGerman(currentPowers.waerme, 2)} kW</span></div></div></div>` : '';
        
        dom.gesamtleistungWaerme.textContent = `${formatGerman(currentPowers.waerme, 2)} kW`;
        dom.gesamtleistungKaelte.textContent = `${formatGerman(currentPowers.kaelte, 2)} kW`;

        const leistungVentilator = (inputs.sfp * inputs.volumenstrom) / 1000;
        dom.leistungVentilator.textContent = `${formatGerman(leistungVentilator, 2)} kW`;
        
        const kostenHeizung = currentPowers.waerme * inputs.preisWaerme;
        const kostenKuehlung = currentPowers.kaelte * inputs.preisKaelte;
        const kostenVentilator = inputs.fanCostActive ? leistungVentilator * inputs.preisStrom : 0;
        
        currentTotalCost = kostenHeizung + kostenKuehlung + kostenVentilator;
        
        dom.kostenHeizung.textContent = `${formatGerman(kostenHeizung, 2)} €/h`;
        dom.kostenHeizung.parentElement.title = `${formatGerman(currentPowers.waerme,2)} kW × ${formatGerman(inputs.preisWaerme,2)} €/kWh`;
        dom.kostenKuehlung.textContent = `${formatGerman(kostenKuehlung, 2)} €/h`;
        dom.kostenKuehlung.parentElement.title = `${formatGerman(currentPowers.kaelte,2)} kW × ${formatGerman(inputs.preisKaelte,2)} €/kWh`;
        dom.kostenVentilator.textContent = `${formatGerman(kostenVentilator, 2)} €/h`;
        dom.kostenVentilator.parentElement.title = `${formatGerman(leistungVentilator,2)} kW × ${formatGerman(inputs.preisStrom,2)} €/kWh`;
        dom.kostenGesamt.textContent = `${formatGerman(currentTotalCost, 2)} €/h`;
        
        const jahresVerbrauchWaerme = currentPowers.waerme * inputs.stundenHeizen;
        const jahresVerbrauchKaelte = currentPowers.kaelte * inputs.stundenKuehlen;
        const jahresVerbrauchVentilator = inputs.fanCostActive ? leistungVentilator * inputs.betriebsstundenGesamt : 0;
        
        dom.jahresverbrauchWaerme.textContent = `${formatGerman(jahresVerbrauchWaerme, 0)} kWh/a`;
        dom.jahresverbrauchKaelte.textContent = `${formatGerman(jahresVerbrauchKaelte, 0)} kWh/a`;
        dom.jahresverbrauchVentilator.textContent = `${formatGerman(jahresVerbrauchVentilator, 0)} kWh/a`;

        const jahreskostenWaerme = jahresVerbrauchWaerme * inputs.preisWaerme;
        const jahreskostenKaelte = jahresVerbrauchKaelte * inputs.preisKaelte;
        const jahreskostenVentilator = jahresVerbrauchVentilator * inputs.preisStrom;
        dom.jahreskostenWaerme.textContent = `${formatGerman(jahreskostenWaerme, 0)} €/a`;
        dom.jahreskostenWaerme.parentElement.title = `${formatGerman(jahresVerbrauchWaerme,0)} kWh/a × ${formatGerman(inputs.preisWaerme,2)} €/kWh`;
        dom.jahreskostenKaelte.textContent = `${formatGerman(jahreskostenKaelte, 0)} €/a`;
        dom.jahreskostenKaelte.parentElement.title = `${formatGerman(jahresVerbrauchKaelte,0)} kWh/a × ${formatGerman(inputs.preisKaelte,2)} €/kWh`;
        dom.jahreskostenVentilator.textContent = `${formatGerman(jahreskostenVentilator, 0)} €/a`;
        dom.jahreskostenVentilator.parentElement.title = `${formatGerman(jahresVerbrauchVentilator,0)} kWh/a × ${formatGerman(inputs.preisStrom,2)} €/kWh`;
        dom.jahreskostenGesamt.textContent = `${formatGerman(jahreskostenWaerme + jahreskostenKaelte + jahreskostenVentilator, 0)} €/a`;
        
        dom.fanCostDisplays.forEach(d => d.classList.toggle('hidden', !inputs.fanCostActive));
        
        dom.setReferenceBtn.className = referenceState ? 'activated' : '';
        dom.setReferenceBtn.textContent = referenceState ? 'Referenz gesetzt' : 'Referenz festlegen';

        dom.referenceDetails.classList.toggle('invisible', !referenceState);
        if (referenceState) {
            dom.kostenReferenz.textContent = `${formatGerman(referenceState.cost, 2)} €/h`;
            const changeAbs = currentTotalCost - referenceState.cost;
            const changePerc = referenceState.cost > 0 ? (changeAbs / referenceState.cost) * 100 : 0;
            const sign = changeAbs >= 0 ? '+' : '';
            const changeClass = changeAbs < -TOLERANCE ? 'saving' : (changeAbs > TOLERANCE ? 'expense' : '');
            dom.kostenAenderung.textContent = `${sign}${formatGerman(changeAbs, 2)} €/h (${sign}${formatGerman(changePerc,1)} %)`;
            dom.kostenAenderung.className = `cost-value ${changeClass}`;
            const deltaTemp = inputs.tempZuluft - referenceState.temp;
            dom.tempAenderung.textContent = `${deltaTemp >= 0 ? '+' : ''}${formatGerman(deltaTemp,1)} °C`;
            const deltaRh = inputs.rhZuluft - referenceState.rh;
            dom.rhAenderung.textContent = `${deltaRh >= 0 ? '+' : ''}${formatGerman(deltaRh,1)} %`;
            const deltaVol = inputs.volumenstrom - referenceState.vol;
            dom.volumenAenderung.textContent = `${deltaVol >= 0 ? '+' : ''}${formatGerman(deltaVol,0)} m³/h`;
        }
    }
    
    function updateStateNode(node, state, colorClass, isInactive = false) {
        node.className = 'state-node';
        if (colorClass) node.classList.add(colorClass);
        if (isInactive) node.classList.add('inactive');
        if(node.id === 'node-final') node.classList.add('final-state');
        const spans = node.querySelectorAll('span');
        spans[1].textContent = formatGerman(state.t, 1);
        spans[3].textContent = formatGerman(state.rh, 1);
        spans[5].textContent = formatGerman(state.x, 2);
    }
    function updateComponentNode(comp, power, kondensat = -1, wasserstrom = 0) {
        comp.p.textContent = formatGerman(power, 2);
        comp.node.classList.toggle('active', power > 0);
        comp.node.classList.toggle('inactive', power <= 0);
        if (comp.kondensat) comp.kondensat.textContent = formatGerman(kondensat, 2);
        if (comp.wv) comp.wv.textContent = formatGerman(wasserstrom, 2);
    }

    function handleSetReference() {
        referenceState = { cost: currentTotalCost, temp: parseFloat(dom.tempZuluft.value), rh: parseFloat(dom.rhZuluft.value), vol: parseFloat(dom.volumenstrom.value) };
        dom.resetSlidersBtn.disabled = false;
        calculateAll();
    }
    
    function resetToDefaults() {
        allInteractiveElements.forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') { el.checked = el.dataset.defaultChecked === 'true'; } 
            else if(el.dataset.defaultValue) { el.value = el.dataset.defaultValue; }
        });
        referenceState = null;
        dom.resetSlidersBtn.disabled = true;
        
        syncAllSlidersToInputs();
        handleKuehlerToggle();
        calculateAll();
    }
    
    function resetSlidersToRef() {
        if (!referenceState) return;
        dom.tempZuluft.value = referenceState.temp.toFixed(1);
        dom.rhZuluft.value = referenceState.rh.toFixed(1);
        dom.volumenstrom.value = referenceState.vol;
        syncAllSlidersToInputs();
        calculateAll();
    }

    function handleKuehlerToggle() {
        const isActive = dom.kuehlerAktiv.checked;
        dom.kuehlmodusWrapper.classList.toggle('disabled', !isActive);
        dom.kuehlmodusInputs.forEach(radio => radio.disabled = !isActive);
        const checkedKuehlmodus = document.querySelector('input[name="kuehlmodus"]:checked');
        const isDehumidify = checkedKuehlmodus ? checkedKuehlmodus.value === 'dehumidify' : false;
        dom.sollFeuchteWrapper.style.display = isActive && isDehumidify ? 'block' : 'none';
    }
    
    function syncAllSlidersToInputs(){
        syncSliderToInput(dom.volumenstrom, dom.volumenstromSlider, dom.volumenstromLabel);
        syncSliderToInput(dom.tempZuluft, dom.tempZuluftSlider, dom.tempZuluftLabel, true);
        syncSliderToInput(dom.rhZuluft, dom.rhZuluftSlider, dom.rhZuluftLabel, true);
    }
    function syncSliderToInput(input, slider, label, isFloat = false) {
        const newValue = parseFloat(input.value);
        if(isNaN(newValue)) return;
        
        if (input.id === 'volumenstrom') {
            slider.min = Math.round(newValue * 0.5 / 100) * 100;
            slider.max = Math.round(newValue * 1.5 / 100) * 100;
        }
        if (input.id === 'tempZuluft') {
            slider.min = (newValue - 6).toFixed(1);
            slider.max = (newValue + 6).toFixed(1);
        }
        slider.value = newValue;
        label.textContent = isFloat ? formatGerman(newValue, 1) : formatGerman(newValue, 0);
    }

    function updateBetriebszeit(sourceId) {
        if (sourceId === 'betriebsstundenGesamt') {
            const stunden = parseFloat(dom.betriebsstundenGesamt.value);
            if (!isNaN(stunden)) dom.betriebstageGesamt.value = (stunden / 24).toFixed(1);
        } else if (sourceId === 'betriebstageGesamt') {
            const tage = parseFloat(dom.betriebstageGesamt.value);
            if (!isNaN(tage)) dom.betriebsstundenGesamt.value = (tage * 24).toFixed(0);
        }
    }
    
    function storeInitialValues() {
        allInteractiveElements.forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.dataset.defaultChecked = el.checked;
            } else {
                el.dataset.defaultValue = el.value;
            }
        });
    }

    function addEventListeners() {
        // --- Buttons ---
        if (dom.resetBtn) dom.resetBtn.addEventListener('click', resetToDefaults);
        if (dom.resetSlidersBtn) dom.resetSlidersBtn.addEventListener('click', resetSlidersToRef);
        if (dom.setReferenceBtn) dom.setReferenceBtn.addEventListener('click', handleSetReference);

        // --- All other inputs and selects ---
        const allInputs = document.querySelectorAll('input:not([type=button]), select');
        allInputs.forEach(el => {
            const eventType = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
            el.addEventListener(eventType, (e) => {
                const target = e.target;
                if (target.type === 'number') enforceLimits(target);
                
                if (target.type === 'range') {
                    const inputId = target.id.replace('Slider', '');
                    const value = parseFloat(target.value);
                    const isFloat = inputId !== 'volumenstrom';
                    dom[inputId].value = isNaN(value) ? '' : (isFloat ? value.toFixed(1) : value);
                    dom[inputId+'Label'].textContent = formatGerman(value, isFloat ? 1 : 0);
                } else if (dom[target.id + 'Slider']) {
                    syncAllSlidersToInputs();
                }
                
                if (target.id === 'betriebsstundenGesamt' || target.id === 'betriebstageGesamt') {
                    updateBetriebszeit(target.id);
                }
                
                if (target.id === 'kuehlerAktiv' || target.name === 'kuehlmodus' || target.id === 'feuchteSollTyp') {
                    handleKuehlerToggle();
                }
                calculateAll();
            });
        });
    }

    addEventListeners();
    handleKuehlerToggle();
    syncAllSlidersToInputs();
    calculateAll();
});
