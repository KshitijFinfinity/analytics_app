import { useCallback, useSyncExternalStore } from "react";
import { syncUserIdWithAuthenticatedEmail } from "@/utils/userIdentity";

const STORAGE_KEYS = {
  user: "fin_user",
  users: "fin_users",
  auth: "fin_auth",
  loan: "fin_loan",
};

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function readUsers() {
  if (typeof window === "undefined") return [];

  const users = safeParse(window.localStorage.getItem(STORAGE_KEYS.users), []);
  if (Array.isArray(users) && users.length > 0) {
    return users;
  }

  // Backward compatibility: migrate legacy single-user storage to users array.
  const legacyUser = safeParse(window.localStorage.getItem(STORAGE_KEYS.user));
  if (!legacyUser || !legacyUser.email) return [];

  const migratedUsers = [{
    ...legacyUser,
    email: normalizeEmail(legacyUser.email),
  }];

  window.localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(migratedUsers));
  window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(migratedUsers[0]));
  return migratedUsers;
}

function writeUsers(users) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_AUTH_STATE = { user: null, isAuthenticated: false };
let cachedUserRaw = null;
let cachedAuthRaw = null;
let cachedSnapshot = DEFAULT_AUTH_STATE;

function getAuthSnapshot() {
  if (typeof window === "undefined") return DEFAULT_AUTH_STATE;

  const userRaw = window.localStorage.getItem(STORAGE_KEYS.user);
  const authRaw = window.localStorage.getItem(STORAGE_KEYS.auth);

  if (userRaw === cachedUserRaw && authRaw === cachedAuthRaw) {
    return cachedSnapshot;
  }

  cachedUserRaw = userRaw;
  cachedAuthRaw = authRaw;
  cachedSnapshot = {
    user: safeParse(userRaw),
    isAuthenticated: authRaw === "true",
  };

  return cachedSnapshot;
}

function subscribeAuth(onStoreChange) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = () => onStoreChange();
  const onCustom = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener("fin_auth_changed", onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("fin_auth_changed", onCustom);
  };
}

function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("fin_auth_changed"));
}

export function useAuth() {
  const authState = useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => DEFAULT_AUTH_STATE);

  const loading = false;
  const { user, isAuthenticated } = authState;

  const signup = useCallback(
    ({ name, email, password }) => {
      if (typeof window === "undefined") return false;

      const normalizedEmail = email.trim().toLowerCase();
      const users = readUsers();
      const alreadyExists = users.some((item) => normalizeEmail(item?.email) === normalizedEmail);
      if (alreadyExists) return false;

      const newUser = { name, email: normalizedEmail, password, createdAt: Date.now() };
      writeUsers([...users, newUser]);
      window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(newUser));
      window.localStorage.setItem(STORAGE_KEYS.auth, "true");
      syncUserIdWithAuthenticatedEmail(normalizedEmail);
      notifyAuthChanged();
      return true;
    },
    []
  );

  const login = useCallback(
    ({ email, password }) => {
      if (typeof window === "undefined") return false;

      const normalizedEmail = email.trim().toLowerCase();
      const users = readUsers();
      const matchedUser = users.find((item) => normalizeEmail(item?.email) === normalizedEmail);
      if (!matchedUser) return false;

      const isValid = matchedUser.password === password;
      if (!isValid) return false;

      window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(matchedUser));
      window.localStorage.setItem(STORAGE_KEYS.auth, "true");
      syncUserIdWithAuthenticatedEmail(normalizedEmail);
      notifyAuthChanged();
      return true;
    },
    []
  );

  const logout = useCallback(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(STORAGE_KEYS.auth, "false");
    notifyAuthChanged();
  }, []);

  const saveLoanApplication = useCallback((loanData) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.loan, JSON.stringify(loanData));
  }, []);

  const getLoanApplication = useCallback(() => {
    if (typeof window === "undefined") return null;
    return safeParse(window.localStorage.getItem(STORAGE_KEYS.loan));
  }, []);

  const updateProfile = useCallback(
    (updates) => {
      if (typeof window === "undefined") return null;

      const currentUser = safeParse(window.localStorage.getItem(STORAGE_KEYS.user));
      if (!currentUser) return null;

      const users = readUsers();

      const nextUser = {
        ...currentUser,
        ...updates,
        email: updates.email ? updates.email.trim().toLowerCase() : currentUser.email,
        updatedAt: Date.now(),
      };

      const emailInUseByAnotherUser = users.some(
        (item) => normalizeEmail(item?.email) === nextUser.email && normalizeEmail(item?.email) !== normalizeEmail(currentUser.email)
      );
      if (emailInUseByAnotherUser) return null;

      const nextUsers = users.map((item) => {
        if (normalizeEmail(item?.email) !== normalizeEmail(currentUser.email)) return item;
        return {
          ...item,
          ...nextUser,
        };
      });

      writeUsers(nextUsers);

      window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(nextUser));
      syncUserIdWithAuthenticatedEmail(nextUser.email);
      notifyAuthChanged();
      return nextUser;
    },
    []
  );

  return {
    user,
    isAuthenticated,
    loading,
    signup,
    login,
    logout,
    saveLoanApplication,
    getLoanApplication,
    updateProfile,
  };
}
