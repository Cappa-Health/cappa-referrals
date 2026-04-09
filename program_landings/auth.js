/**
 * auth.js — Shared Cognito authentication module for HALT dashboard pages.
 *
 * Usage:
 *   <script src="auth-config.js"></script>
 *   <script src="auth.js"></script>
 *   <script>
 *     Auth.onReady(() => {
 *       // called once the user is authenticated
 *       console.log(Auth.getEmail(), Auth.getState());
 *     });
 *   </script>
 *
 * Configure Cognito values in auth-config.js so deployments can swap
 * environment-specific settings without editing this shared bundle.
 */

const AUTH_CONFIG = window.HALT_AUTH_CONFIG || {};
const COGNITO_REGION = AUTH_CONFIG.cognitoRegion || "";
const USER_POOL_CLIENT = AUTH_CONFIG.userPoolClient || "";

if (!COGNITO_REGION || !USER_POOL_CLIENT) {
  throw new Error(
    "Missing HALT auth config. Load /program_landings/auth-config.js before auth.js.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
const SK_ID_TOKEN = "halt_id_token";
const SK_REFRESH_TOKEN = "halt_refresh_token";
const AUTH_VIEW_IDS = [
  "authLogin",
  "authForgotPassword",
  "authConfirmReset",
  "authNewPassword",
];

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

async function _setNewPassword(email, newPassword, session) {
  return _cognitoRequest("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: USER_POOL_CLIENT,
    ChallengeResponses: {
      USERNAME: email,
      NEW_PASSWORD: newPassword,
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

async function _changePassword(accessToken, oldPassword, newPassword) {
  return _cognitoRequest("ChangePassword", {
    AccessToken: accessToken,
    PreviousPassword: oldPassword,
    ProposedPassword: newPassword,
  });
}

async function _forgotPassword(email) {
  return _cognitoRequest("ForgotPassword", {
    ClientId: USER_POOL_CLIENT,
    Username: email,
  });
}

async function _confirmForgotPassword(email, code, newPassword) {
  return _cognitoRequest("ConfirmForgotPassword", {
    ClientId: USER_POOL_CLIENT,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token storage
// ─────────────────────────────────────────────────────────────────────────────

function _saveTokens(idToken, refreshToken, accessToken) {
  sessionStorage.setItem(SK_ID_TOKEN, idToken);
  if (refreshToken) {
    sessionStorage.setItem(SK_REFRESH_TOKEN, refreshToken);
  }
  if (accessToken) {
    sessionStorage.setItem("halt_access_token", accessToken);
  }
}

function _clearTokens() {
  sessionStorage.removeItem(SK_ID_TOKEN);
  sessionStorage.removeItem(SK_REFRESH_TOKEN);
  sessionStorage.removeItem("halt_access_token");
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
      .auth-submit {
        width: 100%; padding: 10px; background: #003366; color: #fff;
        border: none; border-radius: 6px; font-size: 1rem;
        font-weight: 600; cursor: pointer;
      }
      .auth-submit:disabled { background: #7a9cbf; cursor: not-allowed; }
      .auth-error {
        margin-top: 14px; font-size: 0.85rem; color: #c0392b;
        min-height: 1.2em;
      }
      #authUserInfo {
        margin-top: 12px; font-size: 0.8rem; color: #555; text-align: center;
      }
      #authBox .auth-link {
        display: block; margin-top: 14px; font-size: 0.82rem;
        color: #003366; text-align: center; cursor: pointer;
        text-decoration: underline; background: none; border: none; width: 100%;
      }
      #authBox .auth-link:hover { color: #004488; }
      .pw-wrap {
        position: relative; margin-bottom: 16px;
      }
      .pw-wrap input {
        margin-bottom: 0 !important;
        padding-right: 40px !important;
      }
      .pw-toggle {
        position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer;
        color: #888; font-size: 1rem; padding: 0; line-height: 1;
      }
      .pw-toggle:hover { color: #003366; }
    </style>

    <div id="authBox">
      <!-- Login form -->
      <div id="authLogin">
        <h2>HALT Dashboard</h2>
        <p class="auth-sub">Sign in to access referrals</p>
        <label for="authEmail">Email</label>
        <input type="email" id="authEmail" autocomplete="username" placeholder="you@example.gov" />
        <label for="authPassword">Password</label>
        <div class="pw-wrap">
          <input type="password" id="authPassword" autocomplete="current-password" placeholder="Password" />
          <button type="button" class="pw-toggle" onclick="Auth._togglePw('authPassword', this)" tabindex="-1">👁</button>
        </div>
        <button class="auth-submit" data-idle-label="Sign In" onclick="Auth._submitLogin()">Sign In</button>
        <button class="auth-link" onclick="Auth._showForgotPassword()">Forgot password?</button>
        <div class="auth-error"></div>
      </div>

      <!-- Forgot password — step 1: enter email -->
      <div id="authForgotPassword" style="display:none">
        <h2>Forgot Password</h2>
        <p class="auth-sub">Enter your email and we'll send a verification code.</p>
        <label for="authForgotEmail">Email</label>
        <input type="email" id="authForgotEmail" autocomplete="username" placeholder="you@example.gov" />
        <button class="auth-submit" data-idle-label="Send Code" onclick="Auth._submitForgotPassword()">Send Code</button>
        <button class="auth-link" onclick="Auth._showLogin()">Back to sign in</button>
        <div class="auth-error"></div>
      </div>

      <!-- Forgot password — step 2: enter code + new password -->
      <div id="authConfirmReset" style="display:none">
        <h2>Reset Password</h2>
        <p class="auth-sub">Enter the verification code sent to your email.</p>
        <label for="authResetCode">Verification Code</label>
        <input type="text" id="authResetCode" autocomplete="one-time-code" placeholder="6-digit code" />
        <label for="authResetPw1">New Password</label>
        <div class="pw-wrap">
          <input type="password" id="authResetPw1" autocomplete="new-password" placeholder="Min 12 chars, upper, lower, number, symbol" oninput="Auth._validateResetPw()" />
          <button type="button" class="pw-toggle" onclick="Auth._togglePw('authResetPw1', this)" tabindex="-1">👁</button>
        </div>
        <div id="authPwReqs" style="font-size:0.78rem;margin:-8px 0 12px;line-height:1.7;">
          <span id="reqLen"  style="color:#aaa;">✗ At least 12 characters</span><br>
          <span id="reqUpper" style="color:#aaa;">✗ Uppercase letter</span><br>
          <span id="reqLower" style="color:#aaa;">✗ Lowercase letter</span><br>
          <span id="reqNum"   style="color:#aaa;">✗ Number</span><br>
          <span id="reqSym"   style="color:#aaa;">✗ Symbol (!@#$%…)</span>
        </div>
        <label for="authResetPw2">Confirm Password</label>
        <div class="pw-wrap">
          <input type="password" id="authResetPw2" autocomplete="new-password" placeholder="Confirm password" oninput="Auth._validateResetPw()" />
          <button type="button" class="pw-toggle" onclick="Auth._togglePw('authResetPw2', this)" tabindex="-1">👁</button>
        </div>
        <div id="authPwMatch" style="font-size:0.78rem;margin:-8px 0 12px;color:#aaa;">✗ Passwords match</div>
        <button class="auth-submit" data-idle-label="Reset Password" onclick="Auth._submitConfirmReset()" disabled>Reset Password</button>
        <button class="auth-link" onclick="Auth._showLogin()">Back to sign in</button>
        <div class="auth-error"></div>
      </div>

      <!-- New password required form (first login) -->
      <div id="authNewPassword" style="display:none">
        <h2>Set New Password</h2>
        <p class="auth-sub">You must set a new password before continuing. Your state assignment is managed by an administrator.</p>
        <label for="authNewPw1">New Password</label>
        <div class="pw-wrap">
          <input type="password" id="authNewPw1" autocomplete="new-password" placeholder="Min 12 chars, upper, lower, number, symbol" oninput="Auth._validateNewPw()" />
          <button type="button" class="pw-toggle" onclick="Auth._togglePw('authNewPw1', this)" tabindex="-1">👁</button>
        </div>
        <div id="authNewPwReqs" style="font-size:0.78rem;margin:-8px 0 12px;line-height:1.7;">
          <span id="newReqLen"   style="color:#aaa;">✗ At least 12 characters</span><br>
          <span id="newReqUpper" style="color:#aaa;">✗ Uppercase letter</span><br>
          <span id="newReqLower" style="color:#aaa;">✗ Lowercase letter</span><br>
          <span id="newReqNum"   style="color:#aaa;">✗ Number</span><br>
          <span id="newReqSym"   style="color:#aaa;">✗ Symbol (!@#$%…)</span>
        </div>
        <label for="authNewPw2">Confirm Password</label>
        <div class="pw-wrap">
          <input type="password" id="authNewPw2" autocomplete="new-password" placeholder="Confirm password" oninput="Auth._validateNewPw()" />
          <button type="button" class="pw-toggle" onclick="Auth._togglePw('authNewPw2', this)" tabindex="-1">👁</button>
        </div>
        <div id="authNewPwMatch" style="font-size:0.78rem;margin:-8px 0 12px;color:#aaa;">✗ Passwords match</div>
        <button class="auth-submit" data-idle-label="Set Password" onclick="Auth._submitNewPassword()" disabled>Set Password</button>
        <div class="auth-error"></div>
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
function _getVisibleAuthView() {
  return (
    AUTH_VIEW_IDS.map((id) => document.getElementById(id)).find(
      (el) => el && el.style.display !== "none",
    ) || null
  );
}

function _getAuthErrorElement() {
  return _getVisibleAuthView()?.querySelector(".auth-error") || null;
}

function _getAuthSubmitButton() {
  return _getVisibleAuthView()?.querySelector(".auth-submit") || null;
}

function _setError(msg, color = "#c0392b") {
  const errorEl = _getAuthErrorElement();
  if (!errorEl) return;
  errorEl.textContent = msg || "";
  errorEl.style.color = color;
}
function _setBusy(on) {
  const btn = _getAuthSubmitButton();
  if (btn) {
    btn.disabled = on;
    btn.textContent = on
      ? "Please wait…"
      : btn.dataset.idleLabel || btn.textContent;
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
    _saveTokens(result.IdToken, null, result.AccessToken);
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

  /** Returns the current Cognito access token for admin API calls. */
  getAccessToken() {
    return sessionStorage.getItem("halt_access_token") || "";
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
    // Let pages clear their displayed data before the login screen appears.
    document.dispatchEvent(new CustomEvent("halt:logout"));
    _clearTokens();
    _isReady = false;
    _setError("");
    document.getElementById("authLogin").style.display = "block";
    document.getElementById("authForgotPassword").style.display = "none";
    document.getElementById("authConfirmReset").style.display = "none";
    document.getElementById("authNewPassword").style.display = "none";
    const btn = _getAuthSubmitButton();
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.idleLabel || "Sign In";
    }
    _showModal();
  },

  /** Ensures the ID token is valid, refreshing silently if needed. */
  async ensureValidToken() {
    const token = this.getToken();
    if (token && !_isTokenExpired(token)) return true;
    return _tryRefresh();
  },

  /** Ensures the access token is valid, refreshing silently if needed. */
  async ensureValidAccessToken() {
    const token = this.getAccessToken();
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
      _saveTokens(result.IdToken, result.RefreshToken, result.AccessToken);
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
    const pw1 = (document.getElementById("authNewPw1").value || "").trim();
    const pw2 = (document.getElementById("authNewPw2").value || "").trim();

    if (!pw1 || !pw2) {
      _setError("All fields are required.");
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
      const data = await _setNewPassword(_pendingEmail, pw1, _pendingSession);
      const result = data.AuthenticationResult;
      _saveTokens(result.IdToken, result.RefreshToken, result.AccessToken);
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

  // ── Forgot password flow ───────────────────────────────────────────────────

  _togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "🙈" : "👁";
  },

  _validateNewPw() {
    const pw1 = document.getElementById("authNewPw1").value || "";
    const pw2 = document.getElementById("authNewPw2").value || "";

    const checks = {
      newReqLen: pw1.length >= 12,
      newReqUpper: /[A-Z]/.test(pw1),
      newReqLower: /[a-z]/.test(pw1),
      newReqNum: /[0-9]/.test(pw1),
      newReqSym: /[^A-Za-z0-9]/.test(pw1),
    };

    Object.entries(checks).forEach(([id, pass]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const label = el.textContent.slice(2);
      el.textContent = (pass ? "✓ " : "✗ ") + label;
      el.style.color = pass ? "#1a7a3c" : "#aaa";
    });

    const allPass = Object.values(checks).every(Boolean);
    const matches = pw1 && pw1 === pw2;
    const matchEl = document.getElementById("authNewPwMatch");
    if (matchEl) {
      matchEl.textContent = matches ? "✓ Passwords match" : "✗ Passwords match";
      matchEl.style.color = matches ? "#1a7a3c" : "#aaa";
    }

    const btn = document.querySelector("#authNewPassword .auth-submit");
    if (btn) {
      btn.disabled = !(allPass && matches);
    }
  },

  _validateResetPw() {
    const pw1 = document.getElementById("authResetPw1").value || "";
    const pw2 = document.getElementById("authResetPw2").value || "";

    const checks = {
      reqLen: pw1.length >= 12,
      reqUpper: /[A-Z]/.test(pw1),
      reqLower: /[a-z]/.test(pw1),
      reqNum: /[0-9]/.test(pw1),
      reqSym: /[^A-Za-z0-9]/.test(pw1),
    };

    Object.entries(checks).forEach(([id, pass]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const label = el.textContent.slice(2);
      el.textContent = (pass ? "✓ " : "✗ ") + label;
      el.style.color = pass ? "#1a7a3c" : "#aaa";
    });

    const allPass = Object.values(checks).every(Boolean);
    const matches = pw1 && pw1 === pw2;
    const matchEl = document.getElementById("authPwMatch");
    if (matchEl) {
      matchEl.textContent = matches ? "✓ Passwords match" : "✗ Passwords match";
      matchEl.style.color = matches ? "#1a7a3c" : "#aaa";
    }

    const btn = document.querySelector("#authConfirmReset .auth-submit");
    if (btn) {
      btn.disabled = !(
        allPass &&
        matches &&
        document.getElementById("authResetCode").value.trim()
      );
    }
  },

  _showLogin() {
    AUTH_VIEW_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    document.getElementById("authLogin").style.display = "block";
    _setError("");
    const btn = _getAuthSubmitButton();
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.idleLabel || "Sign In";
    }
  },

  _showForgotPassword() {
    AUTH_VIEW_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    document.getElementById("authForgotPassword").style.display = "block";
    _setError("");
    _setBusy(false);
  },

  async _submitForgotPassword() {
    const email = (
      document.getElementById("authForgotEmail").value || ""
    ).trim();
    if (!email) {
      _setError("Email is required.");
      return;
    }

    _setError("");
    _setBusy(true);
    try {
      await _forgotPassword(email);
      _pendingEmail = email;
      document.getElementById("authForgotPassword").style.display = "none";
      document.getElementById("authConfirmReset").style.display = "block";
      _setBusy(false);
    } catch (err) {
      _setBusy(false);
      _setError(err.message || "Failed to send code. Please try again.");
    }
  },

  async _submitConfirmReset() {
    const code = (document.getElementById("authResetCode").value || "").trim();
    const pw1 = (document.getElementById("authResetPw1").value || "").trim();
    const pw2 = (document.getElementById("authResetPw2").value || "").trim();

    if (!code || !pw1 || !pw2) {
      _setError("All fields are required.");
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
      await _confirmForgotPassword(_pendingEmail, code, pw1);
      // After reset, show login with success hint
      this._showLogin();
      _setError(
        "Password reset successful. Please sign in with your new password.",
        "#1a7a3c",
      );
    } catch (err) {
      _setBusy(false);
      if (err.code === "CodeMismatchException") {
        _setError("Invalid verification code. Please check and try again.");
      } else if (err.code === "ExpiredCodeException") {
        _setError("Verification code has expired. Request a new one.");
      } else if (err.code === "InvalidPasswordException") {
        _setError(
          "Password does not meet requirements: min 12 chars, upper, lower, number, symbol.",
        );
      } else {
        _setError(err.message || "Failed to reset password. Please try again.");
      }
    }
  },

  /** Change password for an already-authenticated user. Returns a promise. */
  async changePassword(oldPassword, newPassword) {
    const accessToken = sessionStorage.getItem("halt_access_token");
    if (!accessToken) throw new Error("Not authenticated.");
    return _changePassword(accessToken, oldPassword, newPassword);
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
