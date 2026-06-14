import { httpsCallable, httpsCallableFromURL } from "firebase/functions";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, functions } from "../config/firebase";

type QcCallableName = "saveQcMeasurement" | "saveQcInspection" | "updateQcMeasurement";

const shouldUseVercelCallableProxy = (): boolean => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host.endsWith(".vercel.app");
};

const getQcCallable = <TRequest extends object>(name: QcCallableName) => {
  if (shouldUseVercelCallableProxy()) {
    return httpsCallableFromURL<TRequest, unknown>(functions, `${window.location.origin}/api/callables/${name}`);
  }

  return httpsCallable<TRequest, unknown>(functions, name);
};

const isPreviewCorsEnvironment = (): boolean => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host.endsWith(".vercel.app") || host.endsWith(".app.github.dev");
};

const waitForAuthenticatedUser = async (timeoutMs = 2500): Promise<User | null> => {
  if (auth.currentUser) return auth.currentUser;

  return await new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
};

const ensureQcUserAuth = async (): Promise<void> => {
  const user = await waitForAuthenticatedUser();
  if (!user) {
    throw new Error(
      "Je bent niet ingelogd voor QC opslaan. Log opnieuw in en herlaad de pagina. Op Vercel preview moet je zowel Vercel toegang als Firebase login actief hebben."
    );
  }

  await user.getIdToken();
};

const normalizeCallableError = (error: unknown, actionName: string): Error => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  const message = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  const combined = `${code} ${message}`.toLowerCase();

  if (
    isPreviewCorsEnvironment() &&
    (combined.includes("failed to fetch") ||
      combined.includes("cors") ||
      combined.includes("networkerror"))
  ) {
    return new Error(
      `${actionName} mislukt op deze preview-omgeving. Firebase callable requests vanaf preview-domeinen kunnen door CORS of domeinautorisatie worden geblokkeerd. Test deze actie via Firebase Hosting of voeg dit preview-domein toe aan de Firebase authorized domains.`
    );
  }

  if (combined.includes("unauthenticated") || combined.includes("niet ingelogd")) {
    return new Error(
      "Je sessie is verlopen of niet actief. Log opnieuw in en herlaad de pagina voordat je QC opslaat."
    );
  }

  return error instanceof Error ? error : new Error(message || `${actionName} mislukt.`);
};

export const saveQcMeasurement = async (payload: {
  lotNumber: string;
  resinBatch?: string;
  ri?: number | null;
  brix?: number | null;
  tg?: number | null;
  notes?: string;
  actorLabel: string;
  source: string;
  type?: 'ri' | 'tg';
  department?: string;
  kitchen?: string;
  tapPoint?: string;
  shift?: string;
  resinWeight?: number;
  hardenerWeight?: number;
  refractiveIndex?: number;
  visualCheckOk?: boolean;
  tableRef?: number;
  mixingRatio?: string;
  area?: 'A' | 'B' | 'C';
  trackedProductPath?: string | null;
}) => {
  await ensureQcUserAuth();
  const callable = getQcCallable<typeof payload>("saveQcMeasurement");
  try {
    const res = await callable(payload);
    return (res as { data?: unknown }).data;
  } catch (error) {
    throw normalizeCallableError(error, "QC meting opslaan");
  }
};

export const saveQcInspection = async (payload: {
  lotNumber: string;
  checkType: string;
  result: "OK" | "NOK";
  note?: string;
  actorLabel: string;
  source: string;
}) => {
  await ensureQcUserAuth();
  const callable = getQcCallable<typeof payload>("saveQcInspection");
  try {
    const res = await callable(payload);
    return (res as { data?: unknown }).data;
  } catch (error) {
    throw normalizeCallableError(error, "QC inspectie opslaan");
  }
};

export const updateQcMeasurement = async (payload: {
  measurementId: string;
  lotNumber?: string;
  type?: "ri" | "tg";
  measuredAt?: string;
  actorLabel?: string;
  source?: string;
  notes?: string;
  trackedProductPath?: string | null;
  department?: string;
  kitchen?: string;
  tapPoint?: string;
  shift?: string;
  resinWeight?: number;
  hardenerWeight?: number;
  refractiveIndex?: number;
  ri?: number;
  brix?: number;
  visualCheckOk?: boolean;
  tableRef?: number;
  mixingRatio?: string;
  area?: "A" | "B" | "C";
  resinBatch?: string;
  tg?: number;
}) => {
  await ensureQcUserAuth();
  const callable = getQcCallable<typeof payload>("updateQcMeasurement");
  try {
    const res = await callable(payload);
    return (res as { data?: unknown }).data;
  } catch (error) {
    throw normalizeCallableError(error, "QC meting bewerken");
  }
};