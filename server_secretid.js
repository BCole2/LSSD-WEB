const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const app = express();

// 1. Kritické nastavení pro Render (aby server věřil, že je za proxy a používá HTTPS)
app.enable('trust proxy');

// 2. Nastavení session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'lssd_session',
    proxy: true, // Povolí předávání informací o HTTPS z proxy
    cookie: {
        secure: false,    // VYŽADUJE HTTPS (Render poskytuje HTTPS automaticky)
        httpOnly: true,  // Ochrana proti XSS
        sameSite: 'lax', // Standard pro přihlášení mezi doménami
        maxAge: 24 * 60 * 60 * 1000 // 24 hodin
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// 3. Serializace uživatele
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Strategie (Discord a Google)
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "/auth/discord/callback",
    scope: ['identify', 'email']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

// 4. Debugovací middleware (vypisuje stav do logů Renderu)
app.use((req, res, next) => {
    console.log(`[DEBUG] URL: ${req.url} | SessionID: ${req.sessionID} | Přihlášen: ${req.isAuthenticated()}`);
    next();
});

// Cesty
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard.html');
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard.html');
});

app.get('/dashboard.html', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        console.log("[LOG] Přístup na dashboard zamítnut – uživatel není přihlášen.");
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server bezi na portu ${PORT}`));
