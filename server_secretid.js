const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const app = express();

// 1. DŮLEŽITÉ pro Render (aby poznal HTTPS za proxy)
app.set('trust proxy', 1);

// 2. Nastavení session pro produkci
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true, // Nutné pro Render
    cookie: {
        secure: true,    // Musí být true pro HTTPS
        httpOnly: true,
        sameSite: 'none' // 'none' je nutné pro OAuth přesměrování
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Serializace uživatele
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Discord Strategie
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "/auth/discord/callback",
    scope: ['identify', 'email']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

// Google Strategie
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

// Ladící Middleware (vypíše do logu, zda jsi přihlášen)
app.use((req, res, next) => {
    console.log(`URL: ${req.url} | Přihlášen: ${req.isAuthenticated()}`);
    if (req.isAuthenticated()) {
        console.log("Uživatel v session:", req.user ? req.user.id : "Neznámý");
    }
    next();
});

// Cesty
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard.html'));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard.html'));

app.get('/dashboard.html', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server bezi na portu ${PORT}`));
