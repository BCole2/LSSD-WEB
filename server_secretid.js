const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const app = express();

// 1. Nastavení pro Render proxy
app.set('trust proxy', 1);

// 2. Konfigurace session
app.use(session({
    secret: process.env.SESSION_SECRET || 'lssd-fixed-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    name: 'lssd_sid',
    cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// 3. Serializace uživatele
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 4. Autentizační strategie
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify', 'email']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

// 5. Cesty (Routy)

// Hlavní stránka
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Pojistka pro staré odkazy na index.html
app.get('/index.html', (req, res) => res.redirect('/'));

// Discord Login
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    req.session.save(() => res.redirect('/dashboard.html'));
});

// Google Login
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    req.session.save(() => res.redirect('/dashboard.html'));
});

// Dashboard (chráněný)
app.get('/dashboard.html', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        res.redirect('/');
    }
});

// ODHLÁŠENÍ - Toto je klíčová oprava
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.log(err);
        req.session.destroy(() => {
            res.clearCookie('lssd_sid');
            res.redirect('/'); // Přesměruje na čisté URL bez .html
        });
    });
});

// Spuštění
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
