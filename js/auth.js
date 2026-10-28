// =======================================================
// auth.js
// Sign up, log in and log out.
//
// Passwords are never stored. Instead we store a "hash":
// a scrambled version made with PBKDF2 that can't be turned
// back into the password. To log in, we scramble what you
// typed the same way and check if it matches.
//
// NOTE: accounts live in this browser only. For accounts that
// work on any device you'd need a server (see README).
// =======================================================

const Auth = (() => {
  const USERS_KEY = "ht:users";
  const SESSION_KEY = "ht:session";
  const ITERATIONS = 150000;

  function getUsers() { return readJSON(USERS_KEY, []); }
  function saveUsers(users) { writeJSON(USERS_KEY, users); }

  function toBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
  function fromBase64(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }

  async function hashPassword(password, saltBase64) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error("This browser can't protect passwords here. Try Chrome, Edge or Firefox.");
    }
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromBase64(saltBase64), iterations: ITERATIONS, hash: "SHA-256" },
      key, 256
    );
    return toBase64(new Uint8Array(bits));
  }

  function cleanEmail(email) { return email.trim().toLowerCase(); }

  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  async function signUp({ name, email, password, confirm }) {
    name = name.trim();
    email = cleanEmail(email);

    if (!name) throw new Error("Enter your name.");
    if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (password !== confirm) throw new Error("The passwords don't match.");

    const users = getUsers();
    if (users.some(u => u.email === email)) {
      throw new Error("There's already an account with that email. Log in instead.");
    }

    const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    const user = {
      id: makeId(),
      name,
      email,
      salt,
      hash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    startSession(user.id, true);
    return user;
  }

  async function logIn({ email, password, remember }) {
    email = cleanEmail(email);
    const user = getUsers().find(u => u.email === email);
    // Same message either way, so nobody can tell which emails have accounts
    const wrong = new Error("Email or password is incorrect.");
    if (!user) throw wrong;
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw wrong;
    startSession(user.id, remember);
    return user;
  }

  // "Keep me logged in" uses localStorage (survives closing the browser),
  // otherwise sessionStorage (forgotten when the browser closes)
  function startSession(userId, remember) {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, userId);
    } catch (error) {
      console.error("Could not start session", error);
    }
  }

  function logOut() {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  function currentUser() {
    let id = null;
    try {
      id = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    } catch {}
    return id ? getUsers().find(u => u.id === id) || null : null;
  }

  function updateName(userId, name) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      user.name = name.trim();
      saveUsers(users);
    }
    return user;
  }

  function deleteAccount(userId) {
    saveUsers(getUsers().filter(u => u.id !== userId));
    try { localStorage.removeItem(`ht:data:${userId}`); } catch {}
    logOut();
  }

  function hasAccounts() { return getUsers().length > 0; }

  return { signUp, logIn, logOut, currentUser, updateName, deleteAccount, hasAccounts };
})();
