const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const app = express();

// 1. Nastavení proxy pro Render
app.set('trust proxy', 1);

// 2. Nastavení session s proxy: true
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-tajne-heslo',
    resave: false,
    saveUninitialized: false,
    proxy: true, // ZDE JE TO DŮLEŽITÉ
    name: 'lssd_session',
    cookie: {
        secure: true,      // HTTPS je na Renderu povinné
        httpOnly: true,
        sameSite: 'none',  // 'none' + secure je nutné pro cross-site OAuth
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// 3. Serializace
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 4. Strategie
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

// 5. Debug logy
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.url} | SeshID: ${req.sessionID} | Auth: ${req.isAuthenticated()}`);
    next();
});

// 6. Cesty
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord', { scope: ['identify'] }));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard.html'));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
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
