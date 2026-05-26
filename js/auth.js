// auth.js: Handles Google sign-in using Google Identity Services (GIS).
//
// GIS is Google's modern OAuth2 library for web apps. Instead of storing a
// password, it gives us a short-lived access token that proves the user
// approved read-only Gmail access. 
// The token lives only in memory (not saved to localStorage, cookies, or a server).

let _tokenClient = null;  // the GIS object that manages the OAuth2 flow
let _accessToken = null;  // the current token, or null if not signed in
let _onSignIn = null;     // callback fired after a successful sign-in

// Called once from main.js after GIS has loaded.
function initAuth(onSignIn) {
  _onSignIn = onSignIn;  // onSignIn is the function to call when the user successfully logs in.

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/gmail.readonly', // gmail.readonly for search and read emails

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

// Open the Google sign-in popup and request an access token.
// If the user is already signed into Google in their browser,
// this may complete silently without showing a popup.
function signIn() {
  _tokenClient.requestAccessToken();
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
