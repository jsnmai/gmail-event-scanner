// auth.js: Handles Google sign-in using Google Identity Services (GIS).
//
// GIS is Google's modern OAuth2 library for web apps. Instead of storing a
// password, it gives us a short-lived access token that proves the user
// approved read-only Gmail access.
// The token lives only in memory (not saved to localStorage, cookies, or a server).
//
// Two sign-in paths:
//   Desktop — GIS popup (requestAccessToken), same-tab, no navigation.
//   Mobile  — OAuth2 redirect: browser goes to Google, returns with token in URL hash.
//             Mobile browsers block popups even from click handlers, so redirect is required.

let _tokenClient = null;  // the GIS object that manages the OAuth2 flow (desktop)
let _accessToken = null;  // the current token, or null if not signed in
let _onSignIn = null;     // callback fired after a successful sign-in

const _GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function _isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Called once from main.js after GIS has loaded.
// Also checks for a token in the URL hash in case we just returned from a mobile redirect.
function initAuth(onSignIn) {
  _onSignIn = onSignIn;

  // Mobile redirect return: Google puts the token in the URL fragment after redirect.
  // Parse it immediately so the user lands on the app already signed in.
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const tokenFromRedirect = hash.get('access_token');
  if (tokenFromRedirect) {
    _accessToken = tokenFromRedirect;
    // Remove the token from the URL so it's not exposed in browser history
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (_onSignIn) _onSignIn();
    return;
  }

  // Desktop path: initialize the GIS popup client
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: _GMAIL_SCOPE,
    callback: (response) => {
      if (response.error) {
        console.error('OAuth error:', response.error);
        return;
      }
      _accessToken = response.access_token;
      if (_onSignIn) _onSignIn();
    },
  });
}

// Sign in via popup (desktop) or redirect (mobile).
function signIn() {
  if (_isMobile()) {
    // Redirect to Google's OAuth2 endpoint; token comes back in the URL hash.
    // The redirect_uri must be registered in Google Cloud Console.
    const params = new URLSearchParams({
      client_id:              CONFIG.CLIENT_ID,
      redirect_uri:           window.location.origin + window.location.pathname,
      response_type:          'token',
      scope:                  _GMAIL_SCOPE,
      include_granted_scopes: 'true',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  } else {
    _tokenClient.requestAccessToken();
  }
}

// Revoke the token with Google and clear it from memory.
// After this, any Gmail API calls will fail until the user signs in again.
function signOut() {
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken);
    _accessToken = null;
  }
}

function getAccessToken() {
  return _accessToken;
}
