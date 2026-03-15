const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const app = express();

// 1. Nastavení pro Render proxy
app.set('trust proxy', 1);

// 2. Nastavení session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'none'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// 3. Serializace (s ladicím výpisem)
passport.serializeUser((user, done) => {
    console.log("LOG: Serializuji uživatele (ukládám do session):", user.id);
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    console.log("LOG: Deserializuji uživatele (čtu ze session):", obj.id);
    done(null, obj);
});

// Strategie
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

// 4. Ladicí middleware
app.use((req, res, next) => {
    console.log(`URL: ${req.url} | SessionID: ${req.sessionID} | isAuthenticated: ${req.isAuthenticated()}`);
    next();
});

// Cesty
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    req.session.save(() => {
        console.log("LOG: Discord session uložena, přesměrovávám na dashboard.");
        res.redirect('/dashboard.html');
    });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    req.session.save(() => {
        console.log("LOG: Google session uložena, přesměrovávám na dashboard.");
        res.redirect('/dashboard.html');
    });
});

app.get('/dashboard.html', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        console.log("LOG: Přístup zamítnut, uživatel není přihlášen.");
        res.redirect('/');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server bezi na portu ${PORT}`));
