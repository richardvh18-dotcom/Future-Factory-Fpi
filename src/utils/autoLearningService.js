/**
 * autoLearningService.js
 * Zelflerend systeem dat standaard productietijden automatisch bijwerkt
 * op basis van historische werkelijke data
 */

import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import { calculateDuration } from "./efficiencyCalculator";

/**
 * Analyseer voltooide producties en update standaard tijden
 * @param {Object} options - Configuratie opties
 * @param {number} options.minSamples - Minimum aantal samples voor update (default: 5)
 * @param {number} options.maxDeviation - Maximum afwijking percentage (default: 50)
 * @param {number} options.learningRate - Hoe snel het systeem leert (0-1, default: 0.3)
 * @param {boolean} options.dryRun - Test mode zonder daadwerkelijke updates
 * @returns {Promise<Object>} Update resultaten
 */
export const analyzeAndUpdateStandards = async (options = {}) => {
  const {
    minSamples = 5,
    maxDeviation = 50,
    learningRate = 0.3,
    dryRun = false
  } = options;

  const results = {
    analyzed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    recommendations: []
  };

  try {
    // Haal alle standaard tijden op
    const standardsSnapshot = await getDocs(collection(db, ...PATHS.PRODUCTION_STANDARDS));
    const standards = standardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`[Auto-Learning] Analyzing ${standards.length} standards...`);

    // Voor elke standaard, analyseer recente voltooide producties
    for (const standard of standards) {
      results.analyzed++;

      try {
        // Haal voltooide producties op voor dit product/machine
        const trackedQuery = query(
          collection(db, ...PATHS.TRACKING),
          where("item", "==", standard.itemCode),
          where("originMachine", "==", standard.machine),
          where("status", "==", "completed")
        );

        const trackedSnapshot = await getDocs(trackedQuery);
        const completedProducts = trackedSnapshot.docs.map(doc => doc.data());

        // Filter alleen producties met timestamps
        const validProducts = completedProducts.filter(p => 
          p.timestamps?.station_start && 
          (p.timestamps?.completed || p.timestamps?.finished)
        );

        if (validProducts.length < minSamples) {
          results.skipped++;
          console.log(
            `[Auto-Learning] Skipped ${standard.itemCode}/${standard.machine}: ` +
            `only ${validProducts.length} samples (min: ${minSamples})`
          );
          continue;
        }

        // Bereken werkelijke tijden
        const actualTimes = validProducts.map(p => {
          const duration = calculateDuration(
            p.timestamps.station_start,
            p.timestamps.completed || p.timestamps.finished
          );
          return duration;
        }).filter(t => t > 0);

        if (actualTimes.length === 0) {
          results.skipped++;
          continue;
        }

        // Bereken gemiddelde en mediaan
        const average = actualTimes.reduce((a, b) => a + b, 0) / actualTimes.length;
        const sorted = [...actualTimes].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        // Gebruik mediaan (robuuster tegen uitschieters)
        const observedTime = median;
        const currentStandard = standard.standardMinutes;

        // Bereken afwijking
        const deviation = ((observedTime - currentStandard) / currentStandard) * 100;

        // Check of afwijking significant genoeg is
        if (Math.abs(deviation) < 5) {
          // Minder dan 5% afwijking = geen update nodig
          console.log(
            `[Auto-Learning] ${standard.itemCode}/${standard.machine}: ` +
            `deviation ${deviation.toFixed(1)}% is acceptable`
          );
          continue;
        }

        // Check of afwijking niet te extreem is (data quality check)
        if (Math.abs(deviation) > maxDeviation) {
          results.errors.push({
            standard: `${standard.itemCode}/${standard.machine}`,
            reason: `Deviation ${deviation.toFixed(1)}% exceeds maximum ${maxDeviation}%`,
            currentStandard,
            observedTime
          });
          console.warn(
            `[Auto-Learning] ${standard.itemCode}/${standard.machine}: ` +
            `deviation ${deviation.toFixed(1)}% too extreme, skipping`
          );
          continue;
        }

        // Bereken nieuwe standaard met learning rate
        // Learning rate = hoe snel systeem aanpast (0.3 = 30% naar nieuwe waarde)
        const newStandard = currentStandard + (observedTime - currentStandard) * learningRate;
        const roundedNew = Math.round(newStandard);

        results.recommendations.push({
          itemCode: standard.itemCode,
          machine: standard.machine,
          currentStandard,
          observedMedian: Math.round(observedTime),
          observedAverage: Math.round(average),
          sampleCount: actualTimes.length,
          deviation: Math.round(deviation * 10) / 10,
          recommendedStandard: roundedNew,
          change: roundedNew - currentStandard
        });

        // Update in database (tenzij dry run)
        if (!dryRun) {
          await setDoc(
            doc(db, ...PATHS.PRODUCTION_STANDARDS, standard.id),
            {
              standardMinutes: roundedNew,
              updatedAt: serverTimestamp(),
              autoLearning: {
                lastUpdate: new Date().toISOString(),
                sampleCount: actualTimes.length,
                previousStandard: currentStandard,
                observedMedian: Math.round(observedTime),
                deviation: Math.round(deviation * 10) / 10
              }
            },
            { merge: true }
          );

          results.updated++;
          console.log(
            `[Auto-Learning] Updated ${standard.itemCode}/${standard.machine}: ` +
            `${currentStandard}m → ${roundedNew}m (${actualTimes.length} samples, ${deviation.toFixed(1)}% deviation)`
          );
        } else {
          console.log(
            `[Auto-Learning] [DRY RUN] Would update ${standard.itemCode}/${standard.machine}: ` +
            `${currentStandard}m → ${roundedNew}m`
          );
        }

      } catch (error) {
        console.error(`[Auto-Learning] Error processing ${standard.itemCode}/${standard.machine}:`, error);
        results.errors.push({
          standard: `${standard.itemCode}/${standard.machine}`,
          reason: error.message
        });
      }
    }

  } catch (error) {
    console.error("[Auto-Learning] Fatal error:", error);
    results.errors.push({
      standard: "GLOBAL",
      reason: error.message
    });
  }

  console.log("[Auto-Learning] Analysis complete:", results);
  return results;
};

/**
 * Run auto-learning in background (scheduled job)
 * Kan worden aangeroepen vanuit een Cloud Function of cron job
 */
export const scheduledAutoLearning = async () => {
  console.log("[Auto-Learning] Starting scheduled analysis...");
  
  const results = await analyzeAndUpdateStandards({
    minSamples: 10,        // Wacht op minstens 10 voltooide producties
    maxDeviation: 40,      // Accepteer max 40% afwijking
    learningRate: 0.2,     // Conservatieve learning rate voor geautomatiseerde runs
    dryRun: false
  });

  return results;
};

/**
 * Get learning recommendations zonder direct te updaten
 * Voor review door planner/engineer
 */
export const getRecommendations = async () => {
  const results = await analyzeAndUpdateStandards({
    minSamples: 5,
    maxDeviation: 50,
    learningRate: 0.3,
    dryRun: true  // Alleen analyse, geen updates
  });

  return results.recommendations;
};
