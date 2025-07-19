document.addEventListener('DOMContentLoaded', () => {

    let referenceState = null;
    let currentTotalCost = 0;
    let currentPowers = { waerme: 0, kaelte: 0, ventilator: 0 };

    const dom = {
        // Inputs
        tempAussen: document.getElementById('tempAussen'), rhAussen: document.getElementById('rhAussen'),
        tempZuluft: document.getElementById('tempZuluft'), rhZuluft: document.getElementById('rhZuluft'),
        volumenstrom: document.getElementById('volumenstrom'),
        druck: document.getElementById('druck'),
        kuehlerAktiv: document.getElementById('kuehlerAktiv'),
        preisWaerme: document.getElementById('preisWaerme'),
        preisKaelte: document.getElementById('preisKaelte'),
        preisStrom: document.getElementById('preisStrom'),
        sfp: document.getElementById('sfp'),
        stundenHeizen: document.getElementById('stundenHeizen'),
        stundenKuehlen: document.getElementById('stundenKuehlen'),
        betriebsstundenGesamt: document.getElementById('betriebsstundenGesamt'),
        kuehlmodusInputs: document.querySelectorAll('input[name="kuehlmodus"]'),
        
        // Sliders & Labels
        volumenstromSlider: document.getElementById('volumenstromSlider'), tempZuluftSlider: document.getElementById('tempZuluftSlider'),
        rhZuluftSlider: document.getElementById('rhZuluftSlider'), volumenstromLabel: document.getElementById('volumenstromLabel'),
        tempZuluftLabel: document.getElementById('tempZuluftLabel'), rhZuluftLabel: document.getElementById('rhZuluftLabel'),
        rhZuluftSliderGroup: document.getElementById('rhZuluftSliderGroup'),

        // Buttons
        resetBtn: document.getElementById('resetBtn'),
        resetSlidersBtn: document.getElementById('resetSlidersBtn'),
        setReferenceBtn: document.getElementById('setReferenceBtn'),
        
        // Process Display
        processOverviewContainer: document.getElementById('process-overview-container'),
        nodes: [document.getElementById('node-0'), document.getElementById('node-1'), document.getElementById('node-2'), document.getElementById('node-3'), document.getElementById('node-final')],
        compVE: { node: document.getElementById('comp-ve'), p: document.getElementById('res-p-ve') },
        compK: { node: document.getElementById('comp-k'), p: document.getElementById('res-p-k'), kondensat: document.getElementById('res-kondensat') },
        compNE: { node: document.getElementById('comp-ne'), p: document.getElementById('res-p-ne') },
        
        // Reference Display
        kostenReferenz: document.getElementById('kostenReferenz'),
        kostenAenderung: document.getElementById('kostenAenderung'), tempAenderung: document.getElementById('tempAenderung'),
        rhAenderung: document.getElementById('rhAenderung'), volumenAenderung: document.getElementById('volumenAenderung'),
        
        // Hourly Results
        gesamtleistungWaerme: document.getElementById('gesamtleistungWaerme'),
        gesamtleistungKaelte: document.getElementById('gesamtleistungKaelte'),
        leistungVentilator: document.getElementById('leistungVentilator'),
        kostenHeizung: document.getElementById('kostenHeizung'),
        kostenKuehlung: document.getElementById('kostenKuehlung'),
        kostenVentilator: document.getElementById('kostenVentilator'),
        kostenGesamt: document.getElementById('kostenGesamt'),
        
        // Annual Results (Energy & Cost)
        jahresverbrauchWaerme: document.getElementById('jahresverbrauchWaerme'),
        jahresverbrauchKaelte: document.getElementById('jahresverbrauchKaelte'),
        jahresverbrauchVentilator: document.getElementById('jahresverbrauchVentilator'),
        jahreskostenWaerme: document.getElementById('jahreskostenWaerme'),
        jahreskostenKaelte: document.getElementById('jahreskostenKaelte'),
        jahreskostenVentilator: document.getElementById('jahreskostenVentilator'),
        jahreskostenGesamt: document.getElementById('jahreskostenGesamt'),
    };
    
    const allInteractiveElements = document.querySelectorAll('input');
    storeInitialValues(); 

    const TOLERANCE = 0.01; 

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
            const inputs = {
                tempAussen: parseFloat(dom.tempAussen.value) || 0, rhAussen: parseFloat(dom.rhAussen.value) || 0,
                tempZuluft: parseFloat(dom.tempZuluft.value) || 0, rhZuluft: parseFloat(dom.rhZuluft.value) || 0,
                volumenstrom: parseFloat(dom.volumenstrom.value) || 0,
                kuehlerAktiv: dom.kuehlerAktiv.checked, tempVorerhitzerSoll: 5.0,
                druck: (parseFloat(dom.druck.value) || 1013.25) * 100,
                preisWaerme: parseFloat(dom.preisWaerme.value) || 0,
                preisKaelte: parseFloat(dom.preisKaelte.value) || 0,
                preisStrom: parseFloat(dom.preisStrom.value) || 0,
                kuehlmodus: document.querySelector('input[name="kuehlmodus"]:checked').value,
                stundenHeizen: parseFloat(dom.stundenHeizen.value) || 0,
                stundenKuehlen: parseFloat(dom.stundenKuehlen.value) || 0,
                sfp: parseFloat(dom.sfp.value) || 0,
                betriebsstundenGesamt: parseFloat(dom.betriebsstundenGesamt.value) || 0,
            };

            const aussen = { t: inputs.tempAussen, rh: inputs.rhAussen, x: getX(inputs.tempAussen, inputs.rhAussen, inputs.druck) };
            if (!isFinite(aussen.x)) {
                dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Fehler im Außenluft-Zustand.</div>`;
                return;
            }
            aussen.h = getH(aussen.t, aussen.x);
            dom.processOverviewContainer.innerHTML = ''; 

            const massenstrom_kg_s = (inputs.volumenstrom / 3600) * 1.2;
            const zuluftSoll = { t: inputs.tempZuluft };

            const isDehumidifyActive = inputs.kuehlerAktiv && inputs.kuehlmodus === 'dehumidify';
            if (isDehumidifyActive) {
                 zuluftSoll.rh = inputs.rhZuluft;
                 zuluftSoll.x = getX(zuluftSoll.t, zuluftSoll.rh, inputs.druck); 
            } else {
                zuluftSoll.x = aussen.x;
                zuluftSoll.rh = getRh(zuluftSoll.t, zuluftSoll.x, inputs.druck);
            }
            zuluftSoll.h = getH(zuluftSoll.t, zuluftSoll.x);

            let states = [aussen, {...aussen}, {...aussen}, {...aussen}];
            let operations = { ve: {p:0}, k: {p:0, kondensat:0}, ne: {p:0} };
            
            let currentState = { ...states[0] };
            if (currentState.t < inputs.tempVorerhitzerSoll) {
                const hNach = getH(inputs.tempVorerhitzerSoll, currentState.x);
                operations.ve.p = massenstrom_kg_s * (hNach - currentState.h);
                currentState = {t: inputs.tempVorerhitzerSoll, h: hNach, x: currentState.x, rh: getRh(inputs.tempVorerhitzerSoll, currentState.x, inputs.druck)};
            }
            states[1] = { ...currentState };
            
            if (inputs.kuehlerAktiv && (currentState.h > zuluftSoll.h + TOLERANCE || (isDehumidifyActive && currentState.x > zuluftSoll.x + TOLERANCE))) {
                if (isDehumidifyActive) {
                    const tempNachKuehler = getTd(zuluftSoll.x, inputs.druck);
                    const hNachKuehler = getH(tempNachKuehler, zuluftSoll.x);
                    operations.k.p = massenstrom_kg_s * (currentState.h - hNachKuehler);
                    operations.k.kondensat = massenstrom_kg_s * (currentState.x - zuluftSoll.x) / 1000 * 3600;
                    currentState = { t: tempNachKuehler, h: hNachKuehler, x: zuluftSoll.x, rh: getRh(tempNachKuehler, zuluftSoll.x, inputs.druck) };
                } else { // Sensible cooling
                    const h_final = getH(zuluftSoll.t, currentState.x);
                    operations.k.p = massenstrom_kg_s * (currentState.h - h_final);
                    currentState = { t: zuluftSoll.t, h: h_final, x: currentState.x, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck)};
                }
            }
            states[2] = { ...currentState };

            if (currentState.t < zuluftSoll.t - TOLERANCE) {
                const h_final = getH(zuluftSoll.t, currentState.x);
                operations.ne.p = massenstrom_kg_s * (h_final - currentState.h);
                currentState = { t: zuluftSoll.t, rh: getRh(zuluftSoll.t, currentState.x, inputs.druck), x: currentState.x, h: h_final };
            }
            states[3] = { ...currentState };
            
            currentPowers.waerme = operations.ve.p + operations.ne.p;
            currentPowers.kaelte = operations.k.p;
            currentPowers.ventilator = (inputs.sfp * inputs.volumenstrom) / 1000;
            
            renderAll(states, operations, inputs);
        } catch (error) {
            console.error("Berechnungsfehler:", error);
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-error">Ein interner Berechnungsfehler ist aufgetreten.</div>`;
        }
    }
    
    function formatGerman(num, decimals = 0, unit = '') {
        if (isNaN(num) || !isFinite(num)) return '--';
        const formattedNum = num.toLocaleString('de-DE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
        return unit ? `${formattedNum} ${unit}` : formattedNum;
    }

    function renderAll(states, operations, inputs) {
        // Process Flow
        const finalState = states[3];
        let colors = ['color-green', 'color-green', 'color-green', 'color-green'];
        colors[1] = operations.ve.p > 0.01 ? 'color-red' : colors[0];
        colors[2] = operations.k.p > 0.01 ? 'color-blue' : colors[1];
        colors[3] = operations.ne.p > 0.01 ? 'color-red' : colors[2];
        const finalColor = finalState.t < states[0].t - TOLERANCE ? 'color-blue' : (finalState.t > states[0].t + TOLERANCE ? 'color-red' : 'color-green');

        for (let i = 0; i <= 4; i++) {
            const node = dom.nodes[i];
            const state = (i < 4) ? states[i] : finalState;
            let color = (i < 4) ? colors[i] : finalColor;
            let isInactive = (i > 0 && i < 4) ? (Object.values(operations)[i-1].p <= 0.01) : false;
            updateStateNode(node, state, color, isInactive);
        }
        
        updateComponentNode(dom.compVE, operations.ve.p);
        updateComponentNode(dom.compK, operations.k.p, operations.k.kondensat);
        updateComponentNode(dom.compNE, operations.ne.p);

        const activeNames = Object.entries(operations).filter(([,op]) => op.p > 0.01).map(([key]) => key.toUpperCase());
        if (activeNames.length > 0) {
            const overviewClass = currentPowers.kaelte > 0 ? 'process-info' : 'process-heating';
            dom.processOverviewContainer.innerHTML = `<div class="process-overview ${overviewClass}">Prozesskette: ${activeNames.join(' → ')}</div>`;
        } else {
            dom.processOverviewContainer.innerHTML = `<div class="process-overview process-success">Idealzustand (Freie Lüftung)</div>`;
        }

        const kostenHeizung = currentPowers.waerme * inputs.preisWaerme;
        const kostenKuehlung = currentPowers.kaelte * inputs.preisKaelte;
        const kostenVentilator = currentPowers.ventilator * inputs.preisStrom;
        currentTotalCost = kostenHeizung + kostenKuehlung + kostenVentilator;
        
        dom.gesamtleistungWaerme.textContent = formatGerman(currentPowers.waerme, 2);
        dom.gesamtleistungKaelte.textContent = formatGerman(currentPowers.kaelte, 2);
        dom.leistungVentilator.textContent = formatGerman(currentPowers.ventilator, 2);
        dom.kostenHeizung.textContent = formatGerman(kostenHeizung, 2);
        dom.kostenKuehlung.textContent = formatGerman(kostenKuehlung, 2);
        dom.kostenVentilator.textContent = formatGerman(kostenVentilator, 2);
        dom.kostenGesamt.textContent = formatGerman(currentTotalCost, 2);
        
        const jahresVerbrauchWaerme = currentPowers.waerme * inputs.stundenHeizen;
        const jahresVerbrauchKaelte = currentPowers.kaelte * inputs.stundenKuehlen;
        const jahresVerbrauchVentilator = currentPowers.ventilator * inputs.betriebsstundenGesamt;
        const jahreskostenWaerme = jahresVerbrauchWaerme * inputs.preisWaerme;
        const jahreskostenKaelte = jahresVerbrauchKaelte * inputs.preisKaelte;
        const jahreskostenVentilator = jahresVerbrauchVentilator * inputs.preisStrom;
        
        dom.jahresverbrauchWaerme.textContent = formatGerman(jahresVerbrauchWaerme, 0);
        dom.jahresverbrauchKaelte.textContent = formatGerman(jahresVerbrauchKaelte, 0);
        dom.jahresverbrauchVentilator.textContent = formatGerman(jahresVerbrauchVentilator, 0);
        dom.jahreskostenWaerme.textContent = formatGerman(jahreskostenWaerme, 0);
        dom.jahreskostenKaelte.textContent = formatGerman(jahreskostenKaelte, 0);
        dom.jahreskostenVentilator.textContent = formatGerman(jahreskostenVentilator, 0);
        dom.jahreskostenGesamt.textContent = formatGerman(jahreskostenWaerme + jahreskostenKaelte + jahreskostenVentilator, 0);
        
        dom.setReferenceBtn.className = referenceState ? 'activated' : '';
        dom.setReferenceBtn.textContent = referenceState ? 'Referenz gesetzt' : 'Referenz löschen';
        
        // Bugfix: Referenz-Anzeige immer sichtbar, Werte werden je nach Status gefüllt.
        if (referenceState) {
            dom.kostenReferenz.textContent = formatGerman(referenceState.cost, 2, '€/h');
            const changeAbs = currentTotalCost - referenceState.cost;
            const changePerc = referenceState.cost !== 0 ? (changeAbs / referenceState.cost) * 100 : 0;
            const sign = changeAbs >= 0 ? '+' : '';
            dom.kostenAenderung.textContent = `${sign}${formatGerman(changeAbs, 2)} €/h (${sign}${formatGerman(changePerc,0)} %)`;
            dom.kostenAenderung.className = `cost-value ${changeAbs < -TOLERANCE ? 'saving' : (changeAbs > TOLERANCE ? 'expense' : '')}`;
            dom.tempAenderung.textContent = formatGerman(inputs.tempZuluft - referenceState.temp, 1, '°C');
            dom.rhAenderung.textContent = formatGerman(inputs.rhZuluft - referenceState.rh, 1, '%');
            dom.volumenAenderung.textContent = formatGerman(inputs.volumenstrom - referenceState.vol, 0, 'm³/h');
        } else {
            ['kostenReferenz', 'kostenAenderung', 'tempAenderung', 'rhAenderung', 'volumenAenderung'].forEach(id => {
                dom[id].textContent = '--';
            });
            dom.kostenAenderung.className = 'cost-value';
        }
    }
    
    function updateStateNode(node, state, colorClass, isInactive) {
        node.className = 'state-node';
        if (colorClass) node.classList.add(colorClass);
        if (isInactive) node.classList.add('inactive');
        if(node.id === 'node-final') node.classList.add('final-state');
        node.querySelector('#res-t-' + node.id.slice(-1)).textContent = formatGerman(state.t, 1);
        node.querySelector('#res-rh-' + node.id.slice(-1)).textContent = formatGerman(state.rh, 1);
        node.querySelector('#res-x-' + node.id.slice(-1)).textContent = formatGerman(state.x, 2);
    }
    
    function updateComponentNode(comp, power, kondensat) {
        comp.node.classList.toggle('active', power > 0.01);
        comp.node.classList.toggle('inactive', power <= 0.01);
        comp.p.textContent = formatGerman(power, 2);
        if (comp.kondensat) comp.kondensat.textContent = formatGerman(kondensat, 1);
    }

    function handleSetReference() {
        if (referenceState) { // Wenn Referenz bereits gesetzt ist, wird sie gelöscht
            referenceState = null;
            dom.resetSlidersBtn.disabled = true;
        } else { // Ansonsten wird sie gesetzt
            if (isNaN(currentTotalCost)) { 
                console.error("Referenz konnte nicht gesetzt werden, da die aktuellen Kosten ungültig sind.");
                return;
            }
            referenceState = { 
                cost: currentTotalCost, temp: parseFloat(dom.tempZuluft.value), rh: parseFloat(dom.rhZuluft.value), vol: parseFloat(dom.volumenstrom.value) 
            };
            dom.resetSlidersBtn.disabled = false;
        }
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
        toggleKuehlerAnzeige();
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

    function toggleKuehlerAnzeige() {
        const isKuehlerAktiv = dom.kuehlerAktiv.checked;
        document.querySelector('.radio-group-container').classList.toggle('disabled', !isKuehlerAktiv);
        const isDehumidify = document.querySelector('input[name="kuehlmodus"]:checked').value === 'dehumidify';
        const showRhInputs = isKuehlerAktiv && isDehumidify;
        // Feuchte-Eingabefeld im Block "Luftzustände"
        dom.rhZuluft.closest('.input-group-inline').style.display = showRhInputs ? 'flex' : 'none';
        // Feuchte-Slider
        dom.rhZuluftSliderGroup.style.display = showRhInputs ? 'block' : 'none';
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
        } else {
            slider.min = (newValue - 6).toFixed(1);
            slider.max = (newValue + 6).toFixed(1);
        }
        slider.value = newValue;
        label.textContent = isFloat ? formatGerman(newValue, 1) : formatGerman(newValue, 0);
    }
    
    function storeInitialValues() {
        allInteractiveElements.forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') { el.dataset.defaultChecked = el.checked; }
            else { el.dataset.defaultValue = el.value; }
        });
    }
    
    // Event Listeners
    function addEventListeners() {
        allInteractiveElements.forEach(input => {
            input.addEventListener('input', () => {
                if (input.type === 'number') enforceLimits(input);
                if (input.name === 'kuehlmodus' || input.id === 'kuehlerAktiv') toggleKuehlerAnzeige();
                calculateAll();
            });
        });

        [dom.volumenstrom, dom.tempZuluft, dom.rhZuluft].forEach(input => {
            input.addEventListener('input', syncAllSlidersToInputs);
        });

        [dom.volumenstromSlider, dom.tempZuluftSlider, dom.rhZuluftSlider].forEach(slider => {
            slider.addEventListener('input', (e) => {
                const targetId = e.target.id.replace('Slider', '');
                const targetInput = dom[targetId];
                const targetLabel = dom[targetId + 'Label'];
                const isFloat = targetId.includes('temp') || targetId.includes('rh');
                const value = isFloat ? parseFloat(e.target.value).toFixed(1) : e.target.value;
                targetInput.value = value;
                targetLabel.textContent = isFloat ? formatGerman(parseFloat(value), 1) : formatGerman(parseFloat(value), 0);
                calculateAll();
            });
        });

        dom.resetBtn.addEventListener('click', resetToDefaults);
        dom.resetSlidersBtn.addEventListener('click', resetSlidersToRef);
        dom.setReferenceBtn.addEventListener('click', handleSetReference);
    }

    // Initialisierung
    addEventListeners();
    toggleKuehlerAnzeige();
    syncAllSlidersToInputs();
    calculateAll();
});
