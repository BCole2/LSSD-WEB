const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const app = express();

// 1. ABSOLUTNĚ KRITICKÉ PRO RENDER (musí být před session middlewarem)
app.set('trust proxy', 1);

// 2. Nastavení session
app.use(session({
    // Použije se z Renderu, nebo pevný řetězec, aby se klíč po restartu nezměnil
    secret: process.env.SESSION_SECRET || 'pevne-tajne-heslo-ktere-se-nemeni-12345',
    resave: false,
    saveUninitialized: false, // Neuloží cookie, dokud se uživatel opravdu nepřihlásí
    name: 'lssd_sid',         // Změněný název pro čistý štít v prohlížeči
    cookie: {
        secure: true,         // Render používá HTTPS
        httpOnly: true,       // Ochrana před XSS útoky
        sameSite: 'none',     // NUTNÉ pro návrat z Discordu/Googlu
        maxAge: 24 * 60 * 60 * 1000 // 1 den platnosti
    }
}));

// 3. Inicializace Passportu
app.use(passport.initialize());
app.use(passport.session());

// 4. Serializace a Deserializace
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// 5. Autentizační strategie
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify', 'email']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// 6. Debugovací logy pro Render
app.use((req, res, next) => {
    if (req.url !== '/favicon.ico') { // Ignorujeme ikonky, ať to neplevelí log
        console.log(`[LOG] URL: ${req.url} | SessionID: ${req.sessionID} | Přihlášen: ${req.isAuthenticated()}`);
    }
    next();
});

// 7. Cesty a přesměrování
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DISCORD ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }), 
    (req, res) => {
        // Vynucené uložení session před přesměrováním (řeší ztrátu cookie na Renderu)
        req.session.save((err) => {
            if (err) console.error("Chyba při ukládání session:", err);
            res.redirect('/dashboard.html');
        });
    }
);

// --- GOOGLE ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }), 
    (req, res) => {
        // Vynucené uložení session před přesměrováním
        req.session.save((err) => {
            if (err) console.error("Chyba při ukládání session:", err);
            res.redirect('/dashboard.html');
        });
    }
);

// --- CHRÁNĚNÁ STRÁNKA ---
app.get('/dashboard.html', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        console.log("[LOG] Přístup odepřen - přesměrování na index.");
        res.redirect('/');
    }
});

// 8. Spuštění serveru
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server bezi na portu ${PORT}`);
});
