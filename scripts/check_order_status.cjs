#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');

const PROJECT_ID = 'future-factory-377ef';
const ORDER_ID   = 'N20024607';

const getToken = () => {
    // Probeer firebase token te krijgen via CLI
    try {
        const t = execSync('firebase auth:export --json', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
        // Dit is niet de juiste manier voor een access token, maar we proberen gewoon gcloud als die er is
    } catch (_) {}
    
    try {
        const t = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
        if (t) return t;
    } catch (_) {}

    throw new Error('Geen geldig access token gevonden. Voer gcloud auth login uit.');
};

async function main() {
    let token;
    try {
        token = getToken();
    } catch (e) {
        console.error(e.message);
        return;
    }

    const apiGet = (path) => new Promise((res, rej) => {
        const req = https.request({
            hostname: 'firestore.googleapis.com', path, method: 'GET',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
        }, (r) => { 
            let d = ''; 
            r.on('data', c => d += c); 
            r.on('end', () => { 
                try { 
                    const parsed = JSON.parse(d);
                    if (parsed.error) {
                        console.error(`API Error op ${path}:`, parsed.error.message);
                        res(null);
                    } else {
                        res(parsed);
                    }
                } catch(e) { res({}); } 
            }); 
        });
        req.on('error', rej); req.end();
    });

    const runQuery = (collectionId, field, value, allDescendants) => new Promise((res, rej) => {
        const body = JSON.stringify({
            structuredQuery: {
                from: [{ collectionId, allDescendants: !!allDescendants }],
                where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
                limit: 100
            }
        });
        const path = '/v1/projects/' + PROJECT_ID + '/databases/(default)/documents:runQuery';
        const req = https.request({
            hostname: 'firestore.googleapis.com', path, method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (r) => { 
            let d = ''; 
            r.on('data', c => d += c); 
            r.on('end', () => { 
                try { 
                    const parsed = JSON.parse(d);
                    if (parsed.error) {
                         console.error(`Query Error op ${collectionId}:`, parsed.error.message);
                         res([]);
                    } else {
                        res(parsed); 
                    }
                } catch(e) { res([]); } 
            }); 
        });
        req.on('error', rej); req.write(body); req.end();
    });

    const strVal = (f) => f?.stringValue || '';
    const jsVal = (f) => {
        if (!f) return null;
        if (f.stringValue !== undefined) return f.stringValue;
        if (f.integerValue !== undefined) return parseInt(f.integerValue, 10);
        if (f.doubleValue !== undefined) return parseFloat(f.doubleValue);
        if (f.booleanValue !== undefined) return f.booleanValue;
        if (f.timestampValue !== undefined) return f.timestampValue;
        return null;
    };

    console.log(`=== Diagnose order: ${ORDER_ID} ===`);

    // 1. Zoek in actieve planning
    console.log('\n--- Zoeken in actieve planning (digital_planning) ---');
    const activeResults = await runQuery('orders', 'orderId', ORDER_ID, true);
    if (activeResults && activeResults.length > 0 && activeResults[0].document) {
        activeResults.forEach(r => {
            const d = r.document;
            console.log('  Gevonden in:', d.name.split('/databases/(default)/documents/')[1]);
            console.log('  Status:', strVal(d.fields.status));
            console.log('  Quantity:', jsVal(d.fields.quantity));
        });
    } else {
        console.log('  Niet gevonden in actieve planning.');
    }

    // 2. Zoek in archief
    console.log('\n--- Zoeken in archief (2024-2026) ---');
    for (const year of [2026, 2025, 2024]) {
        const archResults = await runQuery('planning', 'orderId', ORDER_ID, true);
        // We filteren handmatig op het pad omdat runQuery op collectionId 'planning' alle jaren kan pakken als we niet oppassen
        // Maar het pad bevat meestal het jaar.
        const matches = (archResults || []).filter(r => r.document && r.document.name.includes(`/archive/${year}/`));
        if (matches.length > 0) {
            matches.forEach(r => {
                const d = r.document;
                console.log(`  Gevonden in archief ${year}:`, d.name.split('/databases/(default)/documents/')[1]);
                console.log('  Status:', strVal(d.fields.status));
                console.log('  Quantity:', jsVal(d.fields.quantity));
            });
        } else {
            console.log(`  Niets in archief ${year}.`);
        }
    }
}

main();
