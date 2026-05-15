/**
 * useHasFeature - Granulaire module/feature toegangscontrole
 *
 * Kern-modules (planning, catalog, inbox) zijn ALTIJD toegankelijk voor
 * iedere ingelogde gebruiker. Optionele modules worden gecontroleerd via
 * user.permissions in Firestore.
 *
 * Gebruik:
 *   const hasFeature = useHasFeature(user);
 *   hasFeature("digital_planning", "capacity_planning")  // → true/false
 *   hasFeature("digital_planning")                        // → true als minstens 1 feature aan
 *
 * Of direct via helper:
 *   import { checkFeature } from "./useHasFeature";
 *   checkFeature(user, "ai_assistant", "chat_enabled")
 */
// Kern-modules zijn standaard AAN voor alle gebruikers (geen permission check nodig)
export const CORE_MODULES = ["planning", "catalog", "inbox"];
/**
 * Controleer of een gebruiker toegang heeft tot een module of specifieke feature.
 * @param {object} user - gebruikersobject uit useAdminAuth
 * @param {string} moduleId - bijv. "digital_planning", "ai_assistant"
 * @param {string} [featureId] - optioneel: bijv. "capacity_planning"
 * @returns {boolean}
 */
export function checkFeature(user, moduleId, featureId = null) {
    // Admins hebben altijd volledige toegang
    if (user?.role === "admin" || user?.isGodMode)
        return true;
    // Kern-modules zijn altijd aan voor iedereen
    if (CORE_MODULES.includes(moduleId)) {
        if (!featureId)
            return true;
        // Sub-features van kern-modules worden wél gecontroleerd via permissions
        const perms = user?.permissions || {};
        const modulePerms = perms[moduleId];
        // Als geen permissions gezet zijn voor deze kern-module, zijn ALLE sub-features aan
        if (!modulePerms || modulePerms.length === 0)
            return true;
        return modulePerms.includes(featureId);
    }
    // Optionele modules: vereist expliciete toegang in permissions
    const perms = user?.permissions || {};
    const modulePerms = perms[moduleId] || [];
    if (!featureId) {
        // Alleen module-level check: true als minstens 1 feature aan staat
        return modulePerms.length > 0;
    }
    return modulePerms.includes(featureId);
}
/**
 * React hook die een checkFeature-functie teruggeeft voor de huidige gebruiker.
 * @param {object} user - gebruikersobject uit useAdminAuth
 * @returns {Function} hasFeature(moduleId, featureId?)
 */
export function useHasFeature(user) {
    return (moduleId, featureId = null) => checkFeature(user, moduleId, featureId);
}
export default useHasFeature;
