/**
 * auth.js — Shared Cognito authentication module for HALT dashboard pages.
 *
 * Usage:
 *   <script src="auth.js"></script>
 *   <script>
 *     Auth.onReady(() => {
 *       // called once the user is authenticated
 *       console.log(Auth.getEmail(), Auth.getState());
 *     });
 *   </script>
 *
 * After CloudFormation deployment, update the two constants below with the
 * values from the stack Outputs (UserPoolClientId, and set the region to
 * match your GovCloud deployment region).
 */

const COGNITO_REGION = "us-gov-west-1";
const USER_POOL_CLIENT = "6kht95c982kkdrloqfdhsveaol"; // from CF output: UserPoolClientId

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
const SK_ID_TOKEN = "halt_id_token";
const SK_REFRESH_TOKEN = "halt_refresh_token";

let _readyCallbacks = [];
let _isReady = false;

// ─────────────────────────────────────────────────────────────────────────────
// JWT helpers
// ─────────────────────────────────────────────────────────────────────────────

function _decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    // Pad base64 to a multiple of 4
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function _isTokenExpired(token) {
  const claims = _decodeJwt(token);
  if (!claims || !claims.exp) return true;
  // Refresh 60 seconds before actual expiry
  return Date.now() / 1000 > claims.exp - 60;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cognito API calls
// ─────────────────────────────────────────────────────────────────────────────

async function _cognitoRequest(target, body) {
  const resp = await fetch(COGNITO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(
      data.message || data.__type || "Authentication error",
    );
    err.code = data.__type || "";
    err.status = resp.status;
    throw err;
  }
  return data;
}

async function _signIn(email, password) {
  return _cognitoRequest("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: USER_POOL_CLIENT,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
}

async function _setNewPassword(email, newPassword, state, session) {
  return _cognitoRequest("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: USER_POOL_CLIENT,
    ChallengeResponses: {
      USERNAME: email,
      NEW_PASSWORD: newPassword,
      "userAttributes.custom:state": state,
    },
    Session: session,
  });
}

async function _refreshTokens(refreshToken) {
  return _cognitoRequest("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: USER_POOL_CLIENT,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token storage
// ─────────────────────────────────────────────────────────────────────────────

function _saveTokens(idToken, refreshToken) {
  sessionStorage.setItem(SK_ID_TOKEN, idToken);
  if (refreshToken) {
    // Refresh tokens survive across tabs in the same session
    sessionStorage.setItem(SK_REFRESH_TOKEN, refreshToken);
  }
}

function _clearTokens() {
  sessionStorage.removeItem(SK_ID_TOKEN);
  sessionStorage.removeItem(SK_REFRESH_TOKEN);
}

// ─────────────────────────────────────────────────────────────────────────────
// Login modal UI
// ─────────────────────────────────────────────────────────────────────────────

function _injectModal() {
  if (document.getElementById("authOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "authOverlay";
  overlay.innerHTML = `
    <style>
      #authOverlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #authBox {
        background: #fff; border-radius: 10px;
        padding: 36px 40px; width: 100%; max-width: 400px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      }
      #authBox h2 {
        margin: 0 0 6px; font-size: 1.25rem; color: #003366;
      }
      #authBox p.auth-sub {
        margin: 0 0 24px; font-size: 0.85rem; color: #666;
      }
      #authBox label {
        display: block; font-size: 0.8rem; font-weight: 600;
        color: #444; margin-bottom: 4px;
      }
      #authBox input[type=email],
      #authBox input[type=password],
      #authBox select {
        width: 100%; padding: 9px 12px; margin-bottom: 16px;
        border: 1px solid #ccc; border-radius: 6px;
        font-size: 0.95rem; box-sizing: border-box;
      }
      #authBox input:focus, #authBox select:focus {
        outline: none; border-color: #003366;
        box-shadow: 0 0 0 3px rgba(0,51,102,0.15);
      }
      #authBtn {
        width: 100%; padding: 10px; background: #003366; color: #fff;
        border: none; border-radius: 6px; font-size: 1rem;
        font-weight: 600; cursor: pointer;
      }
      #authBtn:disabled { background: #7a9cbf; cursor: not-allowed; }
      #authError {
        margin-top: 14px; font-size: 0.85rem; color: #c0392b;
        min-height: 1.2em;
      }
      #authUserInfo {
        margin-top: 12px; font-size: 0.8rem; color: #555; text-align: center;
      }
    </style>

    <div id="authBox">
      <!-- Login form -->
      <div id="authLogin">
        <h2>HALT Dashboard</h2>
        <p class="auth-sub">Sign in to access referrals</p>
        <label for="authEmail">Email</label>
        <input type="email" id="authEmail" autocomplete="username" placeholder="you@example.gov" />
        <label for="authPassword">Password</label>
        <input type="password" id="authPassword" autocomplete="current-password" placeholder="Password" />
        <button id="authBtn" onclick="Auth._submitLogin()">Sign In</button>
        <div id="authError"></div>
      </div>

      <!-- New password required form (first login) -->
      <div id="authNewPassword" style="display:none">
        <h2>Set New Password</h2>
        <p class="auth-sub">You must set a new password before continuing.</p>
        <label for="authNewPw1">New Password</label>
        <input type="password" id="authNewPw1" autocomplete="new-password" placeholder="Min 12 chars, upper, lower, number, symbol" />
        <label for="authNewPw2">Confirm Password</label>
        <input type="password" id="authNewPw2" autocomplete="new-password" placeholder="Confirm password" />
        <label for="authNewState">Your State</label>
        <select id="authNewState">
          <option value="">— Select your state —</option>
          <option>Alabama</option><option>Alaska</option><option>Arizona</option>
          <option>Arkansas</option><option>California</option><option>Colorado</option>
          <option>Connecticut</option><option>Delaware</option><option>Florida</option>
          <option>Georgia</option><option>Hawaii</option><option>Idaho</option>
          <option>Illinois</option><option>Indiana</option><option>Iowa</option>
          <option>Kansas</option><option>Kentucky</option><option>Louisiana</option>
          <option>Maine</option><option>Maryland</option><option>Massachusetts</option>
          <option>Michigan</option><option>Minnesota</option><option>Mississippi</option>
          <option>Missouri</option><option>Montana</option><option>Nebraska</option>
          <option>Nevada</option><option>New Hampshire</option><option>New Jersey</option>
          <option>New Mexico</option><option>New York</option><option>North Carolina</option>
          <option>North Dakota</option><option>Ohio</option><option>Oklahoma</option>
          <option>Oregon</option><option>Pennsylvania</option><option>Rhode Island</option>
          <option>South Carolina</option><option>South Dakota</option><option>Tennessee</option>
          <option>Texas</option><option>Utah</option><option>Vermont</option>
          <option>Virginia</option><option>Washington</option><option>West Virginia</option>
          <option>Wisconsin</option><option>Wyoming</option>
        </select>
        <button id="authBtn" onclick="Auth._submitNewPassword()">Set Password</button>
        <div id="authError"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Submit on Enter key
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const loginVisible =
      document.getElementById("authLogin").style.display !== "none";
    if (loginVisible) Auth._submitLogin();
    else Auth._submitNewPassword();
  });
}

function _showModal() {
  document.getElementById("authOverlay").style.display = "flex";
}
function _hideModal() {
  document.getElementById("authOverlay").style.display = "none";
}
function _setError(msg) {
  document.getElementById("authError").textContent = msg || "";
}
function _setBusy(on) {
  const btn = document.getElementById("authBtn");
  if (btn) {
    btn.disabled = on;
    btn.textContent = on
      ? "Please wait…"
      : document.getElementById("authNewPassword").style.display !== "none"
        ? "Set Password"
        : "Sign In";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth flow
// ─────────────────────────────────────────────────────────────────────────────

let _pendingEmail = "";
let _pendingSession = "";

function _onAuthenticated() {
  _hideModal();
  _isReady = true;
  _readyCallbacks.forEach((fn) => fn());
  _readyCallbacks = [];
}

async function _tryRefresh() {
  const refreshToken = sessionStorage.getItem(SK_REFRESH_TOKEN);
  if (!refreshToken) return false;
  try {
    const data = await _refreshTokens(refreshToken);
    const result = data.AuthenticationResult;
    // Refresh flow does not return a new refresh token — keep the existing one
    _saveTokens(result.IdToken, null);
    return true;
  } catch {
    _clearTokens();
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const Auth = {
  /** Call fn once the user is authenticated. If already authenticated, calls immediately. */
  onReady(fn) {
    if (_isReady) {
      fn();
      return;
    }
    _readyCallbacks.push(fn);
  },

  /** Returns the current Cognito ID token for use as Authorization: Bearer <token>. */
  getToken() {
    return sessionStorage.getItem(SK_ID_TOKEN) || "";
  },

  /** Returns the custom:state claim from the ID token (e.g. "Alaska"). */
  getState() {
    const claims = _decodeJwt(this.getToken());
    return (claims && claims["custom:state"]) || "";
  },

  /** Returns the authenticated user's email address. */
  getEmail() {
    const claims = _decodeJwt(this.getToken());
    return (claims && claims.email) || "";
  },

  /** Signs the user out and shows the login form. */
  logout() {
    _clearTokens();
    _isReady = false;
    _setError("");
    document.getElementById("authLogin").style.display = "block";
    document.getElementById("authNewPassword").style.display = "none";
    const btn = document.getElementById("authBtn");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
    _showModal();
  },

  /** Ensures the ID token is valid, refreshing silently if needed. */
  async ensureValidToken() {
    const token = this.getToken();
    if (token && !_isTokenExpired(token)) return true;
    return _tryRefresh();
  },

  // ── Internal handlers (called from inline onclick, hence public) ───────────

  async _submitLogin() {
    const email = (document.getElementById("authEmail").value || "").trim();
    const password = (
      document.getElementById("authPassword").value || ""
    ).trim();
    if (!email || !password) {
      _setError("Email and password are required.");
      return;
    }

    _setError("");
    _setBusy(true);
    try {
      const data = await _signIn(email, password);

      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        _pendingEmail = email;
        _pendingSession = data.Session;
        document.getElementById("authLogin").style.display = "none";
        document.getElementById("authNewPassword").style.display = "block";
        _setBusy(false);
        return;
      }

      const result = data.AuthenticationResult;
      _saveTokens(result.IdToken, result.RefreshToken);
      _onAuthenticated();
    } catch (err) {
      _setBusy(false);
      if (err.code === "NotAuthorizedException") {
        _setError("Incorrect email or password.");
      } else if (err.code === "UserNotFoundException") {
        _setError("No account found for that email address.");
      } else if (err.code === "PasswordResetRequiredException") {
        _setError("A password reset is required. Contact an administrator.");
      } else {
        _setError(err.message || "Sign-in failed. Please try again.");
      }
    }
  },

  async _submitNewPassword() {
    const pw1   = (document.getElementById("authNewPw1").value    || "").trim();
    const pw2   = (document.getElementById("authNewPw2").value    || "").trim();
    const state = (document.getElementById("authNewState").value  || "").trim();

    if (!pw1 || !pw2 || !state) {
      _setError("All fields are required, including your state.");
      return;
    }
    if (pw1 !== pw2) {
      _setError("Passwords do not match.");
      return;
    }
    if (pw1.length < 12) {
      _setError("Password must be at least 12 characters.");
      return;
    }

    _setError("");
    _setBusy(true);
    try {
      const data = await _setNewPassword(_pendingEmail, pw1, state, _pendingSession);
      const result = data.AuthenticationResult;
      _saveTokens(result.IdToken, result.RefreshToken);
      _onAuthenticated();
    } catch (err) {
      _setBusy(false);
      if (err.code === "InvalidPasswordException") {
        _setError(
          "Password does not meet requirements: min 12 chars, upper, lower, number, symbol.",
        );
      } else {
        _setError(err.message || "Failed to set password. Please try again.");
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap — runs on script load
// ─────────────────────────────────────────────────────────────────────────────

(async function _boot() {
  // Inject the modal HTML into the page immediately (before DOMContentLoaded)
  // so it's available even if onReady is called very early.
  if (document.body) {
    _injectModal();
  } else {
    document.addEventListener("DOMContentLoaded", _injectModal);
  }

  const idToken = sessionStorage.getItem(SK_ID_TOKEN);

  if (idToken && !_isTokenExpired(idToken)) {
    // Valid token already in storage — proceed immediately
    _isReady = true;
    document.addEventListener("DOMContentLoaded", () => {
      _hideModal();
      _readyCallbacks.forEach((fn) => fn());
      _readyCallbacks = [];
    });
    return;
  }

  // Try silent refresh before showing login
  const refreshed = await _tryRefresh();
  if (refreshed) {
    _isReady = true;
    document.addEventListener("DOMContentLoaded", () => {
      _hideModal();
      _readyCallbacks.forEach((fn) => fn());
      _readyCallbacks = [];
    });
    return;
  }

  // No valid token — show login modal
  document.addEventListener("DOMContentLoaded", () => {
    _injectModal();
    _showModal();
    document.getElementById("authEmail").focus();
  });
})();
