const express = require('express');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');

const app = express();

// --- NASTAVENÍ RELACE (SESSION) ---
app.use(session({ secret: 'lssd_secret_key', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- KONFIGURACE GOOGLE ---
passport.use(new GoogleStrategy({
clientID: process.env.GOOGLE_CLIENT_ID,
clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  }, (accessToken, refreshToken, profile, done) => done(null, profile)
));

// --- KONFIGURACE DISCORD ---
passport.use(new DiscordStrategy({
clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "/auth/discord/callback",
    scope: ['identify', 'email']
  }, (accessToken, refreshToken, profile, done) => done(null, profile)
));

// --- CESTY (ROUTES) ---

// Přihlášení
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/discord', passport.authenticate('discord'));

// Callbacky (kam tě to vrátí)
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));

// Ochrana Dashboardu (Middleware)
function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/'); // Pokud není přihlášen, šoupni ho na úvodní stránku
}

app.get('/dashboard', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start serveru
app.listen(3000, () => console.log('LSSD Terminál běží na portu 3000!'));