import { collectionGroup, getDocs, limit, onSnapshot, query, } from "firebase/firestore";
const EFFICIENCY_SCOPE_TYPE = "efficiency_hours";
const isScopedActiveEfficiencyPath = (path) => {
    const safePath = String(path || "");
    return (safePath.includes("/production/efficiency_hours/") &&
        safePath.includes("/machines/") &&
        safePath.includes("/items/"));
};
const isScopedArchiveEfficiencyPath = (path, year) => {
    const safePath = String(path || "");
    return (safePath.includes(`/production/archive/${year}/efficiency_scoped/`) &&
        safePath.includes("/machines/") &&
        safePath.includes("/items/"));
};
const isMatchingScopedEfficiencyDoc = (docSnap, { mode = "active", year } = {}) => {
    const path = docSnap?.ref?.path || "";
    const data = docSnap.data() || {};
    const scopeType = String(data._scopeType || "");
    if (scopeType && scopeType !== EFFICIENCY_SCOPE_TYPE)
        return false;
    if (mode === "archive") {
        if (!Number.isFinite(Number(year)))
            return false;
        return isScopedArchiveEfficiencyPath(path, Number(year));
    }
    return isScopedActiveEfficiencyPath(path);
};
const toRows = (snapshot, options) => {
    return snapshot.docs
        .filter((docSnap) => isMatchingScopedEfficiencyDoc(docSnap, options))
        .map((docSnap) => ({
        id: docSnap.id,
        __docPath: docSnap.ref.path,
        ...docSnap.data(),
    }));
};
export const subscribeScopedEfficiencyHours = ({ db, mode = "active", year, onData, onError, }) => {
    return onSnapshot(collectionGroup(db, "items"), (snapshot) => {
        const rows = toRows(snapshot, { mode, year });
        onData?.(rows);
    }, (error) => {
        onError?.(error);
    });
};
export const fetchScopedEfficiencyHours = async ({ db, mode = "active", year, maxDocs = 5000, }) => {
    const capped = Math.max(1, Math.min(Number(maxDocs) || 5000, 20000));
    const snapshot = await getDocs(query(collectionGroup(db, "items"), limit(capped)));
    return toRows(snapshot, { mode, year });
};
